import https from 'https';
import http from 'http';
import { logger } from './utils/logger.js';

/**
 * Enhanced URL validation system to prevent favicon and non-video downloads
 */
export class URLValidator {
  constructor() {
    this.invalidExtensions = /\.(png|jpg|jpeg|ico|gif|css|js|woff|woff2|ttf|svg|webp|bmp|tiff)$/i;
    this.validVideoPatterns = /\.(m3u8|mpd|mp4|ts|webm|mkv|avi|mov|flv|m4v|3gp|wmv)$/i;
    this.invalidKeywords = [
      'favicon', 'analytics', 'google', 'tracking', 'facebook', 'twitter',
      'instagram', 'linkedin', 'youtube', 'ads', 'advertisement', 'banner',
      'logo', 'icon', 'thumbnail', 'preview', 'poster', 'cover'
    ];
  }

  /**
   * Check if URL is a valid video stream
   */
  async isValidStreamUrl(url) {
    if (!url || typeof url !== 'string') {
      logger.warn(`[URLValidator] Invalid URL: ${url}`);
      return false;
    }

    // Check for invalid extensions
    if (this.invalidExtensions.test(url)) {
      logger.warn(`[URLValidator] Invalid extension: ${url}`);
      return false;
    }

    // Check for invalid keywords
    const lowerUrl = url.toLowerCase();
    for (const keyword of this.invalidKeywords) {
      if (lowerUrl.includes(keyword)) {
        logger.warn(`[URLValidator] Invalid keyword '${keyword}': ${url}`);
        return false;
      }
    }

    // Check for valid video patterns
    if (this.validVideoPatterns.test(url)) {
      logger.info(`[URLValidator] Valid video pattern: ${url}`);
      return true;
    }

    // Additional content-type check for ambiguous URLs
    try {
      const contentType = await this.getContentType(url);
      if (contentType && (contentType.includes('video') || contentType.includes('application/vnd.apple.mpegurl'))) {
        logger.info(`[URLValidator] Valid content-type '${contentType}': ${url}`);
        return true;
      } else {
        logger.warn(`[URLValidator] Invalid content-type '${contentType}': ${url}`);
        return false;
      }
    } catch (error) {
      logger.warn(`[URLValidator] Content-type check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get content type of URL via HEAD request
   */
  async getContentType(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https:') ? https : http;
      const request = protocol.request(url, { method: 'HEAD' }, (response) => {
        const contentType = response.headers['content-type'] || '';
        resolve(contentType);
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(5000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      request.end();
    });
  }

  /**
   * Filter array of URLs to only valid video streams
   */
  async filterValidStreams(urls) {
    if (!Array.isArray(urls)) {
      return [];
    }

    const validStreams = [];
    const invalidStreams = [];

    for (const url of urls) {
      try {
        const isValid = await this.isValidStreamUrl(url);
        if (isValid) {
          validStreams.push(url);
          logger.info(`[URLValidator] Valid stream: ${url}`);
        } else {
          invalidStreams.push(url);
          logger.warn(`[URLValidator] Invalid stream: ${url}`);
        }
      } catch (error) {
        logger.warn(`[URLValidator] Error validating ${url}: ${error.message}`);
        invalidStreams.push(url);
      }
    }

    logger.info(`[URLValidator] Filtered ${urls.length} URLs: ${validStreams.length} valid, ${invalidStreams.length} invalid`);
    
    return {
      valid: validStreams,
      invalid: invalidStreams
    };
  }

  /**
   * Quick validation without network request
   */
  isQuickValidStreamUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Check for invalid extensions
    if (this.invalidExtensions.test(url)) {
      return false;
    }

    // Check for invalid keywords
    const lowerUrl = url.toLowerCase();
    for (const keyword of this.invalidKeywords) {
      if (lowerUrl.includes(keyword)) {
        return false;
      }
    }

    // Check for valid video patterns
    return this.validVideoPatterns.test(url);
  }
}

export default URLValidator;




