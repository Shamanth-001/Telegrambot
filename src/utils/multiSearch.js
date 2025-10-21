// Multi-source resilient search wrapper
// Stage 1: TMDB normalization
// Stage 2: YTS and PirateBay (stable indexers)
// Stage 3: Scraping fallback (headful Puppeteer) for JS-heavy sites

import axios from 'axios';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../utils/logger.js';

puppeteer.use(StealthPlugin());

const OMDB_KEY = process.env.OMDB_KEY || process.env.OMDB_API_KEY || '';
const SCRAPING_API_KEY = process.env.SCRAPING_API_KEY || '';

function normalizeTitleString(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// 1) IMDb normalization via OMDb (public IMDb-compatible API)
async function searchIMDb(query) {
  if (!OMDB_KEY) return [];
  try {
    const url = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&type=movie&s=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, { timeout: 15000 });
    const results = Array.isArray(data?.Search) ? data.Search : [];
    return results.map(r => ({
      title: r.Title,
      year: r.Year ? String(r.Year) : null,
      imdbId: r.imdbID || null,
      poster: r.Poster && r.Poster !== 'N/A' ? r.Poster : null
    }));
  } catch (e) {
    logger.warn(`[multiSearch] IMDb(OMDb) error: ${e.message}`);
    return [];
  }
}

// 2) YTS indexer
async function searchYTS(query) {
  try {
    const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, { timeout: 15000 });
    const movies = data?.data?.movies || [];
    return movies.map(m => ({
      title: m.title,
      year: m.year,
      torrentUrl: m.torrents?.[0]?.url || null,
      seeders: m.torrents?.[0]?.seeds ?? null,
      quality: m.torrents?.[0]?.quality || null,
      source: 'YTS'
    }));
  } catch (e) {
    logger.warn(`[multiSearch] YTS error: ${e.message}`);
    return [];
  }
}

// 3) PirateBay via API mirror
async function searchPirateBay(query) {
  try {
    const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, { timeout: 15000 });
    const items = Array.isArray(data) ? data : [];
    return items.map(m => ({
      title: m.name,
      magnet: `magnet:?xt=urn:btih:${m.info_hash}&dn=${encodeURIComponent(m.name)}`,
      seeders: Number(m.seeders || 0),
      leechers: Number(m.leechers || 0),
      source: 'PirateBay'
    }));
  } catch (e) {
    logger.warn(`[multiSearch] PirateBay error: ${e.message}`);
    return [];
  }
}

// 4) Scraping fallback (headful) for JS-heavy sites
async function scrapeFallback(url) {
  let browser;
  try {
    const args = ['--no-sandbox', '--disable-setuid-sandbox'];
    if (process.env.SCRAPING_PROXY) args.push(`--proxy-server=${process.env.SCRAPING_PROXY}`);

    browser = await puppeteer.launch({ headless: false, args });
    const page = await browser.newPage();
    if (process.env.SCRAPING_PROXY_USER && process.env.SCRAPING_PROXY_PASS) {
      await page.authenticate({
        username: process.env.SCRAPING_PROXY_USER,
        password: process.env.SCRAPING_PROXY_PASS,
      });
    }
    await page.setUserAgent(process.env.SCRAPING_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    try {
      await page.waitForSelector('.film, .movie, .movie-card, .film-card, .result-item', { timeout: 6000 });
    } catch (_) {}

    const results = await page.evaluate(() => {
      const sel = '.film, .movie, .movie-card, .film-card, .result-item';
      return Array.from(document.querySelectorAll(sel)).map(el => ({
        title: el.querySelector('a')?.textContent?.trim() || '',
        link: el.querySelector('a')?.href || ''
      })).filter(r => r.title && r.link);
    });

    await browser.close();
    return results;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    logger.warn(`[multiSearch] scrapeFallback error: ${e.message}`);
    return [];
  }
}

export async function multiSourceSearch(query) {
  const q = String(query || '').trim();
  if (!q) return { source: 'none', results: [] };

  // Stage 1: normalize via IMDb (OMDb) then return normalized entity list
  const imdb = await searchIMDb(q);
  if (imdb.length) {
    logger.info(`[multiSearch] IMDb returned ${imdb.length} result(s)`);
    return { source: 'IMDb', results: imdb };
  }

  // Stage 2: indexers YTS / PirateBay
  const yts = await searchYTS(q);
  if (yts.length) {
    logger.info(`[multiSearch] YTS returned ${yts.length} result(s)`);
    return { source: 'YTS', results: yts };
  }

  const pb = await searchPirateBay(q);
  if (pb.length) {
    logger.info(`[multiSearch] PirateBay returned ${pb.length} result(s)`);
    return { source: 'PirateBay', results: pb };
  }

  // Stage 3: scraping fallback (example: Fmovies query URL)
  const fmoviesUrl = `https://www.fmovies.gd/search?keyword=${encodeURIComponent(q)}`;
  const scraped = await scrapeFallback(fmoviesUrl);
  if (scraped.length) {
    // Filter by normalized title contains
    const qn = normalizeTitleString(q);
    const filtered = scraped.filter(r => normalizeTitleString(r.title).includes(qn));
    logger.info(`[multiSearch] Fallback scraped ${scraped.length}, filtered ${filtered.length}`);
    return { source: 'ScrapingFallback', results: filtered.length ? filtered : scraped };
  }

  logger.warn(`[multiSearch] No results found for "${q}"`);
  return { source: 'none', results: [] };
}

export default { multiSourceSearch };


