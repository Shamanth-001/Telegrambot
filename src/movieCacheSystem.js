// Movie Cache System - Orchestrates both bots and manages the complete system
import { DownloaderBot } from './bot/downloaderBot.js';
import { ApiBot } from './bot/apiBot.js';
import { movieCache } from './movieCache.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';

export class MovieCacheSystem {
  constructor() {
    this.downloaderBot = null;
    this.apiBot = null;
    this.isRunning = false;
  }

  /**
   * Initialize and start the movie cache system
   * @param {Object} botConfig - Bot configuration
   */
  async start(botConfig) {
    try {
      logger.info('Starting Movie Cache System...');

      // Validate configuration
      this.validateConfig(botConfig);

      // Initialize API Bot (now handles everything - torrent + streaming downloads)
      this.apiBot = new ApiBot(
        botConfig.apiBotToken,
        botConfig.downloaderBotToken,
        botConfig.cacheChannelId
      );

      // Start cleanup scheduler
      this.startSystemCleanup();

      this.isRunning = true;
      logger.info('Movie Cache System started successfully');

      // Display system status
      this.displaySystemStatus();

    } catch (error) {
      logger.error('Failed to start Movie Cache System:', error);
      throw error;
    }
  }

  /**
   * Validate bot configuration
   * @param {Object} botConfig - Bot configuration
   */
  validateConfig(botConfig) {
    const required = [
      'downloaderBotToken',
      'apiBotToken',
      'cacheChannelId',
      'downloaderBotChatId'
    ];

    for (const field of required) {
      if (!botConfig[field]) {
        throw new Error(`Missing required configuration: ${field}`);
      }
    }

    logger.info('Configuration validated successfully');
  }

  /**
   * Start system-wide cleanup scheduler
   */
  startSystemCleanup() {
    // Run cleanup every 6 hours
    setInterval(async () => {
      try {
        if (!this.isRunning) return;

        const stats = movieCache.getStats();
        logger.info(`Cache stats - Total: ${stats.total}, Active: ${stats.active}, Expired: ${stats.expired}`);

        // Clean up expired movies
        const cleaned = movieCache.cleanupExpired();
        if (cleaned > 0) {
          logger.info(`System cleanup: Removed ${cleaned} expired movies`);
        }

        // Log system health
        this.logSystemHealth();

      } catch (error) {
        logger.error('System cleanup error:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    logger.info('System cleanup scheduler started');
  }

  /**
   * Display system status
   */
  displaySystemStatus() {
    const stats = movieCache.getStats();
    
    console.log('\n🎬 ===== MOVIE CACHE SYSTEM =====');
    console.log(`📊 Cache Status: ${stats.active} active, ${stats.expired} expired`);
    console.log(`🤖 API Bot: ${this.apiBot ? 'Running (handles torrent + streaming downloads)' : 'Stopped'}`);
    console.log(`🔄 System Status: ${this.isRunning ? 'Active' : 'Inactive'}`);
    console.log('================================\n');
  }

  /**
   * Log system health
   */
  logSystemHealth() {
    const stats = movieCache.getStats();
    const downloaderStatus = this.downloaderBot ? this.downloaderBot.getQueueStatus() : null;

    logger.info('System Health Check:', {
      cache: {
        total: stats.total,
        active: stats.active,
        expired: stats.expired
      },
      downloader: downloaderStatus ? {
        isProcessing: downloaderStatus.isProcessing,
        queueLength: downloaderStatus.queueLength
      } : null,
      system: {
        isRunning: this.isRunning,
        uptime: process.uptime()
      }
    });
  }

  /**
   * Get system statistics
   * @returns {Object} System statistics
   */
  getSystemStats() {
    const cacheStats = movieCache.getStats();
    const downloaderStatus = this.downloaderBot ? this.downloaderBot.getQueueStatus() : null;

    return {
      system: {
        isRunning: this.isRunning,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      cache: cacheStats,
      downloader: downloaderStatus,
      bots: {
        downloader: this.downloaderBot ? 'Running' : 'Stopped',
        api: this.apiBot ? 'Running' : 'Stopped'
      }
    };
  }

  /**
   * Stop the movie cache system
   */
  async stop() {
    try {
      logger.info('Stopping Movie Cache System...');

      this.isRunning = false;

      // Close database connection
      movieCache.close();

      logger.info('Movie Cache System stopped successfully');
    } catch (error) {
      logger.error('Error stopping Movie Cache System:', error);
    }
  }

  /**
   * Restart the system
   * @param {Object} botConfig - Bot configuration
   */
  async restart(botConfig) {
    await this.stop();
    await this.start(botConfig);
  }

  /**
   * Handle graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    logger.info('Graceful shutdown handlers registered');
  }
}

// Export singleton instance
export const movieCacheSystem = new MovieCacheSystem();

