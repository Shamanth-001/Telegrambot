// Cache Manager - Handles index.json and Telegram file caching
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

// TTL configuration: when CACHE_TTL_HOURS <= 0, entries never expire
const TTL_HOURS = Number.parseInt(process.env.CACHE_TTL_HOURS || '24', 10);
const INFINITE_TTL = !Number.isFinite(TTL_HOURS) || TTL_HOURS <= 0;

export class CacheManager {
  constructor(cacheDir = './cache', privateChannelId = null) {
    this.cacheDir = cacheDir;
    this.indexPath = path.join(cacheDir, 'index.json');
    this.privateChannelId = privateChannelId;
    this.activeDownloads = new Map(); // Track active downloads to prevent duplicates
    
    this.ensureCacheDir();
    this.loadIndex();
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      logger.info(`[CacheManager] Created cache directory: ${this.cacheDir}`);
    }
  }

  /**
   * Load index.json from disk
   */
  loadIndex() {
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf8');
        this.index = JSON.parse(raw);
        logger.info(`[CacheManager] Loaded cache index with ${Object.keys(this.index).length} entries`);
      } else {
        this.index = {};
        this.saveIndex();
        logger.info('[CacheManager] Created new cache index');
      }
    } catch (error) {
      logger.error('[CacheManager] Error loading index:', error);
      this.index = {};
    }
  }

  /**
   * Save index.json to disk
   */
  saveIndex() {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
    } catch (error) {
      logger.error('[CacheManager] Error saving index:', error);
    }
  }

  /**
   * Check if movie exists in cache
   * @param {string} title - Movie title
   * @returns {Object|null} Cache entry or null
   */
  checkCache(title) {
    const normalizedTitle = title.toLowerCase().trim();
    const entry = this.index[normalizedTitle];
    
    if (entry && entry.file_id) {
      if (INFINITE_TTL) {
        logger.info(`[CacheManager] Cache hit (no TTL): ${title}`);
        return entry;
      }

      const downloadedAt = new Date(entry.downloadedAt);
      const now = new Date();
      const hoursDiff = (now - downloadedAt) / (1000 * 60 * 60);
      if (hoursDiff < TTL_HOURS) {
        logger.info(`[CacheManager] Cache hit for: ${title}`);
        return entry;
      }

      logger.info(`[CacheManager] Cache expired for: ${title} (${hoursDiff.toFixed(1)} hours old)`);
      this.removeFromCache(normalizedTitle);
      return null;
    }
    
    return null;
  }

  /**
   * Add movie to cache
   * @param {string} title - Movie title
   * @param {string} fileId - Telegram file ID
   * @param {number} messageId - Telegram message ID
   * @param {string} sourceType - Source type (torrent/streaming)
   * @param {string} sourceUrl - Source URL
   * @param {number} fileSize - File size in bytes
   */
  addToCache(title, fileId, messageId, sourceType = 'unknown', sourceUrl = '', fileSize = 0) {
    const normalizedTitle = title.toLowerCase().trim();
    
    this.index[normalizedTitle] = {
      file_id: fileId,
      message_id: messageId,
      downloadedAt: new Date().toISOString(),
      source_type: sourceType,
      source_url: sourceUrl,
      file_size: fileSize,
      channel_id: this.privateChannelId
    };
    
    this.saveIndex();
    logger.info(`[CacheManager] Added to cache: ${title} (${fileId})`);
  }

  /**
   * Remove movie from cache
   * @param {string} title - Movie title
   */
  removeFromCache(title) {
    const normalizedTitle = title.toLowerCase().trim();
    if (this.index[normalizedTitle]) {
      delete this.index[normalizedTitle];
      this.saveIndex();
      logger.info(`[CacheManager] Removed from cache: ${title}`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const entries = Object.values(this.index);
    if (INFINITE_TTL) {
      return {
        total: entries.length,
        active: entries.length,
        expired: 0,
        totalSize: entries.reduce((sum, entry) => sum + (entry.file_size || 0), 0)
      };
    }

    const now = new Date();
    const active = entries.filter(entry => {
      const downloadedAt = new Date(entry.downloadedAt);
      const hoursDiff = (now - downloadedAt) / (1000 * 60 * 60);
      return hoursDiff < TTL_HOURS;
    });
    const expired = entries.filter(entry => {
      const downloadedAt = new Date(entry.downloadedAt);
      const hoursDiff = (now - downloadedAt) / (1000 * 60 * 60);
      return hoursDiff >= TTL_HOURS;
    });

    return {
      total: entries.length,
      active: active.length,
      expired: expired.length,
      totalSize: entries.reduce((sum, entry) => sum + (entry.file_size || 0), 0)
    };
  }

  /**
   * Clean up expired entries
   * @returns {number} Number of entries cleaned up
   */
  cleanupExpired() {
    if (INFINITE_TTL) {
      // No cleanup when TTL is infinite
      return 0;
    }

    const now = new Date();
    let cleaned = 0;
    for (const [title, entry] of Object.entries(this.index)) {
      const downloadedAt = new Date(entry.downloadedAt);
      const hoursDiff = (now - downloadedAt) / (1000 * 60 * 60);
      if (hoursDiff >= TTL_HOURS) {
        delete this.index[title];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.saveIndex();
      logger.info(`[CacheManager] Cleaned up ${cleaned} expired entries`);
    }
    return cleaned;
  }

  /**
   * Check if download is already in progress
   * @param {string} title - Movie title
   * @returns {boolean} True if download is active
   */
  isDownloadActive(title) {
    const normalizedTitle = title.toLowerCase().trim();
    return this.activeDownloads.has(normalizedTitle);
  }

  /**
   * Mark download as active
   * @param {string} title - Movie title
   */
  markDownloadActive(title) {
    const normalizedTitle = title.toLowerCase().trim();
    this.activeDownloads.set(normalizedTitle, Date.now());
  }

  /**
   * Mark download as completed
   * @param {string} title - Movie title
   */
  markDownloadCompleted(title) {
    const normalizedTitle = title.toLowerCase().trim();
    this.activeDownloads.delete(normalizedTitle);
  }

  /**
   * Get active downloads
   * @returns {Array} Array of active download titles
   */
  getActiveDownloads() {
    return Array.from(this.activeDownloads.keys());
  }

  /**
   * Search movies in cache
   * @param {string} query - Search query
   * @returns {Array} Matching cache entries
   */
  searchCache(query) {
    const normalizedQuery = query.toLowerCase().trim();
    const results = [];
    
    for (const [title, entry] of Object.entries(this.index)) {
      if (title.includes(normalizedQuery)) {
        results.push({
          title: title,
          ...entry
        });
      }
    }
    
    return results.sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt));
  }
}

export const cacheManager = new CacheManager();
