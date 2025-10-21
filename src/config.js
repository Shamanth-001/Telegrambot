// src/config.js
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN,
  workerUrl: process.env.CLOUDFLARE_WORKER_URL || 'https://rough-heart-b2de.mshamanthkodgi.workers.dev/',
  adminUserId: process.env.ADMIN_USER_ID,
  databasePath: process.env.DATABASE_PATH || './movies.db',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '2147483648'), // 2GB
  cacheChannelId: process.env.CACHE_CHANNEL_ID || null,
  
  // Timeouts
  downloadTimeout: 300000, // 5 minutes
  streamTimeout: 600000,   // 10 minutes
  
  // Retry settings
  maxRetries: 3,
  retryDelay: 2000
};


