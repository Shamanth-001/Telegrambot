// Cataz-specific stream extractor
import { logger } from '../utils/logger.js';

/**
 * Check if this extractor handles the given URL
 * @param {string} url - Movie page URL
 * @returns {boolean}
 */
export function match(url) {
  return url.includes('cataz.to/movie/watch-');
}

/**
 * Extract stream URLs from Cataz movie page
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Array>} - Array of stream URLs with metadata
 */
export async function getStreamUrls(page) {
  logger.info('[CatazExtractor] Extracting stream URLs from Cataz page');
  
  try {
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Cataz often redirects to YouTube or other platforms
    const streamData = await page.evaluate(() => {
      const urls = [];
      const metadata = {
        title: document.title || 'Unknown',
        language: 'english',
        quality: 'HD'
      };
      
      // Check if we're on YouTube (common redirect)
      if (window.location.href.includes('youtube.com') || window.location.href.includes('youtu.be')) {
        urls.push({ 
          url: window.location.href, 
          type: 'youtube_redirect', 
          quality: 'youtube',
          metadata: { ...metadata, platform: 'youtube' }
        });
        return { urls, metadata };
      }
      
      // Look for iframe players
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        const src = iframe.src;
        if (src) {
          const isYouTube = src.includes('youtube.com') || src.includes('youtu.be');
          urls.push({ 
            url: src, 
            type: 'iframe', 
            quality: isYouTube ? 'youtube' : 'unknown',
            metadata: { ...metadata, platform: isYouTube ? 'youtube' : 'iframe' }
          });
        }
      });
      
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
            const quality = source.getAttribute('data-quality') || 'unknown';
            urls.push({ 
              url: source.src, 
              type: 'source', 
              quality,
              metadata: { ...metadata, platform: 'direct' }
            });
          }
        });
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
      
      // Look for JavaScript variables
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const content = script.textContent || '';
        
        // Common patterns for Cataz
        const patterns = [
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.m3u8[^"']*)["']/gi,
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.mp4[^"']*)["']/gi,
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.mpd[^"']*)["']/gi,
          /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi,
          /youtu\.be\/([a-zA-Z0-9_-]+)/gi
        ];
        
        patterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              if (match.includes('youtube.com/embed/')) {
                urls.push({ 
                  url: match, 
                  type: 'youtube_embed', 
                  quality: 'youtube',
                  metadata: { ...metadata, platform: 'youtube' }
                });
              } else if (match.includes('youtu.be/')) {
                urls.push({ 
                  url: match, 
                  type: 'youtube_short', 
                  quality: 'youtube',
                  metadata: { ...metadata, platform: 'youtube' }
                });
              } else {
                const urlMatch = match.match(/https?:\/\/[^\s"']+/);
                if (urlMatch) {
                  const url = urlMatch[0];
                  const quality = url.includes('720p') ? '720p' : 
                                url.includes('1080p') ? '1080p' : 
                                url.includes('480p') ? '480p' : 'unknown';
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
               item.url.includes('youtube.com') ||
               item.url.includes('youtu.be') ||
               item.url.includes('player') ||
               item.url.includes('embed');
      })
      .sort((a, b) => {
        // Prioritize by quality and platform
        const qualityScore = (item) => {
          // Direct streams first
          if (item.url.includes('.m3u8')) return 6;
          if (item.url.includes('.mpd')) return 5;
          if (item.url.includes('.mp4')) return 4;
          
          // Quality-based scoring
          if (item.quality === '1080p') return 3;
          if (item.quality === '720p') return 2;
          if (item.quality === '480p') return 1;
          
          // YouTube last (requires special handling)
          if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) return 0;
          
          return -1;
        };
        return qualityScore(b) - qualityScore(a);
      });
    
    logger.info(`[CatazExtractor] Found ${filteredUrls.length} stream URLs`);
    
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
    logger.error(`[CatazExtractor] Error extracting streams: ${error.message}`);
    return [];
  }
}

export default { match, getStreamUrls };
