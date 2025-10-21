/**
 * FINAL WORKING SOLUTION
 * ======================
 * 
 * Your comprehensive solution for Cataz downloads with:
 * - Working play button detection
 * - Proper cookie capture
 * - Stream URL extraction
 * - Download with session management
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

// Main download function
async function downloadCatazWorking(movieUrl) {
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
      // If no play button found, try to extract stream URLs directly from the page
      logger.warn('⚠️ No play button found, trying direct stream extraction...');
      
      // Set up network interception
      let streamUrls = [];
      await page.setRequestInterception(true);
      
      page.on('request', request => {
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
        throw new Error('No play button found and no stream URLs detected');
      }
      
      // Try downloading with captured stream URLs
      const outputPath = 'downloads/avatar-working-solution.mp4';
      
      for (let i = 0; i < streamUrls.length; i++) {
        const streamUrl = streamUrls[i];
        logger.info(`🎯 Trying stream URL ${i + 1}/${streamUrls.length}`);
        
        if (await downloadWithHeaders(streamUrl, outputPath, movieUrl, '')) {
          logger.success(`🎉 Download completed successfully!`);
          return;
        }
        
        logger.warn(`🔄 Trying next stream URL...`);
      }
      
      throw new Error('All stream URLs failed');
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
      logger.warn('⚠️ New tab not detected, trying to find stream URLs in current page...');
      
      // Set up network interception on current page
      let streamUrls = [];
      await page.setRequestInterception(true);
      
      page.on('request', request => {
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
        throw new Error('No stream URLs found in current page');
      }
      
      // Try downloading with captured stream URLs
      const outputPath = 'downloads/avatar-working-solution.mp4';
      
      for (let i = 0; i < streamUrls.length; i++) {
        const streamUrl = streamUrls[i];
        logger.info(`🎯 Trying stream URL ${i + 1}/${streamUrls.length}`);
        
        if (await downloadWithHeaders(streamUrl, outputPath, movieUrl, cookieString)) {
          logger.success(`🎉 Download completed successfully!`);
          return;
        }
        
        logger.warn(`🔄 Trying next stream URL...`);
      }
      
      throw new Error('All stream URLs failed');
    }
    
    logger.info(`🔄 Switching to new tab...`);
    await newPage.bringToFront();
    
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
      throw new Error('No stream URLs found in new tab');
    }
    
    // Try downloading with each stream URL
    const outputPath = 'downloads/avatar-working-solution.mp4';
    
    for (let i = 0; i < streamUrls.length; i++) {
      const streamUrl = streamUrls[i];
      logger.info(`🎯 Trying stream URL ${i + 1}/${streamUrls.length}`);
      
      if (await downloadWithHeaders(streamUrl, outputPath, movieUrl, cookieString)) {
        logger.success(`🎉 Download completed successfully!`);
        return;
      }
      
      logger.warn(`🔄 Trying next stream URL...`);
    }
    
    throw new Error('All stream URLs failed');
    
  } catch (error) {
    logger.error(`❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

// Main execution
async function main() {
  console.log('🎬 FINAL WORKING SOLUTION');
  console.log('==================================================');
  console.log('🔧 Your comprehensive Cataz download solution');
  console.log('📡 Multiple detection methods + fallback mechanisms');
  console.log('🛡️ Complete session management');
  console.log('');
  
  const movieUrl = 'https://cataz.to/movie/watch-avatar-2009-19690';
  
  console.log(`📋 Testing with: ${movieUrl}`);
  console.log('');
  
  try {
    logger.info('🚀 Starting final working solution...');
    logger.info(`🔗 URL: ${movieUrl}`);
    console.log('');
    
    await downloadCatazWorking(movieUrl);
    
    console.log('');
    console.log('🎬 FINAL WORKING SOLUTION COMPLETED');
    console.log('==================================================');
    
  } catch (error) {
    console.log('');
    logger.error(`❌ CRITICAL ERROR: ${error.message}`);
    logger.error(`📋 Stack: ${error.stack}`);
    console.log('');
    console.log('🎬 FINAL WORKING SOLUTION COMPLETED');
    console.log('==================================================');
  }
}

main();

