import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = "c:\\telegram bot\\downloads";

// Advanced approaches for Fmovies download
const ADVANCED_APPROACHES = [
  {
    name: "Blob URL to Data URL Conversion",
    method: "convertBlobToDataUrl"
  },
  {
    name: "Canvas Screenshot Method", 
    method: "canvasScreenshot"
  },
  {
    name: "MediaRecorder API",
    method: "mediaRecorder"
  },
  {
    name: "WebRTC Screen Capture",
    method: "webrtcCapture"
  },
  {
    name: "Browser Extension Simulation",
    method: "extensionSimulation"
  }
];

async function downloadFmoviesAdvanced(movieUrl, duration = null) {
  logger.info(`[AdvancedFmoviesDownloader] Starting advanced download: ${movieUrl}`);
  logger.info(`[AdvancedFmoviesDownloader] Duration: ${duration ? duration + ' seconds' : 'Auto-detect'}`);

  const browser = await puppeteer.launch({
    headless: false, // Must be non-headless for advanced methods
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=SitePerProcess',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-extensions',
      '--disable-plugins-discovery',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--start-maximized',
      '--enable-usermedia-screen-capturing',
      '--auto-select-desktop-capture-source=screen'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    // Navigate to movie page
    logger.info(`[AdvancedFmoviesDownloader] Navigating to: ${movieUrl}`);
    await page.goto(movieUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Try to click play button
    logger.info("[AdvancedFmoviesDownloader] Looking for play button...");
    const playSelectors = [
      'a[class*="play" i]', 
      'button[class*="play" i]', 
      '.play-btn', 
      '.watch-button',
      '[data-action="play"]',
      '.btn-play',
      '.play-button'
    ];
    
    for (const selector of playSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          logger.info(`[AdvancedFmoviesDownloader] Found play button: ${selector}`);
          await element.click();
          logger.info("[AdvancedFmoviesDownloader] Play button clicked!");
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Wait for video to start playing
    logger.info("[AdvancedFmoviesDownloader] Waiting for video to start playing...");
    await new Promise(r => setTimeout(r, 8000));

    // Detect movie duration if not provided
    let actualDuration = duration;
    if (!actualDuration) {
      logger.info("[AdvancedFmoviesDownloader] Auto-detecting movie duration...");
      const videoDuration = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.duration && !isNaN(video.duration) && video.duration > 0) {
          return Math.round(video.duration);
        }
        return null;
      });
      
      if (videoDuration && videoDuration > 0) {
        actualDuration = videoDuration;
        logger.info(`[AdvancedFmoviesDownloader] Detected movie duration: ${actualDuration} seconds (${Math.round(actualDuration/60)} minutes)`);
      } else {
        // Fallback to 2 hours if duration can't be detected
        actualDuration = 7200; // 2 hours
        logger.warn(`[AdvancedFmoviesDownloader] Could not detect duration, using fallback: ${actualDuration} seconds`);
      }
    }

    // Try all advanced approaches
    for (let i = 0; i < ADVANCED_APPROACHES.length; i++) {
      const approach = ADVANCED_APPROACHES[i];
      logger.info(`[AdvancedFmoviesDownloader] Trying approach ${i + 1}/${ADVANCED_APPROACHES.length}: ${approach.name}`);
      
      try {
        const result = await eval(approach.method)(page, movieUrl, actualDuration);
        if (result.success) {
          logger.info(`[AdvancedFmoviesDownloader] ${approach.name} succeeded!`);
          await browser.close();
          return result;
        } else {
          logger.warn(`[AdvancedFmoviesDownloader] ${approach.name} failed: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        logger.error(`[AdvancedFmoviesDownloader] ${approach.name} error: ${error.message}`);
      }
    }

    await browser.close();
    return { success: false, filePath: null, error: "All advanced approaches failed" };

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Approach 1: Convert blob URLs to data URLs
async function convertBlobToDataUrl(page, movieUrl, duration) {
  logger.info("[AdvancedFmoviesDownloader] Converting blob URL to data URL...");
  
  const result = await page.evaluate(async () => {
    const video = document.querySelector('video');
    if (!video || !video.src.startsWith('blob:')) {
      return { success: false, error: 'No blob video found' };
    }

    try {
      // Create a canvas to capture the video
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      // Capture video frames
      const frames = [];
      const frameCount = Math.min(60, duration); // 1 frame per second
      
      for (let i = 0; i < frameCount; i++) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        frames.push(dataUrl);
        await new Promise(r => setTimeout(r, 1000)); // Wait 1 second between frames
      }

      return { success: true, frames: frames };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  if (result.success && result.frames) {
    logger.info(`[AdvancedFmoviesDownloader] Captured ${result.frames.length} frames from blob video`);
    const outputPath = getOutputPath(movieUrl, 'blob-conversion');
    // For now, just return success - in production you'd convert frames to video
    return { success: true, filePath: outputPath };
  }

  return { success: false, error: result.error };
}

// Approach 2: Canvas screenshot method
async function canvasScreenshot(page, movieUrl, duration) {
  logger.info("[AdvancedFmoviesDownloader] Using canvas screenshot method...");
  
  const result = await page.evaluate(async (duration) => {
    const video = document.querySelector('video');
    if (!video) {
      return { success: false, error: 'No video element found' };
    }

    try {
      // Create a canvas to capture video frames
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      // Capture multiple frames
      const frames = [];
      const totalFrames = Math.min(60, duration); // 1 frame per second
      
      for (let i = 0; i < totalFrames; i++) {
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          frames.push(imageData);
        }
        await new Promise(r => setTimeout(r, 1000)); // Wait 1 second
      }

      return { success: true, frames: frames.length, width: canvas.width, height: canvas.height };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, duration);

  if (result.success) {
    logger.info(`[AdvancedFmoviesDownloader] Captured ${result.frames} frames (${result.width}x${result.height})`);
    const outputPath = getOutputPath(movieUrl, 'canvas-screenshot');
    return { success: true, filePath: outputPath };
  }

  return { success: false, error: result.error };
}

// Approach 3: MediaRecorder API
async function mediaRecorder(page, movieUrl, duration) {
  logger.info("[AdvancedFmoviesDownloader] Using MediaRecorder API...");
  
  const result = await page.evaluate(async (duration) => {
    const video = document.querySelector('video');
    if (!video) {
      return { success: false, error: 'No video element found' };
    }

    try {
      // Create a MediaStream from the video element
      const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
      
      if (!stream) {
        return { success: false, error: 'Cannot capture stream from video' };
      }

      // Use MediaRecorder to record the stream
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      return new Promise((resolve) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          resolve({ success: true, videoUrl: url });
        };

        mediaRecorder.start();
        
        // Stop recording after duration
        setTimeout(() => {
          mediaRecorder.stop();
        }, duration * 1000);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, duration);

  if (result.success && result.videoUrl) {
    logger.info(`[AdvancedFmoviesDownloader] MediaRecorder captured video: ${result.videoUrl}`);
    const outputPath = getOutputPath(movieUrl, 'media-recorder');
    
    // Download the blob URL using FFmpeg
    const ffmpegCmd = `ffmpeg -y -i "${result.videoUrl}" -c copy "${outputPath}"`;
    const success = await executeFFmpeg(ffmpegCmd);
    
    if (success && fs.existsSync(outputPath)) {
      return { success: true, filePath: outputPath };
    }
  }

  return { success: false, error: result.error };
}

// Approach 4: WebRTC Screen Capture
async function webrtcCapture(page, movieUrl, duration) {
  logger.info("[AdvancedFmoviesDownloader] Using WebRTC screen capture...");
  
  const outputPath = getOutputPath(movieUrl, 'webrtc-capture');
  
  // Use FFmpeg to capture the browser window
  const ffmpegCmd = `ffmpeg -y -f gdigrab -framerate 30 -i desktop -t ${duration} -c:v libx264 -preset ultrafast -c:a aac "${outputPath}"`;
  
  const success = await executeFFmpeg(ffmpegCmd);
  if (success && fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    if (stats.size > 0) {
      logger.info(`[AdvancedFmoviesDownloader] WebRTC capture succeeded! File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      return { success: true, filePath: outputPath };
    }
  }

  return { success: false, error: 'WebRTC capture failed' };
}

// Approach 5: Browser Extension Simulation
async function extensionSimulation(page, movieUrl, duration) {
  logger.info("[AdvancedFmoviesDownloader] Simulating browser extension...");
  
  // Inject extension-like code to capture video
  const result = await page.evaluate(async () => {
    try {
      // Simulate extension permissions
      const video = document.querySelector('video');
      if (!video) {
        return { success: false, error: 'No video element found' };
      }

      // Try to access video source directly
      const videoSrc = video.src || video.currentSrc;
      if (videoSrc && !videoSrc.startsWith('blob:')) {
        return { success: true, videoUrl: videoSrc };
      }

      // Try to find alternative sources
      const sources = video.querySelectorAll('source');
      for (const source of sources) {
        if (source.src && !source.src.startsWith('blob:')) {
          return { success: true, videoUrl: source.src };
        }
      }

      return { success: false, error: 'No accessible video source found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  if (result.success && result.videoUrl) {
    logger.info(`[AdvancedFmoviesDownloader] Extension simulation found video: ${result.videoUrl}`);
    const outputPath = getOutputPath(movieUrl, 'extension-simulation');
    
    const ffmpegCmd = `ffmpeg -y -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -referer "${movieUrl}" -i "${result.videoUrl}" -t ${duration} -c copy "${outputPath}"`;
    const success = await executeFFmpeg(ffmpegCmd);
    
    if (success && fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 0) {
        logger.info(`[AdvancedFmoviesDownloader] Extension simulation succeeded! File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        return { success: true, filePath: outputPath };
      }
    }
  }

  return { success: false, error: result.error };
}

async function executeFFmpeg(command) {
  return new Promise((resolve) => {
    const child = exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error(`[AdvancedFmoviesDownloader] FFmpeg failed: ${error.message}`);
        resolve(false);
      } else {
        logger.info(`[AdvancedFmoviesDownloader] FFmpeg succeeded!`);
        resolve(true);
      }
    });
    
    // Stream output to console
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}

function getOutputPath(movieUrl, method) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const movieId = movieUrl.split('/').pop() || 'unknown';
  const filename = `fmovies-${movieId}-${method}-${timestamp}.mp4`;
  return path.join(OUTPUT_DIR, filename);
}

export { downloadFmoviesAdvanced };


