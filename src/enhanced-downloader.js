import { downloadCatazEnhanced } from './enhanced-cataz-downloader.js';
import { downloadFmoviesEnhanced } from './enhanced-fmovies-downloader.js';
import { downloadCatazInSession } from './cataz-session-downloader.js';
import { decryptFmoviesBlob } from './fmovies-blob-decryptor.js';
import { downloadWithStreamFab } from './drm-bypass-tools.js';
import { errorHandler } from './enhanced-error-handler.js';
import { monitor } from './enhanced-monitor.js';
import { logger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
// Simple UUID generator to avoid external dependencies
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Enhanced downloader with comprehensive error handling, monitoring, and optimization
 */
export class EnhancedDownloader {
  constructor() {
    this.downloadMethods = [
      { 
        name: 'Enhanced Cataz', 
        fn: downloadCatazEnhanced, 
        priority: 1,
        description: 'Enhanced Cataz with new tab handling and improved session management'
      },
      { 
        name: 'Enhanced Fmovies', 
        fn: downloadFmoviesEnhanced, 
        priority: 2,
        description: 'Enhanced Fmovies with updated selectors and blob URL handling'
      },
      { 
        name: 'Cataz Session', 
        fn: downloadCatazInSession, 
        priority: 3,
        description: 'Original Cataz session-based download (fallback)'
      },
      { 
        name: 'Fmovies Blob', 
        fn: decryptFmoviesBlob, 
        priority: 4,
        description: 'Original Fmovies blob decryption (fallback)'
      },
      { 
        name: 'StreamFab DRM', 
        fn: downloadWithStreamFab, 
        priority: 5,
        description: 'StreamFab DRM bypass (GUI-based)'
      }
    ];
  }

  /**
   * Download movie with enhanced error handling and monitoring
   */
  async downloadMovie(title, movieUrl, outputDir = 'downloads', options = {}) {
    const downloadId = generateUUID();
    const outputPath = path.join(outputDir, `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${downloadId}.mp4`);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    logger.info(`[EnhancedDownloader] Starting download: ${title}`);
    logger.info(`[EnhancedDownloader] Download ID: ${downloadId}`);
    logger.info(`[EnhancedDownloader] URL: ${movieUrl}`);
    logger.info(`[EnhancedDownloader] Output: ${outputPath}`);

    // Start monitoring
    monitor.monitorDownload(downloadId, this.detectSite(movieUrl), 'Enhanced Download', movieUrl, new Date());

    // Try each download method in priority order
    for (const method of this.downloadMethods) {
      try {
        logger.info(`[EnhancedDownloader] Trying ${method.name} (Priority ${method.priority})`);
        
        // Update progress
        monitor.updateDownloadProgress(downloadId, 10, 'TRYING_METHOD');
        
        const result = await this.executeDownloadMethod(method, movieUrl, outputPath, downloadId);
        
        if (result.success) {
          // Success!
          logger.info(`[EnhancedDownloader] SUCCESS with ${method.name}!`);
          logger.info(`[EnhancedDownloader] File: ${result.filePath}`);
          logger.info(`[EnhancedDownloader] Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          
          // Complete monitoring
          monitor.completeDownload(downloadId, true, result.fileSize);
          
          return {
            success: true,
            downloadId,
            filePath: result.filePath,
            fileSize: result.fileSize,
            method: method.name,
            source: result.source,
            duration: Date.now() - new Date().getTime()
          };
        } else {
          // Method failed, try next
          logger.warn(`[EnhancedDownloader] ${method.name} failed: ${result.error}`);
          
          // Handle error with enhanced error handler
          const errorInfo = await errorHandler.handleDownloadError(
            new Error(result.error), 
            method.name, 
            this.detectSite(movieUrl), 
            movieUrl
          );
          
          logger.info(`[EnhancedDownloader] Error handled: ${errorInfo.userMessage}`);
          logger.info(`[EnhancedDownloader] Fallback suggestions: ${errorInfo.fallbackSuggestions.join(', ')}`);
          
          // Continue to next method
          continue;
        }
        
      } catch (error) {
        logger.error(`[EnhancedDownloader] ${method.name} threw exception:`, error);
        
        // Handle exception
        const errorInfo = await errorHandler.handleDownloadError(
          error, 
          method.name, 
          this.detectSite(movieUrl), 
          movieUrl
        );
        
        logger.info(`[EnhancedDownloader] Exception handled: ${errorInfo.userMessage}`);
        
        // Continue to next method
        continue;
      }
    }

    // All methods failed
    logger.error(`[EnhancedDownloader] All download methods failed for ${title}`);
    monitor.completeDownload(downloadId, false, 0, new Error('All methods failed'));
    
    return {
      success: false,
      downloadId,
      error: 'All download methods failed',
      suggestions: this.getGeneralSuggestions()
    };
  }

  /**
   * Execute download method with timeout and error handling
   */
  async executeDownloadMethod(method, movieUrl, outputPath, downloadId) {
    const timeout = 300000; // 5 minutes timeout
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          success: false,
          error: `Method ${method.name} timed out after ${timeout / 1000} seconds`
        });
      }, timeout);

      method.fn(movieUrl, outputPath)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          resolve({
            success: false,
            error: error.message
          });
        });
    });
  }

  /**
   * Detect site from URL
   */
  detectSite(url) {
    if (url.includes('cataz.to')) return 'Cataz';
    if (url.includes('fmovies.to')) return 'Fmovies';
    if (url.includes('yts.mx')) return 'YTS';
    if (url.includes('einthusan.com')) return 'Einthusan';
    return 'Unknown';
  }

  /**
   * Get general suggestions when all methods fail
   */
  getGeneralSuggestions() {
    return [
      'Check internet connection',
      'Verify the movie URL is correct',
      'Try a different movie title',
      'Wait and try again later',
      'Check if the site is accessible',
      'Try using a VPN if geo-blocked'
    ];
  }

  /**
   * Download multiple movies with queue management
   */
  async downloadMultiple(movies, options = {}) {
    const results = [];
    const maxConcurrent = options.maxConcurrent || 2;
    let activeDownloads = 0;
    const queue = [...movies];

    logger.info(`[EnhancedDownloader] Starting batch download of ${movies.length} movies`);
    logger.info(`[EnhancedDownloader] Max concurrent downloads: ${maxConcurrent}`);

    while (queue.length > 0 || activeDownloads > 0) {
      // Start new downloads if we have capacity
      while (activeDownloads < maxConcurrent && queue.length > 0) {
        const movie = queue.shift();
        activeDownloads++;
        
        logger.info(`[EnhancedDownloader] Starting download ${activeDownloads}/${maxConcurrent}: ${movie.title}`);
        
        this.downloadMovie(movie.title, movie.url, movie.outputDir, movie.options)
          .then(result => {
            results.push(result);
            activeDownloads--;
            logger.info(`[EnhancedDownloader] Completed download: ${movie.title} (${result.success ? 'SUCCESS' : 'FAILED'})`);
          })
          .catch(error => {
            results.push({
              success: false,
              title: movie.title,
              error: error.message
            });
            activeDownloads--;
            logger.error(`[EnhancedDownloader] Failed download: ${movie.title}`, error);
          });
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info(`[EnhancedDownloader] Batch download completed: ${results.length} results`);
    return results;
  }

  /**
   * Get system status and performance metrics
   */
  getSystemStatus() {
    const dashboardData = monitor.getDashboardData();
    const queueStatus = monitor.getQueueStatus();
    const performanceStats = errorHandler.getPerformanceStats();

    return {
      dashboard: dashboardData,
      queue: queueStatus,
      performance: performanceStats,
      timestamp: new Date()
    };
  }

  /**
   * Generate comprehensive system report
   */
  generateSystemReport() {
    console.log("\n🎬 ENHANCED DOWNLOADER SYSTEM REPORT");
    console.log("=" .repeat(60));
    
    // System status
    const status = this.getSystemStatus();
    
    console.log("\n📊 SYSTEM STATUS:");
    console.log(`   Active Downloads: ${status.dashboard.activeDownloads.length}`);
    console.log(`   Queue Length: ${status.queue.queueLength}`);
    console.log(`   Success Rate: ${status.performance.successRate}%`);
    console.log(`   Total Attempts: ${status.performance.totalAttempts}`);
    
    // Performance breakdown
    console.log("\n📈 PERFORMANCE BREAKDOWN:");
    Object.entries(status.performance.sitePerformance).forEach(([site, performance]) => {
      const siteSuccessRate = performance.attempts > 0 
        ? (performance.successes / performance.attempts * 100).toFixed(2)
        : '0.00';
      console.log(`   ${site}: ${siteSuccessRate}% (${performance.successes}/${performance.attempts})`);
    });
    
    // Error breakdown
    if (Object.keys(status.performance.errorTypes).length > 0) {
      console.log("\n❌ ERROR BREAKDOWN:");
      Object.entries(status.performance.errorTypes).forEach(([errorType, count]) => {
        console.log(`   ${errorType}: ${count} occurrences`);
      });
    }
    
    // System health
    const health = status.dashboard.systemHealth;
    console.log("\n💻 SYSTEM HEALTH:");
    console.log(`   CPU Usage: ${health.cpuUsage.toFixed(2)}%`);
    console.log(`   Memory Usage: ${health.memoryUsage.toFixed(2)}MB`);
    console.log(`   Disk Space: ${health.diskSpace.toFixed(2)}MB`);
    console.log(`   Network Latency: ${health.networkLatency.toFixed(2)}ms`);
    
    // Recent alerts
    if (status.dashboard.recentAlerts.length > 0) {
      console.log("\n⚠️ RECENT ALERTS:");
      status.dashboard.recentAlerts.forEach(alert => {
        console.log(`   ${alert.type}: ${alert.message}`);
      });
    }
    
    console.log("=" .repeat(60));
  }
}

// Export singleton instance
export const enhancedDownloader = new EnhancedDownloader();


