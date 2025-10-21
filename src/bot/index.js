import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '../utils/logger.js';
import { getSourcesStatus } from '../utils/status.js';
import { searchEinthusan } from '../einthusan.js';
import { searchTorrents } from '../services/searchService.js';
import { fetchPosterForTitle } from '../utils/poster.js';
import { http } from '../utils/http.js';
import { createServer, DOWNLOAD_DIR } from '../fileServer.js';
// Integrated cache system imports
import { cacheManager } from '../services/cacheManager.js';
import IntegratedDownloader from '../integratedDownloader.js';
// Removed fast streamer imports - not needed for full MKV movies

const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

// Admin configuration
const ADMIN_USER_ID = '931635587'; // Your Telegram user ID

// Cache configuration
const CACHE_CHANNEL_ID = process.env.CACHE_CHANNEL_ID; // Private channel for file storage

export async function startBot(token) {
  let bot;
  try {
    bot = new TelegramBot(token, { polling: true });
  } catch (err) {
    logger.error('Failed to initialize TelegramBot', { error: err?.stack || String(err) });
    throw err;
  }
  
  // Start file server for direct downloads
  const fileServer = createServer();
  console.log('[DEBUG] File server started for direct downloads');

  // Initialize integrated downloader with cache system
  let integratedDownloader = null;
  if (CACHE_CHANNEL_ID) {
    integratedDownloader = new IntegratedDownloader(bot, CACHE_CHANNEL_ID);
    console.log('[DEBUG] Integrated downloader with cache system initialized');
  } else {
    console.log('[WARNING] CACHE_CHANNEL_ID not set - cache system disabled');
  }

  bot.on('polling_error', (err) => {
    console.error('[polling_error]', err?.response?.body || err?.message || err);
  });

  // Removed Einthusan callback handlers - they were too problematic

  // Removed generic message handler to avoid intercepting commands

  bot.onText(/^\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    const welcomeMessage = `🎬 *Welcome to Movie Torrent Bot* 🎬

I help you find movie torrents easily! Here's what you need to know:

📱 *Requirements:*
• You MUST have a torrent client installed (qBittorrent, BitTorrent, etc.)
• The torrent links I provide are for personal use only

🔍 *How to Search:*
Just type any movie name! Examples:
• \`superman\`
• \`rrr\` 
• \`kgf chapter 2\`
• \`bahubali\`

📋 *Available Commands:*
• \`/help\` - Show detailed help
• \`/cache-status\` - Check cache statistics
• \`/convert <URL>\` - Full movie download (1-2 hours)

⚡ *NEW: Automatic Movie Search:*
• Just type any movie name (e.g., \`superman\`, \`batman\`)
• Bot automatically checks cache first
• If cached → instant delivery! ⚡
• If not cached → searches torrents and streaming
• Perfect for popular movies - instant delivery!

⚠️ *Important Notes:*
• Download speeds depend on seeders
• Always check your local laws
• Support creators when possible

Ready to find movies? Try \`/cache <movie>\` for instant delivery! 🚀`;

    await bot.sendMessage(chatId, welcomeMessage, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  });

  bot.onText(/^\/help$/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    const helpMessage = `📖 *Bot Help & Usage* 📖

🔍 *How to Search:*
• Just type any movie name \\(examples: \`superman\`, \`rrr\`, \`kgf\`\\)
• Bot automatically checks cache first
• If cached → instant delivery! ⚡
• If not cached → searches torrents and streaming

📋 *Available Commands:*
• \`/start\` - Welcome message
• \`/help\` - Show this help
• \`/cache-status\` - Check cache statistics
• \`/files\` - Show available downloads

⚡ *NEW: Automatic Movie Search:*
• Just type movie name - no commands needed!
• Instant delivery if cached
• Automatic download for new movies
• 24-hour cache retention
• Perfect for popular movies

⚙️ *Bot Features:*
• Finds movies from multiple sources (YTS, PirateBay, Movierulz)
• Shows up to 3 download links per movie
• Supports Indian movies in multiple languages
• Automatic language detection
• Direct torrent file downloads
• **NEW:** Instant cache delivery system

⚠️ *Important:*
• Make sure you have a torrent client installed
• Check your local laws before downloading
• Support creators when you can!`;

    await bot.sendMessage(chatId, helpMessage, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  });

  // Removed /cache command - now handled by generic message handler

  // Cache status command
  bot.onText(/^\/cache-status$/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    if (!integratedDownloader) {
      return bot.sendMessage(
        chatId,
        '❌ **Cache system not configured**\n\nPlease set CACHE_CHANNEL_ID environment variable.',
        { parse_mode: 'Markdown' }
      );
    }

    const stats = integratedDownloader.getStats();
    const cacheStats = stats.cache;
    
    const statusMessage = `📊 **Cache System Status**

📁 **Cache Statistics:**
• Total Movies: ${cacheStats.total}
• Active (not expired): ${cacheStats.active}
• Expired: ${cacheStats.expired}
• Total Size: ${(cacheStats.totalSize / 1024 / 1024).toFixed(2)} MB

🔄 **Active Downloads:**
• In Progress: ${stats.activeDownloads}
${stats.activeDownloadTitles.length > 0 ? `• Movies: ${stats.activeDownloadTitles.join(', ')}` : ''}

💡 **How it works:**
• \`/cache <movie>\` - Search with instant delivery
• Cached movies delivered in <1 second ⚡
• New movies downloaded automatically
• 24-hour cache retention
• Automatic cleanup`;

    await bot.sendMessage(chatId, statusMessage, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  });

  // Cache cleanup command (admin only)
  bot.onText(/^\/cache-cleanup$/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_USER_ID) {
      return bot.sendMessage(chatId, '❌ Admin access required');
    }

    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    if (!integratedDownloader) {
      return bot.sendMessage(
        chatId,
        '❌ **Cache system not configured**',
        { parse_mode: 'Markdown' }
      );
    }

    const cleaned = cacheManager.cleanupExpired();
    await bot.sendMessage(
      chatId,
      `🧹 **Cache Cleanup Complete**\n\nRemoved ${cleaned} expired entries`,
      { parse_mode: 'Markdown' }
    );
  });

  // Removed fast streaming commands - not needed for full MKV movies

  bot.onText(/^\/files$/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    try {
      const files = fs.readdirSync(DOWNLOAD_DIR)
        .filter(file => {
          const filePath = path.join(DOWNLOAD_DIR, file);
          return fs.statSync(filePath).isFile();
        })
        .map(file => {
          const filePath = path.join(DOWNLOAD_DIR, file);
          const stat = fs.statSync(filePath);
          return {
            name: file,
            size: (stat.size / 1024 / 1024).toFixed(1) + ' MB',
            url: `http://localhost:8080/download/${encodeURIComponent(file)}`
          };
        })
        .sort((a, b) => b.size - a.size);
      
      if (files.length === 0) {
        await bot.sendMessage(chatId, '📁 No files available yet. Download some content first!');
        return;
      }
      
      const fileList = files.slice(0, 10).map(file => 
        `📄 **${file.name}** (${file.size})\n🔗 [Download](${file.url})`
      ).join('\n\n');
      
      const message = `📁 **Available Downloads** (${files.length} files)\n\n${fileList}\n\n🌐 **File Server:** http://localhost:8080\n🔄 **Range Resume:** Supported`;
      
      await bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true 
      });
    } catch (error) {
      await bot.sendMessage(chatId, `❌ Error listing files: ${error.message}`);
    }
  });

  // Removed Einthusan commands - they were too problematic with geo-blocking


  bot.onText(/^\/sources$/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Check if user is admin
    if (String(msg.from.id) !== ADMIN_USER_ID) {
      return bot.sendMessage(chatId, '🔒 *Admins Only*\n\nThis command is restricted to administrators.', { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }

    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    try {
      const statusList = await getSourcesStatus();
      let message = '🔧 *Source Status (Admin)*\n\n';

      let openCount = 0;
      for (const s of statusList) {
        const isOpen = s.status?.isOpen === true;
        if (isOpen) openCount += 1;
        const emoji = isOpen ? '✅' : '❌';
        const state = isOpen ? 'OPEN' : 'CLOSED';
        const failures = s.status?.failureCount ?? 0;
        message += `${emoji} **${s.name}**: ${state}\n`;
        if (!isOpen && failures > 0) {
          message += `└ Failures: ${failures}\n`;
        }
      }

      message += `\n📊 Overall: ${openCount}/${statusList.length} sources active`;

      await bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    } catch (error) {
      await bot.sendMessage(chatId, `❌ Failed to get source status: ${error.message}`);
    }
  });

  bot.onText(/^\/healthcheck$/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Check if user is admin
    if (String(msg.from.id) !== ADMIN_USER_ID) {
      return bot.sendMessage(chatId, '🔒 *Admins Only*\n\nThis command is restricted to administrators.', { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }

    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    try {
      await bot.sendMessage(chatId, '🔍 Checking domain status...');
      
      const domains = [
        { 
          name: 'YTS API', 
          url: 'https://yts.mx/api/v2/list_movies.json',
          testType: 'http',
          testQuery: 'superman'
        },
        { 
          name: 'PirateBay', 
          url: 'https://piratebayproxy.net',
          testType: 'http',
          testQuery: 'superman'
        },
        { 
          name: 'Movierulz', 
          url: 'https://www.5movierulz.guide',
          testType: 'http',
          testQuery: 'superman'
        },
        {
          name: 'Cataz',
          url: 'https://cataz.to',
          testType: 'http',
          testQuery: 'superman'
        },
        {
          name: 'YTSTV',
          url: 'https://yts.rs',
          testType: 'http',
          testQuery: 'S01E01'
        },
        {
          name: 'Einthusan',
          url: 'https://einthusan.tv',
          testType: 'http',
          testQuery: 'rrr'
        },
        { 
          name: 'Telegram API', 
          url: 'https://api.telegram.org',
          testType: 'http'
        }
      ];

      const { searchYTS } = await import('../yts.js');
      const { searchMovierulz } = await import('../movierulz.js');
      const { searchPirateBay } = await import('../piratebay.js');

      const results = await Promise.allSettled(
        domains.map(async (domain) => {
          try {
            // Test HTTP connectivity first
            const response = await http.get(domain.url, { 
              timeout: 5000,
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            
            let functionalTest = null;
            
            // Test actual search functionality for sources
            if (domain.testQuery && domain.name !== 'Telegram API') {
              try {
                let searchResults = [];
                switch (domain.name) {
                  case 'YTS API':
                    searchResults = await searchYTS(domain.testQuery, { limit: 5 });
                    break;
                  case 'Movierulz':
                    searchResults = await searchMovierulz(domain.testQuery, { fast: true });
                    break;
                  case 'PirateBay':
                    searchResults = await searchPirateBay(domain.testQuery);
                    break;
                }
                functionalTest = searchResults.length > 0 ? 'WORKING' : 'NO_RESULTS';
              } catch (err) {
                functionalTest = 'SEARCH_ERROR';
              }
            }
            
            return {
              name: domain.name,
              status: 'UP',
              statusCode: response.status,
              functionalTest: functionalTest
            };
          } catch (error) {
            return {
              name: domain.name,
              status: 'DOWN',
              error: error.message,
              functionalTest: 'HTTP_ERROR'
            };
          }
        })
      );

      const domainStatus = results.map(r => r.value || r.reason);
      const upCount = domainStatus.filter(d => d.status === 'UP').length;
      const total = domains.length;
      
      let message = `🌐 **Domain Health Check (Admin)**\n\n`;
      message += `📊 **Summary:** ${upCount}/${total} domains UP\n\n`;
      
      domainStatus.forEach(domain => {
        const emoji = domain.status === 'UP' ? '✅' : '❌';
        let details = '';
        
        if (domain.status === 'UP') {
          details = `(HTTP ${domain.statusCode})`;
          if (domain.functionalTest) {
            switch (domain.functionalTest) {
              case 'WORKING':
                details += ' • ✅ Search Working';
                break;
              case 'NO_RESULTS':
                details += ' • ⚠️ No Results Found';
                break;
              case 'SEARCH_ERROR':
                details += ' • ❌ Search Failed';
                break;
              case 'HTTP_ERROR':
                details += ' • ❌ HTTP Error';
                break;
            }
          }
        } else {
          details = `(${domain.error})`;
        }
        
        message += `${emoji} **${domain.name}**: ${domain.status} ${details}\n`;
      });
      
      const healthStatus = upCount === total ? '🟢 HEALTHY' : upCount > 0 ? '🟡 DEGRADED' : '🔴 DOWN';
      message += `\n**Overall Status:** ${healthStatus}`;

      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      await bot.sendMessage(chatId, `❌ Health check failed: ${error.message}`);
    }
  });

  // Zero-storage delivery command
  bot.onText(/^\/send (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1];
    
    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    if (!url.startsWith('http')) {
      await bot.sendMessage(chatId, '❌ Invalid URL. Must start with http:// or https://');
      return;
    }

    const filename = url.split('/').pop() || 'video.mkv';
    
    try {
      const statusMsg = await bot.sendMessage(
        chatId,
        `📥 **Processing: ${filename}**\n\n⏳ Method: Checking...`,
        { parse_mode: 'Markdown' }
      );
      
      // Import smart delivery
      const { default: smartDelivery } = await import('../smart-delivery.js');
      
      // Try smart send
      await bot.editMessageText(
        `📥 **Processing: ${filename}**\n\n📤 Attempting delivery...`,
        { 
          chat_id: chatId, 
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      const result = await smartDelivery.smartSend(url, bot, chatId, filename);
      
      // Delete status message
      await bot.deleteMessage(chatId, statusMsg.message_id);
      
      // Send success message
      await bot.sendMessage(
        chatId,
        `✅ **Delivered!**\n\n🎬 ${filename}\n📦 Method: ${result.method}\n💾 Cached for future use`,
        { parse_mode: 'Markdown' }
      );
      
      console.log(`✅ Zero-storage delivery successful: ${filename} (${result.method})`);
      
    } catch (error) {
      console.error('Zero-storage delivery error:', error);
      await bot.sendMessage(
        chatId,
        `❌ **Delivery Failed**\n\n${filename}\n\nError: ${error.message}\n\nTry:\n1. Different source\n2. Check URL\n3. Contact admin`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // Series search command
  bot.onText(/^\/series\s+(.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    let query = match[1].trim();
    // Optional season parsing: robust (supports: "S01", "s1", "Season 1" anywhere, case-insensitive)
    let directSeasonNum = null;
    const extractSeason = (text) => {
      // Supports: "S02", "s2", "Season 2", "season02" anywhere in the string
      const m = text.match(/(?:^|\s)(?:s(?:eason)?\s*0?(\d{1,2})|s0?(\d{1,2}))(?:\b|$)/i);
      if (m) {
        const n = (m[1] || m[2] || '').padStart(2, '0');
        return { num: n, raw: m[0] };
      }
      return null;
    };
    const found = extractSeason(query);
    if (found) {
      directSeasonNum = found.num;
      query = query.replace(found.raw, ' ').replace(/\s{2,}/g, ' ').trim();
    }
    
    if (!query) {
      return bot.sendMessage(chatId, '❌ Please provide a series name.\n\nExample: `/series Game of Thrones`', {
        parse_mode: 'Markdown'
      });
    }

    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }

    console.log(`[DEBUG] Series search triggered for: ${query}${directSeasonNum?` (Season ${directSeasonNum})`:''}`);
    await handleSeriesSearch(chatId, query, { directSeasonNum });
  });

  // ephemeral stores
  // - language selection (token -> data)
  const selectionStore = new Map();
  // - pending downloads for YTS/PirateBay (token -> { title, quality, url, size })
  const downloadStore = new Map();
  // - season selection for series (token -> { query, seasonGroups, createdAt, chatId })
  const seasonStore = new Map();
  // - episode downloads for series (token -> { episodes, season, query, createdAt, chatId })
  const episodeStore = new Map();

  const handleSearch = async (chatId, query) => {
    const q = (query || '').trim();
    if (!q) return bot.sendMessage(chatId, 'Provide a movie name.');
    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.sendMessage(chatId, 'Rate limit exceeded. Try again in a minute.');
    }
    try {
      logger.info('Starting search', { query: q });
      const searchingMsg = await bot.sendMessage(chatId, `Searching for ${q}...`);
      await bot.sendChatAction(chatId, 'typing');

      const results = await searchTorrents(q, {});
      logger.info('Search completed', { query: q, count: results.length });
      if (!results.length) {
        try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
        try { await bot.deleteMessage(chatId, searchingMsg.message_id); } catch {}
        return bot.sendMessage(chatId, `No torrents found for "${q}".`);
      }

      // Prefer Movierulz grouping ONLY when YTS has no matches; otherwise, merge+sort globally
      const movierulzResults = results.filter(r => (r.source || '').toLowerCase() === 'movierulz');
      const hasYtsResults = results.some(r => (r.source || '').toLowerCase() === 'yts');
      if (movierulzResults.length && !hasYtsResults) {
        // group by language (with fallback label)
        const byLang = new Map();
        const nonDubbedExists = movierulzResults.some(r => r && r.is_dubbed === false);
        for (const r of movierulzResults) {
          // If original-language variants exist, hide dubbed entries
          if (nonDubbedExists && r.is_dubbed === true) continue;
          const langLabel = r.language || (r.is_dubbed ? 'Dubbed' : 'Unknown');
          const lang = langLabel;
          if (!byLang.has(lang)) byLang.set(lang, []);
          byLang.get(lang).push(r);
        }
        // sort each group by seeders desc when available, else by quality
        for (const [lang, list] of byLang) {
          list.sort((a, b) => {
            const sa = typeof a.seeders === 'number' ? a.seeders : -1;
            const sb = typeof b.seeders === 'number' ? b.seeders : -1;
            if (sa !== sb) return sb - sa;
            const qa = (a.quality || '').toLowerCase();
            const qb = (b.quality || '').toLowerCase();
            const order = ['2160p','1440p','1080p','720p','480p','360p','web-dl','webrip','hdrip','bluray','brrip','dvdrip','bdrip','tc','ts','cam','hd'];
            const ra = order.findIndex(x => qa.includes(x));
            const rb = order.findIndex(x => qb.includes(x));
            return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
          });
          byLang.set(lang, list.slice(0, 5));
        }

        // build token and keyboard
        const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        selectionStore.set(tokenId, { query: q, byLang, createdAt: Date.now(), chatId });
        setTimeout(() => selectionStore.delete(tokenId), 2 * 60 * 60 * 1000); // 2 hours

        const keyboard = { inline_keyboard: [] };
        const entries = Array.from(byLang.entries());
        // Order languages: non-dubbed first (original), then others; known-language hinting can be added later
        const isDub = (name) => /dubbed/i.test(name);
        entries.sort((a, b) => {
          const ad = isDub(a[0]) ? 1 : 0;
          const bd = isDub(b[0]) ? 1 : 0;
          if (ad !== bd) return ad - bd; // originals first
          return a[0].localeCompare(b[0]);
        });
        for (const [lang, list] of entries) {
          const suffix = isDub(lang) ? ' • Dubbed' : ' • Original';
          keyboard.inline_keyboard.push([
            { text: `${lang}${suffix} (${list.length})`, callback_data: `mlang:${tokenId}:${lang.slice(0,20)}` }
          ]);
        }

        await bot.sendMessage(chatId, `Select language for "${q}":`, { reply_markup: keyboard });
        return; // handled via callback_query
      }

      const first = results[0];
      let poster = first.poster_url || null;
      if (!poster) {
        // Prefer fetching poster by the user's query; fallback to top result title
        poster = (await fetchPosterForTitle(q)) || (await fetchPosterForTitle(first.title));
      }

      // New: Global Top-3 torrent choices (exclude Movierulz), seeders >= 15, descending
      try {
          const normalizeQuality = (s) => {
          const ql = String(s || '').toLowerCase();
          if (ql.includes('2160') || /\b4k\b/i.test(ql)) return '2160p';
          if (ql.includes('1440')) return '1440p';
          if (ql.includes('1080')) return '1080p';
          if (ql.includes('720')) return '720p';
          if (ql.includes('480') || ql.includes('360') || /\bsd\b/i.test(ql)) return 'SD';
          return 'HD';
        };
        const nonMovierulz = results.filter(r => (r.source || '').toLowerCase() !== 'movierulz');
        // Accept minor title differences; require actionable torrent (torrent_url or magnet[_link])
        const valid = nonMovierulz.filter(r => (r.torrent_url || r.magnet || r.magnet_link));
        valid.sort((a,b) => (b.seeders||0)-(a.seeders||0));
        const top3 = valid.slice(0,3);
        if (top3.length) {
          const toHuman = (bytes) => {
            if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return '';
            const mb = bytes / (1024 * 1024);
            return mb >= 1024 ? `${(mb/1024).toFixed(1)}GB` : `${Math.round(mb)}MB`;
          };

          const buttons = [];
          const lines = [];
          for (const r of top3) {
            const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const qualityLabel = normalizeQuality(r.quality);
            // Store with allowMagnetFallback=false to avoid sending magnet text; we will try mirror fetch only
            downloadStore.set(tokenId, {
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
            setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000);
            const label = `📁 Download ${qualityLabel}`;
            buttons.push([{ text: label, callback_data: `dl:${tokenId}` }]);

            const sizeText = toHuman(r.size);
            const titleLine = `- ${htmlEscape(r.title)} ${(qualityLabel||'')}${sizeText?` ${sizeText}`:''}`.trim();
            lines.push(titleLine);
          }

          const caption = [`Results for ${htmlEscape(q)}:`, '', lines.join('\n\n')].join('\n');
          const replyMarkup = { reply_markup: { inline_keyboard: buttons } };
          if (poster) {
            await bot.sendPhoto(chatId, poster, {
              caption,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              ...replyMarkup
            }).catch(() => {
              bot.sendMessage(chatId, caption, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup });
            });
          } else {
            await bot.sendMessage(chatId, caption, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup });
          }
          try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
          try { await bot.deleteMessage(chatId, searchingMsg.message_id); } catch {}
          return; // Early return: we presented top-3 torrent choices per requirement
        }
      } catch {}

      const htmlEscape = (s) => String(s || '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');

      const appendTrackersToMagnet = (magnetUri) => {
        if (!magnetUri || !magnetUri.startsWith('magnet:')) return magnetUri;
        // If magnet already has trackers, still append popular ones to improve peer discovery
        const trackers = [
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.demonii.com:1337/announce',
          'udp://tracker.openbittorrent.com:6969/announce',
          'udp://tracker.torrent.eu.org:451/announce',
          'udp://exodus.desync.com:6969/announce',
          'udp://208.83.20.20:6969/announce',
          'udp://tracker1.bt.moack.co.kr:80/announce',
          'udp://tracker-udp.gbitt.info:80/announce'
        ];
        const encoded = trackers.map(t => `tr=${encodeURIComponent(t)}`).join('&');
        return magnetUri.includes('tr=') ? `${magnetUri}&${encoded}` : `${magnetUri}${magnetUri.includes('&') ? '&' : ''}${encoded}`;
      };

      // Sort all non-Movierulz results by seeders desc if available, else quality
      const sorted = [...results].sort((a, b) => {
        const sa = typeof a.seeders === 'number' ? a.seeders : -1;
        const sb = typeof b.seeders === 'number' ? b.seeders : -1;
        if (sa !== sb) return sb - sa;
        const qa = (a.quality || '').toLowerCase();
        const qb = (b.quality || '').toLowerCase();
        const order = ['2160p','1440p','1080p','720p','480p','360p','web-dl','webrip','hdrip','bluray','brrip','dvdrip','bdrip','tc','ts','cam','hd'];
        const ra = order.findIndex(x => qa.includes(x));
        const rb = order.findIndex(x => qb.includes(x));
        return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
      });
      const top = sorted.slice(0, 5);
      const MB = 1024 * 1024;
      // Collapse non-Movierulz entries to one line per quality
      const nonMlForLines = top.filter(r => r.source !== 'Movierulz');
      const byQualityForLines = new Map();
      for (const r of nonMlForLines) {
        const ql = r.quality || 'N/A';
        if (!byQualityForLines.has(ql)) byQualityForLines.set(ql, r);
      }
      const collapsedNonMl = Array.from(byQualityForLines.values());

      const listForLines = [
        ...top.filter(r => r.source === 'Movierulz'),
        ...collapsedNonMl
      ];

      const lines = listForLines.map((r) => {
        const ql = r.quality || 'N/A';
        const sizeText = typeof r.size === 'number'
          ? (() => { const mb = r.size / MB; return mb >= 1024 ? `${(mb/1024).toFixed(1)}GB` : `${Math.round(mb)}MB`; })()
          : '';
        const meta = [ql, sizeText].filter(Boolean).join(' ');
        const year = r.year ? ` (${String(r.year)})` : '';
        const titleSafe = htmlEscape(r.title + year);
        const header = `- ${titleSafe} ${meta ? '- ' + htmlEscape(meta) : ''}`;
        
        // Source-specific link logic (ABSOLUTE REQUIREMENTS)
        let linkLine = '';
        if (r.source === 'Movierulz') {
          // Movierulz: Use buttons instead of HTML links to avoid URL length limits
          linkLine = '';
        } else {
          // YTS & PirateBay: show button(s) to request .torrent via callback
          linkLine = '';
        }
        
        // Prefer explicit button-style inline keyboard for reliable clickability
        if (linkLine) {
          linkLine = linkLine;
        }
        return [header.trim(), linkLine].filter(Boolean).join('\n');
      });

      const msgText = [`Results for ${htmlEscape(q)}:`, '', lines.join('\n\n')].join('\n');
      
      // Build inline buttons:
      // - Movierulz: magnets as URL buttons
      // - YTS/PirateBay/YTSTV: unique qualities as callback buttons to send .torrent/magnet
      const qualityRank = (q) => {
        if (!q) return 999;
        const order = ['2160p','1440p','1080p','720p','480p','360p','web-dl','webrip','hdrip','bluray','brrip','dvdrip','bdrip','tc','ts','cam','hd'];
        const qq = String(q).toLowerCase();
        const idx = order.findIndex(x => qq.includes(x));
        return idx === -1 ? 999 : idx;
      };
      const buttons = [];
      // Movierulz: Only show buttons for direct torrent links
      for (const r of top) {
        if (r.source === 'Movierulz') {
          const ql = r.quality || 'HD';
          const torrentUrl = r.torrent_url ? r.torrent_url : '';
          if (torrentUrl) {
            const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            downloadStore.set(tokenId, { title: r.title, quality: ql, url: torrentUrl, size: r.size || null, createdAt: Date.now() });
            setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000); // 2 hours
            buttons.push([{ text: `📁 Download ${ql}`, callback_data: `dl:${tokenId}` }]);
          }
        }
      }
      // Smart download strategy: ≥15 seeders = torrent, <15 seeders = direct files
      const MIN_SEEDERS_FOR_TORRENT = 15;
      
      // Group all results by quality and source
      const byQuality = new Map();
      for (const r of top) {
        const ql = r.quality || 'HD';
        const key = `${ql}_${r.source}`;
        if (!byQuality.has(key)) byQuality.set(key, []);
        byQuality.get(key).push(r);
      }
      
      // Process each quality/source combination
      for (const [key, results] of byQuality) {
        const [quality, source] = key.split('_');
        // Find exact title match first, then fallback to best result
        let bestResult = results.find(r => r.title.toLowerCase() === query.toLowerCase());
        if (!bestResult) {
          bestResult = results[0]; // Fallback to first result
        }
        
        const seeders = bestResult.seeders || 0;
        const hasDirectDownload = bestResult.direct_url || bestResult.stream_url || bestResult.file_host_url;
        const hasTorrent = bestResult.torrent_url || bestResult.magnet_link;
        
        if (seeders >= MIN_SEEDERS_FOR_TORRENT && hasTorrent) {
          // High seeders: Provide torrent for fast download
        const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          downloadStore.set(tokenId, { 
            title: bestResult.title, 
            quality, 
            url: bestResult.torrent_url || bestResult.magnet_link, 
            size: bestResult.size || null, 
            source,
            type: 'torrent',
            seeders,
            createdAt: Date.now() 
          });
          setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000);
          buttons.push([{ text: `🧲 Torrent ${quality} (${source}) - ${seeders} seeds`, callback_data: `dl:${tokenId}` }]);
          
        } else if (seeders < MIN_SEEDERS_FOR_TORRENT && hasDirectDownload) {
          // Low seeders: Provide direct download
          if (bestResult.direct_url) {
            const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            downloadStore.set(tokenId, { 
              title: bestResult.title, 
              quality, 
              url: bestResult.direct_url, 
              size: bestResult.size || null, 
              source,
              type: 'direct_download',
              seeders,
              createdAt: Date.now() 
            });
            setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000);
            buttons.push([{ text: `🎬 Direct ${quality} (${source}) - ${seeders} seeds`, callback_data: `dl:${tokenId}` }]);
            
          } else if (bestResult.stream_url) {
            // Auto-convert directly to MKV - no buttons needed
            console.log(`[AutoConvert] Starting direct MKV conversion for ${bestResult.title}`);
            
            // Start conversion immediately
            setTimeout(async () => {
              try {
                const { convertStreamingContent } = await import('../simple-converter.js');
                const urlToUse = bestResult.movie_page_url || bestResult.stream_url;
                const result = await convertStreamingContent(urlToUse, 'downloads/converted.mkv');
                
                if (result.success) {
                  // Move file to download directory
                  const filename = `${bestResult.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${quality}.mkv`;
                  const finalPath = path.join(DOWNLOAD_DIR, filename);
                  
                  if (result.filePath !== finalPath) {
                    fs.copyFileSync(result.filePath, finalPath);
                    fs.unlinkSync(result.filePath);
                  }
                  
                  // Send the converted MKV file
                  await bot.sendDocument(
                    chatId,
                    finalPath,
                    { caption: `✅ Auto-converted ${bestResult.title} to MKV!` },
                    { filename: filename, contentType: 'video/x-matroska' }
                  );
                  await bot.sendMessage(chatId, `🔗 Your file is also available at: http://localhost:8080/${encodeURIComponent(filename)}`);
                  
                  console.log(`[AutoConvert] ✅ Successfully converted ${bestResult.title} to MKV`);
                } else {
                  console.log(`[AutoConvert] ❌ Failed to convert ${bestResult.title}: ${result.error}`);
                  await bot.sendMessage(chatId, `❌ Auto-conversion failed: ${result.error}`);
                }
              } catch (error) {
                console.error('[AutoConvert] Error:', error);
                await bot.sendMessage(chatId, `❌ Auto-conversion error: ${error.message}`);
              }
            }, 1000); // Start conversion after 1 second
            
            // Show conversion status instead of button
            buttons.push([{ text: `🎬 Converting to MKV... (${source}) - ${seeders} seeds`, callback_data: 'converting' }]);
            
          } else if (bestResult.file_host_url) {
            const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            downloadStore.set(tokenId, { 
              title: bestResult.title, 
              quality, 
              url: bestResult.file_host_url, 
              size: bestResult.size || null, 
              source,
              type: 'file_host',
              seeders,
              createdAt: Date.now() 
            });
            setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000);
            buttons.push([{ text: `📂 File Host ${quality} (${source}) - ${seeders} seeds`, callback_data: `dl:${tokenId}` }]);
          }
          
        } else if (hasTorrent) {
          // Fallback: Provide torrent even with low seeders if no direct download
          const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          downloadStore.set(tokenId, { 
            title: bestResult.title, 
            quality, 
            url: bestResult.torrent_url || bestResult.magnet_link, 
            size: bestResult.size || null, 
            source,
            type: 'torrent',
            seeders,
            createdAt: Date.now() 
          });
          setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000);
          buttons.push([{ text: `🧲 Torrent ${quality} (${source}) - ${seeders} seeds ⚠️`, callback_data: `dl:${tokenId}` }]);
          // Queue background streaming replacement using integrated downloader
          try {
            if (integratedDownloader && typeof integratedDownloader.enqueueStreamingJob === 'function') {
              integratedDownloader.enqueueStreamingJob({ title: q, chatId });
            }
          } catch {}
        }
      }

      const replyMarkup = buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {};

      // Send poster with caption + inline buttons
      if (poster) {
        await bot.sendPhoto(chatId, poster, { 
          caption: msgText, 
          parse_mode: 'HTML', 
          disable_web_page_preview: true,
          ...replyMarkup
        }).catch(() => {
          bot.sendMessage(chatId, msgText, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup });
        });
      } else {
        await bot.sendMessage(chatId, msgText, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup });
      }
      // Remove the temporary "Searching..." message (edit first to avoid flicker in some clients)
      try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
      try { await bot.deleteMessage(chatId, searchingMsg.message_id); } catch {}
      setTimeout(() => { try { bot.deleteMessage(chatId, searchingMsg.message_id); } catch {} }, 3000);

      // Do not auto-send files here; buttons above will trigger downloads via callback
    } catch (err) {
      logger.error('Search error', { err: err?.stack || String(err) });
      try { /* best-effort remove searching message */
        if (searchingMsg?.message_id) {
          try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
          await bot.deleteMessage(chatId, searchingMsg.message_id);
        }
      } catch {}
      bot.sendMessage(chatId, 'Search failed. Please try again later.');
    }
  };

  const handleSeriesSearch = async (chatId, query, opts = {}) => {
    const q = (query || '').trim();
    if (!q) return bot.sendMessage(chatId, 'Provide a series name.');
    const { directSeasonNum } = opts;
    
    try {
      logger.info('Starting series search', { query: q });
      const searchingMsg = await bot.sendMessage(chatId, `Searching for series: ${q}...`);
      await bot.sendChatAction(chatId, 'typing');

      // Import PirateBay and YTSTV for series search and IMDb helpers for exact counts
      const { searchPirateBay } = await import('../piratebay.js');
      const { searchYTSTVSeries } = await import('../ytstv.js');
      let extraResults = [];
      try {
        // Search YTSTV for series with season info
        const ytstvResults = await searchYTSTVSeries(q, { season: directSeasonNum });
        console.log(`[Series] YTSTV returned ${ytstvResults.length} items`);
        extraResults.push(...ytstvResults);
      } catch (e) {
        console.log('[Series] YTSTV error:', e?.message);
      }
      const { resolveImdbTconst, fetchImdbSeasonCounts, fetchTvMazeSeasonCounts } = await import('../imdb.js');
      
      // Search PirateBay with allowSeries=true and multiPage=true, merge with 1337x
      const pbResults = await searchPirateBay(q, { allowSeries: true, multiPage: true });
      console.log(`[Series] PirateBay returned ${pbResults.length} items`);
      const results = [...pbResults, ...extraResults];
      console.log(`[Series] Merged series results: ${results.length}`);
      
      logger.info('Series search completed', { query: q, count: results.length });
      
      if (!results.length) {
        try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
        try { await bot.deleteMessage(chatId, searchingMsg.message_id); } catch {}
        return bot.sendMessage(chatId, `No series found for "${q}".`);
      }

      // Optionally fetch authoritative season->episode counts from IMDb
      let imdbCounts = null;
      try {
        const tconst = await resolveImdbTconst(q);
        if (tconst) {
          imdbCounts = await fetchImdbSeasonCounts(tconst);
          if (imdbCounts) console.log('[Series] IMDb counts loaded for', q, Object.fromEntries(imdbCounts));
        }
        if (!imdbCounts) {
          const tvm = await fetchTvMazeSeasonCounts(q);
          if (tvm) { imdbCounts = tvm; console.log('[Series] TVMaze counts loaded for', q, Object.fromEntries(tvm)); }
        }
      } catch {}

      // Group results by season with accurate episode vs pack classification (collapsed per season)
      const seasonGroups = new Map(); // key: label e.g., "Season 01"
      const seasonMeta = new Map();   // key -> { hasCompletePack: boolean }
      for (const result of results) {
        const title = result.title || '';
        const lower = title.toLowerCase();
        // Detect season from Sxx or "Season xx"
        const seasonMatchS = title.match(/S(\d{1,2})/i);
        const seasonMatchWord = title.match(/Season\s*(\d{1,2})/i);
        const seasonNumRaw = seasonMatchS?.[1] || seasonMatchWord?.[1];

        // Episode detection variants: single or combined ranges
        //  - Single: SxxEyy, 1xNN, EpNN, Episode NN, ENN (with season present)
        //  - Combined: SxxEyy-Ezz, 1xNN-1xMM, ENN-EMM (season present)
        let epNums = [];
        // Combined patterns first
        const mSxErange = title.match(/S(\d{1,2})[^\n\r]*E(\d{1,2})\s*[-–]\s*E?(\d{1,2})/i);
        const mXrange = title.match(/\b(\d{1,2})x(\d{1,2})\s*[-–]\s*(?:\1x)?(\d{1,2})\b/i);
        const mErange = title.match(/\bE(\d{1,2})\s*[-–]\s*E?(\d{1,2})\b/i);
        if (mSxErange) {
          const start = parseInt(mSxErange[2], 10);
          const end = parseInt(mSxErange[3], 10);
          for (let e = start; e <= end; e++) epNums.push(e);
        } else if (mXrange) {
          const start = parseInt(mXrange[2], 10);
          const end = parseInt(mXrange[3], 10);
          for (let e = start; e <= end; e++) epNums.push(e);
        } else if (mErange && seasonNumRaw) {
          const start = parseInt(mErange[1], 10);
          const end = parseInt(mErange[2], 10);
          for (let e = start; e <= end; e++) epNums.push(e);
        } else {
          // Single-episode patterns
        const mSxEy = title.match(/S(\d{1,2})[^\n\r]*E(\d{1,2})/i);
        const mNxNN = title.match(/\b(\d{1,2})x(\d{1,2})\b/i);
        const mEpNN = title.match(/\bEp(?:isode)?\s*0?(\d{1,2})\b/i);
        const mEOnly = title.match(/\bE\s*0?(\d{1,2})\b/i);
        if (mSxEy) {
            epNums.push(parseInt(mSxEy[2], 10));
        } else if (mNxNN) {
            epNums.push(parseInt(mNxNN[2], 10));
        } else if (mEpNN) {
            epNums.push(parseInt(mEpNN[1], 10));
        } else if (mEOnly && seasonNumRaw) {
            epNums.push(parseInt(mEOnly[1], 10));
          }
        }

        const isCompletePack = lower.includes('complete') || lower.includes('full season') || lower.includes('season pack');

        let seasonLabel = 'Unknown Season';
        if (seasonNumRaw) {
          const seasonNum = seasonNumRaw.padStart(2, '0');
          seasonLabel = `Season ${seasonNum}`;
        } else if (opts?.directSeasonNum) {
          // If user explicitly requested a season but title lacks season tag, assume it for grouping
          seasonLabel = `Season ${opts.directSeasonNum}`;
        }

        if (!seasonGroups.has(seasonLabel)) seasonGroups.set(seasonLabel, []);
        
        // Handle YTSTV's __epNums field
        if (result.__epNums && Array.isArray(result.__epNums)) {
          for (const e of result.__epNums) {
            seasonGroups.get(seasonLabel).push({ ...result, __epNum: e });
          }
        } else if (epNums.length > 1) {
          // Map combined release to each episode number
          for (const e of epNums) {
            seasonGroups.get(seasonLabel).push({ ...result, __epNum: e });
          }
        } else {
          const epNum = epNums[0] ?? null;
          // If no explicit episode number but direct season is known, attempt to infer from title numbers like "Episode 5" or standalone numbers
          let inferredEp = epNum;
          if (inferredEp == null && opts?.directSeasonNum) {
            const m1 = title.match(/episode\s*0?(\d{1,2})/i);
            const m2 = title.match(/\bpart\s*0?(\d{1,2})\b/i);
            const m3 = title.match(/\b(?:ep|e)\s*0?(\d{1,2})\b/i);
            const m4 = title.match(/\b(?:\(|\[)?0?(\d{1,2})(?:\)|\])?\b/);
            const cands = [m1?.[1], m2?.[1], m3?.[1], m4?.[1]].filter(Boolean).map(x=>parseInt(x,10)).filter(n=>n>=1&&n<=99);
            if (cands.length) inferredEp = cands[0];
          }
          seasonGroups.get(seasonLabel).push({ ...result, __epNum: inferredEp });
        }
        const meta = seasonMeta.get(seasonLabel) || { hasCompletePack: false };
        if (isCompletePack) meta.hasCompletePack = true;
        seasonMeta.set(seasonLabel, meta);
      }

      // Prepare token storage (shortened for Telegram's 64-byte callback_data limit)
      const tokenId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      // Store season data for callbacks (include imdbCounts)
      seasonStore.set(tokenId, { query: q, seasonGroups, imdbCounts, createdAt: Date.now(), chatId });
      setTimeout(() => seasonStore.delete(tokenId), 2 * 60 * 60 * 1000); // 2 hours

      // Initialize keyboard for season selection
      const keyboard = { inline_keyboard: [] };

      // Build season buttons with accurate counts; sort numerically and group completes after their season
      const seasonKeys = Array.from(seasonGroups.keys());
      const sortKey = (label) => {
        if (label === 'Unknown Season') return { n: 9999, complete: 1 };
        const m = label.match(/Season\s+(\d{2}|\d{1})/i);
        const n = m ? parseInt(m[1], 10) : 9999;
        const complete = label.includes('(Complete)') ? 1 : 0; // base season first
        return { n, complete };
      };
      const sortedSeasons = seasonKeys.sort((a, b) => {
        const A = sortKey(a); const B = sortKey(b);
        if (A.n !== B.n) return A.n - B.n;
        return A.complete - B.complete;
      });

      for (const season of sortedSeasons) {
        const items = seasonGroups.get(season) || [];
        const meta = seasonMeta.get(season) || { hasCompletePack: false };
        // Unique episode numbers count to avoid duplicates
        const uniqueEpNums = new Set(items.filter(it => it.__epNum != null).map(it => it.__epNum));
        let episodeCount = uniqueEpNums.size;
        // If IMDb has authoritative count for this season, prefer it
        if (imdbCounts && season.startsWith('Season ')) {
          const sn = season.split(' ')[1]; // '01'
          const imdbNum = imdbCounts.get(sn);
          if (typeof imdbNum === 'number') episodeCount = imdbNum;
        }
        // Hide tiny Unknown Season noise
        if (season === 'Unknown Season' && items.length < 5) continue;
        // Skip seasons with zero detected episodes
        if (season !== 'Unknown Season' && episodeCount === 0 && !meta.hasCompletePack) continue;
        const extra = meta.hasCompletePack ? ' • Pack' : '';
        const label = season === 'Unknown Season'
          ? `Unknown Season (${items.length} items)`
          : `${season} (${episodeCount} episodes)${extra}`;
        keyboard.inline_keyboard.push([
          { text: `📺 ${label}`, callback_data: `season:${tokenId}:${season}` }
        ]);
      }

      // If a direct season was requested (e.g., S01), render it immediately and RETURN
      if (directSeasonNum) {
        const label = `Season ${directSeasonNum}`;
        const seasonItems = seasonGroups.get(label) || [];
        
        if (seasonItems.length) {
          try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
          try { await bot.deleteMessage(chatId, searchingMsg.message_id); } catch {}
          
          // Process episodes for the specific season
            const seasonNum = directSeasonNum;
            const langMode = 'all';
          let singleEpisodeItems = seasonItems.filter(ep => {
              const title = ep.title || '';
              const lower = title.toLowerCase();
              const isPack = /(complete|season\s*pack|full\s*season)/i.test(lower)
                || /S\s*0?\d\s*[-–to]+\s*S\s*0?\d/i.test(title)
                || /S\d{1,2}[^\n\r]{0,40}S\d{1,2}/i.test(title)
                || /E\s*0?\d\s*[-–to]+\s*E\s*0?\d/i.test(title)
                || /E\d{1,2}[^\n\r]{0,20}E\d{1,2}/i.test(title);
              // Allow combined-episode releases that we've already mapped to a specific episode
              if (isPack && (ep.__epNum == null)) return false;

            // Resolve episode number from multiple possible patterns.
            const sxe = title.match(/S(\d{1,2}).{0,20}?E(\d{1,2})/i);
            const nxnn = title.match(/\b(\d{1,2})x(\d{1,2})\b/i);
            const eonly = title.match(/\bE(\d{1,2})\b/i) || title.match(/\bEp(?:isode)?\s*0?(\d{1,2})\b/i);

            let resolved = null;
            // Prefer SxxEyy if present and season matches
            if (sxe) {
              const s = String(parseInt(sxe[1],10)).padStart(2,'0');
              if (s === seasonNum) resolved = parseInt(sxe[2],10);
            }
            // Next prefer NxNN if season matches and no conflict
            if (!resolved && nxnn) {
              const s = String(parseInt(nxnn[1],10)).padStart(2,'0');
              if (s === seasonNum) resolved = parseInt(nxnn[2],10);
            }
            // Finally accept Eyy if nothing else
            if (!resolved && eonly) {
              resolved = parseInt(eonly[1],10);
            }
            if (!resolved) return false;

            ep.__epNum = ep.__epNum != null ? ep.__epNum : resolved;
              if (langMode !== 'all') {
                const isHindi = /(\bhin\b|hindi|hind|dubbed\s*hindi|hindi\s*dub)/i.test(lower);
                if (langMode === 'hi' && !isHindi) return false;
                if (langMode === 'en' && isHindi) return false;
              }
              return ep.__epNum != null;
            });
          
          if (singleEpisodeItems.length) {
            const bestByEpisode = new Map();
            const MAX_SIZE_GB = 5;
            const MAX_SIZE_BYTES = MAX_SIZE_GB * 1024 * 1024 * 1024;
            const MIN_SEEDERS = 15;
            
            // Smart selection per your rule:
            // 1) Consider only 720p/1080p
            // 2) Prefer <=5GB with seeders >=15
            // 3) If none <=5GB meet >=15, allow >5GB with >=15 seeders
            // 4) If still none, fallback to highest-seeded 720p+ regardless of size
            // 5) YTSTV results (no seeders) are treated as fallback with quality preference
            for (const ep of singleEpisodeItems) {
              const k = ep.__epNum;
              const current = bestByEpisode.get(k);
              
              // Check if quality meets minimum requirement (720p or higher)
              const getQualityScore = (item) => {
                const quality = (item.quality || '').toLowerCase();
                if (quality.includes('2160p') || quality.includes('4k')) return 4;
                if (quality.includes('1080p')) return 3;
                if (quality.includes('720p')) return 2;
                if (quality.includes('480p') || quality.includes('360p')) return 1;
                return 0; // Unknown quality
              };
              
              const currentQuality = current ? getQualityScore(current) : 0;
              const newQuality = getQualityScore(ep);
              
              // Skip if quality is below 720p (score < 2)
              if (newQuality < 2) continue;
              
              if (!current) {
                bestByEpisode.set(k, ep);
                continue;
              }
              
              // Skip current if it's below 720p quality
              if (currentQuality < 2) {
                bestByEpisode.set(k, ep);
                continue;
              }
              
              const currentSize = current.size || 0;
              const newSize = ep.size || 0;
              const currentUnderLimit = currentSize <= MAX_SIZE_BYTES;
              const newUnderLimit = newSize <= MAX_SIZE_BYTES;
              const currentSeeders = current.seeders || 0;
              const newSeeders = ep.seeders || 0;
              
              // Handle direct downloads vs torrents
              const hasDirectDownload = ep.direct_url || ep.stream_url || ep.file_host_url;
              const currentHasDirectDownload = current.direct_url || current.stream_url || current.file_host_url;
              
              if (hasDirectDownload && !currentHasDirectDownload) {
                // Prefer direct downloads over torrents
                bestByEpisode.set(k, ep);
                continue;
              } else if (!hasDirectDownload && currentHasDirectDownload) {
                // Keep current direct download
                continue;
              } else if (hasDirectDownload && currentHasDirectDownload) {
                // Both have direct downloads - prefer higher quality
                if (newQuality > currentQuality) {
                  bestByEpisode.set(k, ep);
                }
                continue;
              }
              
              // Handle YTSTV (no seeder info) - treat as fallback with quality preference
              const isYTSTV = ep.source === 'YTSTV';
              const isCurrentYTSTV = current.source === 'YTSTV';
              
              if (isYTSTV && !isCurrentYTSTV) {
                // Only use YTSTV if current has no seeders or very low seeders
                if (currentSeeders < 5) {
                  bestByEpisode.set(k, ep);
                }
                continue;
              } else if (!isYTSTV && isCurrentYTSTV) {
                // Prefer non-YTSTV if it has reasonable seeders
                if (newSeeders >= 1) {
                  bestByEpisode.set(k, ep);
                }
                continue;
              } else if (isYTSTV && isCurrentYTSTV) {
                // Both YTSTV - prefer higher quality
                if (newQuality > currentQuality) {
                  bestByEpisode.set(k, ep);
                }
                continue;
              }
              
              // Regular seeder-based logic for non-YTSTV sources
              const currentPreferred = currentUnderLimit && currentSeeders >= MIN_SEEDERS;
              const newPreferred = newUnderLimit && newSeeders >= MIN_SEEDERS;

              if (currentPreferred && newPreferred) {
                // both good: higher seeders wins
                if (newSeeders > currentSeeders) bestByEpisode.set(k, ep);
              } else if (!currentPreferred && newPreferred) {
                // new upgrades to preferred tier
                bestByEpisode.set(k, ep);
              } else if (currentPreferred && !newPreferred) {
                // keep current preferred
              } else {
                // Neither in preferred tier. Check secondary tier: (>5GB && seeders>=MIN_SEEDERS)
                const currentSecondary = !currentUnderLimit && currentSeeders >= MIN_SEEDERS;
                const newSecondary = !newUnderLimit && newSeeders >= MIN_SEEDERS;
                if (currentSecondary && newSecondary) {
                  if (newSeeders > currentSeeders) bestByEpisode.set(k, ep);
                } else if (!currentSecondary && newSecondary) {
                  bestByEpisode.set(k, ep);
                } else if (currentSecondary && !newSecondary) {
                  // keep current secondary
                } else {
                  // Fallback: neither meets >=15 seeders.
                  // Choose higher seeders (must be >=1) regardless of size to avoid dead torrents.
                  const curS = currentSeeders || 0;
                  const newS = newSeeders || 0;
                  if (newS >= 1 && newS > curS) bestByEpisode.set(k, ep);
                }
              }
            }
            let sortedEpisodes = Array.from(bestByEpisode.keys()).sort((a,b)=>a-b).map(k=>bestByEpisode.get(k));
            
            // For episodes with no results, try to find any available torrent (even 0 seeders) as last resort
            const expectedEpisodes = imdbCounts ? imdbCounts.get(seasonNum) : 10;
            if (expectedEpisodes && sortedEpisodes.length < expectedEpisodes) {
              console.log(`[DEBUG] Only found ${sortedEpisodes.length}/${expectedEpisodes} episodes, looking for fallbacks...`);
              
              // Find missing episode numbers
              const foundEps = new Set(sortedEpisodes.map(ep => ep.__epNum));
              const missingEps = [];
              for (let i = 1; i <= expectedEpisodes; i++) {
                if (!foundEps.has(i)) missingEps.push(i);
              }
              
              // Look for direct downloads for missing episodes (no low-seeder torrents)
              for (const missingEp of missingEps) {
                const fallback = singleEpisodeItems.find(ep => 
                  ep.__epNum === missingEp && 
                  (ep.direct_url || ep.stream_url || ep.file_host_url) // Only direct downloads
                );
                if (fallback) {
                  console.log(`[DEBUG] Adding direct download fallback for Episode ${missingEp}`);
                  sortedEpisodes.push(fallback);
                }
              }
            }
            
            // Smart filtering: Only keep episodes with >=15 seeders OR direct downloads
            sortedEpisodes = sortedEpisodes.filter(ep => ep && (
              (ep.seeders || 0) >= 15 || // High seeders for torrents
              ep.direct_url || ep.stream_url || ep.file_host_url // Direct downloads regardless of seeders
            ));
            // Use IMDb data to limit episodes to correct count
            if (imdbCounts) { 
              const cap = imdbCounts.get(seasonNum); 
              if (typeof cap==='number'&&cap>0) {
                sortedEpisodes = sortedEpisodes.filter(e=>e.__epNum<=cap);
                console.log(`[DEBUG] Limited to ${cap} episodes for Season ${seasonNum} based on IMDb data`);
              }
            }
            
            // Auto-queue background streaming for missing or low-seed episodes
            try {
              const expectedCount = (imdbCounts && imdbCounts.get(seasonNum)) ? Number(imdbCounts.get(seasonNum)) : null;
              const present = new Map(); // epNum -> info
              for (const ep of sortedEpisodes) {
                if (ep && typeof ep.__epNum === 'number') {
                  present.set(ep.__epNum, ep);
                }
              }
              // Queue for low-seed torrents (<15) without direct alternatives
              for (const [epNum, ep] of present.entries()) {
                const seeders = parseInt(ep.seeders || ep.seeds || 0, 10) || 0;
                const hasDirect = !!(ep.direct_url || ep.stream_url || ep.file_host_url);
                if (!hasDirect && seeders < 15) {
                  const epTitle = `${q} S${seasonNum}E${String(epNum).padStart(2,'0')}`;
                  if (typeof integratedDownloader?.enqueueStreamingJob === 'function') {
                    integratedDownloader.enqueueStreamingJob({ title: epTitle, chatId });
                  }
                }
              }
              // Queue for missing episodes if authoritative expected count is known
              if (expectedCount && Number.isFinite(expectedCount)) {
                for (let epNum = 1; epNum <= expectedCount; epNum++) {
                  if (!present.has(epNum)) {
                    const epTitle = `${q} S${seasonNum}E${String(epNum).padStart(2,'0')}`;
                    if (typeof integratedDownloader?.enqueueStreamingJob === 'function') {
                      integratedDownloader.enqueueStreamingJob({ title: epTitle, chatId });
                    }
                  }
                }
              }
            } catch {}
            
            // File size filtering is now handled in smart selection above
            
            const episodeLines = sortedEpisodes.slice(0, 10).map((ep, idx) => {
              const title = ep.title || ''; const quality = ep.quality || 'Unknown'; const seeders = ep.seeders || 0;
              const size = ep.size ? `${(ep.size / (1024*1024*1024)).toFixed(1)}GB` : 'Unknown';
              
              // Show download type based on seeder count
              let downloadType = '';
              if (seeders >= 15) {
                downloadType = `🧲 ${seeders} seeds (Torrent)`;
              } else if (ep.direct_url) {
                downloadType = `🎬 Direct Download`;
              } else if (ep.stream_url) {
                downloadType = `🎥 Stream Convert`;
              } else if (ep.file_host_url) {
                downloadType = `📂 File Host`;
              } else {
                downloadType = `${seeders} seeds`;
              }
              
              return `${idx+1}. ${title}\n   ${quality} • ${downloadType} • ${size}`;
            });
            
            const text = `📺 **${label} - ${q}**\n\n${episodeLines.join('\n\n')}${sortedEpisodes.length>10?`\n\n... and ${sortedEpisodes.length-10} more episodes`:''}`;
            const downloadKeyboard = { inline_keyboard: [] };
            const episodeTokenId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            episodeStore.set(episodeTokenId, { episodes: sortedEpisodes, season: label, query: q, createdAt: Date.now(), chatId });
            setTimeout(()=>episodeStore.delete(episodeTokenId), 2*60*60*1000); // 2 hours
            
            // Try to fetch season poster
            let seasonPoster = null;
            try {
              seasonPoster = await fetchPosterForTitle(`${q} ${label}`);
            } catch (error) {
              console.log('[DEBUG] Could not fetch season poster:', error.message);
            }
            
            const episodesToShow = sortedEpisodes.slice(0, sortedEpisodes.length);
            
            // Create individual episode buttons in single column for faster access
            for (let i=0;i<episodesToShow.length;i++){
              const ep=episodesToShow[i]; 
              const epNum=ep.__epNum!=null?String(ep.__epNum).padStart(2,'0'):(i+1); 
              const epId=`${i}`; 
              downloadKeyboard.inline_keyboard.push([
                { text:`📺 Episode ${epNum}`, callback_data:`ep:${episodeTokenId}:${epId}` }
              ]);
            }
            
            // Add Download All button prominently at the bottom
            if (sortedEpisodes.length>1){ 
              downloadKeyboard.inline_keyboard.push([
                { text:`📦 Download All Episodes (${sortedEpisodes.length})`, callback_data:`download_all:${episodeTokenId}`}
              ]); 
            }

            // If we didn't meet the expected episode count, surface a season pack button when available
            try {
              const expectedCap = (imdbCounts && imdbCounts.get(seasonNum)) ? Number(imdbCounts.get(seasonNum)) : null;
              const missing = expectedCap && Number.isFinite(expectedCap) ? Math.max(0, expectedCap - sortedEpisodes.length) : 0;
              if (missing > 0) {
                // Identify season pack candidates from seasonItems
                const isPackTitle = (t) => {
                  const lower = String(t||'').toLowerCase();
                  return /complete|full\s*season|season\s*pack/.test(lower);
                };
                const packCandidates = (seasonItems||[]).filter(it => isPackTitle(it.title));
                if (packCandidates.length) {
                  // Prefer direct .torrent and higher quality then higher seeders
                  const qRank = (q) => {
                    const qq = String(q||'').toLowerCase();
                    if (qq.includes('2160')) return 1;
                    if (qq.includes('1080')) return 2;
                    if (qq.includes('720')) return 3;
                    return 9;
                  };
                  packCandidates.sort((a,b)=>{
                    const qa = qRank(a.quality); const qb = qRank(b.quality);
                    if (qa!==qb) return qa - qb;
                    const sa = parseInt(a.seeders||0,10); const sb = parseInt(b.seeders||0,10);
                    return sb - sa;
                  });
                  const bestPack = packCandidates[0];
                  if (bestPack && (bestPack.torrent_url || bestPack.magnet || bestPack.link)) {
                    const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const url = bestPack.torrent_url || bestPack.magnet || bestPack.link;
                    downloadStore.set(tokenId, { title: `${q} — ${label} (Complete)`, quality: bestPack.quality || 'HD', url, size: bestPack.size || null, createdAt: Date.now(), allowMagnetFallback: true });
                    setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000);
                    downloadKeyboard.inline_keyboard.push([
                      { text:`📦 Season ${seasonNum} Complete Pack`, callback_data:`dl:${tokenId}` }
                    ]);
                  }
                }
              }
            } catch {}
            // Send with poster if available, otherwise send as text
            if (seasonPoster) {
              await bot.sendPhoto(chatId, seasonPoster, { 
                caption: text, 
                parse_mode: 'Markdown', 
                disable_web_page_preview: true,
                reply_markup: downloadKeyboard 
              }).catch(() => {
                // Fallback to text if photo fails
                bot.sendMessage(chatId, text, { parse_mode:'Markdown', disable_web_page_preview:true, reply_markup: downloadKeyboard });
              });
            } else {
              await bot.sendMessage(chatId, text, { parse_mode:'Markdown', disable_web_page_preview:true, reply_markup: downloadKeyboard });
            }
            return; // Show episodes directly for specific season
          }
        }
      }

      // If no specific season was requested, show available seasons info
      const msgText = `🎬 **Series Found: ${q}**\n\nAvailable seasons found. Use \`/series ${q} S01\` to search for a specific season.`;
      try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
      try { await bot.deleteMessage(chatId, searchingMsg.message_id); } catch {}
      
      // Try to fetch series poster
      let seriesPoster = null;
      try {
        seriesPoster = await fetchPosterForTitle(q);
      } catch (error) {
        console.log('[DEBUG] Could not fetch series poster:', error.message);
      }
      
      // Send with poster if available, otherwise send as text
      if (seriesPoster) {
        await bot.sendPhoto(chatId, seriesPoster, { 
          caption: msgText, 
          parse_mode: 'Markdown', 
          disable_web_page_preview: true
        }).catch(() => {
          // Fallback to text if photo fails
          bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        });
      } else {
        await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
      }

    } catch (err) {
      logger.error('Series search error', { err: err?.stack || String(err) });
      try {
        if (searchingMsg?.message_id) {
          try { await bot.editMessageText(' ', { chat_id: chatId, message_id: searchingMsg.message_id }); } catch {}
          await bot.deleteMessage(chatId, searchingMsg.message_id);
        }
      } catch {}
      bot.sendMessage(chatId, 'Series search failed. Please try again later.');
    }
  };

  // Remove /search command: rely on plain text queries only

  // Fallback: plain text triggers search
  bot.on('message', async (msg) => {
    const text = (msg.text || '').trim();
    console.log('[DEBUG] Received message:', { text, chatId: msg.chat.id, isCommand: text.startsWith('/') });
    if (!text || text.startsWith('/')) return; // ignore commands handled elsewhere
    console.log('[DEBUG] Triggering search for plain text:', text);
    await handleSearch(msg.chat.id, text);
  });

  // Handle language selection callbacks
  bot.on('callback_query', async (cb) => {
    const data = cb.data || '';
    try {
      console.log(`[DEBUG] callback_query received: ${data}`);
      // Immediate ack so Telegram clears the spinner even if we do heavier work later
      await bot.answerCallbackQuery(cb.id, { text: 'Processing…', show_alert: false }).catch(() => {});
    } catch {}

    // Handle direct download requests for YTS/PirateBay
    if (data.startsWith('dl:')) {
      const chatId = cb.message?.chat?.id;
      const tokenId = data.split(':')[1];
      const entry = downloadStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Download expired. Search again.' });
      }
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
      }
      try {
        await bot.answerCallbackQuery(cb.id, { text: `Sending ${entry.quality}…` });
        
        // Handle magnet links as clickable text messages (works on both desktop and mobile)
        if (entry.url && entry.url.startsWith('magnet:')) {
          // 1) Try to convert magnet -> validated .torrent and send as document
          try {
            const magnetUrl = entry.url;
            const infoHash = magnetUrl.match(/btih:([a-f0-9]{40})/i)?.[1];
            if (infoHash) {
              const cacheServices = [
                `https://itorrents.org/torrent/${infoHash}.torrent`,
                `https://torrage.info/torrent.php?h=${infoHash}`,
                `https://btcache.me/torrent/${infoHash}.torrent`,
                `https://zoink.it/torrent/${infoHash}.torrent`,
                `https://torrent-download.to/${infoHash}.torrent`,
                `https://torcache.net/torrent/${infoHash}.torrent`
              ];

              let torrentBuffer = null;
              for (const cacheUrl of cacheServices) {
                try {
                  const fileResp = await http.get(cacheUrl, { responseType: 'arraybuffer', timeout: 12000 });
                  if (fileResp.data && fileResp.data.length > 2000) {
                    const buffer = Buffer.from(fileResp.data);
                    const head = buffer.toString('utf8', 0, Math.min(100, buffer.length));
                    if (head.startsWith('d') || head.includes('announce') || head.includes('info')) {
                      torrentBuffer = buffer;
                      break;
                    }
                  }
                } catch {}
              }

              if (torrentBuffer) {
                // Enhance torrent with a robust announce-list before sending
                const enhanceTorrentTrackers = (buffer) => {
                  const trackers = [
                    'udp://tracker.opentrackr.org:1337/announce',
                    'udp://tracker.torrent.eu.org:451/announce',
                    'udp://open.demonii.com:1337/announce',
                    'udp://exodus.desync.com:6969/announce',
                    'udp://tracker.openbittorrent.com:6969/announce',
                    'udp://opentracker.i2p.rocks:6969/announce',
                    'udp://tracker1.bt.moack.co.kr:80/announce',
                    'udp://tracker-udp.gbitt.info:80/announce',
                    'udp://tracker.tiny-vps.com:6969/announce',
                    'udp://movies.zsw.ca:6969/announce'
                  ];
                  try {
                    let i = 0; const data = buffer;
                    const decode = () => {
                      const ch = String.fromCharCode(data[i]);
                      if (ch === 'i') { i++; let end = data.indexOf(101, i); const num = parseInt(Buffer.from(data.slice(i, end)).toString('utf8'), 10); i = end + 1; return num; }
                      if (ch === 'l') { i++; const arr = []; while (data[i] !== 101) arr.push(decode()); i++; return arr; }
                      if (ch === 'd') { i++; const obj = {}; while (data[i] !== 101) { const k = decode(); const v = decode(); obj[k] = v; } i++; return obj; }
                      let colon = data.indexOf(58, i); const len = parseInt(Buffer.from(data.slice(i, colon)).toString('utf8'), 10); colon++; const strBuf = Buffer.from(data.slice(colon, colon + len)); i = colon + len; return strBuf;
                    };
                    const encode = (val) => {
                      if (Buffer.isBuffer(val)) return Buffer.concat([Buffer.from(String(val.length)+':'), val]);
                      if (typeof val === 'string') { const b = Buffer.from(val, 'utf8'); return Buffer.concat([Buffer.from(String(b.length)+':'), b]); }
                      if (typeof val === 'number') return Buffer.from('i'+String(val)+'e');
                      if (Array.isArray(val)) { const parts = [Buffer.from('l')]; val.forEach(v=>parts.push(encode(v))); parts.push(Buffer.from('e')); return Buffer.concat(parts); }
                      if (val && typeof val === 'object') { const keys = Object.keys(val).sort(); const parts = [Buffer.from('d')]; keys.forEach(k=>{ parts.push(encode(k)); parts.push(encode(val[k])); }); parts.push(Buffer.from('e')); return Buffer.concat(parts); }
                      return Buffer.from('');
                    };
                    const root = decode();
                    if (root && typeof root === 'object') {
                      const announce = (root['announce'] && Buffer.isBuffer(root['announce'])) ? root['announce'].toString('utf8') : trackers[0];
                      const annList = Array.isArray(root['announce-list']) ? root['announce-list'] : [];
                      const current = new Set();
                      annList.forEach(tier => { if (Array.isArray(tier) && tier[0]) current.add(Buffer.isBuffer(tier[0]) ? tier[0].toString('utf8') : String(tier[0])); });
                      current.add(announce);
                      trackers.forEach(t => current.add(t));
                      root['announce'] = Buffer.from(announce, 'utf8');
                      root['announce-list'] = Array.from(current).map(t => [Buffer.from(t,'utf8')]);
                      return encode(root);
                    }
                  } catch {}
                  return buffer; // fallback unchanged
                };
                torrentBuffer = enhanceTorrentTrackers(torrentBuffer);
                const safeBase = `${entry.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${(entry.quality || 'HD')}`.replace(/\s+/g, '_');
                const filename = `${safeBase}.torrent`;
                const tmpPath = path.join(os.tmpdir(), filename);
                fs.writeFileSync(tmpPath, torrentBuffer);
                await bot.sendDocument(
                  chatId,
                  tmpPath,
                  { caption: `📁 ${entry.title} — ${entry.quality}`, parse_mode: 'HTML', disable_web_page_preview: true, disable_content_type_detection: true },
                  { filename, contentType: 'application/x-bittorrent' }
                );
                try { fs.unlinkSync(tmpPath); } catch {}
                return; // do not fall through to magnet text when .torrent succeeded
              }
            }
          } catch {}

          // 2) If conversion failed and we are not allowed to send raw magnets, stop here
          if (entry.allowMagnetFallback === false) {
            await bot.answerCallbackQuery(cb.id, { text: 'No cached .torrent for this variant. Try another.' });
            return;
          }

          // 3) Otherwise send the raw magnet as text with an HTML anchor for easy tap
          // Build a clean magnet (btih + expanded trackers)
          const ih = entry.url.match(/btih:([a-f0-9]{40})/i)?.[1];
          const baseMagnet = ih ? `magnet:?xt=urn:btih:${ih}` : entry.url;
          const trackers = [
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://tracker.torrent.eu.org:451/announce',
            'udp://open.demonii.com:1337/announce',
            'udp://exodus.desync.com:6969/announce',
            'udp://tracker.openbittorrent.com:6969/announce',
            'udp://opentracker.i2p.rocks:6969/announce',
            'udp://tracker1.bt.moack.co.kr:80/announce',
            'udp://tracker-udp.gbitt.info:80/announce',
            'udp://tracker.tiny-vps.com:6969/announce',
            'udp://movies.zsw.ca:6969/announce'
          ];
          const tr = trackers.map(t => `tr=${encodeURIComponent(t)}`).join('&');
          const cleanMagnet = baseMagnet.includes('tr=') ? baseMagnet : `${baseMagnet}&${tr}`;
          const href = cleanMagnet.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          const text = `🧲 ${entry.title} — ${entry.quality}\n\n${cleanMagnet}\n\n<a href="${href}">Tap to open magnet</a>`;
          await bot.sendMessage(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
        } else if (entry.type === 'direct_download') {
          // Handle direct video file downloads
          await bot.answerCallbackQuery(cb.id, { text: `Downloading ${entry.quality}...` });
          
          try {
            const { downloadDirectFile } = await import('../directDownload.js');
            const filename = `${entry.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${entry.quality}.${entry.url.split('.').pop()}`;
            const downloadPath = path.join(DOWNLOAD_DIR, filename);
            
            const result = await downloadDirectFile(entry.url, filename);
            
            if (result.success) {
              // Move file to download directory
              const finalPath = path.join(DOWNLOAD_DIR, filename);
              if (result.filePath !== finalPath) {
                fs.copyFileSync(result.filePath, finalPath);
                fs.unlinkSync(result.filePath);
              }
              
              // Send file via Telegram
              await bot.sendDocument(
                chatId,
                finalPath,
                { 
                  caption: `🎬 ${entry.title} — ${entry.quality} (Direct Download)\n\n📁 Also available at: http://localhost:8080/download/${encodeURIComponent(filename)}`, 
                  parse_mode: 'HTML', 
                  disable_web_page_preview: true 
                }
              );
              
              // Don't delete - keep for file server
              console.log(`[DirectDownload] File saved to: ${finalPath}`);
            } else {
              await bot.sendMessage(chatId, `❌ Download failed: ${result.error}`);
            }
          } catch (error) {
            console.error('[DirectDownload] Error:', error);
            await bot.sendMessage(chatId, `❌ Download error: ${error.message}`);
          }
        } else if (entry.type === 'stream_convert') {
          // Handle stream conversion
          await bot.answerCallbackQuery(cb.id, { text: `Converting stream to video...` });
          
          try {
            const { convertStreamingContent } = await import('../simple-converter.js');
            
            // Show format selection
            const formatButtons = entry.formats.map(format => ({
              text: `Convert to ${format.toUpperCase()}`,
              callback_data: `convert:${tokenId}:${format}`
            }));
            
            await bot.sendMessage(chatId, `🎥 Choose format for ${entry.title}:`, {
              reply_markup: { inline_keyboard: [formatButtons] }
            });
          } catch (error) {
            console.error('[StreamConvert] Error:', error);
            await bot.sendMessage(chatId, `❌ Conversion error: ${error.message}`);
          }
        } else if (entry.type === 'file_host') {
          // Handle file host links
          await bot.answerCallbackQuery(cb.id, { text: `Opening file host...` });
          
          const message = `📂 **File Host Link**\n\n**${entry.title}** — ${entry.quality}\n\n🔗 [Download from ${entry.source}](${entry.url})\n\n*Note: You may need to complete captcha or wait for countdown*`;
          
          await bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
          });
        } else {
          // Handle .torrent files (YTS/PirateBay)
          const fileResp = await http.get(entry.url, { responseType: 'arraybuffer', timeout: 20000 });
          // Inject additional trackers into the .torrent to improve peer discovery
          const enhanceTorrentTrackers = (buffer) => {
            const trackers = [
              'udp://tracker.opentrackr.org:1337/announce',
              'udp://tracker.torrent.eu.org:451/announce',
              'udp://open.demonii.com:1337/announce',
              'udp://exodus.desync.com:6969/announce',
              'udp://tracker.openbittorrent.com:6969/announce',
              'udp://opentracker.i2p.rocks:6969/announce',
              'udp://tracker1.bt.moack.co.kr:80/announce',
              'udp://tracker-udp.gbitt.info:80/announce',
              'udp://tracker.tiny-vps.com:6969/announce',
              'udp://movies.zsw.ca:6969/announce'
            ];
            try {
              // Minimal bencode decode/encode for dict/list/int/string
              let i = 0; const data = buffer;
              const decode = () => {
                const ch = String.fromCharCode(data[i]);
                if (ch === 'i') { // int
                  i++; let end = data.indexOf(101, i); // 'e'
                  const num = parseInt(Buffer.from(data.slice(i, end)).toString('utf8'), 10);
                  i = end + 1; return num;
                }
                if (ch === 'l') { // list
                  i++; const arr = []; while (data[i] !== 101) arr.push(decode()); i++; return arr;
                }
                if (ch === 'd') { // dict
                  i++; const obj = {}; while (data[i] !== 101) { const k = decode(); const v = decode(); obj[k] = v; } i++; return obj;
                }
                // string: <len>:<data>
                let colon = data.indexOf(58, i); // ':'
                const len = parseInt(Buffer.from(data.slice(i, colon)).toString('utf8'), 10);
                colon++; const strBuf = Buffer.from(data.slice(colon, colon + len)); i = colon + len; return strBuf;
              };
              const encode = (val) => {
                if (Buffer.isBuffer(val)) return Buffer.concat([Buffer.from(String(val.length)+':'), val]);
                if (typeof val === 'string') { const b = Buffer.from(val, 'utf8'); return Buffer.concat([Buffer.from(String(b.length)+':'), b]); }
                if (typeof val === 'number') return Buffer.from('i'+String(val)+'e');
                if (Array.isArray(val)) { const parts = [Buffer.from('l')]; val.forEach(v=>parts.push(encode(v))); parts.push(Buffer.from('e')); return Buffer.concat(parts); }
                if (val && typeof val === 'object') { const keys = Object.keys(val).sort(); const parts = [Buffer.from('d')]; keys.forEach(k=>{ parts.push(encode(k)); parts.push(encode(val[k])); }); parts.push(Buffer.from('e')); return Buffer.concat(parts); }
                return Buffer.from('');
              };
              const root = decode();
              if (root && typeof root === 'object') {
                // ensure announce and announce-list
                const announce = (root['announce'] && Buffer.isBuffer(root['announce'])) ? root['announce'].toString('utf8') : trackers[0];
                const annList = Array.isArray(root['announce-list']) ? root['announce-list'] : [];
                const current = new Set();
                annList.forEach(tier => { if (Array.isArray(tier) && tier[0]) current.add(Buffer.isBuffer(tier[0]) ? tier[0].toString('utf8') : String(tier[0])); });
                current.add(announce);
                trackers.forEach(t => current.add(t));
                root['announce'] = Buffer.from(announce, 'utf8');
                root['announce-list'] = Array.from(current).map(t => [Buffer.from(t,'utf8')]);
                return encode(root);
              }
            } catch {}
            return buffer; // fallback unchanged
          };
          let fileBuffer = Buffer.from(fileResp.data);
          fileBuffer = enhanceTorrentTrackers(fileBuffer);
          const baseTitle = `${entry.title.replace(/[^\w\-\s\.]/g,' ').trim()}_${(entry.quality || 'HD')}`.replace(/\s+/g,'_');
          const filename = `${baseTitle}.torrent`;
          const caption = `📁 ${entry.title} — ${entry.quality}`;
          const tmpPath = path.join(os.tmpdir(), filename);
          fs.writeFileSync(tmpPath, fileBuffer);
          await bot.sendDocument(
            chatId,
            tmpPath,
            { caption, parse_mode: 'HTML', disable_web_page_preview: true, disable_content_type_detection: true },
            { filename, contentType: 'application/x-bittorrent' }
          );
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      } catch (e) {
        console.warn('[DownloadCB] Failed to fetch .torrent', { url: entry.url, error: e?.message });
        await bot.answerCallbackQuery(cb.id, { text: 'Download failed. Try another quality.' });
      }
      return; // handled
    }
    // proceed to handle language selection for Movierulz only when present
    if (!data.startsWith('mlang:')) {
      // not a Movierulz language selection; continue to other handlers
    } else {
      const chatId = cb.message?.chat?.id;
      const [_, tokenId, langRaw] = data.split(':');
      if (!tokenId || !langRaw) return;
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
      }
      const entry = selectionStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Selection expired. Please search again.' });
      }
      const lang = langRaw;
      const list = entry.byLang.get(lang) || [];
      if (!list.length) {
        return bot.answerCallbackQuery(cb.id, { text: 'No results for this language.' });
      }
      await bot.answerCallbackQuery(cb.id, { text: `Showing ${lang}` });
      // ... existing Movierulz rendering code continues below ...
    }
    if (data.startsWith('mlang:')) {
      const chatId = cb.message?.chat?.id;
      const [_, tokenId, langRaw] = data.split(':');
      if (!tokenId || !langRaw) return;
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
      }
      const entry = selectionStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Selection expired. Please search again.' });
      }
      const lang = langRaw;
      const list = entry.byLang.get(lang) || [];
      if (!list.length) {
        return bot.answerCallbackQuery(cb.id, { text: 'No results for this language.' });
      }
      await bot.answerCallbackQuery(cb.id, { text: `Showing ${lang}` });

    const escapeMarkdown = (s) => String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
    const htmlEscape = (s) => String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');

    // Enrich Movierulz items by fetching per-item links and resolving missing-quality torrents
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const isMovierulz = item.source && item.source.toLowerCase() === 'movierulz';
      if (isMovierulz && item.link) {
        try {
          // Slow mode: allow deeper redirects and longer timeout when needed
          const torrents = await fetchMovierulzTorrents(item.link, { timeoutMs: 20000, maxDepth: 3 });
          if (Array.isArray(torrents) && torrents.length) {
            item.torrents = torrents;
            item.torrent_url = torrents.find(t => t.type === 'torrent')?.url || null;
          }
          // Resolve magnets into direct .torrent variants and keep multiple distinct ones
          const magnets = (item.torrents || []).filter(t => t && t.type === 'magnet' && t.url && String(t.url).startsWith('magnet:'));
          const seenTorrentIds = new Set((item.torrents || [])
            .filter(t => t && t.url)
            .map(t => {
              const u = String(t.url);
              const ih = u.match(/[A-Fa-f0-9]{40}(?=\.|$)/)?.[0] || u.match(/btih[=/:]([A-Fa-f0-9]{40})/)?.[1];
              return ih ? ih.toLowerCase() : u.slice(0, 120);
            }));
          for (const m of magnets.slice(0, 8)) {
            // Infer target quality primarily from magnet's own fields/text/size
            const merged = `${m.quality || ''} ${m.text || ''}`.toLowerCase();
            const qm = merged.match(/(2160p|1440p|1080p|720p|480p|360p|320p|web[- ]?dl|webrip|hdrip|bluray|brrip|dvdrip|bdrip|cam|ts|tc|hd)/i);
            let ql = (qm && qm[1]) ? qm[1].toUpperCase() : null;
            if (!ql && m.size) {
              const sm = String(m.size).toLowerCase().match(/(\d+\.?\d*)\s*(gb|mb|tb)/);
              if (sm) {
                const val = parseFloat(sm[1]);
                const unit = sm[2];
                const gb = unit === 'tb' ? val * 1024 : unit === 'mb' ? val / 1024 : val;
                if (gb >= 1.8) ql = '1080p'; else if (gb >= 0.8) ql = '720p'; else if (gb >= 0.45) ql = '480p'; else ql = '360p';
              }
            }
            ql = ql || (item.quality || 'HD');

            const ih = m.url.match(/btih:([a-f0-9]{40})/i)?.[1];
            if (!ih) continue;
            const torrentId = ih.toLowerCase();
            if (seenTorrentIds.has(torrentId)) continue;
            const cacheServices = [
              `https://itorrents.org/torrent/${ih}.torrent`,
              `https://torrage.info/torrent.php?h=${ih}`,
              `https://btcache.me/torrent/${ih}.torrent`,
              `https://zoink.it/torrent/${ih}.torrent`,
              `https://torrent-download.to/${ih}.torrent`,
              `https://torcache.net/torrent/${ih}.torrent`
            ];
            for (const cacheUrl of cacheServices) {
              try {
                const fileResp = await http.get(cacheUrl, { responseType: 'arraybuffer', timeout: 12000 });
                if (fileResp.data && fileResp.data.length > 2000) {
                  const buffer = Buffer.from(fileResp.data);
                  const head = buffer.toString('utf8', 0, Math.min(100, buffer.length));
                  if (head.startsWith('d') || head.includes('announce') || head.includes('info')) {
                    // Add as a usable torrent entry; keep multiple variants even if generic quality
                    item.torrents = [...(item.torrents || []), { url: cacheUrl, type: 'torrent', quality: ql, size: m.size || 'Unknown', text: 'Download' }];
                    seenTorrentIds.add(torrentId);
                    break;
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }
    }

    const qualityRank = (q) => {
      if (!q) return 999;
      const order = ['2160p','1440p','1080p','720p','480p','360p','web-dl','webrip','hdrip','bluray','brrip','dvdrip','bdrip','tc','ts','cam','hd'];
      const qq = String(q).toLowerCase();
      const idx = order.findIndex(x => qq.includes(x));
      return idx === -1 ? 999 : idx;
    };

    const lines = await Promise.all(list.map(async (r) => {
      const ql = r.quality || 'N/A';
      const s = r.seeders ?? 'N/A';
      const l = r.leechers ?? 'N/A';
      const size = typeof r.size === 'number' ? `${Math.round(r.size / (1024*1024))}MB` : (r.size || '');
      const meta = [lang, ql, size].filter(Boolean).join(' • ');
      const titleSafe = htmlEscape(r.title);
      // collect up to 3 direct .torrent links, sorted high->low quality
      const directTorrents = (r.torrents || [])
        .filter(t => t && t.type === 'torrent')
        .sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality));
      if (!directTorrents.length && r.torrent_url && String(r.torrent_url).includes('.torrent')) {
        directTorrents.push({ url: r.torrent_url, type: 'torrent' });
      }
      let linkLine = '';
      const toHtmlLink = (label, href) => {
        // Don't HTML-escape magnet links or torrent URLs - they need to remain valid
        return `<a href="${href}">${label}</a>`;
      };
      const appendTrackersToMagnet = (magnetUri) => {
        if (!magnetUri || !magnetUri.startsWith('magnet:')) return magnetUri;
        // If magnet already has trackers, still append popular ones to improve peer discovery
        const trackers = [
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.demonii.com:1337/announce',
          'udp://tracker.openbittorrent.com:6969/announce',
          'udp://tracker.torrent.eu.org:451/announce',
          'udp://exodus.desync.com:6969/announce',
          'udp://208.83.20.20:6969/announce',
          'udp://tracker1.bt.moack.co.kr:80/announce',
          'udp://tracker-udp.gbitt.info:80/announce'
        ];
        const encoded = trackers.map(t => `tr=${encodeURIComponent(t)}`).join('&');
        return magnetUri.includes('tr=') ? `${magnetUri}&${encoded}` : `${magnetUri}${magnetUri.includes('&') ? '&' : ''}${encoded}`;
      };
      // Movierulz-specific logic: Prefer magnets, fallback to torrents
      const magnets = (r.torrents || [])
        .filter(t => t && t.type === 'magnet')
        .sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality));
      
      // Movierulz: Use buttons instead of HTML links to avoid URL length limits
      linkLine = '';
      const header = `- ${titleSafe}\n${htmlEscape(meta)}`;
      return [header, linkLine].filter(Boolean).join('\n');
    }))
    .then(linesArr => linesArr.join('\n\n'));

    const caption = [
      `Results for ${htmlEscape(entry.query)} — ${htmlEscape(lang)}:`, 
      '', 
      lines
    ].join('\n');
    
    console.log('[DEBUG] Sending HTML caption:', caption.slice(0, 200));

    // Define appendTrackersToMagnet function for this scope
    const appendTrackersToMagnet = (magnetUri) => {
      if (!magnetUri || !magnetUri.startsWith('magnet:')) return magnetUri;
      const trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://208.83.20.20:6969/announce',
        'udp://tracker1.bt.moack.co.kr:80/announce',
        'udp://tracker-udp.gbitt.info:80/announce'
      ];
      const encoded = trackers.map(t => `tr=${encodeURIComponent(t)}`).join('&');
      return magnetUri.includes('tr=') ? `${magnetUri}&${encoded}` : `${magnetUri}${magnetUri.includes('&') ? '&' : ''}${encoded}`;
    };

    // Generate buttons for Movierulz results
    const buttons = [];
    let autoBest = null; // best direct .torrent to auto-send
    for (const r of list) {
      if (r.source === 'Movierulz') {
        // Group torrents by inferred quality and expose multiple variants per quality
        const torrents = (r.torrents || []).filter(t => t && t.type === 'torrent' && t.url);
        if (!torrents.length && r.torrent_url) torrents.push({ url: r.torrent_url, type: 'torrent', quality: r.quality || 'HD' });
        // If no direct torrents after enrichment, consider magnets as candidates for conversion on-click
        const magnetsForFallback = (!torrents.length)
          ? (r.torrents || []).filter(t => t && t.type === 'magnet' && t.url)
          : [];
        if (!torrents.length && !magnetsForFallback.length) continue;

        // Derive a hash key from URL when possible
        const getHashFromUrl = (u) => {
          try {
            if (typeof u !== 'string') return null;
            const ih = u.match(/[A-Fa-f0-9]{40}(?=\.|$)/)?.[0] || u.match(/btih[=/:]([A-Fa-f0-9]{40})/)?.[1];
            return ih ? ih.toLowerCase() : null;
          } catch { return null; }
        };

        // Infer a more precise quality label from text/url/size when missing
        const inferQuality = (t) => {
          const fromField = (t.quality || '').toString();
          const fromText = (t.text || '').toString();
          const fromUrl = (t.url || '').toString();
          const merged = `${fromField} ${fromText} ${fromUrl}`.toLowerCase();
          const m = merged.match(/(2160p|1440p|1080p|720p|480p|360p|320p|web[- ]?dl|webrip|hdrip|bluray|brrip|dvdrip|bdrip|cam|ts|tc|hd)/i);
          if (m) return m[1].toUpperCase();
          // Try size-based heuristic
          const sizeText = (t.size || '').toLowerCase();
          const sm = sizeText.match(/(\d+\.?\d*)\s*(gb|mb|tb)/);
          if (sm) {
            const val = parseFloat(sm[1]);
            const unit = sm[2];
            const gb = unit === 'tb' ? val * 1024 : unit === 'mb' ? val / 1024 : val;
            if (gb >= 1.8) return '1080p';
            if (gb >= 0.8) return '720p';
            if (gb >= 0.45) return '480p';
            return '360p';
          }
          return fromField || 'HD';
        };

        const byQuality = new Map();
        const addToGroup = (t) => {
          const q = inferQuality(t);
          if (!byQuality.has(q)) byQuality.set(q, []);
          const arr = byQuality.get(q);
          const hash = getHashFromUrl(t.url) || `u:${t.url.slice(0,64)}`;
          if (!arr.some(x => x.hash === hash)) arr.push({ ...t, hash });
        };
        for (const t of torrents) addToGroup(t);
        for (const m of magnetsForFallback) addToGroup(m);

        // If we still collapsed everything into a single generic quality (e.g., 'HD'),
        // synthesize qualities from relative sizes to surface 720p/480p variants.
        if (byQuality.size === 1 && torrents.length) {
          const onlyKey = Array.from(byQuality.keys())[0];
          const arr = byQuality.get(onlyKey);
          if (Array.isArray(arr) && arr.length > 1) {
            const parseSizeGb = (s) => {
              const m = String(s || '').toLowerCase().match(/(\d+\.?\d*)\s*(gb|mb|tb)/);
              if (!m) return null;
              const val = parseFloat(m[1]);
              const unit = m[2];
              return unit === 'tb' ? val * 1024 : unit === 'mb' ? val / 1024 : val;
            };
            // Attempt to fetch Content-Length for unknown sizes (cap to 6 requests)
            const enrichSizes = async () => {
              let requested = 0;
              for (const item of arr) {
                if (parseSizeGb(item.size) != null) continue;
                if (!item.url || requested >= 6) continue;
                try {
                  requested++;
                  const resp = await http.get(item.url, { method: 'HEAD', timeout: 8000, maxRedirects: 3 });
                  const cl = (resp && resp.headers && (resp.headers['content-length'] || resp.headers['Content-Length'])) || null;
                  if (cl) {
                    const gb = Number(cl) / (1024*1024*1024);
                    if (isFinite(gb) && gb > 0) {
                      item.size = gb >= 1 ? `${gb.toFixed(2)} GB` : `${(gb*1024).toFixed(0)} MB`;
                    }
                  }
                } catch {}
              }
            };
            try { await enrichSizes(); } catch {}
            // sort by known size, unknowns at end
            const arrWithSize = arr.map((t) => ({ t, gb: parseSizeGb(t.size) }));
            arrWithSize.sort((a,b)=>{
              const ag = a.gb ?? Infinity; const bg = b.gb ?? Infinity; return ag - bg;
            });
            const reassigned = new Map();
            const assign = (t, label) => {
              if (!reassigned.has(label)) reassigned.set(label, []);
              reassigned.get(label).push(t);
            };
            if (arrWithSize.length === 2) {
              // smaller -> 720p, bigger -> 1080p
              assign(arrWithSize[0].t, '720p');
              assign(arrWithSize[1].t, '1080p');
            } else if (arrWithSize.length >= 3) {
              // smallest -> 480p, middle(s) -> 720p, largest -> 1080p
              assign(arrWithSize[0].t, '480p');
              for (let i = 1; i < arrWithSize.length - 1; i++) assign(arrWithSize[i].t, '720p');
              assign(arrWithSize[arrWithSize.length - 1].t, '1080p');
            }
            // Merge back if we created labels
            if (reassigned.size) {
              byQuality.clear();
              for (const [k, v] of reassigned) byQuality.set(k, v);
            }
          }
        }

        const qualities = Array.from(byQuality.keys()).sort((a,b)=> qualityRank(a)-qualityRank(b)).slice(0, 4);
        for (const q of qualities) {
          const variants = byQuality.get(q).slice(0, 3); // up to 3 per quality
          variants.forEach((t, idx) => {
            const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const allowMagnetFallback = !(t.type === 'magnet');
            const labelSuffix = variants.length > 1 ? (' #' + (idx + 1)) : '';
            downloadStore.set(tokenId, { title: r.title, quality: `${q}${labelSuffix}`, url: t.url, size: r.size || null, createdAt: Date.now(), allowMagnetFallback });
            setTimeout(() => downloadStore.delete(tokenId), 2 * 60 * 60 * 1000); // 2 hours
            buttons.push([{ text: `📁 ${q}${labelSuffix}`, callback_data: `dl:${tokenId}` }]);
          });
        }

        // Choose an automatic best torrent (direct .torrent only) to send proactively
        try {
          const allDirect = (r.torrents || []).filter(t => t && t.type === 'torrent' && t.url);
          if (!allDirect.length && r.torrent_url && String(r.torrent_url).includes('.torrent')) {
            allDirect.push({ url: r.torrent_url, type: 'torrent', quality: r.quality || 'HD', size: r.size });
          }
          if (allDirect.length && !autoBest) {
            const scoreQuality = (q) => {
              const qq = String(q || '').toUpperCase();
              if (qq.includes('720')) return 1;
              if (qq.includes('1080')) return 2;
              if (qq.includes('480')) return 3;
              if (/WEB|HDRIP|BRRIP|DVDRIP|CAM|TS|TC|HD/i.test(qq)) return 4;
              return 5;
            };
            const sizeGb = (s) => {
              const m = String(s || '').toLowerCase().match(/(\d+\.?\d*)\s*(gb|mb|tb)/);
              if (!m) return Infinity;
              const v = parseFloat(m[1]);
              const u = m[2];
              return u === 'tb' ? v * 1024 : u === 'mb' ? v / 1024 : v;
            };
            allDirect.sort((a, b) => {
              const qa = scoreQuality(a.quality);
              const qb = scoreQuality(b.quality);
              if (qa !== qb) return qa - qb;
              const sa = sizeGb(a.size);
              const sb = sizeGb(b.size);
              return sa - sb;
            });
            autoBest = { title: r.title, quality: allDirect[0].quality || 'HD', url: allDirect[0].url };
            console.log('[AutoBest] Selected direct .torrent', {
              title: r.title,
              quality: autoBest.quality,
              url: (autoBest.url || '').slice(0, 140)
            });
          } else if (!autoBest) {
            // fallback: consider magnets if no direct .torrent
            const magnets = (r.torrents || []).filter(t => t && t.type === 'magnet' && t.url && String(t.url).startsWith('magnet:'));
            if (magnets.length) {
              const scoreQuality = (q) => {
                const qq = String(q || '').toUpperCase();
                if (qq.includes('720')) return 1;
                if (qq.includes('1080')) return 2;
                if (qq.includes('480')) return 3;
                if (/WEB|HDRIP|BRRIP|DVDRIP|CAM|TS|TC|HD/i.test(qq)) return 4;
                return 5;
              };
              const sizeGb = (s) => {
                const m = String(s || '').toLowerCase().match(/(\d+\.?\d*)\s*(gb|mb|tb)/);
                if (!m) return Infinity;
                const v = parseFloat(m[1]);
                const u = m[2];
                return u === 'tb' ? v * 1024 : u === 'mb' ? v / 1024 : v;
              };
              magnets.sort((a, b) => {
                const qa = scoreQuality(a.quality);
                const qb = scoreQuality(b.quality);
                if (qa !== qb) return qa - qb;
                const sa = sizeGb(a.size);
                const sb = sizeGb(b.size);
                return sa - sb;
              });
              const bestMag = magnets[0];
              // Try to resolve magnet to .torrent via caches
              try {
                const resolved = await (async () => {
                  const ih = (bestMag.url.match(/btih:([a-f0-9]{40})/i) || [])[1];
                  if (!ih) return null;
                  const cacheServices = [
                    `https://itorrents.org/torrent/${ih}.torrent`,
                    `https://torrage.info/torrent.php?h=${ih}`,
                    `https://btcache.me/torrent/${ih}.torrent`,
                    `https://zoink.it/torrent/${ih}.torrent`,
                    `https://torrent-download.to/${ih}.torrent`,
                    `https://torcache.net/torrent/${ih}.torrent`
                  ];
                  for (const url of cacheServices) {
                    try {
                      const resp = await http.get(url, { responseType: 'arraybuffer', timeout: 9000 });
                      const buf = resp?.data ? Buffer.from(resp.data) : null;
                      if (buf && buf.length > 1500) {
                        const head = buf.toString('utf8', 0, Math.min(80, buf.length));
                        if (head.startsWith('d') || head.includes('announce') || head.includes('info')) return { url, buffer: buf };
                      }
                    } catch {}
                  }
                  return null;
                })();
                if (resolved) {
                  autoBest = { title: r.title, quality: bestMag.quality || 'HD', url: resolved.url, _buffer: resolved.buffer };
                  console.log('[AutoBest] Resolved magnet to .torrent', {
                    title: r.title,
                    quality: autoBest.quality,
                    url: (autoBest.url || '').slice(0, 140)
                  });
                }
              } catch {}
            }
          }
        } catch {}
      }
    }

    const replyMarkup = buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {};

    let poster = list[0].poster_url || null;
    if (!poster) poster = await fetchPosterForTitle(list[0].title);
    if (poster) {
        await bot.sendPhoto(chatId, poster, {
          caption,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...replyMarkup
        }).catch(() => bot.sendMessage(chatId, caption, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup }));
    } else {
        await bot.sendMessage(chatId, caption, { parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup });
    }

    // If we identified a best direct torrent, enhance and send it automatically
    if (autoBest && autoBest.url) {
      try {
        const enhanceTorrentTrackers = (buffer) => {
          try {
            const trackers = [
              'udp://tracker.opentrackr.org:1337/announce',
              'udp://tracker.torrent.eu.org:451/announce',
              'udp://open.demonii.com:1337/announce',
              'udp://exodus.desync.com:6969/announce',
              'udp://tracker.openbittorrent.com:6969/announce',
              'udp://opentracker.i2p.rocks:6969/announce',
              'udp://tracker1.bt.moack.co.kr:80/announce',
              'udp://tracker-udp.gbitt.info:80/announce',
              'udp://tracker.tiny-vps.com:6969/announce',
              'udp://explodie.org:6969/announce'
            ];
            const decoded = bencode.decode(buffer);
            const unique = Array.from(new Set(trackers));
            decoded['announce'] = unique[0];
            decoded['announce-list'] = unique.map(t => [Buffer.from(t)]);
            return Buffer.from(bencode.encode(decoded));
          } catch { return buffer; }
        };

        let torrentBuffer = null;
        if (autoBest._buffer) {
          torrentBuffer = autoBest._buffer;
        } else if (autoBest.url.startsWith('data:')) {
          const base64 = autoBest.url.split(',')[1] || '';
          torrentBuffer = Buffer.from(base64, 'base64');
        } else {
          const resp = await http.get(autoBest.url, { responseType: 'arraybuffer', timeout: 12000 });
          torrentBuffer = Buffer.from(resp.data);
        }
        if (torrentBuffer && torrentBuffer.length > 1024) {
          torrentBuffer = enhanceTorrentTrackers(torrentBuffer);
          console.log('[AutoBest] Sending enhanced torrent', { title: autoBest.title, quality: autoBest.quality });
          const safeBase = `${autoBest.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${(autoBest.quality || 'HD')}`.replace(/\s+/g, '_');
          const filename = `${safeBase}.torrent`;
          const tmpPath = path.join(os.tmpdir(), filename);
          fs.writeFileSync(tmpPath, torrentBuffer);
          await bot.sendDocument(
            chatId,
            tmpPath,
            { caption: `📁 Best match — ${autoBest.title} — ${autoBest.quality}`, parse_mode: 'HTML', disable_web_page_preview: true, disable_content_type_detection: true },
            { filename, contentType: 'application/x-bittorrent' }
          ).catch(()=>{});
        }
      } catch {}
    }
    return; // handled Movierulz language selection fully; stop further processing for this callback
    }
    
    // Season selection callbacks removed - now using direct season search
    
    // Language toggle callbacks removed - now using direct season search
    // Handle individual episode downloads
    if (data.startsWith('ep:')) {
      console.log(`[DEBUG] Episode callback received: ${data}`);
      const chatId = cb.message?.chat?.id;
      const parts = data.split(':');
      const tokenId = parts[1];
      const epIndex = parts[2];
      if (!tokenId || !epIndex) return;
      
    try {
      await limiter.consume(String(chatId), 1);
    } catch {
      return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
    }
    
      const entry = episodeStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Download expired. Search again.' });
      }

      const idx = parseInt(epIndex);
      const episode = entry.episodes[idx];
      if (!episode) {
        return bot.answerCallbackQuery(cb.id, { text: 'Episode not found.' });
      }
      
      // Smart download strategy for episodes: ≥15 seeders = torrent, <15 seeders = direct files
      const MIN_SEEDERS_FOR_TORRENT = 15;
      const seeders = episode.seeders || 0;
      const hasDirectDownload = episode.direct_url || episode.stream_url || episode.file_host_url;
      const hasTorrent = episode.torrent_url || episode.magnet_link;
      
      if (seeders >= MIN_SEEDERS_FOR_TORRENT && hasTorrent) {
        // High seeders: Provide torrent for fast download
        await bot.answerCallbackQuery(cb.id, { text: `Sending torrent (${seeders} seeds)...` });
        
        try {
          const torrentUrl = `https://itorrents.org/torrent/${episode.infoHash}.torrent`;
          const fileResp = await http.get(torrentUrl, { responseType: 'arraybuffer', timeout: 20000 });
        
        if (fileResp.data && fileResp.data.length > 2000) {
          const buffer = Buffer.from(fileResp.data);
          const head = buffer.toString('utf8', 0, Math.min(100, buffer.length));
          if (head.startsWith('d') || head.includes('announce') || head.includes('info')) {
            // Enhance torrent with additional trackers
            const enhanceTorrentTrackers = (buffer) => {
              const trackers = [
                'udp://tracker.opentrackr.org:1337/announce',
                'udp://tracker.torrent.eu.org:451/announce',
                'udp://open.demonii.com:1337/announce',
                'udp://exodus.desync.com:6969/announce',
                'udp://tracker.openbittorrent.com:6969/announce',
                'udp://opentracker.i2p.rocks:6969/announce',
                'udp://tracker1.bt.moack.co.kr:80/announce',
                'udp://tracker-udp.gbitt.info:80/announce'
              ];
              try {
                const decoded = bencode.decode(buffer);
                const unique = Array.from(new Set(trackers));
                decoded['announce'] = unique[0];
                decoded['announce-list'] = unique.map(t => [Buffer.from(t)]);
                return Buffer.from(bencode.encode(decoded));
              } catch { return buffer; }
            };
            
            const enhancedBuffer = enhanceTorrentTrackers(buffer);
            const safeBase = `${episode.title.replace(/[^\w\-\s\.]/g, ' ').trim()}`.replace(/\s+/g, '_');
            const filename = `${safeBase}.torrent`;
            const tmpPath = path.join(os.tmpdir(), filename);
            fs.writeFileSync(tmpPath, enhancedBuffer);
            
            await bot.sendDocument(
              chatId,
              tmpPath,
              { caption: `📁 ${episode.title}`, parse_mode: 'HTML', disable_web_page_preview: true, disable_content_type_detection: true },
              { filename, contentType: 'application/x-bittorrent' }
            );
            try { fs.unlinkSync(tmpPath); } catch {}
          } else {
            await bot.sendMessage(chatId, `❌ Invalid torrent file for: ${episode.title}`);
          }
        } else {
          await bot.sendMessage(chatId, `❌ Failed to download torrent for: ${episode.title}`);
        }
        } catch (error) {
          console.error('Torrent download error:', error.message);
          await bot.sendMessage(chatId, `❌ Failed to get torrent for: ${episode.title}`);
        }
        
      } else if (seeders < MIN_SEEDERS_FOR_TORRENT && hasDirectDownload) {
        // Low seeders: Provide direct download
        if (episode.direct_url) {
          await bot.answerCallbackQuery(cb.id, { text: `Downloading direct file (${seeders} seeds)...` });
          
          try {
            const { downloadDirectFile } = await import('../directDownload.js');
            const filename = `${episode.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${episode.quality}.${episode.direct_url.split('.').pop()}`;
            
            const result = await downloadDirectFile(episode.direct_url, filename);
            
            if (result.success) {
              // Move file to download directory
              const finalPath = path.join(DOWNLOAD_DIR, filename);
              if (result.filePath !== finalPath) {
                fs.copyFileSync(result.filePath, finalPath);
                fs.unlinkSync(result.filePath);
              }
              
              await bot.sendDocument(
                chatId,
                finalPath,
                { 
                  caption: `🎬 ${episode.title} — ${episode.quality} (Direct Download)\n\n📁 Also available at: http://localhost:8080/download/${encodeURIComponent(filename)}`, 
                  parse_mode: 'HTML', 
                  disable_web_page_preview: true 
                }
              );
              
              console.log(`[EpisodeDirectDownload] File saved to: ${finalPath}`);
            } else {
              await bot.sendMessage(chatId, `❌ Download failed: ${result.error}`);
            }
          } catch (error) {
            console.error('[EpisodeDirectDownload] Error:', error);
            await bot.sendMessage(chatId, `❌ Download error: ${error.message}`);
          }
          
        } else if (episode.stream_url) {
          await bot.answerCallbackQuery(cb.id, { text: `Converting stream (${seeders} seeds)...` });
          
          try {
            const { convertStreamingContent } = await import('../simple-converter.js');
            
            // Show format selection
            const formatButtons = (episode.__formats || ['mp4']).map(format => ({
              text: `Convert to ${format.toUpperCase()}`,
              callback_data: `convert_ep:${tokenId}:${epIndex}:${format}`
            }));
            
            await bot.sendMessage(chatId, `🎥 Choose format for ${episode.title}:`, {
              reply_markup: { inline_keyboard: [formatButtons] }
            });
          } catch (error) {
            console.error('[EpisodeStreamConvert] Error:', error);
            await bot.sendMessage(chatId, `❌ Conversion error: ${error.message}`);
          }
          
        } else if (episode.file_host_url) {
          await bot.answerCallbackQuery(cb.id, { text: `Opening file host (${seeders} seeds)...` });
          
          const message = `📂 **File Host Link**\n\n**${episode.title}** — ${episode.quality}\n\n🔗 [Download from ${episode.source}](${episode.file_host_url})\n\n*Note: You may need to complete captcha or wait for countdown*`;
          
          await bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
            disable_web_page_preview: true 
          });
        }
        
      } else if (hasTorrent) {
        // Fallback: Provide torrent even with low seeders if no direct download
        await bot.answerCallbackQuery(cb.id, { text: `Sending torrent (${seeders} seeds) ⚠️...` });
        
        try {
          const torrentUrl = `https://itorrents.org/torrent/${episode.infoHash}.torrent`;
          const fileResp = await http.get(torrentUrl, { responseType: 'arraybuffer', timeout: 20000 });
          
          if (fileResp.data && fileResp.data.length > 2000) {
            const buffer = Buffer.from(fileResp.data);
            const head = buffer.toString('utf8', 0, Math.min(100, buffer.length));
            if (head.startsWith('d') || head.includes('announce') || head.includes('info')) {
              // Enhance torrent with additional trackers
              const enhanceTorrentTrackers = (buffer) => {
                const trackers = [
                  'udp://tracker.opentrackr.org:1337/announce',
                  'udp://tracker.torrent.eu.org:451/announce',
                  'udp://open.demonii.com:1337/announce',
                  'udp://exodus.desync.com:6969/announce',
                  'udp://tracker.openbittorrent.com:6969/announce',
                  'udp://opentracker.i2p.rocks:6969/announce',
                  'udp://tracker1.bt.moack.co.kr:80/announce',
                  'udp://tracker-udp.gbitt.info:80/announce'
                ];
                try {
                  const decoded = bencode.decode(buffer);
                  const unique = Array.from(new Set(trackers));
                  decoded['announce'] = unique[0];
                  decoded['announce-list'] = unique.map(t => [Buffer.from(t)]);
                  return Buffer.from(bencode.encode(decoded));
                } catch { return buffer; }
              };
              
              const enhancedBuffer = enhanceTorrentTrackers(buffer);
              const safeBase = `${episode.title.replace(/[^\w\-\s\.]/g, ' ').trim()}`.replace(/\s+/g, '_');
              const filename = `${safeBase}.torrent`;
              const tmpPath = path.join(os.tmpdir(), filename);
              fs.writeFileSync(tmpPath, enhancedBuffer);
              
              await bot.sendDocument(
                chatId,
                tmpPath,
                { caption: `📁 ${episode.title} (${seeders} seeds) ⚠️`, parse_mode: 'HTML', disable_web_page_preview: true, disable_content_type_detection: true },
                { filename, contentType: 'application/x-bittorrent' }
              );
              try { fs.unlinkSync(tmpPath); } catch {}
            } else {
              await bot.sendMessage(chatId, `❌ Invalid torrent file for: ${episode.title}`);
            }
          } else {
            await bot.sendMessage(chatId, `❌ Failed to download torrent for: ${episode.title}`);
          }
        } catch (error) {
          console.error('Torrent download error:', error.message);
          await bot.sendMessage(chatId, `❌ Failed to get torrent for: ${episode.title}`);
        }
      } else {
        await bot.answerCallbackQuery(cb.id, { text: 'No download available for this episode.' });
      }
    }
    
    // Handle auto-convert (direct MP4 conversion)
    if (data.startsWith('auto_convert:')) {
      const chatId = cb.message?.chat?.id;
      const parts = data.split(':');
      const tokenId = parts[1];

      if (!tokenId) return;

      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
      }

      const entry = downloadStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Auto-conversion expired. Search again.' });
      }

      await bot.answerCallbackQuery(cb.id, { text: 'Auto-converting to MP4...' });

      try {
        const { convertStreamingContent } = await import('../simple-converter.js');
        // Use movie_page_url if available, otherwise fall back to stream_url
        const urlToUse = entry.movie_page_url || entry.url;
        const result = await convertStreamingContent(urlToUse, 'downloads/converted.mp4');

        if (result.success) {
          // Move file to download directory
          const filename = `${entry.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${entry.quality}.mp4`;
          const finalPath = path.join(DOWNLOAD_DIR, filename);

          if (result.filePath !== finalPath) {
            fs.copyFileSync(result.filePath, finalPath);
            fs.unlinkSync(result.filePath);
          }

          await bot.sendDocument(
            chatId,
            finalPath,
            { caption: `✅ Auto-converted ${entry.title} to MP4!` },
            { filename: filename, contentType: 'video/mp4' }
          );
          await bot.sendMessage(chatId, `🔗 Your file is also available at: http://localhost:8080/${encodeURIComponent(filename)}`);
        } else {
          if (result.error && result.error.includes('FFmpeg failed')) {
            await bot.sendMessage(chatId, `❌ Auto-conversion requires FFmpeg to be installed.\n\n📥 **To install FFmpeg:**\n• Windows: Download from https://ffmpeg.org/download.html\n• Or use: choco install ffmpeg (if you have Chocolatey)\n\n🎬 **Alternative:** Try direct download sources instead!`);
          } else {
            await bot.sendMessage(chatId, `❌ Auto-conversion failed: ${result.error}`);
          }
        }
      } catch (error) {
        console.error('[AutoConvert] Error:', error);
        await bot.sendMessage(chatId, `❌ Auto-conversion error: ${error.message}`);
      }
      return;
    }
    
    // Handle episode stream conversion format selection
    if (data.startsWith('convert_ep:')) {
      const chatId = cb.message?.chat?.id;
      const parts = data.split(':');
      const tokenId = parts[1];
      const epIndex = parts[2];
      const format = parts[3];
      
      if (!tokenId || !epIndex || !format) return;
      
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
      }
      
      const entry = episodeStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Conversion expired. Search again.' });
      }
      
      const idx = parseInt(epIndex);
      const episode = entry.episodes[idx];
      if (!episode) {
        return bot.answerCallbackQuery(cb.id, { text: 'Episode not found.' });
      }
      
      await bot.answerCallbackQuery(cb.id, { text: `Converting to ${format.toUpperCase()}...` });
      
      try {
        const { convertStreamingContent } = await import('../simple-converter.js');
        // Use movie_page_url if available, otherwise fall back to stream_url
        const urlToUse = episode.movie_page_url || episode.stream_url;
        const result = await convertStreamingContent(urlToUse, `downloads/converted.${format}`);
        
        if (result.success) {
          // Move file to download directory
          const filename = `${episode.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${episode.quality}.${format}`;
          const finalPath = path.join(DOWNLOAD_DIR, filename);
          
          if (result.filePath !== finalPath) {
            fs.copyFileSync(result.filePath, finalPath);
            fs.unlinkSync(result.filePath);
          }
          
          await bot.sendDocument(
            chatId,
            finalPath,
            { 
              caption: `🎥 ${episode.title} — ${episode.quality} (${format.toUpperCase()})\n\n📁 Also available at: http://localhost:8080/download/${encodeURIComponent(filename)}`, 
              parse_mode: 'HTML', 
          disable_web_page_preview: true
            }
          );
          
          console.log(`[EpisodeStreamConvert] File saved to: ${finalPath}`);
        } else {
          if (result.error && result.error.includes('FFmpeg')) {
            await bot.sendMessage(chatId, `❌ Stream conversion requires FFmpeg to be installed.\n\n📥 **To install FFmpeg:**\n• Windows: Download from https://ffmpeg.org/download.html\n• Or use: choco install ffmpeg (if you have Chocolatey)\n\n🎬 **Alternative:** Try direct download sources instead!`);
          } else {
            await bot.sendMessage(chatId, `❌ Conversion failed: ${result.error}`);
          }
        }
      } catch (error) {
        console.error('[EpisodeStreamConvert] Error:', error);
        await bot.sendMessage(chatId, `❌ Conversion error: ${error.message}`);
      }
      return;
    }
    
    // Handle stream conversion format selection
    if (data.startsWith('convert:')) {
      const chatId = cb.message?.chat?.id;
      const parts = data.split(':');
      const tokenId = parts[1];
      const format = parts[2];
      
      if (!tokenId || !format) return;
      
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
      }
      
      const entry = downloadStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Conversion expired. Search again.' });
      }
      
      await bot.answerCallbackQuery(cb.id, { text: `Converting to ${format.toUpperCase()}...` });
      
      try {
        const { convertStreamingContent } = await import('../simple-converter.js');
        // Use movie_page_url if available, otherwise fall back to stream_url
        const urlToUse = entry.movie_page_url || entry.url;
        const result = await convertStreamingContent(urlToUse, `downloads/converted.${format}`);
        
        if (result.success) {
          // Move file to download directory
          const filename = `${entry.title.replace(/[^\w\-\s\.]/g, ' ').trim()}_${entry.quality}.${format}`;
          const finalPath = path.join(DOWNLOAD_DIR, filename);
          
          if (result.filePath !== finalPath) {
            fs.copyFileSync(result.filePath, finalPath);
            fs.unlinkSync(result.filePath);
          }
          
          await bot.sendDocument(
            chatId,
            finalPath,
            { 
              caption: `🎥 ${entry.title} — ${entry.quality} (${format.toUpperCase()})\n\n📁 Also available at: http://localhost:8080/download/${encodeURIComponent(filename)}`, 
              parse_mode: 'HTML', 
          disable_web_page_preview: true
            }
          );
          
          // Don't delete - keep for file server
          console.log(`[StreamConvert] File saved to: ${finalPath}`);
        } else {
          if (result.error && result.error.includes('FFmpeg')) {
            await bot.sendMessage(chatId, `❌ Stream conversion requires FFmpeg to be installed.\n\n📥 **To install FFmpeg:**\n• Windows: Download from https://ffmpeg.org/download.html\n• Or use: choco install ffmpeg (if you have Chocolatey)\n\n🎬 **Alternative:** Try direct download sources instead!`);
          } else {
            await bot.sendMessage(chatId, `❌ Conversion failed: ${result.error}`);
          }
        }
      } catch (error) {
        console.error('[StreamConvert] Error:', error);
        await bot.sendMessage(chatId, `❌ Conversion error: ${error.message}`);
      }
      return;
    }
    
    // Handle download all episodes (filtered set only)
    if (data.startsWith('download_all:')) {
      const chatId = cb.message?.chat?.id;
      const tokenId = data.split(':')[1];
      if (!tokenId) return;
      try {
        await limiter.consume(String(chatId), 1);
      } catch {
        return bot.answerCallbackQuery(cb.id, { text: 'Rate limited. Try again shortly.' });
      }
      const entry = episodeStore.get(tokenId);
      if (!entry) {
        return bot.answerCallbackQuery(cb.id, { text: 'Download expired. Search again.' });
      }
      await bot.answerCallbackQuery(cb.id, { text: `Sending ${entry.episodes.length} torrent files...` });
      for (const episode of entry.episodes) {
        try {
          const torrentUrl = `https://itorrents.org/torrent/${episode.infoHash}.torrent`;
          const fileResp = await http.get(torrentUrl, { responseType: 'arraybuffer', timeout: 20000 });
          
          if (fileResp.data && fileResp.data.length > 2000) {
            const buffer = Buffer.from(fileResp.data);
            const head = buffer.toString('utf8', 0, Math.min(100, buffer.length));
            if (head.startsWith('d') || head.includes('announce') || head.includes('info')) {
              // Enhance torrent with additional trackers
              const enhanceTorrentTrackers = (buffer) => {
                const trackers = [
                  'udp://tracker.opentrackr.org:1337/announce',
                  'udp://tracker.torrent.eu.org:451/announce',
                  'udp://open.demonii.com:1337/announce',
                  'udp://exodus.desync.com:6969/announce',
                  'udp://tracker.openbittorrent.com:6969/announce',
                  'udp://opentracker.i2p.rocks:6969/announce',
                  'udp://tracker1.bt.moack.co.kr:80/announce',
                  'udp://tracker-udp.gbitt.info:80/announce'
                ];
                try {
                  const decoded = bencode.decode(buffer);
                  const unique = Array.from(new Set(trackers));
                  decoded['announce'] = unique[0];
                  decoded['announce-list'] = unique.map(t => [Buffer.from(t)]);
                  return Buffer.from(bencode.encode(decoded));
                } catch { return buffer; }
              };
              
              const enhancedBuffer = enhanceTorrentTrackers(buffer);
              const safeBase = `${episode.title.replace(/[^\w\-\s\.]/g, ' ').trim()}`.replace(/\s+/g, '_');
              const filename = `${safeBase}.torrent`;
              const tmpPath = path.join(os.tmpdir(), filename);
              fs.writeFileSync(tmpPath, enhancedBuffer);
              
              await bot.sendDocument(
                chatId,
                tmpPath,
                { caption: `📁 ${episode.title}`, parse_mode: 'HTML', disable_web_page_preview: true, disable_content_type_detection: true },
                { filename, contentType: 'application/x-bittorrent' }
              );
              try { fs.unlinkSync(tmpPath); } catch {}
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between files
        } catch (error) {
          console.log(`Failed to send episode: ${episode.title}`, error.message);
        }
      }
    }
  });

  logger.info('Telegram bot polling started');
  return bot;
}


