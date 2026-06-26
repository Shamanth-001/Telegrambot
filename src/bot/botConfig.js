// Bot Configuration for Two-Bot Movie Cache System
import dotenv from 'dotenv';
dotenv.config();

export const botConfig = {
  // Bot Tokens
  downloaderBotToken: process.env.DOWNLOADER_BOT_TOKEN,
  apiBotToken: process.env.API_BOT_TOKEN,
  
  // Channel Configuration
  cacheChannelId: process.env.CACHE_CHANNEL_ID, // Private channel for file storage
  
  // Bot Communication
  downloaderBotChatId: process.env.DOWNLOADER_BOT_CHAT_ID || process.env.ADMIN_USER_ID, // Fallback to admin for smoke tests
  
  // Cache Settings
  cacheTTLHours: parseInt(process.env.CACHE_TTL_HOURS || '24'),
  maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE || '100'), // Max number of movies in cache
  
  // Download Settings
  maxConcurrentDownloads: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3'),
  downloadTimeout: parseInt(process.env.DOWNLOAD_TIMEOUT || '1800000'), // 30 minutes
  
  // Cleanup Settings
  cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '6'),
  
  // Admin Settings
  adminUserId: process.env.ADMIN_USER_ID || '931635587',
  
  // Database
  databasePath: process.env.DATABASE_PATH || './movie_cache.db',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Validation function
export function validateBotConfig() {
  const required = [
    'downloaderBotToken',
    'apiBotToken',
    'cacheChannelId',
    'downloaderBotChatId'
  ];

  const missing = required.filter(field => !botConfig[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('✅ Bot configuration validated successfully');
  return true;
}

// Display configuration (without sensitive data)
export function displayConfig() {
  console.log('\n🤖 ===== BOT CONFIGURATION =====');
  console.log(`📱 Downloader Bot: ${botConfig.downloaderBotToken ? 'Configured' : 'Missing'}`);
  console.log(`📱 API Bot: ${botConfig.apiBotToken ? 'Configured' : 'Missing'}`);
  console.log(`📺 Cache Channel: ${botConfig.cacheChannelId || 'Not configured'}`);
  console.log(`💬 Bot Chat ID: ${botConfig.downloaderBotChatId || 'Not configured'}`);
  console.log(`⏰ Cache TTL: ${botConfig.cacheTTLHours} hours`);
  console.log(`📊 Max Cache Size: ${botConfig.maxCacheSize} movies`);
  console.log(`🔄 Max Concurrent Downloads: ${botConfig.maxConcurrentDownloads}`);
  console.log(`🧹 Cleanup Interval: ${botConfig.cleanupIntervalHours} hours`);
  console.log(`👤 Admin User ID: ${botConfig.adminUserId}`);
  console.log(`💾 Database Path: ${botConfig.databasePath}`);
  console.log('================================\n');
}

export default botConfig;


