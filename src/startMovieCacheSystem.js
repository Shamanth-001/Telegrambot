// Main entry point for Movie Cache System
import { movieCacheSystem } from './movieCacheSystem.js';
import { botConfig, validateBotConfig, displayConfig } from './bot/botConfig.js';
import { logger } from './utils/logger.js';

async function startSystem() {
  try {
    console.log('🎬 Starting Movie Cache System...\n');

    // Display configuration
    displayConfig();

    // Validate configuration
    validateBotConfig();

    // Setup graceful shutdown
    movieCacheSystem.setupGracefulShutdown();

    // Start the system
    await movieCacheSystem.start(botConfig);

    // Display startup success
    console.log('✅ Movie Cache System started successfully!');
    console.log('📱 API Bot is ready to receive user requests');
    console.log('🤖 API Bot handles both torrent and streaming downloads');
    console.log('💾 Cache system is active');
    console.log('\n🔍 Commands:');
    console.log('  /search <movie> - Search and get movie');
    console.log('  /status - Check cache status');
    console.log('  /help - Show help');
    console.log('\n⚡ System is running...');

  } catch (error) {
    console.error('❌ Failed to start Movie Cache System:', error.message);
    console.error('\n🔧 Setup Instructions:');
    console.error('1. Create two Telegram bots via @BotFather');
    console.error('2. Create a private channel for file caching');
    console.error('3. Add both bots to the private channel');
    console.error('4. Set environment variables:');
    console.error('   - DOWNLOADER_BOT_TOKEN');
    console.error('   - API_BOT_TOKEN');
    console.error('   - CACHE_CHANNEL_ID');
    console.error('   - DOWNLOADER_BOT_CHAT_ID');
    console.error('5. Run: npm install better-sqlite3');
    console.error('\n📖 See README.md for detailed setup instructions');
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Start the system
startSystem();

