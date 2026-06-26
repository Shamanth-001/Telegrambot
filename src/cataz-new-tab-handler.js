/**
 * Enhanced Cataz downloader with new tab handling
 * Implements your solution for handling new tabs when playing movies
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
 * Download Cataz movie with new tab handling (your solution)
 */
export async function downloadCatazWithNewTabHandling(movieUrl, outputPath) {
  let browser;
  
  try {
    logger.info(`[CatazNewTabHandler] Starting download with new tab handling: ${movieUrl}`);
    
    // Launch browser with stealth mode
    browser = await puppeteer.launch({
      headless: false, // Keep visible to handle new tabs
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
    
    // Set enhanced headers (your solution)
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
    
    // Navigate to movie page
    await page.goto(movieUrl, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Find and click play button
    const playButton = await page.$('a[href*="watch-movie"]');
    if (!playButton) {
      throw new Error('Play button not found');
    }
    
    logger.info('[CatazNewTabHandler] Clicking play button...');
    await playButton.click();
    
    // Handle new tab (your solution)
    const newTab = await handleNewTab(browser);
    if (!newTab) {
      throw new Error('Failed to handle new tab');
    }
    
    // Extract stream URL from new tab
    const streamUrl = await extractStreamFromNewTab(newTab);
    if (!streamUrl) {
      throw new Error('No stream URL found in new tab');
    }
    
    logger.info(`[CatazNewTabHandler] Found stream URL: ${streamUrl}`);
    
    // Download with enhanced headers
    const result = await downloadWithEnhancedHeaders(streamUrl, outputPath, movieUrl);
    
    return result;
    
  } catch (error) {
    logger.error(`[CatazNewTabHandler] Error: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Handle new tab detection and switching (your solution)
 */
async function handleNewTab(browser) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for new tab'));
    }, 30000);
    
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        clearTimeout(timeout);
        logger.info('[CatazNewTabHandler] New tab detected, switching context...');
        
        try {
          const newPage = await target.page();
          
          // Wait for the page to load completely (your solution)
          await newPage.waitForLoadState('networkidle');
          
          // Bring the new tab to front (your solution)
          await newPage.bringToFront();
          
          resolve(newPage);
        } catch (error) {
          // Fallback: just return the page without waiting
          try {
            const newPage = await target.page();
            await newPage.bringToFront();
            resolve(newPage);
          } catch (fallbackError) {
            reject(fallbackError);
          }
        }
      }
    });
  });
}

/**
 * Extract stream URL from new tab with network interception (your solution)
 */
async function extractStreamFromNewTab(page) {
  let streamUrl = null;
  
  // Enable request interception (your solution)
  await page.setRequestInterception(true);
  
  // Intercept network requests to capture stream URLs (your solution)
  page.on('request', request => {
    const url = request.url();
    
    // Check for common stream formats (your solution)
    if (url.includes('.m3u8') || 
        url.includes('.mp4') || 
        url.includes('.mpd') || 
        url.includes('videoplayback') ||
        url.includes('stream') ||
        url.includes('playlist')) {
      streamUrl = url;
      logger.info(`[CatazNewTabHandler] Stream URL captured via request interception: ${url}`);
    }
    
    request.continue();
  });
  
  // Also listen for responses as backup
  page.on('response', response => {
    const url = response.url();
    if (url.includes('.m3u8') || 
        url.includes('.mp4') || 
        url.includes('.mpd') || 
        url.includes('videoplayback') ||
        url.includes('stream') ||
        url.includes('playlist')) {
      streamUrl = url;
      logger.info(`[CatazNewTabHandler] Stream URL captured via response: ${url}`);
    }
  });
  
  // Wait for video element to load (fallback method)
  try {
    await page.waitForSelector('video', { timeout: 10000 });
    
    // Try to get video source
    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.src : null;
    });
    
    if (videoSrc && videoSrc !== 'blob:') {
      streamUrl = videoSrc;
      logger.info(`[CatazNewTabHandler] Stream URL captured from video element: ${videoSrc}`);
    }
  } catch (error) {
    logger.warn('[CatazNewTabHandler] Video element not found, relying on network interception');
  }
  
  // Wait for stream URL to be captured via network interception
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  return streamUrl;
}

/**
 * Download with enhanced headers (your solution)
 */
async function downloadWithEnhancedHeaders(streamUrl, outputPath, refererUrl) {
  const enhancedHeaders = {
    'Referer': refererUrl,
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
  
  logger.info(`[CatazNewTabHandler] FFmpeg command: ${ffmpegCmd}`);
  
  try {
    const { stdout, stderr } = await execAsync(ffmpegCmd);
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      return {
        success: true,
        filePath: outputPath,
        fileSize: stats.size,
        method: 'New Tab Handling'
      };
    } else {
      throw new Error('Download failed - no output file created');
    }
  } catch (error) {
    logger.error(`[CatazNewTabHandler] FFmpeg failed: ${error.message}`);
    throw error;
  }
}


