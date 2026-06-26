// Probe multiple popular series and ensure background streaming fallback runs until cached
import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import IntegratedDownloader from '../src/integratedDownloader.js';
import { cacheManager } from '../src/cacheManager.js';

const SLEEP = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForCache(title, timeoutMs = 15 * 60 * 1000) { // 15 min max
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hit = cacheManager.checkCache(title);
    if (hit && hit.file_id) return hit;
    await SLEEP(15000); // check every 15s
  }
  return null;
}

async function probeOne(downloader, chatId, title) {
  console.log(`\n[Probe] Title: ${title}`);
  // Always queue a streaming job (covers low-seed or no-torrent cases)
  downloader.enqueueStreamingJob({ title, chatId });
  const hit = await waitForCache(title);
  if (hit) {
    console.log(`[Probe] Cached: ${title} -> ${hit.file_id} (source=${hit.source_type})`);
    return true;
  }
  console.log(`[Probe] Timeout waiting for cache: ${title}`);
  return false;
}

async function main() {
  const token = process.env.BOT_TOKEN;
  const cacheChannelId = process.env.CACHE_CHANNEL_ID;
  const chatId = process.env.TEST_CHAT_ID || process.env.ADMIN_USER_ID || undefined;
  if (!token || !cacheChannelId) {
    console.error('Missing BOT_TOKEN or CACHE_CHANNEL_ID');
    process.exit(1);
  }

  const bot = new TelegramBot(token, { polling: false });
  const downloader = new IntegratedDownloader(bot, cacheChannelId);

  // Great series list (adjust as needed)
  const titles = [
    'game of thrones season 2',
    'breaking bad season 2',
    'money heist season 2'
  ];

  for (const t of titles) {
    try {
      const ok = await probeOne(downloader, chatId, t);
      if (ok) {
        console.log(`[Probe] Success for: ${t}`);
        break; // stop at first success
      }
    } catch (e) {
      console.error(`[Probe] Error for ${t}:`, e.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });


