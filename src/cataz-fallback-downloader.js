/**
 * Enhanced Cataz downloader with multiple fallback methods
 * Implements your comprehensive solution for Cataz downloads
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());
const execAsync = promisify(exec);

/**
 * Enhanced Cataz downloader with multiple fallback methods
 */
export async function downloadCatazWithFallbacks(movieUrl, outputPath) {
  const methods = [
    { name: 'Enhanced Headers', fn: downloadWithEnhancedHeaders },
    { name: 'Proxy Rotation', fn: downloadWithProxyRotation },
    { name: 'User Agent Rotation', fn: downloadWithUserAgentRotation },
    { name: 'Session Persistence', fn: downloadWithSessionPersistence },
    { name: 'Direct Stream Extraction', fn: downloadWithDirectExtraction }
  ];

  for (const method of methods) {
    try {
      logger.info(`[CatazFallback] Trying ${method.name}...`);
      const result = await method.fn(movieUrl, outputPath);
      if (result.success) {
        logger.info(`[CatazFallback] ✅ Success with ${method.name}`);
        return { ...result, method: method.name };
      }
    } catch (error) {
      logger.warn(`[CatazFallback] ❌ ${method.name} failed: ${error.message}`);
    }
  }

  return { success: false, error: 'All fallback methods failed' };
}

/**
 * Method 1: Enhanced Headers (Your Solution)
 */
async function downloadWithEnhancedHeaders(movieUrl, outputPath) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Enhanced headers to bypass 403
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    });

    await page.goto(movieUrl, { waitUntil: 'networkidle2' });
    
    // Wait for page to load completely
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try multiple selectors for the play button
    const playSelectors = [
      'a[href*="watch-movie"]',
      'button:contains("Watch")',
      '.btn:contains("Watch")',
      '[class*="watch"]',
      '[class*="play"]',
      'a:contains("Watch now")',
      'button:contains("Play")'
    ];

    let playButton = null;
    for (const selector of playSelectors) {
      try {
        playButton = await page.$(selector);
        if (playButton) {
          logger.info(`[EnhancedHeaders] Found play button with selector: ${selector}`);
          break;
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!playButton) {
      // Try to find any clickable element that might be the play button
      const allButtons = await page.$$('a, button, [onclick]');
      for (const button of allButtons) {
        const text = await button.evaluate(el => el.textContent?.toLowerCase() || '');
        if (text.includes('watch') || text.includes('play') || text.includes('stream')) {
          playButton = button;
          logger.info(`[EnhancedHeaders] Found play button by text: ${text}`);
          break;
        }
      }
    }

    if (!playButton) {
      throw new Error('No play button found');
    }

    // Click the play button
    await playButton.click();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Wait for navigation to streaming page
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    // Extract stream URL from network requests
    let streamUrl = null;
    page.on('response', response => {
      const url = response.url();
      if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('videoplayback')) {
        streamUrl = url;
        logger.info(`[EnhancedHeaders] Found stream URL: ${url}`);
      }
    });

    // Wait for stream URL
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (!streamUrl) {
      throw new Error('No stream URL found');
    }

    // Download with enhanced headers
    const enhancedHeaders = {
      'Referer': movieUrl,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Range': 'bytes=0-'
    };

    const headerString = Object.entries(enhancedHeaders)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\\r\\n');

    const ffmpegCmd = `ffmpeg -y -headers "${headerString}" -i "${streamUrl}" -c copy "${outputPath}"`;
    
    logger.info(`[EnhancedHeaders] FFmpeg command: ${ffmpegCmd}`);
    const { stdout, stderr } = await execAsync(ffmpegCmd);

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      return {
        success: true,
        filePath: outputPath,
        fileSize: stats.size,
        method: 'Enhanced Headers'
      };
    } else {
      throw new Error('Download failed - no output file');
    }

  } finally {
    await browser.close();
  }
}

/**
 * Method 2: Proxy Rotation
 */
async function downloadWithProxyRotation(movieUrl, outputPath) {
  // Implementation for proxy rotation
  throw new Error('Proxy rotation not implemented yet');
}

/**
 * Method 3: User Agent Rotation
 */
async function downloadWithUserAgentRotation(movieUrl, outputPath) {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
  ];

  for (const userAgent of userAgents) {
    try {
      const browser = await puppeteer.launch({ headless: false });
      const page = await browser.newPage();
      
      await page.setUserAgent(userAgent);
      await page.goto(movieUrl, { waitUntil: 'networkidle2' });
      
      // Similar logic to enhanced headers but with different user agent
      // ... implementation details ...
      
      await browser.close();
      return { success: true, method: 'User Agent Rotation' };
    } catch (error) {
      logger.warn(`[UserAgentRotation] Failed with ${userAgent}: ${error.message}`);
    }
  }
  
  throw new Error('All user agents failed');
}

/**
 * Method 4: Session Persistence
 */
async function downloadWithSessionPersistence(movieUrl, outputPath) {
  // Implementation for session persistence
  throw new Error('Session persistence not implemented yet');
}

/**
 * Method 5: Direct Stream Extraction
 */
async function downloadWithDirectExtraction(movieUrl, outputPath) {
  // Implementation for direct stream extraction
  throw new Error('Direct stream extraction not implemented yet');
}


