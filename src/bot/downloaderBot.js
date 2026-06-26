// Downloader Bot (Bot A) - Background worker for downloading/converting movies
import TelegramBot from 'node-telegram-bot-api';
import { movieCache } from '../movieCache.js';
import { searchTorrents } from '../services/searchService.js';
import { searchEinthusan } from '../einthusan.js';
// Removed fmovies imports - not needed for torrent-first approach
// Removed YTS imports - not needed for torrent-first approach

// Imports for direct download solutions
// Removed cataz/fmovies imports - not needed for torrent-first approach

// Imports for DRM bypass tools
import { 
  downloadWithStreamFab, 
  downloadWithDumpMedia, 
  downloadWithRecordFab, 
  downloadWithDRMPlugin, 
  downloadWithKeeprix,
  downloadWithUniversalDRMBypass 
} from '../drm-bypass-tools.js';
import { logger } from '../utils/logger.js';
import { getImdbPoster } from '../utils/imdb.js';
import { botConfig } from './botConfig.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DownloaderBot {
  constructor(token, cacheChannelId) {
    this.bot = new TelegramBot(token, { polling: true });
    this.cacheChannelId = cacheChannelId;
    this.downloadQueue = [];
    this.isProcessing = false;
    
    this.setupEventHandlers();
    this.startCleanupScheduler();
  }

  setupEventHandlers() {
    // Listen for download requests from API Bot (special format)
    this.bot.onText(/^DOWNLOAD_REQUEST:(.+):(.+)$/, async (msg, match) => {
      const title = match[1];
      const requesterChatId = match[2];
      logger.info(`[DownloaderBot] Received download request: ${title} for ${requesterChatId}`);
      await this.addToDownloadQueue(title, requesterChatId);
    });

    // Listen for download requests from API Bot (legacy format)
    this.bot.onText(/^\/download (.+)$/, async (msg, match) => {
      const title = match[1];
      await this.addToDownloadQueue(title, msg.chat.id);
    });

    // Listen for direct movie requests
    this.bot.onText(/^\/request (.+)$/, async (msg, match) => {
      const title = match[1];
      await this.addToDownloadQueue(title, msg.chat.id);
    });

    // Admin commands
    this.bot.onText(/^\/stats$/, async (msg) => {
      const stats = movieCache.getStats();
      await this.bot.sendMessage(
        msg.chat.id,
        `📊 **Cache Statistics**\n\n` +
        `📁 Total Movies: ${stats.total}\n` +
        `✅ Active: ${stats.active}\n` +
        `⏰ Expired: ${stats.expired}\n` +
        `🔄 Queue: ${this.downloadQueue.length}`,
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.onText(/^\/cleanup$/, async (msg) => {
      const cleaned = movieCache.cleanupExpired();
      await this.bot.sendMessage(
        msg.chat.id,
        `🧹 Cleaned up ${cleaned} expired movies`,
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.on('polling_error', (err) => {
      logger.error('Downloader Bot polling error:', err);
    });
  }

  /**
   * Add movie to download queue
   * @param {string} title - Movie title
   * @param {string} requesterChatId - Chat ID of requester
   */
  async addToDownloadQueue(title, requesterChatId) {
    logger.info(`[DownloaderBot] addToDownloadQueue called: ${title} for ${requesterChatId}`);
    
    // Check if already in cache
    if (movieCache.hasMovie(title)) {
      logger.info(`[DownloaderBot] Movie ${title} already in cache`);
      const movie = movieCache.getMovie(title);
      await this.bot.sendMessage(
        requesterChatId,
        `✅ **${title}** is already cached!\n\n📁 File ID: \`${movie.file_id}\`\n⏰ Downloaded: ${new Date(movie.downloaded_at).toLocaleString()}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Check if already in queue
    if (this.downloadQueue.some(item => item.title.toLowerCase() === title.toLowerCase())) {
      await this.bot.sendMessage(
        requesterChatId,
        `⏳ **${title}** is already in download queue`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Add to queue
    this.downloadQueue.push({
      title,
      requesterChatId,
      addedAt: new Date()
    });

    await this.bot.sendMessage(
      requesterChatId,
      `📥 **${title}** added to download queue\n\n⏳ Position: ${this.downloadQueue.length}\n🔄 Processing...`,
      { parse_mode: 'Markdown' }
    );

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processDownloadQueue();
    }
  }

  /**
   * Process download queue
   */
  async processDownloadQueue() {
    if (this.isProcessing || this.downloadQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.downloadQueue.length > 0) {
      const item = this.downloadQueue.shift();
      await this.downloadMovie(item);
    }

    this.isProcessing = false;
  }

  /**
   * Download a single movie
   * @param {Object} item - Download queue item
   */
  async downloadMovie(item) {
    const { title, requesterChatId } = item;
    
    try {
      // Send status update
      const posterUrl = await getImdbPoster(title);
      if (posterUrl) {
        try {
          await this.bot.sendPhoto(
            requesterChatId,
            posterUrl,
            { caption: `🎬 **${title}**\n📥 Download in progress...`, parse_mode: 'Markdown' }
          );
        } catch {
          await this.bot.sendMessage(
            requesterChatId,
            `🔄 **Downloading: ${title}**\n\n⏳ Searching for sources...`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        await this.bot.sendMessage(
          requesterChatId,
          `🔄 **Downloading: ${title}**\n\n⏳ Searching for sources...`,
          { parse_mode: 'Markdown' }
        );
      }

      // 1. Try torrent first
      logger.info(`[DownloaderBot] Trying torrent for: ${title}`);
      const torrentResult = await this.downloadFromTorrent(title);
      
      if (torrentResult) {
        if (torrentResult.isTorrentFile) {
          // High seeders: Upload .torrent file to channel
          logger.info(`[DownloaderBot] High seeders (${torrentResult.seeders}) - uploading torrent file`);
          
          const uploadResult = await this.uploadTorrentToChannel(
            torrentResult.filePath, 
            title, 
            torrentResult.seeders
          );
          
          if (uploadResult.success) {
            // Send torrent file to user
            await this.bot.sendDocument(
              requesterChatId,
              torrentResult.filePath,
              {
                caption: `🌱 **${title} - Torrent File**\n📊 **${torrentResult.seeders} seeders**\n\n💡 Use uTorrent or qBittorrent to download\n📁 File ID: \`${uploadResult.file_id}\``,
                parse_mode: 'Markdown'
              }
            );
            
            // Clean up local torrent file
            if (fs.existsSync(torrentResult.filePath)) {
              fs.unlinkSync(torrentResult.filePath);
            }
            
            logger.info(`Successfully uploaded torrent file for: ${title}`);
            return;
          }
        } else {
          // This shouldn't happen with new logic, but handle just in case
          logger.warn(`[DownloaderBot] Unexpected torrent result without isTorrentFile flag`);
        }
      }

      // 2. Low seeders or no torrent: Try streaming, fallback to torrent file
      logger.info(`[DownloaderBot] Trying streaming sources for: ${title}`);
      const streamingResult = await this.downloadFromStreaming(title);
      
      if (streamingResult) {
        logger.info(`[DownloaderBot] Streaming download successful: ${streamingResult.filePath}`);
        
        // Upload full movie to channel
        const uploadResult = await this.uploadToCacheChannel(streamingResult.filePath, title);
        
        if (!uploadResult.success) {
          throw new Error('Failed to upload to cache channel');
        }

        // Add to cache database
        const cacheData = {
          title,
          file_id: uploadResult.file_id,
          message_id: uploadResult.message_id,
          channel_id: this.cacheChannelId,
          file_size: streamingResult.fileSize,
          source_type: 'streaming',
          source_url: streamingResult.sourceUrl,
          ttl_hours: 24 // 24 hours TTL
        };

        movieCache.addMovie(cacheData);

        // Clean up local file
        if (fs.existsSync(streamingResult.filePath)) {
          fs.unlinkSync(streamingResult.filePath);
        }

        // Notify requester
        await this.bot.sendMessage(
          requesterChatId,
          `✅ **${title}** downloaded and cached!\n\n📁 File ID: \`${uploadResult.file_id}\`\n💾 Cached for 24 hours\n🎬 Ready for instant delivery!`,
          { parse_mode: 'Markdown' }
        );

        logger.info(`Successfully downloaded and cached: ${title}`);
        return;
      } else {
        // Streaming failed - provide torrent file as fallback even with low seeders
        logger.warn(`[DownloaderBot] Streaming failed, providing torrent file as fallback`);
        
        if (torrentResult && torrentResult.filePath) {
          const uploadResult = await this.uploadTorrentToChannel(
            torrentResult.filePath, 
            title, 
            torrentResult.seeders || 0
          );
          
          if (uploadResult.success) {
            // Send torrent file to user with warning about low seeders
            await this.bot.sendDocument(
              requesterChatId,
              torrentResult.filePath,
              {
                caption: `🌱 **${title} - Torrent File**\n📊 **${torrentResult.seeders || 0} seeders** (Low)\n\n⚠️ **Low seeders - download may be slow**\n💡 Use uTorrent or qBittorrent to download\n📁 File ID: \`${uploadResult.file_id}\``,
                parse_mode: 'Markdown'
              }
            );
            
            // Clean up local torrent file
            if (fs.existsSync(torrentResult.filePath)) {
              fs.unlinkSync(torrentResult.filePath);
            }
            
            logger.info(`Successfully uploaded torrent file as fallback for: ${title}`);
            return;
          }
        }
      }

      // 3. No sources found
      throw new Error('No sources found for this movie');

    } catch (error) {
      logger.error(`Download failed for ${title}:`, error);
      
      await this.bot.sendMessage(
        requesterChatId,
        `❌ **Download Failed: ${title}**\n\nError: ${error.message}\n\nTry a different movie or check the title spelling.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Download movie from torrent
   * @param {string} title - Movie title
   * @returns {Object|null} Download result
   */
  async downloadFromTorrent(title) {
    try {
      logger.info(`[Downloader] Trying torrent first for: ${title}`);
      // Search for torrents
      const minSeeders = Number(process.env.MIN_TORRENT_SEEDERS || 15);
      // fetch all candidates; we'll enforce threshold here for clearer diagnostics
      const torrents = await searchTorrents(title, { minSeeders: 0 });
      
      if (!torrents || torrents.length === 0) {
        return null;
      }

      // Use the first torrent (you can implement better selection logic)
      // Prefer highest seeders
      const sorted = [...torrents].sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
      // Log top 3 candidates for debugging
      try {
        const top3 = sorted.slice(0, 3).map((t, i) => `#${i+1} ${t.title || 'unknown'} | seeders=${t.seeders ?? 'n/a'} | q=${t.quality || ''}`);
        if (top3.length) logger.info(`[Downloader] Top torrent candidates:\n${top3.join('\n')}`);
      } catch {}
      const torrent = sorted[0];
      logger.info(`[Downloader] Best torrent candidate: ${torrent.title} (seeders: ${torrent.seeders ?? 'n/a'})`);
      // Diagnostic message to requester: seeder threshold decision
      const requesterChatId = arguments[1]?.requesterChatId;
      if (requesterChatId) {
        const seederMsg = `⚖️ Seeder check: best=${torrent.seeders ?? 'n/a'} vs min=${minSeeders} → ${((torrent.seeders ?? 0) >= minSeeders) ? 'use torrent' : 'fallback to streaming'}`;
        logger.info(`[Downloader] ${seederMsg}`);
        try { await this.bot.sendMessage(requesterChatId, seederMsg, { parse_mode: 'Markdown' }); } catch {}
      }

      if ((torrent.seeders ?? 0) >= minSeeders) {
        // High seeders: Download .torrent file only
        logger.info(`[Downloader] High seeders (${torrent.seeders}) - downloading .torrent file`);
        return await this.downloadTorrentFile(torrent);
      } else {
        // Low seeders: Return null to trigger streaming download
        logger.info(`[Downloader] Low seeders (${torrent.seeders}) - falling back to streaming`);
        return null;
      }

    } catch (error) {
      logger.error('Torrent download error:', error);
      return null;
    }
  }

  /**
   * Download torrent file (not the movie itself)
   * @param {Object} torrent - Torrent object with URL and metadata
   * @returns {Object|null} Download result
   */
  async downloadTorrentFile(torrent) {
    try {
      const axios = require('axios');
      const fs = require('fs');
      
      const torrentUrl = torrent.torrent_url || `https://itorrents.org/torrent/${torrent.infoHash}.torrent`;
      logger.info(`[Downloader] Downloading torrent file from: ${torrentUrl}`);
      
      const response = await axios.get(torrentUrl, { 
        responseType: 'arraybuffer',
        timeout: 30000 
      });
      
      const buffer = Buffer.from(response.data);
      const filename = `${torrent.title.replace(/[^a-zA-Z0-9]/g, '_')}.torrent`;
      const filePath = `downloads/${filename}`;
      
      fs.writeFileSync(filePath, buffer);
      
      logger.info(`[Downloader] Torrent file saved: ${filePath} (${buffer.length} bytes)`);
      
      return {
        filePath,
        fileSize: buffer.length,
        sourceUrl: torrentUrl,
        sourceName: 'Torrent',
        isTorrentFile: true,
        seeders: torrent.seeders
      };
    } catch (error) {
      logger.error('Failed to download torrent file:', error);
      return null;
    }
  }

  /**
   * Download movie from streaming sources
   * @param {string} title - Movie title
   * @returns {Object|null} Download result
   */
  async downloadFromStreaming(title) {
    try {
      logger.info(`[DownloaderBot] Using automated streaming downloader for: ${title}`);
      
      // Use the new automated streaming downloader
      const { downloadMovieFromStreaming } = await import('../services/automatedStreamDownloader.js');
      const result = await downloadMovieFromStreaming(title);
      
      if (result) {
        logger.info(`[DownloaderBot] Automated download successful: ${result.filePath} (${(result.fileSize / 1024 / 1024).toFixed(2)} MB)`);
        return {
          filePath: result.filePath,
          fileSize: result.fileSize,
          sourceUrl: result.sourceUrl,
          sourceName: result.sourceName
        };
      }
      
      logger.warn(`[DownloaderBot] Automated streaming download failed for: ${title}`);
      return null;

    } catch (error) {
      logger.error('Streaming download error:', error);
      return null;
    }
  }

  /**
   * Search Fmovies website for movies
   * @param {string} title - Movie title
   * @returns {Array} Search results
   */
  async searchFmovies(title) {
    try {
      const { searchFmovies } = await import('../fmovies.js');
      return await searchFmovies(title);
    } catch (error) {
      logger.error('Fmovies search error:', error);
      return [];
    }
  }

  async searchYTS(title) {
    try {
      logger.info(`[YTS] Searching for: ${title}`);
      const results = await searchYTS(title);
      return results.map(movie => ({
        title: movie.title,
        url: movie.url,
        quality: movie.quality,
        year: movie.year
      }));
    } catch (error) {
      logger.error('YTS search error:', error);
      return [];
    }
  }

  async searchYTS_TV(title) {
    try {
      logger.info(`[YTS-TV] Searching for: ${title}`);
      const results = await searchYTS_TV(title);
      return results.map(movie => ({
        title: movie.title,
        url: movie.url,
        quality: movie.quality,
        year: movie.year
      }));
    } catch (error) {
      logger.error('YTS-TV search error:', error);
      return [];
    }
  }

  /**
   * Download direct stream using yt-dlp
   * @param {string} streamUrl - Stream URL
   * @param {string} outputPath - Output file path
   * @returns {Object} Download result
   */
  async downloadDirectStream(streamUrl, outputPath) {
    try {
      logger.info(`[DownloaderBot] Direct download from: ${streamUrl}`);
      
      // Use yt-dlp for direct stream download
      const ytdlpCmd = `yt-dlp -o "${outputPath}" --no-playlist "${streamUrl}"`;
      
      logger.info(`[DownloaderBot] Running: ${ytdlpCmd}`);
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync(ytdlpCmd);
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        
        logger.info(`[DownloaderBot] Direct download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
          success: true,
          filePath: outputPath,
          fileSize: fileSize
        };
      } else {
        return { success: false, error: 'Downloaded file not found' };
      }
      
    } catch (error) {
      logger.error(`[DownloaderBot] Direct download error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Download movie from Fmovies using advanced methods
   * @param {string} movieUrl - Fmovies movie URL
   * @param {string} outputPath - Output file path
   * @returns {Object} Download result
   */
  async downloadFromFmovies(movieUrl, outputPath) {
    try {
      logger.info(`[DownloaderBot] Downloading from Fmovies (Advanced): ${movieUrl}`);
      
      // Try precise downloader first (video player area only)
      // No duration specified - will auto-detect movie duration
      const preciseResult = await downloadFmoviesPrecise(movieUrl);
      
      if (preciseResult.success && preciseResult.filePath) {
        // Move the downloaded file to the desired output path
        if (fs.existsSync(preciseResult.filePath)) {
          const stats = fs.statSync(preciseResult.filePath);
          const fileSize = stats.size;
          
          // Copy file to output path
          fs.copyFileSync(preciseResult.filePath, outputPath);
          
          // Clean up original file
          fs.unlinkSync(preciseResult.filePath);
          
          logger.info(`[DownloaderBot] Precise Fmovies download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
          
          return {
            success: true,
            filePath: outputPath,
            fileSize: fileSize
          };
        }
      }
      
      // Fallback to advanced downloader if precise fails
      logger.info(`[DownloaderBot] Precise download failed, trying advanced downloader...`);
      const advancedResult = await downloadFmoviesAdvanced(movieUrl);
      
      if (advancedResult.success && advancedResult.filePath) {
        // Move the downloaded file to the desired output path
        if (fs.existsSync(advancedResult.filePath)) {
          const stats = fs.statSync(advancedResult.filePath);
          const fileSize = stats.size;
          
          // Copy file to output path
          fs.copyFileSync(advancedResult.filePath, outputPath);
          
          // Clean up original file
          fs.unlinkSync(advancedResult.filePath);
          
          logger.info(`[DownloaderBot] Advanced Fmovies download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
          
          return {
            success: true,
            filePath: outputPath,
            fileSize: fileSize
          };
        }
      }
      
      // Fallback to basic downloader if advanced fails
      logger.info(`[DownloaderBot] Advanced download failed, trying basic downloader...`);
      const basicResult = await downloadFmoviesMovie(movieUrl, 120);
      
      if (basicResult.success && basicResult.filePath) {
        // Move the downloaded file to the desired output path
        if (fs.existsSync(basicResult.filePath)) {
          const stats = fs.statSync(basicResult.filePath);
          const fileSize = stats.size;
          
          // Copy file to output path
          fs.copyFileSync(basicResult.filePath, outputPath);
          
          // Clean up original file
          fs.unlinkSync(basicResult.filePath);
          
          logger.info(`[DownloaderBot] Basic Fmovies download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
          
          return {
            success: true,
            filePath: outputPath,
            fileSize: fileSize
          };
        }
      }
      
      return { success: false, error: advancedResult.error || basicResult.error || 'Both advanced and basic downloads failed' };
      
    } catch (error) {
      logger.error(`[DownloaderBot] Fmovies download error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search Cataz website for movies
   * @param {string} title - Movie title
   * @returns {Array} Search results
   */
  async searchCataz(title) {
    try {
      const { searchCataz } = await import('../cataz.js');
      return await searchCataz(title);
    } catch (error) {
      logger.error('Cataz search error:', error);
      return [];
    }
  }

  /**
   * Search MovieRulz for movies
   * @param {string} title - Movie title
   * @returns {Array} Search results
   */
  async searchMovieRulz(title) {
    try {
      const { searchMovieRulz } = await import('../movierulz.js');
      return await searchMovieRulz(title);
    } catch (error) {
      logger.error('MovieRulz search error:', error);
      return [];
    }
  }

  /**
   * Convert streaming content using your existing pipeline
   * @param {string} streamUrl - Streaming URL
   * @param {string} outputPath - Output file path
   * @returns {Object} Conversion result
   */
  async convertStreamingContent(streamUrl, outputPath) {
    try {
      // Import your existing SimpleConverter
      const { SimpleConverter } = await import('../converters/simple-converter.js');
      const converter = new SimpleConverter();
      
      logger.info(`Converting streaming content: ${streamUrl} -> ${outputPath}`);
      
      // Use your existing conversion pipeline
      const result = await converter.convert(streamUrl, outputPath);
      
      return {
        success: result.success,
        filePath: result.outputPath,
        fileSize: result.fileSize,
        method: result.method
      };
      
    } catch (error) {
      logger.error('Streaming conversion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload file to cache channel
   * @param {string} filePath - Local file path
   * @param {string} title - Movie title
   * @returns {Object} Upload result
   */
  async uploadToCacheChannel(filePath, title) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      const fileStats = fs.statSync(filePath);
      
      // Upload to cache channel
      const result = await this.bot.sendDocument(
        this.cacheChannelId,
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
      logger.error('Upload to cache channel failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload torrent file to cache channel
   * @param {string} filePath - Local torrent file path
   * @param {string} title - Movie title
   * @param {number} seeders - Number of seeders
   * @returns {Object} Upload result
   */
  async uploadTorrentToChannel(filePath, title, seeders) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('Torrent file does not exist');
      }

      const fileStats = fs.statSync(filePath);
      
      // Upload torrent file to cache channel
      const result = await this.bot.sendDocument(
        this.cacheChannelId,
        filePath,
        {
          caption: `🌱 ${title} - Torrent File\n📊 Seeders: ${seeders}\n📁 Size: ${(fileStats.size / 1024).toFixed(2)} KB\n⏰ Cached: ${new Date().toLocaleString()}\n\n💡 Use uTorrent or qBittorrent to download`,
          parse_mode: 'Markdown'
        }
      );

      return {
        success: true,
        file_id: result.document.file_id,
        message_id: result.message_id
      };

    } catch (error) {
      logger.error('Upload torrent to cache channel failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start cleanup scheduler
   */
  startCleanupScheduler() {
    // Run cleanup every hour
    setInterval(async () => {
      try {
        const cleaned = movieCache.cleanupExpired();
        if (cleaned > 0) {
          logger.info(`Cleaned up ${cleaned} expired movies from cache`);
        }
      } catch (error) {
        logger.error('Cleanup scheduler error:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Cleanup scheduler started');
  }

  /**
   * Get download queue status
   * @returns {Object} Queue status
   */
  getQueueStatus() {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.downloadQueue.length,
      queue: this.downloadQueue.map(item => ({
        title: item.title,
        addedAt: item.addedAt,
        requesterChatId: item.requesterChatId
      }))
    };
  }
}

export default DownloaderBot;


