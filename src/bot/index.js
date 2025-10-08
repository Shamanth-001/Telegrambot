import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '../logger.js';
// Removed getSourcesStatus import - admin-only commands now
import { fetchMovierulzTorrents } from '../movierulz.js';
import { searchTorrents } from '../searchService.js';
import { fetchPosterForTitle } from '../poster.js';
import { http } from '../http.js';
import { getSourcesStatus } from '../status.js';
import bencode from 'bencode';

const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

// Admin configuration
const ADMIN_USER_ID = '931635587'; // Your Telegram user ID

export async function startBot(token) {
  let bot;
  try {
    bot = new TelegramBot(token, { polling: true });
  } catch (err) {
    logger.error('Failed to initialize TelegramBot', { error: err?.stack || String(err) });
    throw err;
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

⚠️ *Important Notes:*
• Download speeds depend on seeders
• Always check your local laws
• Support creators when possible

Ready to find movies? Just type any movie name! 🚀`;

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
• Type any movie name \\(examples: \`superman\`, \`rrr\`, \`kgf\`\\)
• I'll search for torrents automatically
• Results are sorted by best quality first

📋 *Available Commands:*
• \`/start\` - Welcome message
• \`/help\` - Show this help

⚙️ *Bot Features:*
• Finds movies from multiple sources (YTS, PirateBay, Movierulz)
• Shows up to 3 download links per movie
• Supports Indian movies in multiple languages
• Automatic language detection
• Direct torrent file downloads

⚠️ *Important:*
• Make sure you have a torrent client installed
• Check your local laws before downloading
• Support creators when you can!`;

    await bot.sendMessage(chatId, helpMessage, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
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
    const status = await getSourcesStatus();
      let message = '🔧 *Source Status (Admin)*\n\n';
      
      Object.entries(status).forEach(([source, status]) => {
        const emoji = status.isOpen ? '✅' : '❌';
        const state = status.isOpen ? 'OPEN' : 'CLOSED';
        const failures = status.failureCount;
        
        message += `${emoji} **${source}**: ${state}\n`;
        if (!status.isOpen && failures > 0) {
          message += `└ Failures: ${failures}\n`;
        }
      });
      
      const totalOpen = Object.values(status).filter(s => s.isOpen).length;
      const totalSources = Object.keys(status).length;
      message += `\n📊 Overall: ${totalOpen}/${totalSources} sources active`;

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

  // ephemeral stores
  // - language selection (token -> data)
  const selectionStore = new Map();
  // - pending downloads for YTS/PirateBay (token -> { title, quality, url, size })
  const downloadStore = new Map();

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
        setTimeout(() => selectionStore.delete(tokenId), 15 * 60 * 1000);

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
      // - YTS/PirateBay: unique qualities as callback buttons to send .torrent
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
            setTimeout(() => downloadStore.delete(tokenId), 15 * 60 * 1000);
            buttons.push([{ text: `📁 Download ${ql}`, callback_data: `dl:${tokenId}` }]);
          }
        }
      }
      // YTS/PB callback buttons (dedupe by quality, highest first)
      const nonMl = top.filter(r => r.source !== 'Movierulz' && r.torrent_url && (String(r.torrent_url).includes('.torrent') || String(r.torrent_url).includes('yts.mx/torrent/download/')));
      const byQuality = new Map();
      for (const r of nonMl) {
        const ql = r.quality || 'HD';
        if (!byQuality.has(ql)) byQuality.set(ql, r);
      }
      const qualitiesSorted = Array.from(byQuality.keys()).sort((a,b)=> qualityRank(a)-qualityRank(b));
      for (const ql of qualitiesSorted) {
        const r = byQuality.get(ql);
        const tokenId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        downloadStore.set(tokenId, { title: r.title, quality: ql, url: r.torrent_url, size: r.size || null, createdAt: Date.now() });
        setTimeout(() => downloadStore.delete(tokenId), 15 * 60 * 1000);
        buttons.push([{ text: `📁 Download ${ql}`, callback_data: `dl:${tokenId}` }]);
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
    if (!data.startsWith('mlang:')) return;
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
            setTimeout(() => downloadStore.delete(tokenId), 15 * 60 * 1000);
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
  });

  logger.info('Telegram bot polling started');
  return bot;
}


