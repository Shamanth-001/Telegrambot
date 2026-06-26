// Einthusan-specific stream extractor
import { logger } from '../utils/logger.js';

/**
 * Check if this extractor handles the given URL
 * @param {string} url - Movie page URL
 * @returns {boolean}
 */
export function match(url) {
  return url.includes('einthusan.tv/movie/watch/');
}

/**
 * Extract stream URLs from Einthusan movie page
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Array>} - Array of stream URLs with metadata
 */
export async function getStreamUrls(page) {
  logger.info('[EinthusanExtractor] Extracting stream URLs from Einthusan page');
  
  try {
    // Wait for player to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to find player iframe or video element
    const streamData = await page.evaluate(() => {
      const urls = [];
      const metadata = {
        title: document.title || 'Unknown',
        language: 'kannada',
        quality: 'HD'
      };
      
      // Look for iframe players (common on Einthusan)
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        const src = iframe.src;
        if (src && (src.includes('player') || src.includes('embed'))) {
          urls.push({ url: src, type: 'iframe', quality: 'unknown' });
        }
      });
      
      // Look for video elements
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.src) urls.push({ url: video.src, type: 'video', quality: 'unknown' });
        const sources = video.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src) {
            const quality = source.getAttribute('data-quality') || 'unknown';
            urls.push({ url: source.src, type: 'source', quality });
          }
        });
      });
      
      // Look for JavaScript variables that might contain stream URLs
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const content = script.textContent || '';
        
        // Common patterns for stream URLs in Einthusan
        const patterns = [
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.m3u8[^"']*)["']/gi,
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.mp4[^"']*)["']/gi,
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.mpd[^"']*)["']/gi,
          /window\.__PLAYER__\s*=\s*({[^}]+})/gi,
          /playerConfig\s*=\s*({[^}]+})/gi
        ];
        
        patterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const urlMatch = match.match(/https?:\/\/[^\s"']+/);
              if (urlMatch) {
                const url = urlMatch[0];
                const quality = url.includes('720p') ? '720p' : 
                              url.includes('1080p') ? '1080p' : 
                              url.includes('480p') ? '480p' : 'unknown';
                urls.push({ url, type: 'script', quality });
              }
            });
          }
        });
      });
      
      return { urls, metadata };
    });
    
    // Filter and prioritize URLs
    const filteredUrls = streamData.urls
      .filter(item => item.url && typeof item.url === 'string')
      .filter(item => {
        // Prefer streaming URLs
        return item.url.includes('.m3u8') || 
               item.url.includes('.mpd') || 
               item.url.includes('.mp4') ||
               item.url.includes('player') ||
               item.url.includes('embed');
      })
      .sort((a, b) => {
        // Prioritize by quality and type
        const qualityScore = (item) => {
          if (item.quality === '1080p') return 5;
          if (item.quality === '720p') return 4;
          if (item.quality === '480p') return 3;
          if (item.url.includes('.m3u8')) return 2;
          if (item.url.includes('.mpd')) return 1;
          return 0;
        };
        return qualityScore(b) - qualityScore(a);
      });
    
    logger.info(`[EinthusanExtractor] Found ${filteredUrls.length} stream URLs`);
    
    // Return URLs with metadata
    return filteredUrls.map(item => ({
      url: item.url,
      metadata: {
        ...streamData.metadata,
        quality: item.quality,
        type: item.type
      }
    }));
    
  } catch (error) {
    logger.error(`[EinthusanExtractor] Error extracting streams: ${error.message}`);
    return [];
  }
}

export default { match, getStreamUrls };
