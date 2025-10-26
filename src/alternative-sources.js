import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from './utils/logger.js';

/**
 * Alternative streaming sources handler
 */
export class AlternativeSourcesHandler {
  constructor() {
    this.sources = [
      {
        name: 'DooPlay',
        baseUrl: 'https://dooplay.net',
        searchUrl: 'https://dooplay.net/search?q=',
        health: 95,
        embedSelector: 'iframe[src*="embed"]',
        iframeSelector: 'iframe'
      },
      {
        name: 'ZoeChip',
        baseUrl: 'https://zoechip.to',
        searchUrl: 'https://zoechip.to/search?q=',
        health: 80,
        embedSelector: 'iframe[src*="embed"]',
        iframeSelector: 'iframe'
      },
      {
        name: 'FMovies',
        baseUrl: 'https://fmovies.to',
        searchUrl: 'https://fmovies.to/search?q=',
        health: 75,
        embedSelector: 'iframe[src*="embed"]',
        iframeSelector: 'iframe'
      },
      {
        name: '123Movies',
        baseUrl: 'https://123moviesfree.net',
        searchUrl: 'https://123moviesfree.net/search?q=',
        health: 70,
        embedSelector: 'iframe[src*="embed"]',
        iframeSelector: 'iframe'
      }
    ];
  }

  /**
   * Search for movie on alternative sources
   */
  async searchMovie(title, sourceName = null) {
    logger.info(`[AlternativeSources] Searching for: ${title}`);
    
    const sourcesToTry = sourceName ? 
      this.sources.filter(s => s.name === sourceName) : 
      this.sources.sort((a, b) => b.health - a.health);

    for (const source of sourcesToTry) {
      try {
        logger.info(`[AlternativeSources] Trying ${source.name}...`);
        const results = await this.searchOnSource(source, title);
        
        if (results && results.length > 0) {
          logger.info(`[AlternativeSources] Found ${results.length} results on ${source.name}`);
          return {
            source: source.name,
            results: results,
            success: true
          };
        }
      } catch (error) {
        logger.warn(`[AlternativeSources] ${source.name} failed: ${error.message}`);
      }
    }

    logger.warn(`[AlternativeSources] No results found for: ${title}`);
    return {
      success: false,
      error: 'No results found on any alternative source'
    };
  }

  /**
   * Search on specific source
   */
  async searchOnSource(source, title) {
    try {
      const searchUrl = `${source.searchUrl}${encodeURIComponent(title)}`;
      logger.info(`[AlternativeSources] Searching ${source.name}: ${searchUrl}`);
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      // Look for movie links
      $('a[href*="/movie/"], a[href*="/watch/"], a[href*="/film/"]').each((i, element) => {
        const $element = $(element);
        const href = $element.attr('href');
        const text = $element.text().trim();
        const title = $element.find('h2, h3, .title, .name').text().trim() || text;
        
        if (href && title && !title.includes('Search') && !title.includes('Home')) {
          const fullUrl = href.startsWith('http') ? href : `${source.baseUrl}${href}`;
          results.push({
            title: title,
            url: fullUrl,
            source: source.name
          });
        }
      });

      return results;
    } catch (error) {
      logger.warn(`[AlternativeSources] Error searching ${source.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract embed URLs from movie page
   */
  async extractEmbeds(movieUrl) {
    try {
      logger.info(`[AlternativeSources] Extracting embeds from: ${movieUrl}`);
      
      const response = await axios.get(movieUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const embeds = [];

      // Look for iframe embeds
      $('iframe').each((i, element) => {
        const src = $(element).attr('src');
        if (src && (src.includes('embed') || src.includes('player') || src.includes('stream'))) {
          const fullUrl = src.startsWith('http') ? src : `https:${src}`;
          embeds.push({
            url: fullUrl,
            type: 'iframe'
          });
        }
      });

      // Look for video elements
      $('video').each((i, element) => {
        const src = $(element).attr('src');
        if (src) {
          const fullUrl = src.startsWith('http') ? src : `https:${src}`;
          embeds.push({
            url: fullUrl,
            type: 'video'
          });
        }
      });

      // Look for source elements
      $('source').each((i, element) => {
        const src = $(element).attr('src');
        if (src) {
          const fullUrl = src.startsWith('http') ? src : `https:${src}`;
          embeds.push({
            url: fullUrl,
            type: 'source'
          });
        }
      });

      logger.info(`[AlternativeSources] Found ${embeds.length} embeds`);
      return embeds;
    } catch (error) {
      logger.warn(`[AlternativeSources] Error extracting embeds: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get working alternative for a movie
   */
  async getWorkingAlternative(title) {
    logger.info(`[AlternativeSources] Getting working alternative for: ${title}`);
    
    const searchResult = await this.searchMovie(title);
    
    if (!searchResult.success) {
      return {
        success: false,
        error: searchResult.error
      };
    }

    // Try to extract embeds from the first result
    try {
      const embeds = await this.extractEmbeds(searchResult.results[0].url);
      
      if (embeds.length > 0) {
        logger.info(`[AlternativeSources] Found working alternative: ${searchResult.source}`);
        return {
          success: true,
          source: searchResult.source,
          movieUrl: searchResult.results[0].url,
          embeds: embeds,
          title: searchResult.results[0].title
        };
      }
    } catch (error) {
      logger.warn(`[AlternativeSources] Error extracting embeds: ${error.message}`);
    }

    return {
      success: false,
      error: 'No working embeds found'
    };
  }

  /**
   * Update source health scores
   */
  async updateHealthScores() {
    logger.info(`[AlternativeSources] Updating health scores...`);
    
    for (const source of this.sources) {
      try {
        const response = await axios.head(source.baseUrl, { timeout: 5000 });
        if (response.status === 200) {
          source.health = Math.min(100, source.health + 5);
          logger.info(`[AlternativeSources] ${source.name} health: ${source.health}`);
        } else {
          source.health = Math.max(0, source.health - 10);
          logger.warn(`[AlternativeSources] ${source.name} health: ${source.health}`);
        }
      } catch (error) {
        source.health = Math.max(0, source.health - 20);
        logger.warn(`[AlternativeSources] ${source.name} health: ${source.health} (${error.message})`);
      }
    }
  }

  /**
   * Get all sources with health scores
   */
  getSources() {
    return this.sources.sort((a, b) => b.health - a.health);
  }
}

export default AlternativeSourcesHandler;




