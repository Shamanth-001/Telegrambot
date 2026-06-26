import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());
const execAsync = promisify(exec);

/**
 * Decrypt Fmovies blob URLs and extract direct stream URLs
 * @param {string} movieUrl - Fmovies movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
// Retry operation with exponential backoff
async function retryOperation(operation, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`[FmoviesBlobDecryptor] Retry ${i + 1}: ${error.message}`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

export async function decryptFmoviesBlob(movieUrl, outputPath) {
  let browser;
  
  try {
    logger.info(`[FmoviesBlobDecryptor] Starting blob decryption for: ${movieUrl}`);
    
    // Launch Puppeteer with stealth plugin
    browser = await puppeteer.launch({
      headless: false, // Keep visible to see the process
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security', // Allow cross-origin requests
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic browser settings
    await page.setExtraHTTPHeaders({ 
      'Accept-Language': 'en-US,en;q=0.9', 
      'Referer': 'https://fmovies.to/' 
    });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.243 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    let streamUrl = null;
    let decryptionKeys = [];
    let blobUrl = null;
    let authHeaders = {};
    
    // Intercept network requests to capture decryption keys
    page.on('request', (request) => {
      const url = request.url();
      const headers = request.headers();
      
      // Look for decryption keys
      if (url.includes('.key') || url.includes('key=') || url.includes('decrypt')) {
        logger.info(`[FmoviesBlobDecryptor] Found decryption key: ${url}`);
        decryptionKeys.push(url);
      }
      
      // Look for HLS streams
      if (url.includes('.m3u8')) {
        logger.info(`[FmoviesBlobDecryptor] Found HLS stream: ${url}`);
        streamUrl = url;
        
        // Capture authentication headers
        authHeaders = {
          'Referer': headers.referer || movieUrl,
          'User-Agent': headers['user-agent'],
          'Accept': headers.accept,
          'Accept-Language': headers['accept-language']
        };
      }
      
      // Look for blob URLs
      if (url.startsWith('blob:')) {
        logger.info(`[FmoviesBlobDecryptor] Found blob URL: ${url}`);
        blobUrl = url;
      }
      
      request.continue();
    });
    
    // Navigate to movie page
    logger.info(`[FmoviesBlobDecryptor] Navigating to: ${movieUrl}`);
    await page.goto(movieUrl, { waitUntil: 'networkidle2' });
    
    // Wait for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Find and click play button with enhanced error handling
    logger.info(`[FmoviesBlobDecryptor] Looking for play button...`);
    try {
      const playButton = await page.evaluate(() => {
        // Look for play buttons
        const buttons = document.querySelectorAll('button, [class*="play"], [class*="btn"]');
        for (const button of buttons) {
          const text = button.textContent?.toLowerCase() || '';
          if (text.includes('play') || text.includes('watch')) {
            return button;
          }
        }
        return null;
      });
      
      if (playButton) {
        logger.info(`[FmoviesBlobDecryptor] Clicking play button...`);
        await retryOperation(async () => {
          await page.click('button, [class*="play"], [class*="btn"]');
          logger.info(`[FmoviesBlobDecryptor] Clicked play button`);
        }, 3, 1000);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      logger.warn(`[FmoviesBlobDecryptor] Could not find play button: ${error.message}`);
      throw new Error('Failed to find and click play button');
    }
    
    // Wait for video to load and extract blob URL
    logger.info(`[FmoviesBlobDecryptor] Waiting for video to load...`);
    try {
      await page.waitForSelector('video', { timeout: 15000 });
      logger.info(`[FmoviesBlobDecryptor] Video element detected`);
      
      // Wait for blob URL to be created
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Extract blob URL from video element
      const videoInfo = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          return {
            src: video.src,
            currentSrc: video.currentSrc,
            duration: video.duration,
            readyState: video.readyState
          };
        }
        return null;
      });
      
      if (videoInfo && videoInfo.src && videoInfo.src.startsWith('blob:')) {
        logger.info(`[FmoviesBlobDecryptor] Found blob URL: ${videoInfo.src}`);
        blobUrl = videoInfo.src;
      }
      
    } catch (error) {
      logger.warn(`[FmoviesBlobDecryptor] Video element not detected: ${error.message}`);
    }
    
    // Decrypt blob URL to direct stream URL
    if (blobUrl) {
      logger.info(`[FmoviesBlobDecryptor] Decrypting blob URL: ${blobUrl}`);
      
      try {
        // Method 1: Convert blob to data URL
        const dataUrl = await page.evaluate(async (blobUrl) => {
          try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          } catch (error) {
            return null;
          }
        }, blobUrl);
        
        if (dataUrl) {
          logger.info(`[FmoviesBlobDecryptor] Converted blob to data URL`);
          // Save data URL to file
          const dataUrlPath = outputPath + '.dataurl';
          fs.writeFileSync(dataUrlPath, dataUrl);
          logger.info(`[FmoviesBlobDecryptor] Saved data URL to: ${dataUrlPath}`);
        }
        
        // Method 2: Extract direct stream URL from blob
        const directUrl = await page.evaluate(async (blobUrl) => {
          try {
            // Try to extract the underlying stream URL
            const response = await fetch(blobUrl);
            const blob = await blob;
            
            // Look for stream URL in blob data
            const text = await blob.text();
            const urlMatch = text.match(/https?:\/\/[^\s]+\.(mp4|m3u8|ts)/);
            if (urlMatch) {
              return urlMatch[0];
            }
            
            return null;
          } catch (error) {
            return null;
          }
        }, blobUrl);
        
        if (directUrl) {
          logger.info(`[FmoviesBlobDecryptor] Found direct stream URL: ${directUrl}`);
          streamUrl = directUrl;
        }
        
      } catch (error) {
        logger.warn(`[FmoviesBlobDecryptor] Blob decryption failed: ${error.message}`);
      }
    }
    
    // Try to extract stream URL from JavaScript variables
    if (!streamUrl) {
      logger.info(`[FmoviesBlobDecryptor] Extracting stream URL from JavaScript...`);
      
      const jsStreamUrl = await page.evaluate(() => {
        // Look for common streaming variables
        const variables = [
          'streamUrl', 'videoUrl', 'sourceUrl', 'playUrl',
          'hlsUrl', 'm3u8Url', 'stream', 'video'
        ];
        
        for (const varName of variables) {
          if (window[varName]) {
            return window[varName];
          }
        }
        
        // Look in global objects
        if (window.player && window.player.src) {
          return window.player.src;
        }
        
        if (window.jwplayer && window.jwplayer().getPlaylist) {
          const playlist = window.jwplayer().getPlaylist();
          if (playlist && playlist[0] && playlist[0].sources) {
            return playlist[0].sources[0].file;
          }
        }
        
        return null;
      });
      
      if (jsStreamUrl) {
        logger.info(`[FmoviesBlobDecryptor] Found stream URL in JavaScript: ${jsStreamUrl}`);
        streamUrl = jsStreamUrl;
      }
    }
    
    if (!streamUrl) {
      throw new Error('No stream URL found on Fmovies page');
    }
    
    logger.info(`[FmoviesBlobDecryptor] Final stream URL: ${streamUrl}`);
    logger.info(`[FmoviesBlobDecryptor] Decryption keys: ${decryptionKeys.length}`);
    logger.info(`[FmoviesBlobDecryptor] Auth headers: ${JSON.stringify(authHeaders, null, 2)}`);
    
    // Download using FFmpeg with decryption keys
    logger.info(`[FmoviesBlobDecryptor] Downloading with FFmpeg and decryption keys...`);
    try {
      let ffmpegCmd = `ffmpeg -y -headers "Referer: ${authHeaders.Referer}\\r\\nUser-Agent: ${authHeaders['User-Agent']}\\r\\nAccept: ${authHeaders.Accept}\\r\\nAccept-Language: ${authHeaders['Accept-Language']}" -i "${streamUrl}" -c copy "${outputPath}"`;
      
      // Add decryption keys if available
      if (decryptionKeys.length > 0) {
        ffmpegCmd += ` -decryption_key ${decryptionKeys.join(',')}`;
      }
      
      logger.info(`[FmoviesBlobDecryptor] FFmpeg command: ${ffmpegCmd}`);
      const { stdout, stderr } = await execAsync(ffmpegCmd);
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        
        logger.info(`[FmoviesBlobDecryptor] FFmpeg download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
          success: true,
          filePath: outputPath,
          fileSize: fileSize,
          streamUrl: streamUrl,
          source: 'Fmovies Blob Decryptor',
          method: 'FFmpeg with decryption keys'
        };
      }
    } catch (ffmpegError) {
      logger.warn(`[FmoviesBlobDecryptor] FFmpeg download failed: ${ffmpegError.message}`);
    }
    
    throw new Error('All blob decryption methods failed');
    
  } catch (error) {
    logger.error(`[FmoviesBlobDecryptor] Error: ${error.message}`);
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


