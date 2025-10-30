// API Bot (Bot B) - User interface for instant file delivery
import TelegramBot from 'node-telegram-bot-api';
import { movieCache } from '../movieCache.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { fetchPosterForTitle } from '../utils/poster.js';
import { getImdbPoster } from '../utils/imdb.js';
import { getSourcesStatus } from '../utils/status.js';
import { getEnabledSources } from '../config/sources.js';
import { searchTorrents } from '../services/searchService.js';
import { SimpleConverter } from '../converters/simple-converter.js';
import { downloadMovieFromStreaming } from '../services/automatedStreamDownloader.js';
import axios from 'axios';

const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

export class ApiBot {
  constructor(token, downloaderBotToken, downloaderBotChatId) {
    this.bot = new TelegramBot(token, { polling: true });
    this.downloaderBotToken = downloaderBotToken;
    this.downloaderBotChatId = downloaderBotChatId;
    this.downloaderBot = new TelegramBot(downloaderBotToken, { polling: false });
    
    this.totalRequests = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;

    this.setupEventHandlers();
  }

  /**
   * Process a full season: detect episode count via IMDb if possible, else 10
   */
  async processSeason(chatId, title, seasonNumber) {
    const MIN_TORRENT_SEEDERS = process.env.MIN_TORRENT_SEEDERS ? parseInt(process.env.MIN_TORRENT_SEEDERS) : 15;

    await this.bot.sendMessage(chatId, `📺 Processing season S${String(seasonNumber).padStart(2, '0')} for ${title}...`);

    // Try to detect episode count from IMDb quickly via search API (fallback 10)
    let episodeCount = 10;
    try {
      // Basic heuristic: try episodes 1..20 by probing torrents; stop after a run of 3 misses
      // Keeps implementation simple without heavy IMDb scraping.
      let consecutiveMisses = 0;
      for (let ep = 1; ep <= 20; ep += 1) {
        const epTitle = `${title} S${String(seasonNumber).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;
        const torrents = await searchTorrents(epTitle);
        if (torrents && torrents.length) {
          episodeCount = ep; // update to latest found
          consecutiveMisses = 0;
        } else {
          consecutiveMisses += 1;
          if (consecutiveMisses >= 3 && ep > 3) break;
        }
      }
    } catch {
      // keep default 10
    }

    await this.bot.sendMessage(chatId, `📚 Detected episodes: ${episodeCount}. Starting...`);

    for (let ep = 1; ep <= episodeCount; ep += 1) {
      const epTag = `S${String(seasonNumber).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;
      const epQuery = `${title} ${epTag}`;
      try {
        const torrents = await searchTorrents(epQuery);
        const bestTorrent = torrents.find(t => t.torrent_url) || torrents[0];
        const bestSeeders = bestTorrent?.seeders ?? 0;

        if (bestTorrent && bestSeeders >= MIN_TORRENT_SEEDERS) {
          const result = await this.downloadFromTorrent(bestTorrent, `${title}_${epTag}`);
          const upload = await this.uploadToCacheChannel(result.filePath, `${title} ${epTag}`);
          if (upload?.success) {
            movieCache.addMovie({
              title: `${title} ${epTag}`,
              file_id: upload.file_id,
              message_id: upload.message_id,
              channel_id: this.downloaderBotChatId,
              file_size: result.fileSize,
              source_type: 'torrent',
              source_url: result.sourceUrl,
              ttl_hours: 24
            });
          }
        } else {
          // Streaming fallback for episode
          const streamResult = await this.downloadFromStreaming(`${title} ${epTag}`);
          if (streamResult) {
            const upload = await this.uploadToCacheChannel(streamResult.filePath, `${title} ${epTag}`);
            if (upload?.success) {
              movieCache.addMovie({
                title: `${title} ${epTag}`,
                file_id: upload.file_id,
                message_id: upload.message_id,
                channel_id: this.downloaderBotChatId,
                file_size: streamResult.fileSize,
                source_type: 'streaming',
                source_url: streamResult.sourceUrl,
                ttl_hours: 24
              });
            }
          } else {
            await this.bot.sendMessage(chatId, `🌐 No streaming source for ${epTag}.`);
          }
        }
      } catch (e) {
        await this.bot.sendMessage(chatId, `❌ Failed ${epTag}: ${e.message}`);
      }
    }

    await this.bot.sendMessage(chatId, `✅ Season S${String(seasonNumber).padStart(2, '0')} processing done for ${title}.`);
  }

  setupEventHandlers() {
    // Start command (admin only)
    this.bot.onText(/^\/start$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.isAdmin(chatId)) {
        return this.bot.sendMessage(chatId, '❌ Admin access required');
      }
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return this.bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
      }

      const welcomeMessage = `🎬 *Welcome to Movie Cache Bot* 🎬

⚡ **INSTANT MOVIE DELIVERY**
• Search for movies and get them instantly if cached
• If not cached, we'll download it for you
• All movies are cached for 24 hours

🔍 **Commands:**
• \`/search <movie name>\` - Search and get movie
• \`/status\` - Check cache statistics
• \`/help\` - Show this help

💡 **How it works:**
1. Search for a movie
2. If cached → Instant delivery! ⚡
3. If not cached → We download it for you 📥
4. Next time → Instant delivery! ⚡

🎯 **Perfect for:**
• Quick movie sharing
• Group movie nights
• Instant access to popular movies`;

      await this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    });

