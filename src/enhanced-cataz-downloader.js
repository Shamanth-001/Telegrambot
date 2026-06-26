import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());
const execAsync = promisify(exec);

/**
 * Enhanced Cataz downloader with improved session handling and selectors
 * @param {string} movieUrl - Cataz movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
async function retryOperation(operation, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`[EnhancedCataz] Retry ${i + 1}: ${error.message}`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

export async function downloadCatazEnhanced(movieUrl, outputPath) {
  let browser;
  
  try {
    logger.info(`[EnhancedCataz] Starting enhanced download for: ${movieUrl}`);
    
    // Launch Puppeteer with enhanced stealth settings
    browser = await puppeteer.launch({
      headless: false, // Keep visible to maintain session
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });
    
    const page = await browser.newPage();
    
    // Handle new tab creation for streaming pages
    let streamingPage = null;
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        streamingPage = await target.page();
        logger.info(`[EnhancedCataz] New tab created: ${streamingPage.url()}`);
      }
    });
    
    // Set enhanced viewport and headers
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Enhanced network interception for both main page and new tab
    let streamUrl = null;
    let authHeaders = {};
    let sessionCookies = {};
    
    const setupNetworkInterception = (targetPage) => {
      targetPage.setRequestInterception(true);
      targetPage.on('request', (req) => {
        const url = req.url();
        
        // Capture authentication headers from requests
        authHeaders = {
          'Referer': req.headers()['referer'] || 'https://cataz.to/',
          'User-Agent': req.headers()['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': req.headers()['accept'] || '*/*',
          'Accept-Language': req.headers()['accept-language'] || 'en-US,en;q=0.9'
        };
        
        if (url.includes('.m3u8')) {
          logger.info(`[EnhancedCataz] Found HLS stream: ${url}`);
          streamUrl = url;
          req.continue();
        } else if (url.includes('video') || url.includes('stream')) {
          logger.info(`[EnhancedCataz] Found potential stream: ${url}`);
          req.continue();
        } else {
          req.continue();
        }
      });
    };
    
    // Setup network interception for main page
    await setupNetworkInterception(page);
    
    // Navigate to movie page with enhanced error handling
    logger.info(`[EnhancedCataz] Navigating to: ${movieUrl}`);
    await page.goto(movieUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for page to fully load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Enhanced page analysis
    const pageInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, [class*="play"], [class*="watch"], [class*="btn"]'));
      return {
        title: document.title,
        url: window.location.href,
        hasVideo: !!document.querySelector('video'),
        hasIframe: !!document.querySelector('iframe'),
        hasPlayer: !!document.querySelector('[class*="player"], [class*="video"]'),
        buttons: buttons.map(btn => ({
          text: btn.textContent?.trim(),
          href: btn.href,
          className: btn.className,
          id: btn.id
        })).filter(btn => btn.text && (
          btn.text.toLowerCase().includes('play') || 
          btn.text.toLowerCase().includes('watch') ||
          btn.text.toLowerCase().includes('stream')
        )),
        allLinks: Array.from(document.querySelectorAll('a')).map(a => ({
          text: a.textContent?.trim(),
          href: a.href
        })).filter(a => a.href && a.href.includes('watch'))
      };
    });
    
    logger.info(`[EnhancedCataz] Page analysis: ${JSON.stringify(pageInfo, null, 2)}`);
    
    // Enhanced play button detection and clicking
    logger.info(`[EnhancedCataz] Looking for play button with enhanced selectors...`);
    
    const playButtonFound = await page.evaluate(() => {
      // Multiple selector strategies
      const selectors = [
        'a[href*="watch-movie"]',
        'a[href*="watch"]',
        'button[class*="play"]',
        'button[class*="watch"]',
        '[class*="play-button"]',
        '[class*="watch-button"]',
        'a.btn',
        'button.btn',
        '[role="button"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          return { found: true, selector, text: element.textContent?.trim() };
        }
      }
      
      // Look for any clickable element with play/watch text
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        const text = element.textContent?.toLowerCase() || '';
        if ((text.includes('play') || text.includes('watch') || text.includes('stream')) && 
            element.offsetParent !== null && 
            (element.tagName === 'A' || element.tagName === 'BUTTON' || element.onclick)) {
          return { found: true, selector: element.tagName, text: element.textContent?.trim() };
        }
      }
      
      return { found: false };
    });
    
    if (playButtonFound.found) {
      logger.info(`[EnhancedCataz] Found play button: ${playButtonFound.selector} - "${playButtonFound.text}"`);
      
      try {
        // Enhanced clicking with multiple strategies
        await retryOperation(async () => {
          if (playButtonFound.selector.includes('a[href*="watch-movie"]')) {
            await page.click('a[href*="watch-movie"]');
          } else if (playButtonFound.selector.includes('a[href*="watch"]')) {
            await page.click('a[href*="watch"]');
          } else {
            // Try clicking by text content
            await page.evaluate((buttonText) => {
              const elements = Array.from(document.querySelectorAll('*'));
              for (const element of elements) {
                if (element.textContent?.trim() === buttonText && element.offsetParent !== null) {
                  element.click();
                  return true;
                }
              }
              return false;
            }, playButtonFound.text);
          }
          
          logger.info(`[EnhancedCataz] Clicked play button: ${playButtonFound.text}`);
        }, 3, 2000);
        
        // Wait for new tab to be created and setup network interception
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (streamingPage) {
          logger.info(`[EnhancedCataz] Setting up network interception for streaming tab: ${streamingPage.url()}`);
          await setupNetworkInterception(streamingPage);
          
          // Wait for streaming page to fully load
          await new Promise(resolve => setTimeout(resolve, 8000));
          
          // Get cookies from the streaming page
          sessionCookies = await streamingPage.cookies();
          logger.info(`[EnhancedCataz] Captured ${sessionCookies.length} cookies from streaming page`);
        } else {
          // Fallback: try to wait for navigation on main page
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            logger.info(`[EnhancedCataz] Navigated to streaming page: ${page.url()}`);
          } catch (navError) {
            logger.warn(`[EnhancedCataz] Navigation timeout, continuing...`);
          }
          
          // Wait for streaming page to load
          await new Promise(resolve => setTimeout(resolve, 8000));
        }
        
      } catch (error) {
        logger.warn(`[EnhancedCataz] Could not click play button: ${error.message}`);
        throw new Error('Failed to navigate to streaming page');
      }
    } else {
      logger.warn(`[EnhancedCataz] No play button found, trying direct navigation...`);
    }
    
    // Wait for any additional network requests
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (!streamUrl) {
      throw new Error('No stream URL found on Cataz page');
    }
    
    logger.info(`[EnhancedCataz] Found stream URL: ${streamUrl}`);
    logger.info(`[EnhancedCataz] Auth headers: ${JSON.stringify(authHeaders, null, 2)}`);
    
    // Enhanced download methods
    const downloadMethods = [
      {
        name: 'Browser Session Fetch (Streaming Tab)',
        fn: async () => {
          const targetPage = streamingPage || page;
          const result = await targetPage.evaluate(async (streamUrl, headers) => {
            try {
              const response = await fetch(streamUrl, {
                method: 'GET',
                headers: headers,
                credentials: 'include',
                mode: 'cors'
              });
              
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                return { success: true, data: Array.from(new Uint8Array(arrayBuffer)) };
              }
              return { success: false, error: `Response not ok: ${response.status}` };
            } catch (error) {
              return { success: false, error: error.message };
            }
          }, streamUrl, authHeaders);
          
          if (result.success) {
            const buffer = Buffer.from(result.data);
            fs.writeFileSync(outputPath, buffer);
            return true;
          }
          return false;
        }
      },
      {
        name: 'FFmpeg with Enhanced Headers',
        fn: async () => {
          const cookieString = Object.entries(sessionCookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
          
          const ffmpegCmd = `ffmpeg -y -headers "Referer: ${authHeaders.Referer}\\r\\nUser-Agent: ${authHeaders['User-Agent']}\\r\\nAccept: ${authHeaders.Accept}\\r\\nAccept-Language: ${authHeaders['Accept-Language']}\\r\\nCookie: ${cookieString}" -i "${streamUrl}" -c copy "${outputPath}"`;
          
          logger.info(`[EnhancedCataz] FFmpeg command: ${ffmpegCmd}`);
          await execAsync(ffmpegCmd, { timeout: 300000 });
          return true;
        }
      }
    ];
    
    // Try each download method
    for (const method of downloadMethods) {
      try {
        logger.info(`[EnhancedCataz] Trying ${method.name}...`);
        const success = await method.fn();
        
        if (success && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          const stats = fs.statSync(outputPath);
          logger.info(`[EnhancedCataz] ${method.name} successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          
          return {
            success: true,
            filePath: outputPath,
            fileSize: stats.size,
            source: 'Enhanced Cataz Download',
            method: method.name,
            streamUrl: streamUrl
          };
        }
      } catch (error) {
        logger.warn(`[EnhancedCataz] ${method.name} failed: ${error.message}`);
      }
    }
    
    throw new Error('All enhanced download methods failed');
    
  } catch (error) {
    logger.error(`[EnhancedCataz] Error: ${error.message}`);
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


