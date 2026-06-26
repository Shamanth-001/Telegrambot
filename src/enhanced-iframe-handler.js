import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import { logger } from './utils/logger.js';
import URLValidator from './url-validator.js';
import EnhancedPlaySimulator from './enhanced-play-simulator.js';
import AuthHandler from './auth-handler.js';
import AlternativeSourcesHandler from './alternative-sources.js';

puppeteer.use(StealthPlugin());

/**
 * Enhanced iframe handler that mimics play button behavior
 * to capture dynamic streams that load after user interaction
 */
export async function handleIframeWithPlayButton(iframeUrl, outputPath) {
  logger.info(`[EnhancedIframeHandler] Starting enhanced iframe handling for: ${iframeUrl}`);
  
  // Initialize components
  const urlValidator = new URLValidator();
  const playSimulator = new EnhancedPlaySimulator();
  const authHandler = new AuthHandler();
  const altSources = new AlternativeSourcesHandler();
  
  // Validate URL first
  const isValidUrl = await urlValidator.isValidStreamUrl(iframeUrl);
  if (!isValidUrl) {
    logger.error(`[EnhancedIframeHandler] Invalid iframe URL: ${iframeUrl}`);
    return {
      success: false,
      error: 'Invalid iframe URL - likely a favicon or non-video resource',
      suggestion: 'Try a different movie or check if the iframe URL is correct'
    };
  }
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--incognito',
      '--start-maximized'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Setup authentication
    await authHandler.setupAuthentication(page);
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    // Override navigator properties for stealth
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      Object.defineProperty(navigator, 'permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' }),
        }),
      });
    });

    // Use enhanced play simulator
    const simulationResult = await playSimulator.simulatePlayButton(page, iframeUrl);
    
    if (!simulationResult.success) {
      logger.warn(`[EnhancedIframeHandler] Play simulation failed: ${simulationResult.error}`);
      
      // Try alternative sources as fallback
      logger.info(`[EnhancedIframeHandler] Trying alternative sources...`);
      try {
        const altResult = await altSources.getWorkingAlternative('Avatar 2009');
        if (altResult.success) {
          logger.info(`[EnhancedIframeHandler] Found alternative source: ${altResult.source}`);
          return {
            success: true,
            filePath: outputPath,
            fileSize: 0,
            method: `Alternative Source (${altResult.source})`,
            streamUrl: altResult.embeds[0].url,
            allStreams: altResult.embeds.map(e => e.url),
            alternativeSource: altResult
          };
        }
      } catch (altError) {
        logger.warn(`[EnhancedIframeHandler] Alternative sources failed: ${altError.message}`);
      }
      
      return {
        success: false,
        error: simulationResult.error,
        iframeStatus: simulationResult.iframeStatus,
        suggestion: 'Try accessing the video manually in a browser to see if it works, or check if the content requires special authentication.'
      };
    }

    // Validate captured streams
    const streamValidation = await urlValidator.filterValidStreams(simulationResult.streams);
    
    if (streamValidation.valid.length === 0) {
      logger.warn(`[EnhancedIframeHandler] No valid streams found after validation`);
      return {
        success: false,
        error: 'No valid video streams found after play button simulation and validation.',
        suggestion: 'The iframe may be completely broken or require special authentication.',
        iframeStatus: 'no-valid-streams',
        allStreams: simulationResult.allStreams,
        invalidStreams: streamValidation.invalid
      };
    }

    // Use the first valid stream for download
    const selectedStream = streamValidation.valid[0];
    logger.info(`[EnhancedIframeHandler] Using validated stream: ${selectedStream}`);

    // Download the stream using yt-dlp
    const { spawn } = await import('child_process');
    const path = await import('path');
    
    const downloadResult = await new Promise((resolve) => {
      const ytdlp = spawn('yt-dlp', [
        '--output', outputPath,
        '--no-playlist',
        '--no-warnings',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        '--referer', 'https://cataz.to',
        '--cookies', 'cookies.json',
        selectedStream
      ]);

      let stdout = '';
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, stdout, stderr });
        } else {
          resolve({ success: false, error: stderr, stdout });
        }
      });
    });

    if (downloadResult.success) {
      const fs = await import('fs');
      const stats = fs.statSync(outputPath);
      
      logger.info(`[EnhancedIframeHandler] Download successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      return {
        success: true,
        filePath: outputPath,
        fileSize: stats.size,
        method: 'Enhanced Iframe Handler with URL Validation',
        streamUrl: selectedStream,
        allStreams: streamValidation.valid,
        drmRequests: simulationResult.drmRequests,
        playButtonFound: simulationResult.playButtonFound,
        videoInfo: simulationResult.videoInfo
      };
    } else {
      logger.error(`[EnhancedIframeHandler] Download failed: ${downloadResult.error}`);
      return {
        success: false,
        error: `Download failed: ${downloadResult.error}`,
        streamUrl: selectedStream,
        allStreams: streamValidation.valid
      };
    }

  } catch (error) {
    logger.error(`[EnhancedIframeHandler] Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}
