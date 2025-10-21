// Downloader Bot (Bot A) - Background worker for downloading/converting movies
import TelegramBot from 'node-telegram-bot-api';
import { movieCache } from '../movieCache.js';
import { searchTorrents } from '../services/searchService.js';
import { searchEinthusan } from '../einthusan.js';
import { downloadFmoviesMovie } from '../fmovies-downloader.js';
import { downloadFmoviesAdvanced } from '../advanced-fmovies-downloader.js';
import { downloadFmoviesPrecise } from '../precise-fmovies-downloader.js';
import { searchYTS } from '../yts.js';
import { searchYTS as searchYTS_TV } from '../ytstv.js';

// Imports for direct download solutions
import { downloadCatazInSession } from '../cataz-session-downloader.js';
import { decryptFmoviesBlob } from '../fmovies-blob-decryptor.js';
import { downloadCatazEnhanced } from '../enhanced-cataz-downloader.js';
import { downloadFmoviesEnhanced } from '../enhanced-fmovies-downloader.js';

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
      // Try sending IMDb poster; fall back to text-only if not available
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

      // Try different sources
      let downloadResult = null;
      let sourceIndicator = '';

      // 1. Try streaming sources first (limited options available)
      logger.info(`[DownloaderBot] Trying streaming sources for "${title}"`);
      
      // 2. Try streaming sources directly
        try {
          logger.info(`[DownloaderBot] Searching streaming sources for "${title}"`);
          downloadResult = await this.downloadFromStreaming(title);
          if (downloadResult) {
            downloadResult.source_type = 'streaming';
            sourceIndicator = '🌐 Streaming fallback';
            await this.bot.sendMessage(
              requesterChatId,
              `${sourceIndicator}\n⏳ Downloading "${title}" from ${downloadResult.sourceName}...`,
              { parse_mode: 'Markdown' }
            );
            logger.info(`[DownloaderBot] Streaming source selected: ${downloadResult.sourceName} (${downloadResult.sourceUrl})`);
          }
        } catch (error) {
          logger.error(`Streaming download failed for ${title}:`, error);
        }

      // If no streaming sources found, provide helpful message
      if (!downloadResult) {
        logger.info(`[DownloaderBot] No streaming sources found for "${title}"`);
        logger.info(`[DownloaderBot] NOTE: Cataz only has trailers (17MB), not full movies`);
        logger.info(`[DownloaderBot] For full movies, consider using torrent sources when seeders < 15`);
      }

      if (!downloadResult) {
        throw new Error('No sources found for this movie');
      }

      // Upload to cache channel
      const uploadResult = await this.uploadToCacheChannel(downloadResult.filePath, title);
      
      if (!uploadResult.success) {
        throw new Error('Failed to upload to cache channel');
      }

      // Add to cache database
      const cacheData = {
        title,
        file_id: uploadResult.file_id,
        message_id: uploadResult.message_id,
        channel_id: this.cacheChannelId,
        file_size: downloadResult.fileSize,
        source_type: downloadResult.source_type,
        source_url: downloadResult.sourceUrl,
        ttl_hours: 24 // 24 hours TTL
      };

      movieCache.addMovie(cacheData);

      // Clean up local file
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }

      // Notify requester
      await this.bot.sendMessage(
        requesterChatId,
        `✅ **${title}** downloaded and cached!\n\n📁 File ID: \`${uploadResult.file_id}\`\n💾 Cached for 24 hours\n🎬 Ready for instant delivery!`,
        { parse_mode: 'Markdown' }
      );

      logger.info(`Successfully downloaded and cached: ${title}`);

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

      if ((torrent.seeders ?? 0) < minSeeders) {
        // below threshold → force streaming fallback
        return null;
      }
      
      // For now, return a mock result - you'll need to implement actual torrent downloading
      // This would use WebTorrent or similar library
      const outputPath = `downloads/${title.replace(/[^a-zA-Z0-9]/g, '_')}.mkv`;
      
      // Mock implementation - replace with actual torrent download
      logger.info(`Would download torrent: ${torrent.title} -> ${outputPath}`);
      
      return {
        filePath: outputPath,
        fileSize: 0, // Would be actual file size
        sourceUrl: torrent.magnet_link || torrent.magnet || torrent.torrent_url || torrent.url
      };

    } catch (error) {
      logger.error('Torrent download error:', error);
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
      // Try multiple streaming sources in priority order (working sources first)
      // NOTE: Cataz only has trailers (17MB), not full movies
      const streamingSources = [
        { name: 'Einthusan', searchFn: searchEinthusan, hasAudio: true, directDownload: false },
        { name: 'Enhanced Cataz', searchFn: null, hasAudio: true, directDownload: true, downloadFn: downloadCatazEnhanced, priority: 1 },
        { name: 'Enhanced Fmovies', searchFn: null, hasAudio: true, directDownload: true, downloadFn: downloadFmoviesEnhanced, priority: 2 },
        { name: 'Cataz Session', searchFn: null, hasAudio: true, directDownload: true, downloadFn: downloadCatazInSession, priority: 3 },
        { name: 'Fmovies Blob', searchFn: null, hasAudio: true, directDownload: true, downloadFn: decryptFmoviesBlob, priority: 4 },
        { name: 'StreamFab DRM', searchFn: null, hasAudio: true, directDownload: true, downloadFn: downloadWithStreamFab, priority: 5 },
        { name: 'Universal DRM', searchFn: null, hasAudio: true, directDownload: true, downloadFn: downloadWithUniversalDRMBypass, priority: 6 }
      ];

      for (const source of streamingSources) {
        try {
          logger.info(`Searching ${source.name} for: ${title} (Audio: ${source.hasAudio ? 'YES' : 'NO'})`);
          
          // Handle direct download sources (no search needed)
          if (source.directDownload && source.downloadFn) {
            logger.info(`[DownloaderBot] Using direct download for ${source.name}`);
            const outputPath = `downloads/${title.replace(/[^a-zA-Z0-9]/g, '_')}_${source.name.replace(/\s+/g, '_')}.mp4`;
            
            // Use the specific download function for this source
            const downloadResult = await source.downloadFn(
              `https://cataz.to/movie/watch-${title.toLowerCase().replace(/\s+/g, '-')}-19690`, // Cataz URL format
              outputPath
            );
            
            if (downloadResult.success) {
              return {
                filePath: downloadResult.filePath,
                fileSize: downloadResult.fileSize || 0,
                sourceUrl: downloadResult.streamUrl || 'Direct download',
                sourceName: source.name
              };
            }
          } else if (source.searchFn) {
            // Handle search-based sources
            const results = await source.searchFn(title);
            
            if (results && results.length > 0) {
              const movie = results[0];
              const outputPath = `downloads/${title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
              
              logger.info(`Found on ${source.name}: ${movie.title} -> ${outputPath}`);
              
              // Use direct download for sources that support it
              if (source.directDownload) {
                logger.info(`[DownloaderBot] Using direct download for ${source.name}`);
                // For direct download sources, we can use yt-dlp or similar
                const downloadResult = await this.downloadDirectStream(movie.url, outputPath);
                if (downloadResult.success) {
                  return {
                    filePath: downloadResult.filePath,
                    fileSize: downloadResult.fileSize || 0,
                    sourceUrl: movie.url,
                    sourceName: source.name
                  };
                }
              } else {
                // Use your existing conversion pipeline for other sources
                const conversionResult = await this.convertStreamingContent(movie.url, outputPath);
                
                if (conversionResult.success) {
                  return {
                    filePath: outputPath,
                    fileSize: conversionResult.fileSize || 0,
                    sourceUrl: movie.url,
                    sourceName: source.name
                  };
                }
              }
            }
          }
        } catch (error) {
          logger.error(`${source.name} search failed for ${title}:`, error);
        }
      }

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