    // Plain text movie name: users can just type the title (admin only)
    this.bot.on('message', async (msg) => {
      if (!msg || !msg.text) return;
      const text = String(msg.text || '').trim();
      // Ignore commands (starting with /)
      if (text.startsWith('/')) return;
      const chatId = msg.chat.id;
      if (!this.isAdmin(chatId)) {
        return this.bot.sendMessage(chatId, '❌ Admin access required');
      }
      const title = text;
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return this.bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
      }
      await this.handleMovieSearch(chatId, title);
    });

    // Admin-only: /status with metrics
    this.bot.onText(/^\/status$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.isAdmin(chatId)) {
        return this.bot.sendMessage(chatId, '❌ Admin access required');
      }
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return this.bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
      }
      await this.showAdminStatus(chatId);
    });

    // Help command (admin only)
    this.bot.onText(/^\/help$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.isAdmin(chatId)) {
        return this.bot.sendMessage(chatId, '❌ Admin access required');
      }
      
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return this.bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
      }

      const helpMessage = `🎬 **How to use the bot**

• Just type the movie name (no command needed)
  Example: \`KGF 2\`
• If cached → instant delivery
• If not cached → we will queue and notify when ready

⌛ Expected time:
• Instant if cached
• Otherwise 10–30 minutes depending on source

Need help? Reply here to contact the admin.`;

      await this.bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    });

    // Admin-only: /healthcheck
    this.bot.onText(/^\/healthcheck$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.isAdmin(chatId)) {
        return this.bot.sendMessage(chatId, '❌ Admin access required');
      }
      
      try {
        // Send initial message
        const statusMsg = await this.bot.sendMessage(chatId, '🔍 Checking source status...');
        
        // Import healthcheck functions
        const { checkSourcesHealth, formatHealthMessage, getHealthSummary } = await import('../commands/healthcheck.js');
        
        // Perform health checks
        const healthData = await checkSourcesHealth();
        const summary = getHealthSummary(healthData);
        const formattedMessage = formatHealthMessage(healthData);
        
        // Update the message with results
        await this.bot.editMessageText(formattedMessage, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
        
        // Log summary for debugging
        logger.info(`[HealthCheck] Summary: ${summary.healthy}/${summary.total} sources healthy`);
        
      } catch (e) {
        logger.error(`[HealthCheck] Failed: ${e.message}`);
        await this.bot.sendMessage(chatId, `❌ Healthcheck failed: ${e.message}`);
      }
    });

    // Admin-only: /sources
    this.bot.onText(/^\/sources$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.isAdmin(chatId)) {
        return this.bot.sendMessage(chatId, '❌ Admin access required');
      }
      try {
        const enabledKeys = getEnabledSources();
        const nameMap = { einthusan: 'Einthusan', yts: 'YTS', piratebay: 'PirateBay', movierulz: 'Movierulz', ytstv: 'YTSTV' };
        const enabled = enabledKeys.map(k => nameMap[k] || k);
        const payload = { enabledSources: enabled };
        await this.bot.sendMessage(chatId, '``' + JSON.stringify(payload, null, 2) + '``', { parse_mode: 'Markdown' });
      } catch (e) {
        await this.bot.sendMessage(chatId, `❌ Sources failed: ${e.message}`);
      }
    });

    // Series handler: /series <title> Sxx
    this.bot.onText(/^\/series\s+(.+?)\s+(S\d{2})$/i, async (msg, match) => {
      const chatId = msg.chat.id;
      const title = (match && match[1]) ? match[1].trim() : '';
      const seasonTag = (match && match[2]) ? match[2].toUpperCase() : 'S01';
      const seasonNum = parseInt(seasonTag.replace('S', ''), 10) || 1;

      if (!title) return this.bot.sendMessage(chatId, 'Usage: /series <title> Sxx');

      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return this.bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
      }

      await this.processSeason(chatId, title, seasonNum);
    });

    this.bot.on('polling_error', (err) => {
      logger.error('API Bot polling error:', err);
    });

    // Handle callback queries for instant cache delivery
    this.bot.on('callback_query', async (callbackQuery) => {
      const data = callbackQuery.data || '';
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      if (data.startsWith('cache:')) {
        const cacheMessageId = data.substring(6);
        
        try {
          await this.bot.answerCallbackQuery(callbackQuery.id, { text: '⚡ Delivering instantly...' });
          
          // Instant delivery using copyMessage from cache channel
          await this.bot.copyMessage(chatId, this.downloaderBotChatId, cacheMessageId);
          logger.info(`[ApiBot] Instant delivery successful for message_id: ${cacheMessageId}`);
          
        } catch (error) {
          logger.error(`[ApiBot] CopyMessage failed: ${error.message}`);
          await this.bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Delivery failed', show_alert: true });
        }
      } else if (data.startsWith('dl:')) {
        // Fallback: live download if cache failed
        const tokenId = data.substring(3);
        const downloadInfo = this.downloadStore?.get(tokenId);
        
        if (!downloadInfo) {
          await this.bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Download link expired', show_alert: true });
          return;
        }

        try {
          await this.bot.answerCallbackQuery(callbackQuery.id, { text: '📥 Preparing torrent file...' });
          
          // Download and send the torrent file
          const torrentData = {
            title: downloadInfo.title,
            torrent_url: downloadInfo.url,
            magnet_link: downloadInfo.url.startsWith('magnet:') ? downloadInfo.url : null
          };
          const result = await this.downloadFromTorrent(torrentData, downloadInfo.title);
          if (result && result.filePath) {
            // Send the torrent file
            await this.bot.sendDocument(chatId, result.filePath, {
              caption: `📁 ${downloadInfo.title} (${downloadInfo.quality}) - ${downloadInfo.source}`
            });
          } else {
            await this.bot.sendMessage(chatId, '❌ Failed to prepare torrent file');
          }
        } catch (error) {
          logger.error(`[ApiBot] Callback download failed: ${error.message}`);
          await this.bot.sendMessage(chatId, '❌ Download failed. Please try again.');
        }
      }
    });
  }

  isAdmin(chatId) {
    const adminId = process.env.ADMIN_USER_ID || '931635587';
    return String(chatId) === String(adminId);
  }

  /**
   * Handle movie search request
   * @param {string} chatId - User chat ID
   * @param {string} title - Movie title
   */
  async handleMovieSearch(chatId, title) {
    try {
      this.totalRequests += 1;
      // Minimal initial response (no verbose progress for users)
      const statusMsg = await this.bot.sendMessage(chatId, `🔍 ${title}`);

      // Check cache first
      const cachedMovie = movieCache.getMovie(title);
      
      if (cachedMovie) {
        this.cacheHits += 1;
        // Movie is cached - instant delivery!
        await this.bot.editMessageText(
          `✅ **Found in cache: ${title}**\n\n⚡ Delivering instantly...`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          }
        );

        try {
          // Prefer copying from cache channel message to avoid cross-bot file_id issues
          if (cachedMovie.channel_id && cachedMovie.message_id) {
            await this.bot.copyMessage(
              chatId,
              cachedMovie.channel_id,
              cachedMovie.message_id
            );
          } else {
            // Fallback to file_id if available
            await this.bot.sendDocument(chatId, cachedMovie.file_id, {
              caption: `🎬 **${title}**\n\n⚡ **Instant Delivery!**\n📁 Cached: ${new Date(cachedMovie.downloaded_at).toLocaleString()}\n💾 Expires: ${new Date(cachedMovie.expires_at).toLocaleString()}`,
              parse_mode: 'Markdown'
            });
          }

          // Delete status message
          await this.bot.deleteMessage(chatId, statusMsg.message_id);

          // Send success message
          await this.bot.sendMessage(
            chatId,
            `🎉 **Movie delivered instantly!**\n\n🎬 ${title}\n⚡ Cached delivery\n💡 This movie will be available instantly for 24 hours`,
            { parse_mode: 'Markdown' }
          );

          logger.info(`Instant delivery: ${title} to ${chatId}`);
          return;
        } catch (cachedErr) {
          logger.error(`[ApiBot] Cached send failed for "${title}": ${cachedErr.message}`);
          try {
            // Purge bad cache entry and fall through to re-download
            movieCache.removeMovie(title);
          } catch {}
        }
      }

      // Movie not cached - proceed silently (no extra user noise)
      this.cacheMisses += 1;

      // Start download process directly in API Bot
      logger.info(`[ApiBot] Starting download process for: ${title}`);
      await this.downloadMovie(title, chatId);

      // No progress spam; messaging will happen only after decision (torrent vs streaming)

      logger.info(`Download requested: ${title} for ${chatId}`);

    } catch (error) {
      logger.error('Movie search error:', error);
      
      await this.bot.sendMessage(
        chatId,
        `❌ **Search failed: ${title}**\n\nError: ${error.message}\n\nTry again or contact admin.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Admin status metrics
   * @param {string} chatId - Admin chat ID
   */
  async showAdminStatus(chatId) {
    try {
      const stats = movieCache.getStats();
      const payload = {
        totalRequests: this.totalRequests,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        cache: {
          total: stats.total,
          active: stats.active,
          expired: stats.expired
        }
      };
      await this.bot.sendMessage(chatId, '``' + JSON.stringify(payload, null, 2) + '``', { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Admin status error:', error);
      await this.bot.sendMessage(chatId, '❌ Error retrieving status');
    }
  }

  /**
   * Notify user when movie is ready
   * @param {string} chatId - User chat ID
   * @param {string} title - Movie title
   * @param {string} fileId - Telegram file ID
   */
  async notifyMovieReady(chatId, title, fileId) {
    try {
      await this.bot.sendMessage(
        chatId,
        `🎉 **${title} is ready!**\n\n⚡ Your movie has been downloaded and cached\n💡 Future requests for this movie will be instant!`,
        { parse_mode: 'Markdown' }
      );

      await this.bot.sendDocument(chatId, fileId, {
        caption: `🎬 **${title}**\n\n✅ Downloaded and cached\n⏰ Ready at: ${new Date().toLocaleString()}`,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      logger.error('Notification error:', error);
    }
  }

  /**
   * Search movies in cache
   * @param {string} query - Search query
   * @returns {Array} Matching movies
   */
  searchCache(query) {
    return movieCache.searchMovies(query);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return movieCache.getStats();
  }

  /**
   * Download movie using torrent-first approach
   * @param {string} title - Movie title
   * @param {string} chatId - User chat ID
   */
  async downloadMovie(title, chatId) {
    const MIN_TORRENT_SEEDERS = process.env.MIN_TORRENT_SEEDERS ? parseInt(process.env.MIN_TORRENT_SEEDERS) : 15;
    
    try {
      // Try sending IMDb poster; fall back to text-only if not available
      const posterUrl = await getImdbPoster(title);
      if (posterUrl) {
        try {
          await this.bot.sendPhoto(
            chatId,
            posterUrl,
            { caption: `🎬 **${title}**\n📥 Download in progress...`, parse_mode: 'Markdown' }
          );
        } catch (posterError) {
          logger.error(`[ApiBot] Failed to send poster for "${title}":`, posterError.message);
          await this.bot.sendMessage(
            chatId,
            `🔄 **Downloading: ${title}**\n\n⏳ Searching for sources...`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        await this.bot.sendMessage(
          chatId,
          `🔄 **Downloading: ${title}**\n\n⏳ Searching for sources...`,
          { parse_mode: 'Markdown' }
        );
      }

      let downloadResult = null;
      let sourceIndicator = '';

      // Admin requirement: Disable torrents entirely; use Hicine streaming only
      logger.info(`[ApiBot] Using streaming-only mode (Hicine) for "${title}"`);

      const normalizeQuality = (q = '') => String(q).toLowerCase();
      const isAllowedQuality = (q = '', t = {}) => {
        const qn = normalizeQuality(q);
        if (!qn) return true; // allow unknown
        if (/(dvdscr|cam|hdcam|hdtc|sd|ts|telesync)/i.test(qn)) return true;
        const m = /(\d{3,4})p/.exec(qn) || /(\d{3,4})p/.exec(String(t.title || ''));
        if (m) {
          const p = parseInt(m[1], 10);
          return Number.isFinite(p) && p <= 1080;
        }
        return true;
      };

      const torrentCandidates = (torrents || [])
        .filter(t => (t.torrent_url || t.magnet || t.magnet_link)) // actionable only
        .filter(t => isAllowedQuality(t.quality, t))
        .slice(0); // copy

      torrentCandidates.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
      const top3 = torrentCandidates.slice(0, 3);
      const bestTorrent = top3[0];
      const bestSeeders = bestTorrent?.seeders ?? 0;

      // Remove seeder check message - only show torrent found or fallback message

      if (false) {
        // 1. Check if movie already exists in cache
        const cachedMovie = movieCache.searchMovies(title)[0];
        if (cachedMovie) {
          // Movie exists in cache - serve instantly with copyMessage
          await this.bot.sendMessage(chatId, `✅ Found in cache: ${title}`);
          await this.bot.sendMessage(chatId, `⚡ Delivering instantly...`);
          
          // Copy cached torrent files using copyMessage
          try {
            await this.bot.copyMessage(chatId, this.downloaderBotChatId, cachedMovie.message_id);
            return;
          } catch (error) {
            logger.warn(`[ApiBot] Cached send failed for "${title}": ${error.message}`);
            // Purge stale cache and continue with fresh download
            movieCache.removeMovie(title);
          }
        }

        // 2. Upload all top-3 torrent files to cache channel immediately
        const toHuman = (bytes) => {
          if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return '';
          const mb = bytes / (1024 * 1024);
          return mb >= 1024 ? `${(mb/1024).toFixed(1)}GB` : `${Math.round(mb)}MB`;
        };

        const normalizeQuality = (s) => {
          const ql = String(s || '').toLowerCase();
          if (ql.includes('2160') || /\b4k\b/i.test(ql)) return '2160p';
          if (ql.includes('1440')) return '1440p';
          if (ql.includes('1080')) return '1080p';
          if (ql.includes('720')) return '720p';
          if (ql.includes('480') || ql.includes('360') || /\bsd\b/i.test(ql)) return 'SD';
          return 'HD';
        };

        const buttons = [];
        const lines = [];
        const cacheResults = [];

        // Upload all torrents to cache channel first
        for (let i = 0; i < top3.length; i++) {
          const r = top3[i];
          const qualityLabel = normalizeQuality(r.quality);
          
          try {
            // Download the actual torrent file
            const torrentData = {
              title: r.title,
              torrent_url: r.torrent_url,
              magnet_link: r.magnet_link || r.magnet
            };
            const result = await this.downloadFromTorrent(torrentData, `${title}_${qualityLabel}`);
            
            if (result && result.filePath) {
              // Upload to cache channel
              const uploadResult = await this.uploadToCacheChannel(`${title}_${qualityLabel}`, result.filePath, 'torrent', r.torrent_url || r.magnet_link);
              
              if (uploadResult && uploadResult.success) {
                cacheResults.push({
                  quality: qualityLabel,
                  message_id: uploadResult.message_id,
                  title: r.title,
                  size: r.size
                });
                
                // Create button for instant delivery
                const label = `📁 Download ${qualityLabel}`;
                buttons.push([{ text: label, callback_data: `cache:${uploadResult.message_id}` }]);

                const sizeText = toHuman(r.size);
                const titleLine = `- ${r.title} ${qualityLabel}${sizeText ? ` ${sizeText}` : ''}`.trim();
                lines.push(titleLine);
              } else {
                // Fallback: create button for live download if cache upload fails
                const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                this.downloadStore = this.downloadStore || new Map();
                this.downloadStore.set(tokenId, {
                  title: r.title,
                  quality: qualityLabel,
                  url: r.torrent_url || r.magnet_link || r.magnet,
                  size: r.size || null,
                  source: r.source || 'N/A',
                  type: 'torrent',
                  seeders: r.seeders || 0,
                  allowMagnetFallback: false,
                  createdAt: Date.now()
                });
                setTimeout(() => this.downloadStore.delete(tokenId), 2 * 60 * 60 * 1000);
                
                const label = `📁 Download ${qualityLabel}`;
                buttons.push([{ text: label, callback_data: `dl:${tokenId}` }]);

                const sizeText = toHuman(r.size);
                const titleLine = `- ${r.title} ${qualityLabel}${sizeText ? ` ${sizeText}` : ''}`.trim();
                lines.push(titleLine);
              }
            }
          } catch (error) {
            logger.error(`[ApiBot] Failed to cache torrent ${qualityLabel}: ${error.message}`);
            // Continue with other torrents even if one fails
          }
        }

        // 3. Save to cache database
        if (cacheResults.length > 0) {
          const primaryResult = cacheResults[0];
          movieCache.addMovie({
            title: title,
            file_id: primaryResult.message_id, // Use message_id as identifier
            message_id: primaryResult.message_id,
            channel_id: this.downloaderBotChatId,
            file_size: primaryResult.size || 0,
            source_type: 'torrent',
            source_url: 'cached',
            ttl_hours: 24
          });
        }

        // 4. Send poster with buttons for instant delivery
        const caption = [`Results for ${title}:`, '', lines.join('\n\n')].join('\n');
        const replyMarkup = { reply_markup: { inline_keyboard: buttons } };
        
        // Try to get poster from torrent results
        let finalPoster = posterUrl;
        if (!finalPoster && top3.length > 0) {
          finalPoster = top3[0].poster_url;
        }
        
        if (finalPoster) {
          await this.bot.sendPhoto(chatId, finalPoster, {
            caption,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...replyMarkup
          }).catch((error) => {
            logger.warn(`[ApiBot] Failed to send poster: ${error.message}`);
            this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup });
          });
        } else {
          await this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup });
        }
        
        return; // Early return - user will get instant delivery via copyMessage
      } else {
        logger.info(`[ApiBot] No suitable torrents found for "${title}" (best seeders: ${bestSeeders})`);
        // Show fallback message when seeders < 15
        await this.bot.sendMessage(chatId, `🔄 Fallback to online streaming download (seeders: ${bestSeeders} < 15)`);
      }

      // Streaming-only path (Hicine)
      if (!downloadResult) {
        logger.info(`[ApiBot] Streaming (Hicine) for "${title}"`);
        downloadResult = await this.downloadFromStreaming(title);
        if (downloadResult) {
          downloadResult.source_type = 'streaming';
          sourceIndicator = '🌐 Streaming (Hicine)';
          await this.bot.sendMessage(
            chatId,
            `${sourceIndicator}\n⏳ Downloading "${title}" from ${downloadResult.sourceName}...`
          );
          logger.info(`[ApiBot] Streaming source selected: ${downloadResult.sourceName} (${downloadResult.sourceUrl})`);
        }
      }

      if (!downloadResult) {
        throw new Error('No sources found for this movie');
      }

      // Upload to cache channel
      const uploadResult = await this.uploadToCacheChannel(downloadResult.filePath, title);
      if (!uploadResult.success) throw new Error('Failed to upload to cache channel');

      // Add to cache
      movieCache.addMovie({
        title,
        file_id: uploadResult.file_id,
        message_id: uploadResult.message_id,
        channel_id: this.downloaderBotChatId, // Use cache channel ID
        file_size: downloadResult.fileSize,
        source_type: downloadResult.source_type,
        source_url: downloadResult.sourceUrl,
        ttl_hours: 24
      });

      // Clean up local file
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }

      // Deliver to user by copying from cache channel
      await this.bot.copyMessage(
        chatId,
        this.downloaderBotChatId,
        uploadResult.message_id
      );

      logger.info(`[ApiBot] Successfully downloaded "${title}" from ${downloadResult.source_type}`);

    } catch (error) {
      logger.error(`[ApiBot] Download failed for "${title}":`, error?.message || error);
      // Avoid Markdown to prevent parse errors from arbitrary error text
      await this.bot.sendMessage(
        chatId,
        `❌ Download Failed: ${title}\n\nError: ${error.message}\n\nTry a different movie or check the title spelling.`
      );
    }
  }

  /**
   * Torrent path: fetch and upload .torrent file (or magnet fallback)
   */
  async downloadFromTorrent(torrent, title) {
    const safeBase = (title || torrent.title || 'movie').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const torrentUrl = torrent.torrent_url || torrent.url || null;
    const magnet = torrent.magnet_link || torrent.magnet || null;

    try {
      // 1) If we have a direct .torrent URL, download it
      if (torrentUrl && /\.torrent(\?|$)/i.test(torrentUrl)) {
        const filePath = `downloads/${safeBase}.torrent`;
        try {
          await this.downloadBinary(torrentUrl, filePath);
          return { filePath, fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0, sourceUrl: torrentUrl };
        } catch (e) {
          // fall through to magnet-based fallbacks
        }
      }

      // 2) If we have an infohash in magnet, derive a public .torrent URL (itorrents)
      if (magnet) {
        const infoHash = this.extractInfoHashFromMagnet(magnet);
        if (infoHash) {
          const candidates = [
            `https://itorrents.org/torrent/${infoHash}.torrent`,
            `https://torrage.info/torrent.php?h=${infoHash}`,
            `https://btcache.me/torrent/${infoHash}`
          ];
          for (const url of candidates) {
            try {
              const filePath = `downloads/${safeBase}.torrent`;
              await this.downloadBinary(url, filePath);
              return { filePath, fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0, sourceUrl: url };
            } catch (e) {
              logger.warn(`[ApiBot] Fallback torrent fetch failed (${url}): ${e.message}`);
              continue;
            }
          }
        }
        // Fallback: write magnet to a text file to share
        const magPath = `downloads/${safeBase}.magnet.txt`;
        fs.writeFileSync(magPath, magnet, 'utf8');
        return { filePath: magPath, fileSize: fs.statSync(magPath).size, sourceUrl: magnet };
      }

      // If we reach here, we don't have a valid torrent - throw error instead of creating placeholder
      throw new Error('No valid torrent file available - torrent_url or magnet required');
    } catch (error) {
      logger.error('[ApiBot] Torrent file preparation failed:', error.message);
      throw error;
    }
  }

  async downloadBinary(url, filePath) {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    fs.writeFileSync(filePath, Buffer.from(resp.data));
    return filePath;
  }

  extractInfoHashFromMagnet(magnet) {
    try {
      const m = /xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z0-9]{32})/.exec(magnet);
      return m ? m[1].toUpperCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * Download from streaming sources using SimpleConverter
   */
  async downloadFromStreaming(title) {
    try {
      // Use enhanced automated streaming downloader (Hicine-only configured)
      const result = await downloadMovieFromStreaming(title);
      if (result && result.filePath) {
        return { filePath: result.filePath, fileSize: result.fileSize || 0, sourceUrl: result.sourceUrl, sourceName: result.sourceName || 'Hicine' };
      }
      return null;
    } catch (e) {
      logger.error(`[ApiBot] Streaming fallback error for "${title}": ${e.message}`);
      return null;
    }
  }

  /**
   * Upload file to cache channel
   */
  async uploadToCacheChannel(filePath, title) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      const uploadResult = await this.bot.sendDocument(
        this.downloaderBotChatId,
        filePath,
        {
          caption: `🎬 ${title}`,
          parse_mode: 'Markdown'
        }
      );

      return {
        success: true,
        file_id: uploadResult.document.file_id,
        message_id: uploadResult.message_id
      };
    } catch (error) {
      logger.error('Upload to cache channel failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default ApiBot;



