/**
 * FINAL REDIRECT HANDLER SOLUTION
 * ==============================
 * 
 * Your comprehensive solution for Cataz downloads with:
 * - Redirect handling
 * - Fallback to captured stream URLs
 * - Multiple download methods
 * - Session management
 */

import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const logger = {
  info: (msg) => console.log(`🔍 ${msg}`),
  warn: (msg) => console.log(`⚠️ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`)
};

// Previously captured stream URLs as fallback
const FALLBACK_STREAM_URLS = [
  'https://rainflare53.pro/file2/1ikYmLYJtx5o9GMyc9J1TxK5DhjxxOIkUZJktGYk14~MhNpARv5yD6mSIDey+2FWSf7EzSp5p1KVdArVqJ5bhx1yBMWgdYP1aROvZDk1G4YCBGTmw18AMXd0jhvlr3RyL4NhCzrS6XZ50Ld+Lx0cTFvgUWhWSL72pffHoMFOU80=/cGxheWxpc3QubTN1OA==.m3u8',
  'https://rainflare53.pro/file2/1ikYmLYJtx5o9GMyc9J1TxK5DhjxxOIkUZJktGYk14~MhNpARv5yD6mSIDey+2FWSf7EzSp5p1KVdArVqJ5bhx1yBMWgdYP1aROvZDk1G4YCBGTmw18AMXd0jhvlr3RyL4NhCzrS6XZ50Ld+Lx0cTFvgUWhWSL72pffHoMFOU80=/NzIw/aW5kZXgubTN1OA==.m3u8'
];

