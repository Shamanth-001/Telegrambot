// MkvCinemas Search Module
import { http } from './utils/http.js';
import * as cheerio from 'cheerio';
import { logger } from './utils/logger.js';

/**
 * Search for movies on MkvCinemas website
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of movie results
 */
export async function searchMkvCinemas(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  logger.info(`[MkvCinemas] Searching for: ${q}`);

  try {
    const searchUrl = `https://mkvcinemas.haus/?s=${encodeURIComponent(q)}`;
    logger.info(`[MkvCinemas] Searching URL: ${searchUrl}`);

    const response = await http.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });

    if (!response.data) {
      logger.warn(`[MkvCinemas] No data received for query: ${q}`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const results = [];

    // Look for movie items in search results - based on actual website structure
    $('.post, .movie-item, .film-item, [class*="movie"]').each((index, element) => {
      try {
        const $item = $(element);
        
        // Try multiple selectors for title
        let titleElement = $item.find('h2 a, h3 a, .title a, .name a, a[href*="/movie/"], a[href*="/film/"]').first();
        if (!titleElement.length) {
          // Look for any link that might contain the title
          titleElement = $item.find('a').first();
        }
        
        const title = titleElement.text().trim();
        const movieUrl = titleElement.attr('href');
        
        if (!title || !movieUrl) return;

        // Clean up title
        const cleanTitle = title.replace(/\s+/g, ' ').trim();
        if (cleanTitle.length < 3) return; // Skip very short titles

        // Extract year from title or other elements
        const yearMatch = cleanTitle.match(/\((\d{4})\)/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;

        // Extract quality information from title or content
        let quality = 'Unknown';
        const qualityMatch = cleanTitle.match(/(\d{3,4}p|HD|SD|BRRip|WEBRip|HDRip|BluRay|DVDRip|BluRay)/i);
        if (qualityMatch) {
          quality = qualityMatch[1];
        }

        // Extract size if available
        const sizeElement = $item.find('.size, .file-size, .download-size');
        const sizeText = sizeElement.text().trim();
        const size = parseSize(sizeText);

        // Create result object
        const result = {
          title: cleanTitle,
          year: year,
          quality: quality,
          size: size,
          seeders: 0, // MkvCinemas doesn't show seeders
          leechers: 0,
          source: 'MkvCinemas',
          torrent_url: null, // Will be extracted from movie page
          magnet_link: null,
          poster_url: null,
          has_torrent: false,
          has_magnet: false
        };

        // Try to extract poster
        const posterElement = $item.find('.poster img, .thumbnail img, .cover img, img').first();
        if (posterElement.length) {
          result.poster_url = posterElement.attr('src') || posterElement.attr('data-src');
        }

        results.push(result);

      } catch (error) {
        logger.warn(`[MkvCinemas] Error parsing item ${index}: ${error.message}`);
      }
    });

    logger.info(`[MkvCinemas] Found ${results.length} results for: ${q}`);
    return results;

  } catch (error) {
    logger.error(`[MkvCinemas] Search error for "${q}": ${error.message}`);
    return [];
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
