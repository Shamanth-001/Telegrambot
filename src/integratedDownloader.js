// Integrated Downloader - Handles layered fallback system
import { cacheManager } from './services/cacheManager.js';
import { searchTorrents } from './services/searchService.js';
import { searchEinthusan } from './einthusan.js';
import { searchCataz } from './cataz.js';
import { searchMovierulz } from './movierulz.js';
import { searchYTS } from './yts.js';
import { searchPirateBay } from './piratebay.js';
import { searchYTSTV } from './ytstv.js';
import { SimpleConverter } from './converters/simple-converter.js';
import { logger } from './utils/logger.js';
import { ensureUnderSize } from './converter.js';
import { enqueueJob } from './services/queueManager.js';
import { downloadStreamWithPuppeteer } from './puppeteer-ffmpeg-downloader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class IntegratedDownloader {
  constructor(bot, privateChannelId) {
    this.bot = bot;
    this.privateChannelId = privateChannelId;
    this.converter = new SimpleConverter();
    this.tempDir = os.tmpdir();
    this.MIN_SEEDERS = 15;
    // lightweight background queue for streaming replacements
    this.streamingQueue = [];
    this.streamingQueueProcessing = false;
    
    // Start cleanup scheduler
    this.startCleanupScheduler();
  }

  /**
   * Main search handler with layered fallback
   * @param {string} title - Movie title
   * @param {string} chatId - User chat ID
   * @returns {Promise<Object>} Result object
   */
  async handleSearch(title, chatId) {
    const normalizedTitle = title.toLowerCase().trim();
    
    try {
      // Check if download is already in progress
      if (cacheManager.isDownloadActive(normalizedTitle)) {
        return {
          success: false,
          message: `⏳ **${title}** is already being downloaded. Please wait...`,
          type: 'in_progress'
        };
      }

      // 1. Check Cache First
      const cacheEntry = cacheManager.checkCache(title);
      if (cacheEntry) {
        logger.info(`[IntegratedDownloader] Cache hit for: ${title}`);
        
        await this.bot.sendDocument(chatId, cacheEntry.file_id, {
          caption: `🎬 **${title}**\n\n⚡ **Instant Delivery!**\n📁 Cached: ${new Date(cacheEntry.downloadedAt).toLocaleString()}\n💾 Source: ${cacheEntry.source_type}`,
          parse_mode: 'Markdown'
        });

        return {
          success: true,
          message: `✅ **${title}** delivered instantly from cache!`,
          type: 'cache_hit',
          file_id: cacheEntry.file_id
        };
      }

      // Mark download as active
      cacheManager.markDownloadActive(normalizedTitle);

      // Send initial status
      const statusMsg = await this.bot.sendMessage(
        chatId,
        `🔍 **Searching for: ${title}**\n\n⏳ Checking sources...`,
        { parse_mode: 'Markdown' }
      );

      let result = null;

      // 2. Try Torrent Search & Provide Files Directly
      try {
        await this.bot.editMessageText(
          `🔍 **Searching for: ${title}**\n\n🔄 Searching torrents...`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          }
        );

        result = await this.searchAndProvideTorrents(title, chatId);
        
        if (result.success) {
          // Delete status message since we're sending torrent files directly
          await this.bot.deleteMessage(chatId, statusMsg.message_id);
          
          // Return success - torrent files were sent directly
          return {
            success: true,
            message: result.message,
            type: 'torrent_files_provided',
            torrents: result.torrents
          };
        }
      } catch (error) {
        logger.error(`[IntegratedDownloader] Torrent search failed for ${title}:`, error);
      }

      // 3. Try Streaming Fallback if torrent failed
      if (!result || !result.success) {
        try {
          await this.bot.editMessageText(
            `🔍 **Searching for: ${title}**\n\n🔄 Trying streaming sources...`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );

          result = await this.streamingFallbackDownload(title);
          
          if (result.success) {
            await this.bot.editMessageText(
              `✅ **Found streaming source for: ${title}**\n\n📥 Downloading and converting...`,
              {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
              }
            );
          }
        } catch (error) {
          logger.error(`[IntegratedDownloader] Streaming fallback failed for ${title}:`, error);
        }
      }

      // 4. Handle result
      if (result && result.success) {
        // Enforce <= 1.9GB for streaming outputs only
        let finalPath = result.filePath;
        if (result.source_type === 'streaming') {
          try {
            finalPath = await ensureUnderSize(finalPath, 1900);
          } catch (e) {
            logger.error(`[IntegratedDownloader] Size enforcement failed for ${title}:`, e);
          }
        }

        // Upload to Telegram channel
        const uploadResult = await this.uploadToTelegramChannel(finalPath, title);
        
        if (uploadResult.success) {
          // Add to cache
          cacheManager.addToCache(
            title,
            uploadResult.file_id,
            uploadResult.message_id,
            result.source_type,
            result.source_url,
            result.file_size
          );

          // Clean up local file
          this.cleanupLocalFile(finalPath);

          // Delete status message
          await this.bot.deleteMessage(chatId, statusMsg.message_id);

          // Send the movie
          await this.bot.sendDocument(chatId, uploadResult.file_id, {
            caption: `🎬 **${title}**\n\n✅ **Downloaded and Cached!**\n📁 Source: ${result.source_type}\n💾 Cached for 24 hours\n⚡ Future requests will be instant!`,
            parse_mode: 'Markdown'
          });

          return {
            success: true,
            message: `✅ **${title}** downloaded and cached successfully!`,
            type: 'download_success',
            file_id: uploadResult.file_id,
            source_type: result.source_type
          };
        } else {
          throw new Error('Failed to upload to Telegram channel');
        }
      } else {
        // Not found
        await this.bot.editMessageText(
          `❌ **Not Found: ${title}**\n\n🔍 Searched all available sources:\n• Torrents\n• Einthusan\n• Cataz\n• MovieRulz\n\n💡 Try a different movie or check the title spelling.`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          }
        );

        // Auto-delete the not-found status after a short delay to keep chat clean
        setTimeout(() => {
          try {
            this.bot.deleteMessage(chatId, statusMsg.message_id);
          } catch (e) {
            // ignore deletion errors
          }
        }, 15000);

        return {
          success: false,
          message: `❌ **${title}** could not be found in any source.`,
          type: 'not_found'
        };
      }

    } catch (error) {
      logger.error(`[IntegratedDownloader] Error handling search for ${title}:`, error);
      
      await this.bot.sendMessage(
        chatId,
        `❌ **Error downloading: ${title}**\n\nError: ${error.message}\n\nPlease try again or contact admin.`,
        { parse_mode: 'Markdown' }
      );

      return {
        success: false,
        message: `❌ Error: ${error.message}`,
        type: 'error'
      };
    } finally {
      // Mark download as completed
      cacheManager.markDownloadCompleted(normalizedTitle);
    }
  }

  /**
   * Search and provide torrent files directly (no local download)
   * @param {string} title - Movie title
   * @param {string} chatId - User chat ID
   * @returns {Promise<Object>} Result object
   */
  async searchAndProvideTorrents(title, chatId) {
    try {
      logger.info(`[IntegratedDownloader] Searching torrents for: ${title}`);
      
      // Search for torrents
      const torrents = await searchTorrents(title);
      
      if (!torrents || torrents.length === 0) {
        logger.info(`[IntegratedDownloader] No torrents found for: ${title}`);
        return { success: false, reason: 'no_torrents' };
      }

      logger.info(`[IntegratedDownloader] Found ${torrents.length} torrents for: ${title}`);
      // Split high/low seeders
      const addSeeds = (t) => ({
        ...t,
        _seeds: typeof t.seeds === 'number' ? t.seeds : (typeof t.seeders === 'number' ? t.seeders : 0)
      });
      const enriched = torrents.map(addSeeds);
      const highSeed = enriched.filter(t => t._seeds >= this.MIN_SEEDERS)
        .sort((a,b)=> b._seeds - a._seeds);
      const lowSeed = enriched.filter(t => t._seeds < this.MIN_SEEDERS)
        .sort((a,b)=> b._seeds - a._seeds);

      // 2a) If any high-seed torrent exists, download and cache immediately
      if (highSeed.length > 0) {
        const best = highSeed[0];
        const input = best.magnet || best.magnet_link || best.torrent_url || best.url;
        if (input) {
          try {
            // 1) Send the .torrent (or magnet content) to the user immediately for instant access
            await this.sendTorrentFilesToUser([best], title, chatId, { lowSeedWarning: false });

            // 2) Upload the same .torrent file to the private channel as cache (no movie download)
            const torrentContent = this.createTorrentFileContent(best);
            const filename = `${this.sanitizeFilename(title)}.torrent`;
            const uploaded = await this.bot.sendDocument(
              this.privateChannelId,
              { source: Buffer.from(torrentContent), filename },
              { caption: `🧲 ${title} — Cached torrent file (seeds: ${best._seeds})` }
            );

            // 3) Cache the torrent file_id for instant re-send
            cacheManager.addToCache(
              title,
              uploaded.document.file_id,
              uploaded.message_id,
              'torrent_file',
              input,
              0
            );

            // 4) Send cached file_id to user (demonstrate instant cache delivery)
            await this.bot.sendDocument(chatId, uploaded.document.file_id, {
              caption: `🎬 **${title}**\n\n🧲 Cached .torrent (seeds: ${best._seeds})\n⚡ Future requests will be instant!`,
              parse_mode: 'Markdown'
            });

            return { success: true, type: 'torrent_file_cached', already_sent: true };
          } catch (err) {
            logger.error(`[IntegratedDownloader] High-seed torrent file cache/upload failed for ${title}:`, err);
            // fall through to provide torrents to user
          }
        }
      }

      // 2b) For low-seed torrents, send files with warning and enqueue streaming replacement
      if (lowSeed.length > 0) {
        await this.sendTorrentFilesToUser(lowSeed, title, chatId, { lowSeedWarning: true });
        // Enqueue background streaming replacement
        this.enqueueStreamingJob({ title, chatId });
        return {
          success: true,
          type: 'torrent_files_provided',
          torrents: lowSeed.length,
          message: `⚠️ Low seeders for torrents. Sent .torrent files and queued streaming fallback.`
        };
      }

      // If only non-downloadable entries, still send top few and enqueue streaming
      await this.sendTorrentFilesToUser(enriched.slice(0,3), title, chatId, { lowSeedWarning: true });
      this.enqueueStreamingJob({ title, chatId });
      return { success: true, type: 'torrent_files_provided', torrents: Math.min(3,enriched.length) };

    } catch (error) {
      logger.error(`[IntegratedDownloader] Torrent search error for ${title}:`, error);
      return { success: false, reason: 'torrent_error', error: error.message };
    }
  }

  /**
   * Send torrent files directly to user
   * @param {Array} torrents - Array of torrent objects
   * @param {string} title - Movie title
   * @param {string} chatId - User chat ID
   */
  async sendTorrentFilesToUser(torrents, title, chatId, options = {}) {
    try {
      // Send up to 3 best torrents
      const topTorrents = torrents.slice(0, 3);
      
      for (let i = 0; i < topTorrents.length; i++) {
        const torrent = topTorrents[i];
        const seeds = typeof torrent._seeds === 'number' ? torrent._seeds : (torrent.seeds ?? torrent.seeders ?? 'Unknown');
        
        // Create torrent file content
        const torrentContent = this.createTorrentFileContent(torrent);
        const filename = `${this.sanitizeFilename(title)}_${i + 1}.torrent`;
        
        // Send torrent file directly
        await this.bot.sendDocument(chatId, {
          source: Buffer.from(torrentContent),
          filename: filename
        }, {
          caption: `${options.lowSeedWarning ? '⚠️ ' : ''}🎬 **${title}** - Torrent ${i + 1}\n\n📁 **${torrent.title}**\n💾 Size: ${torrent.size || 'Unknown'}\n⭐ Seeds: ${seeds}\n${options.lowSeedWarning ? '\n⚠️ Low seeders (<15). Download may be slow or fail.\n' : '\n'}💡 **Instructions:**\n1. Download this .torrent file\n2. Open with your torrent client\n3. Start downloading!`,
          parse_mode: 'Markdown'
        });
        
        // Small delay between files
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Send summary message
      await this.bot.sendMessage(
        chatId,
        `🎉 **${title} - Torrent Files Sent!**\n\n📁 **${topTorrents.length} torrent file(s) provided**\n💡 **No local download needed** - use your torrent client\n⚡ **Fast and efficient** - direct torrent delivery\n\n🔄 **Want streaming instead?** Try again if torrents don't work!`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      logger.error(`[IntegratedDownloader] Error sending torrent files for ${title}:`, error);
      throw error;
    }
  }

  enqueueStreamingJob(job) {
    // Mirror into persistent queue; keep lightweight in-memory queue for immediate processing
    try {
      enqueueJob(job.title, async () => {
        const result = await this.streamingFallbackDownload(job.title);
        if (result && result.success) {
          let finalPath = result.filePath;
          try { finalPath = await ensureUnderSize(finalPath, 1900); } catch {}
          const uploaded = await this.uploadToTelegramChannel(finalPath, job.title);
          if (uploaded.success) {
            cacheManager.addToCache(
              job.title,
              uploaded.file_id,
              uploaded.message_id,
              'streaming',
              result.source_url,
              result.file_size
            );
            this.cleanupLocalFile(finalPath);
            if (job.chatId) {
              await this.bot.sendMessage(job.chatId, `✅ Cached better MKV for **${job.title}** (streaming).`, { parse_mode: 'Markdown' });
            }
          }
        }
      });
    } catch {}

    this.streamingQueue.push(job);
    this.processStreamingQueue();
  }

  async processStreamingQueue() {
    if (this.streamingQueueProcessing) return;
    this.streamingQueueProcessing = true;
    try {
      while (this.streamingQueue.length > 0) {
        const { title, chatId } = this.streamingQueue.shift();
        try {
          logger.info(`[IntegratedDownloader] Background streaming job started for: ${title}`);
          const result = await this.streamingFallbackDownload(title);
          if (result && result.success) {
            const uploadResult = await this.uploadToTelegramChannel(result.filePath, title);
            if (uploadResult.success) {
              cacheManager.addToCache(
                title,
                uploadResult.file_id,
                uploadResult.message_id,
                'streaming',
                result.source_url,
                result.file_size
              );
              this.cleanupLocalFile(result.filePath);
              // Optional notify user
              if (chatId) {
                await this.bot.sendMessage(
                  chatId,
                  `✅ Better version cached for **${title}** (streaming source). Future requests will be instant.`,
                  { parse_mode: 'Markdown' }
                );
              }
            }
          }
        } catch (err) {
          logger.error(`[IntegratedDownloader] Background streaming job failed for ${title}:`, err);
        }
      }
    } finally {
      this.streamingQueueProcessing = false;
    }
  }

  /**
   * Create torrent file content (simplified - you may need to implement proper .torrent file creation)
   * @param {Object} torrent - Torrent object
   * @returns {string} Torrent file content
   */
  createTorrentFileContent(torrent) {
    // This is a simplified implementation
    // You may need to implement proper .torrent file creation based on your torrent data structure
    // For now, we'll create a simple text file with magnet link
    
    const content = `# Torrent File for: ${torrent.title}
# Generated by Movie Bot

Magnet Link: ${torrent.magnet || torrent.url}
Title: ${torrent.title}
Size: ${torrent.size || 'Unknown'}
Seeds: ${torrent.seeds || 'Unknown'}

# Instructions:
# 1. Copy the magnet link above
# 2. Paste it into your torrent client
# 3. Start downloading!

# Alternative: Use the magnet link directly in your torrent client
`;
    
    return content;
  }

  /**
   * Streaming fallback download
   * @param {string} title - Movie title
   * @returns {Promise<Object>} Download result
   */
  async streamingFallbackDownload(title) {
    try {
      logger.info(`[IntegratedDownloader] Trying streaming sources for: ${title}`);
      
      // Try multiple streaming sources in priority order
      const streamingSources = [
        { name: 'Cataz', searchFn: searchCataz }
        // Temporarily disabled Einthusan due to yt-dlp piracy blocking
        // { name: 'Einthusan', searchFn: searchEinthusan },
        // { name: 'MovieRulz', searchFn: searchMovierulz },
        // { name: 'YTS', searchFn: searchYTS },
        // { name: 'PirateBay', searchFn: searchPirateBay },
        // { name: 'YTSTV', searchFn: searchYTSTV }
      ];

      for (const source of streamingSources) {
        try {
          logger.info(`[IntegratedDownloader] Searching ${source.name} for: ${title}`);
          const results = await source.searchFn(title);
          
          if (results && results.length > 0) {
            const movie = results[0];
            const tempFilePath = path.join(this.tempDir, `${this.sanitizeFilename(title)}.mkv`);
            
            logger.info(`[IntegratedDownloader] Found on ${source.name}: ${movie.title} -> ${tempFilePath}`);
            
            // Try existing conversion pipeline first
            try {
              const conversionResult = await this.converter.convert(movie.url, tempFilePath);
              
              if (conversionResult.success) {
                return {
                  success: true,
                  filePath: tempFilePath,
                  source_type: 'streaming',
                  source_url: movie.url,
                  source_name: source.name,
                  file_size: conversionResult.fileSize || 0
                };
              }
            } catch (conversionError) {
              logger.warn(`[IntegratedDownloader] ${source.name} conversion failed: ${conversionError.message}`);
            }
            
            // Fallback to Puppeteer + FFmpeg direct download
            logger.info(`[IntegratedDownloader] Trying Puppeteer + FFmpeg fallback for ${source.name}`);
            try {
              const puppeteerResult = await downloadStreamWithPuppeteer(movie.url, {
                outDir: this.tempDir,
                title: title,
                timeoutMs: 45000
              });
              
              return {
                success: true,
                filePath: puppeteerResult.filePath,
                source_type: 'streaming_puppeteer',
                source_url: puppeteerResult.sourceUrl,
                source_name: source.name,
                file_size: puppeteerResult.sizeMB * 1024 * 1024
              };
            } catch (puppeteerError) {
              logger.warn(`[IntegratedDownloader] Puppeteer + FFmpeg fallback failed: ${puppeteerError.message}`);
            }
            
            // Both methods failed -> throw so queue retries
            throw new Error('StreamingConversionFailed');
          }
        } catch (error) {
          logger.error(`[IntegratedDownloader] ${source.name} search failed for ${title}:`, error);
        }
      }

      // No source found -> throw so queue marks failure/retries
      throw new Error('NoStreamingSourceFound');

    } catch (error) {
      logger.error(`[IntegratedDownloader] Streaming fallback error for ${title}:`, error);
      throw error;
    }
  }

  /**
   * Upload file to Telegram channel
   * @param {string} filePath - Local file path
   * @param {string} title - Movie title
   * @returns {Promise<Object>} Upload result
   */
  async uploadToTelegramChannel(filePath, title) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      const fileStats = fs.statSync(filePath);
      
      // Upload to private channel
      const result = await this.bot.sendDocument(
        this.privateChannelId,
        filePath,
        {
          caption: `🎬 ${title}\n📁 Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB\n⏰ Cached: ${new Date().toLocaleString()}`,
          parse_mode: 'Markdown'
        }
      );

      return {
        success: true,
        file_id: result.document.file_id,
        message_id: result.message_id
      };

    } catch (error) {
      logger.error(`[IntegratedDownloader] Upload error for ${title}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up local file
   * @param {string} filePath - File path to delete
   */
  cleanupLocalFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`[IntegratedDownloader] Cleaned up local file: ${filePath}`);
      }
    } catch (error) {
      logger.error(`[IntegratedDownloader] Error cleaning up file ${filePath}:`, error);
    }
  }

  /**
   * Sanitize filename
   * @param {string} title - Movie title
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(title) {
    return title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }

  /**
   * Start cleanup scheduler
   */
  startCleanupScheduler() {
    // Run cleanup every 6 hours
    setInterval(async () => {
      try {
        const cleaned = cacheManager.cleanupExpired();
        if (cleaned > 0) {
          logger.info(`[IntegratedDownloader] Cleanup: Removed ${cleaned} expired cache entries`);
        }
      } catch (error) {
        logger.error('[IntegratedDownloader] Cleanup scheduler error:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    logger.info('[IntegratedDownloader] Cleanup scheduler started');
  }

  /**
   * Get download statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const cacheStats = cacheManager.getStats();
    const activeDownloads = cacheManager.getActiveDownloads();
    
    return {
      cache: cacheStats,
      activeDownloads: activeDownloads.length,
      activeDownloadTitles: activeDownloads
    };
  }
}

export default IntegratedDownloader;