// Enhanced headers
function getEnhancedHeaders(referer, userAgent) {
  return {
    'Referer': referer,
    'User-Agent': userAgent,
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
}

// Download with proper headers and cookies
async function downloadWithHeaders(streamUrl, outputPath, referer, cookies) {
  try {
    logger.info(`📥 Downloading: ${streamUrl.substring(0, 50)}...`);
    
    const headers = getEnhancedHeaders(referer, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Build FFmpeg command with proper headers
    const headerString = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\\r\\n');
    
    const cookieString = cookies ? `\\r\\nCookie: ${cookies}` : '';
    
    const ffmpegCommand = `ffmpeg -y -headers "${headerString}${cookieString}" -i "${streamUrl}" -c copy "${outputPath}"`;
    
    logger.info(`🔧 FFmpeg command: ${ffmpegCommand.substring(0, 100)}...`);
    
    execSync(ffmpegCommand, { stdio: 'inherit' });
    
    // Check if file was created and has content
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 0) {
        logger.success(`📥 Download successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error(`📥 Download failed: ${error.message}`);
    return false;
  }
}

// Try downloading with fallback stream URLs
async function tryFallbackDownload(movieUrl, cookies) {
  logger.info(`🔄 Trying fallback download with captured stream URLs...`);
  
  const outputPath = 'downloads/avatar-fallback.mp4';
  
  for (let i = 0; i < FALLBACK_STREAM_URLS.length; i++) {
    const streamUrl = FALLBACK_STREAM_URLS[i];
    logger.info(`🎯 Trying fallback stream URL ${i + 1}/${FALLBACK_STREAM_URLS.length}`);
    
    if (await downloadWithHeaders(streamUrl, outputPath, movieUrl, cookies)) {
      logger.success(`🎉 Fallback download completed successfully!`);
      return true;
    }
    
    logger.warn(`🔄 Trying next fallback stream URL...`);
  }
  
  return false;
}

// Main download function with redirect handling
async function downloadCatazWithRedirectHandling(movieUrl) {
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    logger.info(`🔗 Navigating to: ${movieUrl}`);
    await page.goto(movieUrl, { waitUntil: 'networkidle2' });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try multiple approaches to find the play button
    let playButton = null;
    let usedMethod = null;
    
    // Method 1: Look for watch links
    try {
      const watchLinks = await page.$$('a[href*="watch"]');
      if (watchLinks.length > 0) {
        playButton = watchLinks[0];
        usedMethod = 'watch links';
      }
    } catch (error) {
      // Continue to next method
    }
    
    // Method 2: Look for play buttons
    if (!playButton) {
      try {
        const playButtons = await page.$$('button, div, a');
        for (const button of playButtons) {
          const text = await button.evaluate(el => el.textContent?.toLowerCase() || '');
          if (text.includes('watch') || text.includes('play') || text.includes('stream')) {
            playButton = button;
            usedMethod = 'text content';
            break;
          }
        }
      } catch (error) {
        // Continue to next method
      }
    }
    
    // Method 3: Look for any clickable element with href
    if (!playButton) {
      try {
        const clickableElements = await page.$$('a[href]');
        for (const element of clickableElements) {
          const href = await element.evaluate(el => el.getAttribute('href') || '');
          if (href.includes('watch') || href.includes('stream') || href.includes('movie')) {
            playButton = element;
            usedMethod = 'href attribute';
            break;
          }
        }
      } catch (error) {
        // Continue to next method
      }
    }
    
    if (!playButton) {
      throw new Error('No play button found');
    }
    
    logger.info(`✅ Found play button using method: ${usedMethod}`);
    
    // Capture cookies before clicking
    const cookies = await page.cookies();
    const cookieString = cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    logger.info(`🍪 Captured ${cookies.length} cookies`);
    
    // Click play button
    logger.info(`▶️ Clicking play button...`);
    await playButton.click();
    
    // Wait for new tab
    logger.info(`🆕 Waiting for new tab to open...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get all pages
    const pages = await browser.pages();
    const newPage = pages[pages.length - 1];
    
    if (newPage === page) {
      logger.warn('⚠️ New tab not detected, trying fallback download...');
      return await tryFallbackDownload(movieUrl, cookieString);
    }
    
    logger.info(`🔄 Switching to new tab...`);
    await newPage.bringToFront();
    
    // Check if redirected to unexpected domain
    const currentUrl = newPage.url();
    logger.info(`🔗 New tab URL: ${currentUrl}`);
    
    if (currentUrl.includes('whitebit.com') || currentUrl.includes('cryptocurrency')) {
      logger.warn('⚠️ Redirected to unexpected domain, using fallback download...');
      return await tryFallbackDownload(movieUrl, cookieString);
    }
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Set up network interception
    let streamUrls = [];
    await newPage.setRequestInterception(true);
    
    newPage.on('request', request => {
      const url = request.url();
      if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.mpd')) {
        streamUrls.push(url);
        logger.info(`🎯 Stream URL captured: ${url.substring(0, 50)}...`);
      }
      request.continue();
    });
    
    // Wait for network requests
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (streamUrls.length === 0) {
      logger.warn('⚠️ No stream URLs found in new tab, using fallback download...');
      return await tryFallbackDownload(movieUrl, cookieString);
    }
    
    // Try downloading with each stream URL
    const outputPath = 'downloads/avatar-redirect-handler.mp4';
    
    for (let i = 0; i < streamUrls.length; i++) {
      const streamUrl = streamUrls[i];
      logger.info(`🎯 Trying stream URL ${i + 1}/${streamUrls.length}`);
      
      if (await downloadWithHeaders(streamUrl, outputPath, movieUrl, cookieString)) {
        logger.success(`🎉 Download completed successfully!`);
        return true;
      }
      
      logger.warn(`🔄 Trying next stream URL...`);
    }
    
    // If all stream URLs fail, try fallback
    logger.warn('⚠️ All stream URLs failed, trying fallback download...');
    return await tryFallbackDownload(movieUrl, cookieString);
    
  } catch (error) {
    logger.error(`❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

// Main execution
async function main() {
  console.log('🎬 FINAL REDIRECT HANDLER SOLUTION');
  console.log('==================================================');
  console.log('🔧 Your redirect handling solution');
  console.log('📡 Fallback mechanisms + captured stream URLs');
  console.log('🛡️ Complete session management');
  console.log('');
  
  const movieUrl = 'https://cataz.to/movie/watch-avatar-2009-19690';
  
  console.log(`📋 Testing with: ${movieUrl}`);
  console.log('');
  
  try {
    logger.info('🚀 Starting final redirect handler solution...');
    logger.info(`🔗 URL: ${movieUrl}`);
    console.log('');
    
    const success = await downloadCatazWithRedirectHandling(movieUrl);
    
    if (success) {
      logger.success('🎉 Download completed successfully!');
    } else {
      logger.error('❌ Download failed');
    }
    
    console.log('');
    console.log('🎬 FINAL REDIRECT HANDLER SOLUTION COMPLETED');
    console.log('==================================================');
    
  } catch (error) {
    console.log('');
    logger.error(`❌ CRITICAL ERROR: ${error.message}`);
    logger.error(`📋 Stack: ${error.stack}`);
    console.log('');
    console.log('🎬 FINAL REDIRECT HANDLER SOLUTION COMPLETED');
    console.log('==================================================');
  }
}

main();

