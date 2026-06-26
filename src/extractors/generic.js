// Generic fallback extractor for new streaming sites
import { logger } from '../utils/logger.js';

/**
 * Check if this extractor handles the given URL (fallback for unknown sites)
 * @param {string} url - Movie page URL
 * @returns {boolean}
 */
export function match(url) {
  // This is a fallback extractor - it matches any URL that other extractors don't handle
  return true; // Always match as fallback
}

/**
 * Generic stream URL extraction for unknown sites
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Array>} - Array of stream URLs with metadata
 */
export async function getStreamUrls(page) {
  logger.info('[GenericExtractor] Using generic extraction for unknown site');
  
  try {
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const streamData = await page.evaluate(() => {
      const urls = [];
      const metadata = {
        title: document.title || 'Unknown',
        language: 'unknown',
        quality: 'unknown'
      };
      
      // Look for video elements
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.src) {
          urls.push({ 
            url: video.src, 
            type: 'video', 
            quality: 'unknown',
            metadata: { ...metadata, platform: 'direct' }
          });
        }
        const sources = video.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src) {
            const quality = source.getAttribute('data-quality') || 
                          source.getAttribute('data-res') || 
                          'unknown';
            urls.push({ 
              url: source.src, 
              type: 'source', 
              quality,
              metadata: { ...metadata, platform: 'direct' }
            });
          }
        });
      });
      
      // Look for iframe players
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        const src = iframe.src;
        if (src) {
          const isYouTube = src.includes('youtube.com') || src.includes('youtu.be');
          const isVimeo = src.includes('vimeo.com');
          const isDailymotion = src.includes('dailymotion.com');
          
          urls.push({ 
            url: src, 
            type: 'iframe', 
            quality: isYouTube ? 'youtube' : isVimeo ? 'vimeo' : isDailymotion ? 'dailymotion' : 'unknown',
            metadata: { 
              ...metadata, 
              platform: isYouTube ? 'youtube' : isVimeo ? 'vimeo' : isDailymotion ? 'dailymotion' : 'iframe' 
            }
          });
        }
      });
      
      // Look for embedded players
      const embeds = document.querySelectorAll('embed');
      embeds.forEach(embed => {
        if (embed.src) {
          urls.push({ 
            url: embed.src, 
            type: 'embed', 
            quality: 'unknown',
            metadata: { ...metadata, platform: 'embed' }
          });
        }
      });
      
      // Look for JavaScript variables and inline scripts
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const content = script.textContent || '';
        
        // Generic patterns for common streaming formats
        const patterns = [
          // HLS streams
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.m3u8[^"']*)["']/gi,
          // DASH streams
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.mpd[^"']*)["']/gi,
          // Direct video files
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.mp4[^"']*)["']/gi,
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.webm[^"']*)["']/gi,
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.mkv[^"']*)["']/gi,
          // YouTube patterns
          /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi,
          /youtu\.be\/([a-zA-Z0-9_-]+)/gi,
          // Vimeo patterns
          /vimeo\.com\/video\/([0-9]+)/gi,
          /player\.vimeo\.com\/video\/([0-9]+)/gi,
          // Dailymotion patterns
          /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/gi,
          // Generic streaming patterns
          /(?:stream|play|watch)["\s]*[:=]["\s]*["']([^"']*stream[^"']*)["']/gi,
          /(?:manifest|playlist)["\s]*[:=]["\s]*["']([^"']*manifest[^"']*)["']/gi
        ];
        
        patterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              if (match.includes('youtube.com/embed/') || match.includes('youtu.be/')) {
                urls.push({ 
                  url: match, 
                  type: 'youtube', 
                  quality: 'youtube',
                  metadata: { ...metadata, platform: 'youtube' }
                });
              } else if (match.includes('vimeo.com')) {
                urls.push({ 
                  url: match, 
                  type: 'vimeo', 
                  quality: 'vimeo',
                  metadata: { ...metadata, platform: 'vimeo' }
                });
              } else if (match.includes('dailymotion.com')) {
                urls.push({ 
                  url: match, 
                  type: 'dailymotion', 
                  quality: 'dailymotion',
                  metadata: { ...metadata, platform: 'dailymotion' }
                });
              } else {
                const urlMatch = match.match(/https?:\/\/[^\s"']+/);
                if (urlMatch) {
                  const url = urlMatch[0];
                  const quality = url.includes('720p') ? '720p' : 
                                url.includes('1080p') ? '1080p' : 
                                url.includes('480p') ? '480p' : 
                                url.includes('360p') ? '360p' : 'unknown';
                  urls.push({ 
                    url, 
                    type: 'script', 
                    quality,
                    metadata: { ...metadata, platform: 'direct' }
                  });
                }
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
        // Accept various streaming formats
        return item.url.includes('.m3u8') || 
               item.url.includes('.mpd') || 
               item.url.includes('.mp4') ||
               item.url.includes('.webm') ||
               item.url.includes('.mkv') ||
               item.url.includes('youtube.com') ||
               item.url.includes('youtu.be') ||
               item.url.includes('vimeo.com') ||
               item.url.includes('dailymotion.com') ||
               item.url.includes('player') ||
               item.url.includes('embed') ||
               item.url.includes('stream') ||
               item.url.includes('manifest');
      })
      .sort((a, b) => {
        // Prioritize by quality and platform
        const qualityScore = (item) => {
          // Direct streams first
          if (item.url.includes('.m3u8')) return 8;
          if (item.url.includes('.mpd')) return 7;
          if (item.url.includes('.mp4')) return 6;
          if (item.url.includes('.webm')) return 5;
          if (item.url.includes('.mkv')) return 4;
          
          // Quality-based scoring
          if (item.quality === '1080p') return 3;
          if (item.quality === '720p') return 2;
          if (item.quality === '480p') return 1;
          if (item.quality === '360p') return 0;
          
          // Platform-based scoring
          if (item.url.includes('vimeo.com')) return -1;
          if (item.url.includes('dailymotion.com')) return -2;
          if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) return -3;
          
          return -4;
        };
        return qualityScore(b) - qualityScore(a);
      });
    
    logger.info(`[GenericExtractor] Found ${filteredUrls.length} stream URLs`);
    
    // Return URLs with metadata
    return filteredUrls.map(item => ({
      url: item.url,
      metadata: {
        ...item.metadata,
        quality: item.quality,
        type: item.type
      }
    }));
    
  } catch (error) {
    logger.error(`[GenericExtractor] Error extracting streams: ${error.message}`);
    return [];
  }
}

export default { match, getStreamUrls };
