// Enhanced Einthusan Search with Anti-Bot Bypass
import { http } from './utils/http.js';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

/**
 * Enhanced Einthusan search with anti-bot protection
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of movie results
 */
export async function searchEinthusan(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  console.log(`[Einthusan] Searching for: ${q}`);

  // Try enhanced browser-based search with anti-bot measures
  try {
    console.log(`[Einthusan] Using enhanced browser automation with anti-bot bypass...`);
    return await searchEinthusanWithEnhancedBrowser(q);
  } catch (error) {
    console.log(`[Einthusan] Enhanced browser search failed: ${error.message}`);
    console.log(`[Einthusan] Falling back to direct HTTP search...`);
  }

  // Fallback to direct HTTP search
  try {
    return await searchEinthusanWithHTTP(q);
  } catch (error) {
    console.log(`[Einthusan] HTTP search failed: ${error.message}`);
    return [];
  }
}

/**
 * Enhanced browser-based search with anti-bot protection
 */
async function searchEinthusanWithEnhancedBrowser(query) {
  console.log(`[Einthusan] Starting enhanced browser search for: ${query}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Enhanced anti-detection measures
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set additional headers
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    // Go to homepage first to establish session
    console.log(`[Einthusan] Establishing session on homepage...`);
    await page.goto('https://einthusan.tv/', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Handle cookie consent if present
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, div[role="button"]');
      for (const button of buttons) {
        const text = button.textContent.toLowerCase();
        if (text.includes('accept') || text.includes('agree') || text.includes('allow') || text.includes('consent') || text.includes('continue')) {
          button.click();
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now try search
    const searchUrl = `https://einthusan.tv/movie/results/?lang=kannada&query=${encodeURIComponent(query)}`;
    console.log(`[Einthusan] Navigating to search: ${searchUrl}`);
    
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Extract search results with enhanced selectors
    const results = await page.evaluate(() => {
      const movies = [];
      
      // Enhanced selectors for Einthusan
      const selectors = [
        '.movie-block', '.movie-item', '.film-item', '.result-item', '.movie',
        '.search-result', '.result', '.item', '.card', '.poster',
        'article', '.content', '.grid-item', '.col',
        '[class*="movie"]', '[class*="film"]', '[class*="result"]',
        '.movie-card', '.film-card', '.poster-card',
        '.movie-poster', '.film-poster', '.poster-item'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          
          elements.forEach((element, index) => {
            // Enhanced title selectors
            const titleSelectors = [
              '.movie-title', '.title', 'h3', 'h4', '.name', '.film-title',
              '.movie-name', '.film-name', '.poster-title', 'a[title]',
              '.movie-name-text', '.film-name-text', '.title-text'
            ];
            
            let title = '';
            let titleEl = null;
            
            for (const titleSelector of titleSelectors) {
              titleEl = element.querySelector(titleSelector);
              if (titleEl) {
                title = titleEl.textContent.trim() || titleEl.getAttribute('title') || '';
                if (title) break;
              }
            }
            
            // Enhanced year selectors
            const yearEl = element.querySelector('.movie-year, .year, .release-year, .film-year, .movie-year-text, .film-year-text');
            const year = yearEl ? yearEl.textContent.trim() : 'Unknown';
            
            // Enhanced poster selectors
            const posterEl = element.querySelector('img');
            const poster = posterEl ? posterEl.src : null;
            
            // Enhanced link selectors
            const linkEl = element.querySelector('a');
            const movieUrl = linkEl ? linkEl.href : null;
            
            if (title && movieUrl) {
              movies.push({
                title: title,
                year: year,
                poster: poster,
                movie_page_url: movieUrl,
                source: 'einthusan',
                quality: 'HD',
                language: 'kannada'
              });
            }
          });
          
          if (movies.length > 0) break;
        }
      }
      
      return movies;
    });
    
    console.log(`[Einthusan] Enhanced browser search found ${results.length} results`);
    return results;
    
  } finally {
    await browser.close();
  }
}

/**
 * HTTP-based search as fallback
 */
async function searchEinthusanWithHTTP(query) {
  console.log(`[Einthusan] Starting HTTP search for: ${query}`);
  
  // Search URL - Try multiple languages for better results
  const languages = ['kannada', 'tamil', 'telugu', 'malayalam', 'hindi'];
  let results = [];
  
  for (const lang of languages) {
    const searchUrl = `https://einthusan.tv/movie/results/?lang=${lang}&query=${encodeURIComponent(query)}`;
    console.log(`[Einthusan] Searching in ${lang}: ${searchUrl}`);
    
    try {
      const response = await http.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://einthusan.tv/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      const langResults = [];

      // Enhanced parsing with multiple selectors
      const selectors = ['.movie-block', '.movie-item', '.film-item', '.result-item', '.movie'];
      
      for (const selector of selectors) {
        $(selector).each((index, element) => {
          const $el = $(element);
          const title = $el.find('.movie-title, .title, h3, h4, .name, .film-title').text().trim();
          const year = $el.find('.movie-year, .year, .release-year, .film-year').text().trim();
          const poster = $el.find('img').attr('src');
          const movieUrl = $el.find('a').attr('href');

          if (title && movieUrl) {
            langResults.push({
              title: title,
              year: year || 'Unknown',
              poster: poster ? `https://einthusan.tv${poster}` : null,
              movie_page_url: movieUrl.startsWith('http') ? movieUrl : `https://einthusan.tv${movieUrl}`,
              source: 'einthusan',
              quality: 'HD',
              language: lang
            });
          }
        });
        
        if (langResults.length > 0) break;
      }

      console.log(`[Einthusan] Found ${langResults.length} results in ${lang}`);
      results = results.concat(langResults);
      
      // If we found results, we can stop searching other languages
      if (langResults.length > 0) {
        break;
      }
    } catch (error) {
      console.log(`[Einthusan] HTTP search failed for ${lang}: ${error.message}`);
    }
  }

  console.log(`[Einthusan] HTTP search total found ${results.length} results across all languages`);
  return results;
}

/**
 * Get movie details from Einthusan movie page
 * @param {string} movieUrl - Movie page URL
 * @returns {Promise<Object>} - Movie details
 */
export async function getEinthusanMovieDetails(movieUrl) {
  try {
    console.log(`[Einthusan] Getting movie details: ${movieUrl}`);

    const response = await http.get(movieUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://einthusan.tv/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    
    const title = $('h1').text().trim() || 'Unknown Title';
    const year = $('.movie-year').text().trim() || 'Unknown Year';
    const poster = $('.movie-poster img').attr('src');
    const description = $('.movie-description').text().trim() || 'No description available';

    return {
      title: title,
      year: year,
      poster: poster ? `https://einthusan.tv${poster}` : null,
      description: description,
      movie_page_url: movieUrl,
      source: 'einthusan',
      quality: 'HD'
    };

  } catch (error) {
    console.log(`[Einthusan] Movie details error: ${error.message}`);
    return null;
  }
}

export default { searchEinthusan };


