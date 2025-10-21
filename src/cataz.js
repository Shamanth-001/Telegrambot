// Cataz Movie Search Module - Puppeteer-based
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());

/**
 * Search for movies on Cataz website using Puppeteer
 * @param {string} query - Search query
 * @returns {Array} Array of movie results
 */
export async function searchCataz(query, options = {}) {
  let browser;
  
  try {
    logger.info(`[Cataz] Searching for: ${query}`);
    
    // Launch Puppeteer with stealth plugin
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic browser settings + stealth headers
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://cataz.to/' });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.243 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate to search page
    const searchUrl = `https://cataz.to/search/${encodeURIComponent(query)}`;
    logger.info(`[Cataz] Navigating to: ${searchUrl}`);
    
    // Retry navigation to dodge CF interstitials
    let navOk = false;
    for (let i = 0; i < 2; i++) {
      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.floor(Math.random() * 1000)));
        navOk = true;
        break;
      } catch (e) {
        logger.warn(`[Cataz] Navigation attempt ${i + 1} failed: ${e.message}`);
      }
    }
    if (!navOk) throw new Error('Navigation blocked by site');
    
    // Try to wait for movie cards or results
    try {
      await page.waitForSelector('.film-detail, .film-card, .movie-card, .movie, .item, [class*="movie"], [class*="card"]', { timeout: 10000 });
    } catch (e) {
      logger.warn(`[Cataz] No specific movie selectors found, trying generic approach`);
    }
    
    // Extract movie information
    const movies = await page.evaluate(() => {
      const results = [];
      
      // Try multiple selectors for movie cards
      const selectors = [
        '.film-detail',
        '.film-card',
        '.movie-card',
        '.movie',
        '.item',
        '[class*="movie"]',
        '[class*="card"]',
        'a[href*="/movie/"]',
        'a[href*="/watch/"]'
      ];
      
      let movieElements = [];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          movieElements = Array.from(elements);
          break;
        }
      }
      
      // If no specific selectors found, look for any links that might be movies
      if (movieElements.length === 0) {
        const allLinks = document.querySelectorAll('a[href]');
        movieElements = Array.from(allLinks).filter(link => {
          const href = link.href;
          return href.includes('/movie/') || 
                 href.includes('/watch/') || 
                 href.includes('/film/') ||
                 (link.textContent && link.textContent.length > 3 && link.textContent.length < 100);
        });
      }
      
      movieElements.forEach((el, index) => {
        try {
          // Extract title
          let title = '';
          const titleEl = el.querySelector('img[alt]') || el.querySelector('[alt]') || el;
          if (titleEl) {
            title = titleEl.alt || titleEl.textContent || titleEl.title || '';
          }
          
          // Extract URL
          let url = '';
          if (el.href) {
            url = el.href.startsWith('http') ? el.href : `https://cataz.to${el.href}`;
          } else {
            const linkEl = el.querySelector('a[href]');
            if (linkEl) {
              url = linkEl.href.startsWith('http') ? linkEl.href : `https://cataz.to${linkEl.href}`;
            }
          }
          
          // Extract poster
          let poster = '';
          const imgEl = el.querySelector('img[src]');
          if (imgEl) {
            poster = imgEl.src.startsWith('http') ? imgEl.src : `https://cataz.to${imgEl.src}`;
          }
          
          // Extract year from title
          let year = null;
          const yearMatch = title.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            year = yearMatch[0];
          }
          
          // Clean title
          title = title.replace(/\b(19|20)\d{2}\b/, '').trim();
          
          if (title && url && title.length > 2) {
            results.push({
              title: title,
              year: year,
              url: url,
              poster: poster,
              source: 'cataz',
              quality: 'HD',
              language: 'english',
              type: 'movie'
            });
          }
        } catch (error) {
          console.warn(`Error processing movie element ${index}:`, error);
        }
      });
      
      return results;
    });
    
    logger.info(`[Cataz] Found ${movies.length} results for "${query}"`);
    return movies;

  } catch (error) {
    logger.error(`[Cataz] Search error for "${query}":`, error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Get movie details and stream URL from Cataz movie page using Puppeteer
 * @param {string} movieUrl - Movie page URL
 * @returns {Object} Movie details with stream URL
 */
export async function getCatazMovieDetails(movieUrl) {
  let browser;
  
  try {
    logger.info(`[Cataz] Getting movie details from: ${movieUrl}`);
    
    // Launch Puppeteer with stealth plugin
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic browser settings
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to movie page
    await page.goto(movieUrl, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract movie details and stream URL
    const movieDetails = await page.evaluate(() => {
      const result = {
        title: document.title || 'Unknown',
        url: window.location.href,
        poster: '',
        streamUrl: '',
        platform: 'unknown',
        quality: 'unknown'
      };
      
      // Extract poster
      const posterEl = document.querySelector('img[src*="poster"], img[src*="cover"], .poster img, .cover img');
      if (posterEl) {
        result.poster = posterEl.src.startsWith('http') ? posterEl.src : `https://cataz.to${posterEl.src}`;
      }
      
      // Look for iframe players (common on Cataz)
      const iframes = document.querySelectorAll('iframe[src]');
      for (const iframe of iframes) {
        const src = iframe.src;
        if (src) {
          // Check if it's YouTube
          if (src.includes('youtube.com') || src.includes('youtu.be')) {
            result.streamUrl = src;
            result.platform = 'youtube';
            result.quality = 'youtube';
            break;
          }
          // Check if it's Vimeo
          else if (src.includes('vimeo.com')) {
            result.streamUrl = src;
            result.platform = 'vimeo';
            result.quality = 'vimeo';
            break;
          }
          // Check if it's a direct stream
          else if (src.includes('.m3u8') || src.includes('.mpd') || src.includes('.mp4')) {
            result.streamUrl = src;
            result.platform = 'direct';
            result.quality = 'unknown';
            break;
          }
          // Generic iframe
          else {
            result.streamUrl = src;
            result.platform = 'iframe';
            result.quality = 'unknown';
          }
        }
      }
      
      // Look for video elements
      const videos = document.querySelectorAll('video[src]');
      for (const video of videos) {
        if (video.src) {
          result.streamUrl = video.src;
          result.platform = 'direct';
          result.quality = 'unknown';
          break;
        }
      }
      
      // Look for JavaScript variables that might contain stream URLs
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        
        // Common patterns for stream URLs
        const patterns = [
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.m3u8[^"']*)["']/gi,
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.mpd[^"']*)["']/gi,
          /(?:src|url|stream|file)["\s]*[:=]["\s]*["']([^"']*\.mp4[^"']*)["']/gi,
          /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi,
          /youtu\.be\/([a-zA-Z0-9_-]+)/gi
        ];
        
        for (const pattern of patterns) {
          const matches = content.match(pattern);
          if (matches) {
            for (const match of matches) {
              if (match.includes('youtube.com/embed/') || match.includes('youtu.be/')) {
                result.streamUrl = match;
                result.platform = 'youtube';
                result.quality = 'youtube';
                break;
              } else {
                const urlMatch = match.match(/https?:\/\/[^\s"']+/);
                if (urlMatch) {
                  result.streamUrl = urlMatch[0];
                  result.platform = 'direct';
                  result.quality = 'unknown';
                  break;
                }
              }
            }
            if (result.streamUrl) break;
          }
        }
        if (result.streamUrl) break;
      }
      
      return result;
    });
    
    logger.info(`[Cataz] Movie details extracted: ${movieDetails.title} (${movieDetails.platform})`);
    return movieDetails;

  } catch (error) {
    logger.error(`[Cataz] Error getting movie details from ${movieUrl}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extract year from movie title
 * @param {string} title - Movie title
 * @returns {string|null} Extracted year
 */
function extractYear(title) {
  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? yearMatch[0] : null;
}

export default { searchCataz, getCatazMovieDetails };