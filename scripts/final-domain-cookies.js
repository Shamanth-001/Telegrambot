/**
 * FINAL DOMAIN COOKIES SOLUTION
 * ============================
 * 
 * Your comprehensive solution for Cataz downloads with:
 * - Dynamic selector detection
 * - Proper domain cookie capture
 * - Redirect handling
 * - Session management
 * - Fallback mechanisms
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

// Enhanced headers with proper domain handling
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

// Capture cookies from the correct domain
async function captureDomainCookies(page, targetDomain) {
  try {
    logger.info(`🍪 Capturing cookies from domain: ${targetDomain}`);
    
    // Wait for the page to load completely
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    // Get all cookies
    const cookies = await page.cookies();
    
    // Filter cookies for the target domain
    const domainCookies = cookies.filter(cookie => 
      cookie.domain.includes(targetDomain) || 
      cookie.domain.includes('cataz.to') ||
      cookie.domain.includes('stormgleam42.xyz') ||
      cookie.domain.includes('rainflare53.pro')
    );
    
    logger.info(`🍪 Found ${domainCookies.length} relevant cookies`);
    
    // Convert cookies to header format
    const cookieHeader = domainCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    return cookieHeader;
  } catch (error) {
    logger.warn(`🍪 Cookie capture failed: ${error.message}`);
    return '';
  }
}

// Download with proper domain handling
async function downloadWithDomainCookies(streamUrl, outputPath, referer, cookies) {
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

// Main download function with domain cookie handling
async function downloadCatazWithDomainCookies(movieUrl) {
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
    
    // Dynamic selector detection for play button
    const playButtonSelectors = [
      'a[href*="watch-movie"]',
      'a[href*="watch"]',
      'button[class*="play"]',
      'div[class*="play"]',
      'a[class*="play"]',
      'button[class*="watch"]',
      'div[class*="watch"]',
      'a[class*="watch"]'
    ];
    
    let playButton = null;
    let usedSelector = null;
    
    for (const selector of playButtonSelectors) {
      try {
        playButton = await page.$(selector);
        if (playButton) {
          usedSelector = selector;
          break;
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    
    if (!playButton) {
      throw new Error('Play button not found with any selector');
    }
    
    logger.info(`✅ Found play button with selector: ${usedSelector}`);
    
    // Capture cookies before clicking
    const initialCookies = await captureDomainCookies(page, 'cataz.to');
    
    // Click play button
    logger.info(`▶️ Clicking play button...`);
    await playButton.click();
    
    // Wait for new tab
    logger.info(`🆕 Waiting for new tab to open...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get all pages
    const pages = await browser.pages();
    const newPage = pages[pages.length - 1];
    
    if (newPage === page) {
      throw new Error('New tab not detected');
    }
    
    logger.info(`🔄 Switching to new tab...`);
    await newPage.bringToFront();
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Capture cookies from the new page
    const newPageCookies = await captureDomainCookies(newPage, 'cataz.to');
    
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
      throw new Error('No stream URLs found');
    }
    
    // Try downloading with each stream URL
    const outputPath = 'downloads/avatar-domain-cookies.mp4';
    
    for (let i = 0; i < streamUrls.length; i++) {
      const streamUrl = streamUrls[i];
      logger.info(`🎯 Trying stream URL ${i + 1}/${streamUrls.length}`);
      
      // Use cookies from the original page (Cataz domain)
      const cookiesToUse = initialCookies || newPageCookies;
      
      if (await downloadWithDomainCookies(streamUrl, outputPath, movieUrl, cookiesToUse)) {
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
  console.log('🎬 FINAL DOMAIN COOKIES SOLUTION');
  console.log('==================================================');
  console.log('🔧 Your domain cookie capture solution');
  console.log('📡 Proper cookie handling + redirect management');
  console.log('🛡️ Complete session management');
  console.log('');
  
  const movieUrl = 'https://cataz.to/movie/watch-avatar-2009-19690';
  
  console.log(`📋 Testing with: ${movieUrl}`);
  console.log('');
  
  try {
    logger.info('🚀 Starting final domain cookies solution...');
    logger.info(`🔗 URL: ${movieUrl}`);
    console.log('');
    
    await downloadCatazWithDomainCookies(movieUrl);
    
    console.log('');
    console.log('🎬 FINAL DOMAIN COOKIES SOLUTION COMPLETED');
    console.log('==================================================');
    
  } catch (error) {
    console.log('');
    logger.error(`❌ CRITICAL ERROR: ${error.message}`);
    logger.error(`📋 Stack: ${error.stack}`);
    console.log('');
    console.log('🎬 FINAL DOMAIN COOKIES SOLUTION COMPLETED');
    console.log('==================================================');
  }
}

main();


