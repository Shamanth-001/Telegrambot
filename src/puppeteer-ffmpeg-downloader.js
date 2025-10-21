// Puppeteer + FFmpeg Direct Stream Downloader
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());

// Configuration
const CONFIG = {
  FFMPEG_BINARY: process.env.FFMPEG_BINARY || 'ffmpeg',
  STREAM_TIMEOUT_MS: parseInt(process.env.STREAM_TIMEOUT_MS) || 45000,
  FFMPEG_TIMEOUT_MS: parseInt(process.env.FFMPEG_TIMEOUT_MS) || 0,
  MAX_STREAM_TRIES: parseInt(process.env.MAX_STREAM_TRIES) || 3,
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB) || 1900
};

/**
 * Main downloader function
 * @param {string} moviePageUrl - URL of the movie page
 * @param {Object} options - Download options
 * @returns {Promise<Object>} - { filePath, sourceUrl }
 */
export async function downloadStreamWithPuppeteer(moviePageUrl, options = {}) {
  const {
    outDir = path.join(process.cwd(), 'downloads'),
    title = 'movie',
    timeoutMs = CONFIG.STREAM_TIMEOUT_MS
  } = options;

  logger.info(`[PuppeteerFFmpeg] Starting download for: ${moviePageUrl}`);
  
  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const safeTitle = sanitizeFilename(title);
  const tempFilePath = path.join(outDir, `${safeTitle}.mkv`);
  
  let browser;
  let streamUrl;

  try {
    // Launch browser
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
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to movie page
    logger.info(`[PuppeteerFFmpeg] Navigating to: ${moviePageUrl}`);
    await page.goto(moviePageUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Try site-specific extractors first
    const streamData = await trySiteSpecificExtractors(page, moviePageUrl);
    
    // Fallback to generic extraction
    if (!streamData) {
      logger.info(`[PuppeteerFFmpeg] No site-specific extractor found, using generic extraction`);
      const candidates = await extractStreamUrlWithPuppeteer(page, { timeoutMs: 10000 });
      streamUrl = candidates[0];
    } else {
      streamUrl = streamData.url;
      logger.info(`[PuppeteerFFmpeg] Using ${streamData.metadata?.platform || 'unknown'} stream: ${streamData.metadata?.quality || 'unknown'} quality`);
    }

    if (!streamUrl) {
      throw new Error('NoStreamFound');
    }

    logger.info(`[PuppeteerFFmpeg] Found stream URL: ${streamUrl}`);

    // Download with FFmpeg
    await runFfmpegRemux(streamUrl, tempFilePath, {
      ffmpegBinary: CONFIG.FFMPEG_BINARY,
      timeoutMs: CONFIG.FFMPEG_TIMEOUT_MS,
      maxSizeMB: CONFIG.MAX_FILE_SIZE_MB
    });

    // Check file size
    const stats = fs.statSync(tempFilePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    if (sizeMB > CONFIG.MAX_FILE_SIZE_MB) {
      logger.warn(`[PuppeteerFFmpeg] File too large: ${sizeMB.toFixed(2)}MB > ${CONFIG.MAX_FILE_SIZE_MB}MB`);
      // TODO: Implement bitrate limiting or splitting
    }

    logger.info(`[PuppeteerFFmpeg] Download completed: ${tempFilePath} (${sizeMB.toFixed(2)}MB)`);

    return {
      filePath: tempFilePath,
      sourceUrl: streamUrl,
      sizeMB: sizeMB
    };

  } catch (error) {
    // Cleanup on failure
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        logger.info(`[PuppeteerFFmpeg] Cleaned up partial file: ${tempFilePath}`);
      } catch (cleanupError) {
        logger.error(`[PuppeteerFFmpeg] Failed to cleanup: ${cleanupError.message}`);
      }
    }
    
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Try site-specific extractors
 */
async function trySiteSpecificExtractors(page, url) {
  try {
    // Import extractors dynamically
    const extractors = await loadExtractors();
    
    for (const extractor of extractors) {
      if (extractor.match(url)) {
        logger.info(`[PuppeteerFFmpeg] Using extractor: ${extractor.name}`);
        const streamData = await extractor.getStreamUrls(page);
        if (streamData && streamData.length > 0) {
          // Return first (highest quality) stream with metadata
          return streamData[0];
        }
      }
    }
  } catch (error) {
    logger.error(`[PuppeteerFFmpeg] Site-specific extraction failed: ${error.message}`);
  }
  
  return null;
}

/**
 * Load available extractors
 */
async function loadExtractors() {
  const extractors = [];
  
  try {
    // Try to load Einthusan extractor
    const einthusanExtractor = await import('./extractors/einthusan.js');
    extractors.push({
      name: 'einthusan',
      match: einthusanExtractor.match,
      getStreamUrls: einthusanExtractor.getStreamUrls
    });
  } catch (error) {
    logger.debug(`[PuppeteerFFmpeg] Einthusan extractor not available: ${error.message}`);
  }

  try {
    // Try to load Cataz extractor
    const catazExtractor = await import('./extractors/cataz.js');
    extractors.push({
      name: 'cataz',
      match: catazExtractor.match,
      getStreamUrls: catazExtractor.getStreamUrls
    });
  } catch (error) {
    logger.debug(`[PuppeteerFFmpeg] Cataz extractor not available: ${error.message}`);
  }

  try {
    // Try to load Generic extractor (fallback)
    const genericExtractor = await import('./extractors/generic.js');
    extractors.push({
      name: 'generic',
      match: genericExtractor.match,
      getStreamUrls: genericExtractor.getStreamUrls
    });
  } catch (error) {
    logger.debug(`[PuppeteerFFmpeg] Generic extractor not available: ${error.message}`);
  }

  return extractors;
}

/**
 * Generic stream URL extraction
 */
async function extractStreamUrlWithPuppeteer(page, { timeoutMs = 15000 } = {}) {
  const candidates = new Set();

  // Listen to responses for manifests
  const onResponse = async (res) => {
    try {
      const url = res.url();
      if (/\.m3u8($|\?)/i.test(url) || /\.mpd($|\?)/i.test(url) || /manifest/i.test(url)) {
        candidates.add(url);
        logger.debug(`[PuppeteerFFmpeg] Found manifest in response: ${url}`);
      }
    } catch (e) {}
  };
  page.on('response', onResponse);

  // Try DOM first
  const domCandidates = await page.evaluate(() => {
    const out = [];
    // <video> or <source>
    document.querySelectorAll('video, video source, source').forEach(s => {
      if (s.src) out.push(s.src);
      if (s.getAttribute && s.getAttribute('src')) out.push(s.getAttribute('src'));
      const data = s.getAttribute && s.getAttribute('data-src');
      if (data) out.push(data);
    });
    // inline scripts: search for m3u8/mpd strings
    document.querySelectorAll('script').forEach(scr => {
      const t = scr.innerText || '';
      const m = t.match(/https?:\/\/[^'"\s]+(?:\.m3u8|\.mpd)[^'"\s]*/ig);
      if (m) out.push(...m);
    });
    return out;
  });

  domCandidates.forEach(u => candidates.add(u));

  // Give network some time (for XHR manifests to appear)
  await new Promise(resolve => setTimeout(resolve, 2000));

  // If none yet, scroll and wait
  if (candidates.size === 0) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Wait a bit for responses to fire
  await new Promise(resolve => setTimeout(resolve, Math.min(3000, timeoutMs)));

  page.off('response', onResponse);

  // Normalize to array and filter
  const arr = Array.from(candidates).map(u => {
    if (!u) return null;
    if (u.startsWith('//')) return 'https:' + u;
    return u;
  }).filter(Boolean);

  // Prefer m3u8 (HLS) then mpd (DASH) then direct mp4
  arr.sort((a, b) => {
    const score = u => (/\.m3u8/i.test(u) ? 3 : /\.mpd/i.test(u) ? 2 : 1);
    return score(b) - score(a);
  });

  logger.info(`[PuppeteerFFmpeg] Found ${arr.length} stream candidates`);
  return arr;
}

/**
 * Run FFmpeg remux with HLS quality selection
 */
function runFfmpegRemux(streamUrl, outPath, { ffmpegBinary = 'ffmpeg', timeoutMs = 0, maxSizeMB = 1900 } = {}) {
  return new Promise((resolve, reject) => {
    // Build FFmpeg arguments with HLS quality selection
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', streamUrl
    ];

    // For HLS streams, try to select best quality
    if (streamUrl.includes('.m3u8')) {
      // Try to select the best quality variant
      args.push('-map', '0:0', '-map', '0:1'); // Map video and audio streams
      args.push('-c:v', 'copy', '-c:a', 'copy'); // Copy without re-encoding
      args.push('-bsf:a', 'aac_adtstoasc'); // Fix AAC audio
      
      // Add size limit if specified
      if (maxSizeMB > 0) {
        args.push('-fs', `${maxSizeMB}M`);
      }
    } else {
      // For other formats, use simple copy
      args.push('-c', 'copy');
      args.push('-bsf:a', 'aac_adtstoasc');
      
      // Add size limit if specified
      if (maxSizeMB > 0) {
        args.push('-fs', `${maxSizeMB}M`);
      }
    }

    args.push(outPath);

    logger.info(`[PuppeteerFFmpeg] Running FFmpeg: ${ffmpegBinary} ${args.join(' ')}`);
    
    const proc = spawn(ffmpegBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    let stdout = '';
    
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    let killedByTimeout = false;
    let timeout;
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        killedByTimeout = true;
        proc.kill('SIGKILL');
        logger.error(`[PuppeteerFFmpeg] FFmpeg timeout after ${timeoutMs}ms`);
      }, timeoutMs);
    }

    proc.on('close', code => {
      if (timeout) clearTimeout(timeout);
      if (killedByTimeout) return reject(new Error('ffmpeg timeout'));
      if (code === 0) return resolve({ file: outPath, stdout, stderr });
      return reject(new Error('ffmpeg failed: ' + (stderr || `exit ${code}`)));
    });
  });
}

/**
 * Sanitize filename
 */
function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

export default { downloadStreamWithPuppeteer };
