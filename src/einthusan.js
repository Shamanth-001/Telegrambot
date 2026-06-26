// Updated Einthusan Scraper with Puppeteer Stealth
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());
import * as cheerio from 'cheerio';
import { http } from './utils/http.js';

/**
 * Search Einthusan for movies using Puppeteer Stealth
 * @param {string} query
 * @returns {Promise<Array>} Array of movie results
 */
export async function searchEinthusan(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  console.log(`[Einthusan] Searching for: ${q}`);

  try {
    const results = await searchEinthusanWithBrowser(q);
    if (results.length > 0) return results;
  } catch (error) {
    console.log(`[Einthusan] Browser search failed: ${error.message}`);
  }

  console.log(`[Einthusan] Falling back to HTTP search (less reliable)...`);
  return await searchEinthusanWithHTTP(q);
}

/**
 * Puppeteer Stealth search
 */
async function searchEinthusanWithBrowser(query) {
  console.log(`[Einthusan] Starting browser-based search (stealth)...`);

  const browser = await puppeteer.launch({ 
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

  // Set realistic browser headers
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });

  const searchUrl = `https://einthusan.tv/movie/results/?lang=kannada&query=${encodeURIComponent(query)}`;
  console.log(`[Einthusan] Navigating to: ${searchUrl}`);

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait extra for dynamic content
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Extract movie results from page
  const movies = await page.evaluate(() => {
    const results = [];
    
    // Look for movie links directly (we know they exist from our test)
    const movieLinks = document.querySelectorAll('a[href*="/movie/watch/"]');
    
    movieLinks.forEach(link => {
      const href = link.href;
      const title = link.textContent.trim() || link.getAttribute('title') || 'Unknown Title';
      
      if (href && title && title !== 'Unknown Title') {
        results.push({
          title: title,
          year: 'Unknown',
          movie_page_url: href,
          poster: null,
          source: 'einthusan',
          quality: 'HD',
          language: 'kannada',
          url: href // Add direct URL for streaming
        });
      }
    });

    // Also try the original selectors as fallback
    if (results.length === 0) {
      const selectors = ['.movie-block', '.movie-item', '.film-item', '.block1'];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const titleEl = el.querySelector('.movie-title, .title, h3, h4, .name, a');
            const yearEl = el.querySelector('.movie-year, .year, .release-year');
            const linkEl = el.querySelector('a');
            const posterEl = el.querySelector('img');

            if (titleEl && linkEl) {
              results.push({
                title: titleEl.textContent.trim(),
                year: yearEl ? yearEl.textContent.trim() : 'Unknown',
                movie_page_url: linkEl.href,
                poster: posterEl ? posterEl.src : null,
                source: 'einthusan',
                quality: 'HD',
                language: 'kannada',
                url: linkEl.href
              });
            }
          });
          if (results.length > 0) break;
        }
      }
    }

    return results;
  });

  console.log(`[Einthusan] Browser search found ${movies.length} results`);
  await browser.close();
  return movies;
}

/**
 * HTTP fallback search
 */
async function searchEinthusanWithHTTP(query) {
  try {
    const searchUrl = `https://einthusan.tv/movie/results/?lang=kannada&query=${encodeURIComponent(query)}`;
    const response = await http.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://einthusan.tv/'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results = [];
    $('.movie-block').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.movie-title').text().trim();
      const year = $el.find('.movie-year').text().trim() || 'Unknown';
      const poster = $el.find('img').attr('src');
      const movieUrl = $el.find('a').attr('href');

      if (title && movieUrl) {
        results.push({
          title,
          year,
          movie_page_url: movieUrl.startsWith('http') ? movieUrl : `https://einthusan.tv${movieUrl}`,
          poster: poster ? `https://einthusan.tv${poster}` : null,
          source: 'einthusan',
          quality: 'HD',
          language: 'kannada'
        });
      }
    });

    console.log(`[Einthusan] HTTP fallback found ${results.length} results`);
    return results;

  } catch (error) {
    console.log(`[Einthusan] HTTP search failed: ${error.message}`);
    return [];
  }
}

export default { searchEinthusan };