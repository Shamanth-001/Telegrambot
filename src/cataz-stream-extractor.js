import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());
const execAsync = promisify(exec);

/**
 * Extract HLS/MP4 stream URLs from Cataz JW Player
 * @param {string} movieUrl - Cataz movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function extractCatazStream(movieUrl, outputPath) {
  let browser;
  
  try {
    logger.info(`[CatazStreamExtractor] Starting extraction for: ${movieUrl}`);
    
    // Launch Puppeteer with stealth plugin
    browser = await puppeteer.launch({
      headless: false, // Keep visible to see JW Player loading
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
    await page.setExtraHTTPHeaders({ 
      'Accept-Language': 'en-US,en;q=0.9', 
      'Referer': 'https://cataz.to/' 
    });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.243 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    let streamUrl = null;
    let m3u8Url = null;
    let mp4Url = null;
    
    // Intercept network requests to capture stream URLs
    page.on('request', (request) => {
      const url = request.url();
      
      // Look for HLS streams
      if (url.includes('.m3u8')) {
        logger.info(`[CatazStreamExtractor] Found HLS stream: ${url}`);
        m3u8Url = url;
        streamUrl = url;
      }
      
      // Look for direct MP4 streams
      if (url.includes('.mp4') && !url.includes('trailer')) {
        logger.info(`[CatazStreamExtractor] Found MP4 stream: ${url}`);
        mp4Url = url;
        if (!streamUrl) streamUrl = url;
      }
      
      request.continue();
    });
    
    // Navigate to movie page
    logger.info(`[CatazStreamExtractor] Navigating to: ${movieUrl}`);
    await page.goto(movieUrl, { waitUntil: 'networkidle2' });
    
    // Click "Watch now" button
    logger.info(`[CatazStreamExtractor] Looking for 'Watch now' button...`);
    try {
      await page.waitForSelector('a[href*="watch-movie"]', { timeout: 10000 });
      const watchButton = await page.$('a[href*="watch-movie"]');
      
      if (watchButton) {
        logger.info(`[CatazStreamExtractor] Clicking 'Watch now' button...`);
        await watchButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        logger.info(`[CatazStreamExtractor] Navigated to streaming page: ${page.url()}`);
      }
    } catch (error) {
      logger.warn(`[CatazStreamExtractor] Could not find 'Watch now' button: ${error.message}`);
    }
    
    // Wait for JW Player to load and look for video elements
    logger.info(`[CatazStreamExtractor] Waiting for JW Player to load...`);
    try {
      // Wait for video element or JW Player to appear
      await page.waitForSelector('video, .jwplayer, [class*="player"]', { timeout: 15000 });
      logger.info(`[CatazStreamExtractor] JW Player detected`);
      
      // Wait a bit more for streams to load
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try to extract stream URL from video element
      const videoSrc = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          return video.src || video.currentSrc;
        }
        return null;
      });
      
      if (videoSrc && videoSrc !== 'blob:') {
        logger.info(`[CatazStreamExtractor] Found video source: ${videoSrc}`);
        streamUrl = videoSrc;
      }
      
    } catch (error) {
      logger.warn(`[CatazStreamExtractor] JW Player not detected: ${error.message}`);
    }
    
    // If no stream URL found, try to extract from page content
    if (!streamUrl) {
      logger.info(`[CatazStreamExtractor] Extracting stream URL from page content...`);
      
      const pageContent = await page.evaluate(() => {
        // Look for common streaming patterns in the page
        const scripts = Array.from(document.querySelectorAll('script'));
        let streamUrl = null;
        
        for (const script of scripts) {
          const content = script.textContent || '';
          
          // Look for HLS URLs
          const hlsMatch = content.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
          if (hlsMatch) {
            streamUrl = hlsMatch[0];
            break;
          }
          
          // Look for MP4 URLs
          const mp4Match = content.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
          if (mp4Match) {
            streamUrl = mp4Match[0];
            break;
          }
        }
        
        return streamUrl;
      });
      
      if (pageContent) {
        logger.info(`[CatazStreamExtractor] Found stream URL in page content: ${pageContent}`);
        streamUrl = pageContent;
      }
    }
    
    if (!streamUrl) {
      throw new Error('No stream URL found on Cataz page');
    }
    
    logger.info(`[CatazStreamExtractor] Final stream URL: ${streamUrl}`);
    
    // Download using yt-dlp with proper headers
    logger.info(`[CatazStreamExtractor] Downloading with yt-dlp...`);
    
    // Get cookies and headers from the page
    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    const ytdlpCmd = `yt-dlp -o "${outputPath}" --no-playlist --add-header "Referer: ${movieUrl}" --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" --add-header "Cookie: ${cookieHeader}" "${streamUrl}"`;
    
    try {
      const { stdout, stderr } = await execAsync(ytdlpCmd);
      
      logger.info(`[CatazStreamExtractor] yt-dlp stdout: ${stdout}`);
      if (stderr) logger.info(`[CatazStreamExtractor] yt-dlp stderr: ${stderr}`);
      
      // Check for downloaded file
      const mp4Path = outputPath;
      const webmPath = outputPath + '.webm';
      const mkvPath = outputPath + '.mkv';
      
      let downloadedFile = null;
      if (fs.existsSync(mp4Path)) {
        downloadedFile = mp4Path;
      } else if (fs.existsSync(webmPath)) {
        downloadedFile = webmPath;
      } else if (fs.existsSync(mkvPath)) {
        downloadedFile = mkvPath;
      }
      
      if (downloadedFile) {
        const stats = fs.statSync(downloadedFile);
        const fileSize = stats.size;
        
        logger.info(`[CatazStreamExtractor] Download successful: ${downloadedFile} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
          success: true,
          filePath: downloadedFile,
          fileSize: fileSize,
          streamUrl: streamUrl,
          source: 'Cataz JW Player'
        };
      } else {
        throw new Error('Downloaded file not found');
      }
      
    } catch (downloadError) {
      logger.error(`[CatazStreamExtractor] yt-dlp download failed: ${downloadError.message}`);
      throw downloadError;
    }
    
  } catch (error) {
    logger.error(`[CatazStreamExtractor] Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}


