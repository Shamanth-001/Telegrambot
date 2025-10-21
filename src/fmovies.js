// Fmovies Search Module
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());

/**
 * Search for movies on Fmovies website
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of movie results
 */
export async function searchFmovies(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  logger.info(`[Fmovies] Searching for: ${q}`);

  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Go to home and trigger JS search to ensure SPA renders results
    await page.goto('https://www.fmovies.gd', { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Capture JSON/XHR responses
    const jsonResults = [];
    page.on('response', async (resp) => {
      try {
        const url = resp.url();
        const ct = resp.headers()['content-type'] || '';
        if (ct.includes('application/json') && /search|api|query|ajax/i.test(url)) {
          const data = await resp.json().catch(() => null);
          if (data) jsonResults.push({ url, data });
        }
      } catch (_) {}
    });
    const inputSelectors = ['input[name="keyword"]', 'input[type="search"]', '#search', '.search-input input'];
    for (const sel of inputSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 3000 });
        // Dispatch real DOM events for SPA search
        await page.evaluate((selector, value) => {
          const el = document.querySelector(selector);
          if (!el) return;
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }, sel, q);
        // Wait for search navigation/XHR
        await Promise.race([
          page.waitForResponse(r => r.url().includes('/search') && r.status() >= 200 && r.status() < 400, { timeout: 8000 }).catch(() => {}),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {})
        ]);
        break;
      } catch (_) {}
    }
    // Wait for any of the known result containers
    const selectors = [
      '.film-list .item', '.film-item', '.movie-item', '.result-item', '.card', '.film', '.movie', '[class*="film"]', '[class*="movie"]'
    ];
    let ready = false;
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        ready = true;
        break;
      } catch (_) { /* try next */ }
    }
    if (!ready) logger.warn('[Fmovies] No result containers detected');

    const htmlSnippet = await page.content().then(h => (h || '').slice(0, 800).replace(/\s+/g, ' ').trim()).catch(() => '');
    if (htmlSnippet) logger.info(`[Fmovies] HTML snippet: ${htmlSnippet}`);

    let results = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.film-item, .film-list .item, .movie-item, .result-item, .card, .film, .movie, [class*="film"], [class*="movie"]');
      return Array.from(nodes).map(item => {
        const a = item.querySelector('h3 a, h2 a, .name a, .title a, a');
        if (!a) return null;
        
        const title = a.textContent.trim();
        // Poster
        const poster = (item.querySelector('img') && (item.querySelector('img').getAttribute('data-src') || item.querySelector('img').src)) || null;
        const yearMatch = title.match(/\((\d{4})\)/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;
        
        // Extract quality from title
        let quality = 'Unknown';
        const qualityMatch = title.match(/(\d{3,4}p|HD|SD|BRRip|WEBRip|HDRip|BluRay|DVDRip)/i);
        if (qualityMatch) {
          quality = qualityMatch[1];
        }
        
        return {
          title: title,
          year: year,
          quality: quality,
          size: null,
          seeders: 0,
          leechers: 0,
          source: 'Fmovies',
          torrent_url: null,
          magnet_link: null,
          poster_url: poster,
          has_torrent: false,
          has_magnet: false
        };
      }).filter(Boolean);
    });

    // Normalize and filter by query
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const qn = norm(q);
    results = (results || []).filter(r => norm(r.title).includes(qn));

    // Fallback to JSON parsing if DOM empty
    if ((!results || results.length === 0) && jsonResults.length > 0) {
      try {
        const first = jsonResults.find(j => Array.isArray(j.data) || j.data.results || j.data.items);
        const arr = Array.isArray(first?.data) ? first.data : (first?.data?.results || first?.data?.items || []);
        const mapped = (arr || []).map((it) => {
          const title = (it.title || it.name || it.slug || '').toString().trim();
          if (!title) return null;
          return {
            title,
            year: it.year || null,
            quality: it.quality || 'Unknown',
            size: null,
            seeders: 0,
            leechers: 0,
            source: 'Fmovies',
            torrent_url: null,
            magnet_link: null,
            poster_url: it.poster || it.image || null,
            has_torrent: false,
            has_magnet: false
          };
        }).filter(Boolean);
        results = mapped.filter(r => norm(r.title).includes(qn));
      } catch (_) {}
    }

    logger.info(`[Fmovies] Found ${results.length} results for: ${q}`);
    return results;

  } catch (error) {
    logger.error(`[Fmovies] Error: ${error.message}`);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Parse size string to bytes
 * @param {string} sizeText - Size text like "1.2GB" or "500MB"
 * @returns {number} Size in bytes
 */
function parseSize(sizeText) {
  if (!sizeText) return null;
  
  const sizeMatch = sizeText.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB)/i);
  if (!sizeMatch) return null;
  
  const value = parseFloat(sizeMatch[1]);
  const unit = sizeMatch[2].toUpperCase();
  
  switch (unit) {
    case 'GB': return Math.round(value * 1024 * 1024 * 1024);
    case 'MB': return Math.round(value * 1024 * 1024);
    case 'KB': return Math.round(value * 1024);
    default: return null;
  }
}
