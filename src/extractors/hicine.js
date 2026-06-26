import { logger } from '../utils/logger.js';

export function match(url) {
  return url.includes('hicine.info') || url.includes('hicine.app');
}

export async function getStreamUrls(page) {
  logger.info('[HicineExtractor] Extracting stream URLs from Hicine page');
  
  try {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
    
    await page.setViewport({ width: 375, height: 812, isMobile: true });
    
    logger.info('[HicineExtractor] Waiting for content to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const streamData = await page.evaluate(() => {
      const urls = [];
      const metadata = {
        title: document.title || 'Unknown',
        language: 'multi',
        quality: 'HD'
      };
      
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        const src = iframe.src;
        if (src && (src.includes('player') || src.includes('embed') || src.includes('stream'))) {
          urls.push({ url: src, type: 'iframe', quality: 'unknown' });
        }
      });
      
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.src) urls.push({ url: video.src, type: 'video', quality: 'unknown' });
        const sources = video.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src) {
            const quality = source.getAttribute('data-quality') || 
                          source.getAttribute('label') || 'unknown';
            urls.push({ url: source.src, type: 'source', quality });
          }
        });
      });
      
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const content = script.textContent || '';
        
        const patterns = [
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.m3u8[^"']*)["']/gi,
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.mp4[^"']*)["']/gi,
          /(?:src|url|stream|file|source)["\s]*[:=]["\s]*["']([^"']*\.mpd[^"']*)["']/gi,
          /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi,
          /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi
        ];
        
        patterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const urlMatch = match.match(/https?:\/\/[^\s"'<>]+/);
              if (urlMatch) {
                const url = urlMatch[0];
                const quality = url.includes('720p') ? '720p' : 
                              url.includes('1080p') ? '1080p' : 
                              url.includes('480p') ? '480p' : 
                              url.includes('360p') ? '360p' : 'unknown';
                urls.push({ url, type: 'script', quality });
              }
            });
          }
        });
      });
      
      const links = document.querySelectorAll('a[href*=".mp4"], a[href*=".m3u8"], a[href*="download"]');
      links.forEach(link => {
        const href = link.href;
        if (href && (href.includes('.mp4') || href.includes('.m3u8'))) {
          const quality = link.textContent?.match(/(\d+p)/)?.[1] || 'unknown';
          urls.push({ url: href, type: 'link', quality });
        }
      });
      
      return { urls, metadata };
    });
    
    const filteredUrls = streamData.urls
      .filter(item => item.url && typeof item.url === 'string')
      .filter(item => {
        return item.url.includes('.m3u8') || 
               item.url.includes('.mpd') || 
               item.url.includes('.mp4') ||
               item.url.includes('player') ||
               item.url.includes('stream') ||
               item.url.includes('embed');
      })
      .sort((a, b) => {
        const qualityScore = (item) => {
          if (item.quality === '1080p') return 5;
          if (item.quality === '720p') return 4;
          if (item.quality === '480p') return 3;
          if (item.quality === '360p') return 2;
          if (item.url.includes('.m3u8')) return 1;
          return 0;
        };
        return qualityScore(b) - qualityScore(a);
      });
    
    logger.info(`[HicineExtractor] Found ${filteredUrls.length} stream URLs`);
    
    return filteredUrls.map(item => ({
      url: item.url,
      metadata: {
        ...streamData.metadata,
        quality: item.quality,
        type: item.type
      }
    }));
    
  } catch (error) {
    logger.error(`[HicineExtractor] Error extracting streams: ${error.message}`);
    return [];
  }
}

export default { match, getStreamUrls };
