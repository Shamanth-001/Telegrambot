// Simple script to enqueue a background streaming job for a title
import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import IntegratedDownloader from '../src/integratedDownloader.js';

async function main() {
  const token = process.env.BOT_TOKEN;
  const cacheChannelId = process.env.CACHE_CHANNEL_ID;
  const title = process.argv.slice(2).join(' ').trim() || 'game of thrones season 2';
  const chatId = process.env.TEST_CHAT_ID || process.env.ADMIN_USER_ID || undefined;

  if (!token || !cacheChannelId) {
    console.error('Missing BOT_TOKEN or CACHE_CHANNEL_ID env.');
    process.exit(1);
  }

  const bot = new TelegramBot(token, { polling: false });
  const downloader = new IntegratedDownloader(bot, cacheChannelId);

  console.log(`[Requeue] Enqueuing background streaming job for: ${title}`);
  downloader.enqueueStreamingJob({ title, chatId });
  console.log('[Requeue] Job enqueued. The bot will fetch/convert/upload and cache when a source is found.');
}

main().catch((e) => { console.error(e); process.exit(1); });


