import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());
const execAsync = promisify(exec);

/**
 * Download Cataz video within browser session to bypass 403 Forbidden
 * @param {string} movieUrl - Cataz movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
// Retry operation with exponential backoff
async function retryOperation(operation, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`[CatazSessionDownloader] Retry ${i + 1}: ${error.message}`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

export async function downloadCatazInSession(movieUrl, outputPath) {
  let browser;
  
  try {
    logger.info(`[CatazSessionDownloader] Starting session-based download for: ${movieUrl}`);
    
    // Launch Puppeteer with stealth plugin
    browser = await puppeteer.launch({
      headless: false, // Keep visible to maintain session
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
    let authHeaders = {};
    let sessionCookies = {};
    
    // Intercept network requests to capture authentication data
    page.on('request', (request) => {
      const url = request.url();
      const headers = request.headers();
      
      // Look for HLS streams
      if (url.includes('.m3u8')) {
        logger.info(`[CatazSessionDownloader] Found HLS stream: ${url}`);
        streamUrl = url;
        
        // Capture authentication headers
        authHeaders = {
          'Referer': headers.referer || movieUrl,
          'User-Agent': headers['user-agent'],
          'Accept': headers.accept,
          'Accept-Language': headers['accept-language'],
          'Accept-Encoding': headers['accept-encoding'],
          'Connection': headers.connection,
          'Upgrade-Insecure-Requests': headers['upgrade-insecure-requests']
        };
        
        // Capture session cookies
        if (headers.cookie) {
          sessionCookies = headers.cookie;
        }
      }
      
      request.continue();
    });
    
    // Also intercept responses to catch HLS streams
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('.m3u8')) {
        logger.info(`[CatazSessionDownloader] Found HLS stream in response: ${url}`);
        streamUrl = url;
      }
    });
    
    // Navigate to movie page
    logger.info(`[CatazSessionDownloader] Navigating to: ${movieUrl}`);
    await page.goto(movieUrl, { waitUntil: 'networkidle2' });
    
    // Wait for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Debug: Check what's on the page
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasVideo: !!document.querySelector('video'),
        hasIframe: !!document.querySelector('iframe'),
        hasPlayer: !!document.querySelector('[class*="player"]'),
        buttons: Array.from(document.querySelectorAll('button, a')).map(btn => ({
          text: btn.textContent?.trim(),
          href: btn.href,
          className: btn.className
        })).filter(btn => btn.text && (btn.text.toLowerCase().includes('play') || btn.text.toLowerCase().includes('watch')))
      };
    });
    
    logger.info(`[CatazSessionDownloader] Page info: ${JSON.stringify(pageInfo, null, 2)}`);
    
    // Find and click play button dynamically
    logger.info(`[CatazSessionDownloader] Looking for play button...`);
    const playButton = await page.evaluate(() => {
      // Look for play/watch buttons
      const buttons = document.querySelectorAll('button, a, [class*="play"], [class*="watch"]');
      for (const button of buttons) {
        const text = button.textContent?.toLowerCase() || '';
        if (text.includes('play') || text.includes('watch')) {
          return button;
        }
      }
      return null;
    });
    
    if (playButton) {
      logger.info(`[CatazSessionDownloader] Clicking play button...`);
      try {
        // Click the specific "Watch now" button with retry logic
        await retryOperation(async () => {
          await page.click('a[href*="watch-movie"]');
          logger.info(`[CatazSessionDownloader] Clicked "Watch now" button`);
        }, 3, 1000);
        
        // Wait for navigation to streaming page with enhanced error handling
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        logger.info(`[CatazSessionDownloader] Navigated to streaming page: ${page.url()}`);
        
        // Wait for streaming page to load
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.warn(`[CatazSessionDownloader] Could not click play button: ${error.message}`);
        throw new Error('Failed to navigate to streaming page');
      }
    }
    
    // Wait for any network requests to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (!streamUrl) {
      throw new Error('No stream URL found on Cataz page');
    }
    
    logger.info(`[CatazSessionDownloader] Found stream URL: ${streamUrl}`);
    logger.info(`[CatazSessionDownloader] Auth headers: ${JSON.stringify(authHeaders, null, 2)}`);
    logger.info(`[CatazSessionDownloader] Session cookies: ${sessionCookies}`);
    
    // Method 1: Use browser's network context to download HLS stream
    logger.info(`[CatazSessionDownloader] Method 1: Using browser's network context for HLS stream...`);
    try {
      // Use page.evaluate to download HLS stream within browser session
      const downloadResult = await page.evaluate(async (streamUrl, outputPath) => {
        try {
          // Fetch the HLS stream within the browser context
          const response = await fetch(streamUrl, {
            method: 'GET',
            headers: {
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': window.location.href,
              'User-Agent': navigator.userAgent
            }
          });
          
          if (response.ok) {
            // For HLS streams, we need to fetch the playlist and then the segments
            const playlistText = await response.text();
            logger.info(`[CatazSessionDownloader] HLS Playlist: ${playlistText.substring(0, 200)}...`);
            
            // Parse HLS playlist to get segment URLs
            const segmentUrls = playlistText
              .split('\n')
              .filter(line => line.trim() && !line.startsWith('#'))
              .map(segment => {
                if (segment.startsWith('http')) return segment;
                return new URL(segment, streamUrl).href;
              });
            
            logger.info(`[CatazSessionDownloader] Found ${segmentUrls.length} segments`);
            
            // Download all segments
            const segments = [];
            for (const segmentUrl of segmentUrls.slice(0, 5)) { // Limit to first 5 segments for testing
              try {
                const segmentResponse = await fetch(segmentUrl);
                if (segmentResponse.ok) {
                  const segmentArrayBuffer = await segmentResponse.arrayBuffer();
                  segments.push(new Uint8Array(segmentArrayBuffer));
                }
              } catch (e) {
                logger.warn(`[CatazSessionDownloader] Failed to download segment: ${segmentUrl}`);
              }
            }
            
            if (segments.length > 0) {
              // Combine segments
              const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
              const combined = new Uint8Array(totalLength);
              let offset = 0;
              for (const segment of segments) {
                combined.set(segment, offset);
                offset += segment.length;
              }
              
              // Convert to base64 for transfer
              const base64 = btoa(String.fromCharCode.apply(null, combined));
              
              return {
                success: true,
                data: base64,
                size: combined.length,
                type: 'video/mp4',
                segments: segments.length
              };
            } else {
              return {
                success: false,
                error: 'No segments could be downloaded'
              };
            }
          } else {
            return {
              success: false,
              error: `HTTP ${response.status}: ${response.statusText}`
            };
          }
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }, streamUrl, outputPath);
      
      if (downloadResult.success) {
        // Save the downloaded data
        const buffer = Buffer.from(downloadResult.data, 'base64');
        fs.writeFileSync(outputPath, buffer);
        
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        
        logger.info(`[CatazSessionDownloader] Browser session download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
          success: true,
          filePath: outputPath,
          fileSize: fileSize,
          streamUrl: streamUrl,
          source: 'Cataz Session Downloader',
          method: 'Browser session context'
        };
      } else {
        logger.warn(`[CatazSessionDownloader] Browser session download failed: ${downloadResult.error}`);
      }
    } catch (error) {
      logger.warn(`[CatazSessionDownloader] Browser session download failed: ${error.message}`);
    }
    
    // Method 2: Use browser's network context with proper headers
    logger.info(`[CatazSessionDownloader] Method 2: Using browser's network context with proper headers...`);
    try {
      // Get all cookies from the page
      const pageCookies = await page.cookies();
      const cookieString = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Use page.evaluate to download with proper headers
      const downloadResult = await page.evaluate(async (streamUrl, outputPath, cookieString) => {
        try {
          // Fetch the stream within the browser context with all cookies
          const response = await fetch(streamUrl, {
            method: 'GET',
            headers: {
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': window.location.href,
              'User-Agent': navigator.userAgent,
              'Cookie': cookieString
            }
          });
          
          if (response.ok) {
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Convert to base64 for transfer
            const base64 = btoa(String.fromCharCode.apply(null, uint8Array));
            
            return {
              success: true,
              data: base64,
              size: blob.size,
              type: blob.type
            };
          } else {
            return {
              success: false,
              error: `HTTP ${response.status}: ${response.statusText}`
            };
          }
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }, streamUrl, outputPath, cookieString);
      
      if (downloadResult.success) {
        // Save the downloaded data
        const buffer = Buffer.from(downloadResult.data, 'base64');
        fs.writeFileSync(outputPath, buffer);
        
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        
        logger.info(`[CatazSessionDownloader] Browser session download with cookies successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
          success: true,
          filePath: outputPath,
          fileSize: fileSize,
          streamUrl: streamUrl,
          source: 'Cataz Session Downloader',
          method: 'Browser session context with cookies'
        };
      } else {
        logger.warn(`[CatazSessionDownloader] Browser session download with cookies failed: ${downloadResult.error}`);
      }
    } catch (error) {
      logger.warn(`[CatazSessionDownloader] Browser session download with cookies failed: ${error.message}`);
    }
    
    // Method 3: Use FFmpeg with enhanced headers to bypass 403
    logger.info(`[CatazSessionDownloader] Method 3: Using FFmpeg with enhanced headers...`);
    try {
      // Get all cookies from the page
      const pageCookies = await page.cookies();
      const cookieString = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Enhanced headers to bypass 403 Forbidden
      const enhancedHeaders = {
        'Referer': authHeaders.Referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Range': 'bytes=0-',
        'Cookie': cookieString
      };
      
      const headerString = Object.entries(enhancedHeaders)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\\r\\n');
      
      const ffmpegCmd = `ffmpeg -y -headers "${headerString}" -i "${streamUrl}" -c copy "${outputPath}"`;
      
      logger.info(`[CatazSessionDownloader] FFmpeg command: ${ffmpegCmd}`);
      const { stdout, stderr } = await execAsync(ffmpegCmd);
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        
        logger.info(`[CatazSessionDownloader] FFmpeg with session cookies successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
          success: true,
          filePath: outputPath,
          fileSize: fileSize,
          streamUrl: streamUrl,
          source: 'Cataz Session Downloader',
          method: 'FFmpeg with session cookies'
        };
      }
    } catch (ffmpegError) {
      logger.warn(`[CatazSessionDownloader] FFmpeg with session cookies failed: ${ffmpegError.message}`);
    }
    
    throw new Error('All session-based download methods failed');
    
  } catch (error) {
    logger.error(`[CatazSessionDownloader] Error: ${error.message}`);
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


