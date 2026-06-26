import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../utils/logger.js';

puppeteer.use(StealthPlugin());

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Extract first playable m3u8 URL from Fmovies search -> first result -> player page.
 * @param {string} query Movie title
 * @param {object} options { headless, proxy }
 * @returns {Promise<string|null>} m3u8 URL or null
 */
export async function extractM3U8FromFmovies(query, options = {}) {
  const headless = options.headless ?? false; // headful improves success on JS-heavy sites
  const launchArgs = ['--no-sandbox','--disable-setuid-sandbox'];
  if (options.proxy) launchArgs.push(`--proxy-server=${options.proxy}`);

  let browser;
  let m3u8Url = null;
  try {
    browser = await puppeteer.launch({ headless, args: launchArgs, defaultViewport: null });
    const page = await browser.newPage();
    await page.setUserAgent(options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.fmovies.gd/' });

    // Capture any m3u8 from network
    page.on('requestfinished', async (req) => {
      try {
        const url = req.url();
        if (url.includes('.m3u8')) {
          m3u8Url = url;
        }
      } catch {}
    });

    // 1) Go to search page
    const searchUrl = `https://www.fmovies.gd/search?keyword=${encodeURIComponent(query)}`;
    logger.info(`[m3u8Extractor] Fmovies search: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await wait(2000);

    // 2) Click first result
    const resultSel = '.film-list .film a, .movie-item a, .item a, a[href*="/movie/"]';
    await page.waitForSelector(resultSel, { timeout: 10000 });
    const firstHref = await page.$eval(resultSel, a => a.href);
    logger.info(`[m3u8Extractor] Opening first result: ${firstHref}`);
    await page.goto(firstHref, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(2000);

    // 3) Look for an iframe/embed and click play
    try {
      const iframeHandle = await page.$('iframe');
      if (iframeHandle) {
        const frame = await iframeHandle.contentFrame();
        if (frame) {
          // Click play buttons heuristically
          try { await frame.click('button[aria-label*="play" i], .vjs-big-play-button, .jw-icon-play', { delay: 50 }); } catch {}
          await wait(2000);
        }
      } else {
        // Try clicking play on main page
        try { await page.click('.vjs-big-play-button, .jw-icon-play, button[aria-label*="play" i]'); } catch {}
        await wait(2000);
      }
    } catch {}

    // Wait some time to let HLS manifest load
    let attempts = 0;
    while (!m3u8Url && attempts < 10) {
      await wait(1000);
      attempts++;
    }

    if (m3u8Url) logger.info(`[m3u8Extractor] Found m3u8: ${m3u8Url}`);
    return m3u8Url || null;
  } catch (e) {
    logger.error(`[m3u8Extractor] Error: ${e.message}`);
    return null;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

/**
 * Extract m3u8 directly from a known Fmovies watch page
 * @param {string} watchUrl Ex: https://www.fmovies.gd/watch/movie/24428
 * @param {object} options { headless, proxy }
 * @returns {Promise<string|null>}
 */
export async function extractM3U8FromFmoviesWatch(watchUrl, options = {}) {
  const headless = options.headless ?? false;
  const launchArgs = ['--no-sandbox','--disable-setuid-sandbox'];
  if (options.proxy) launchArgs.push(`--proxy-server=${options.proxy}`);

  let browser;
  let m3u8Url = null;
  try {
    browser = await puppeteer.launch({ headless, args: launchArgs, defaultViewport: null });
    const page = await browser.newPage();
    await page.setUserAgent(options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.fmovies.gd/' });

    page.on('requestfinished', async (req) => {
      try {
        const url = req.url();
        if (url.includes('.m3u8')) m3u8Url = url;
      } catch {}
    });

    logger.info(`[m3u8Extractor] Fmovies watch: ${watchUrl}`);
    await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(2000);

    // Try iframe player
    try {
      const iframeHandle = await page.$('iframe');
      if (iframeHandle) {
        const frame = await iframeHandle.contentFrame();
        if (frame) {
          try { await frame.click('button[aria-label*="play" i], .vjs-big-play-button, .jw-icon-play', { delay: 50 }); } catch {}
        }
      } else {
        try { await page.click('.vjs-big-play-button, .jw-icon-play, button[aria-label*="play" i]'); } catch {}
      }
    } catch {}

    let attempts = 0;
    while (!m3u8Url && attempts < 12) {
      await wait(1000);
      attempts++;
    }

    if (m3u8Url) logger.info(`[m3u8Extractor] Found m3u8: ${m3u8Url}`);
    return m3u8Url || null;
  } catch (e) {
    logger.error(`[m3u8Extractor] Watch error: ${e.message}`);
    return null;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

export default { extractM3U8FromFmovies };


