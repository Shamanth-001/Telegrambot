import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());

/**
 * Enhanced play button simulator with network interception and authentication
 */
export class EnhancedPlaySimulator {
  constructor() {
    this.playButtonSelectors = [
      // Video.js selectors
      '.vjs-play-control',
      '.vjs-big-play-button',
      '.vjs-play-button',
      '.vjs-poster',
      
      // JW Player selectors
      '.jw-play',
      '.jw-display-icon-container',
      '.jw-icon-play',
      
      // Generic selectors
      '.play-button',
      '.btn-play',
      '.play-btn',
      '.start-button',
      '.watch-button',
      
      // Button and div selectors
      'button[class*="play"]',
      'button[class*="watch"]',
      'div[class*="play"]',
      'div[class*="watch"]',
      
      // Data attribute selectors
      '[data-testid*="play"]',
      '[data-testid*="watch"]',
      '[aria-label*="play"]',
      '[title*="play"]',
      
      // Custom player selectors
      '.player-play',
      '.video-play',
      '.stream-play',
      '.media-play',
      
      // SVG and icon selectors
      'button:has(svg)',
      'div:has(svg)',
      '.play-icon',
      '.watch-icon',
      
      // Iframe specific selectors
      'iframe[src*="player"]',
      'iframe[src*="embed"]',
      'iframe[src*="stream"]'
    ];
  }

  /**
   * Simulate play button interaction with enhanced detection
   */
  async simulatePlayButton(page, iframeUrl) {
    logger.info(`[EnhancedPlaySimulator] Starting play button simulation for: ${iframeUrl}`);
    
    const capturedStreams = [];
    const drmRequests = [];
    const networkRequests = [];

    // Set up network request interception
    page.on('request', (request) => {
      const url = request.url();
      const resourceType = request.resourceType();
      
      // Capture video streams
      if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('.mp4') || 
          url.includes('.webm') || url.includes('.mkv') || url.includes('.avi') ||
          (resourceType === 'media' && !url.includes('favicon'))) {
        logger.info(`[EnhancedPlaySimulator] Captured stream: ${url}`);
        capturedStreams.push(url);
      }
      
      // Capture DRM license requests
      if (url.includes('license') || url.includes('widevine') || url.includes('playready')) {
        logger.info(`[EnhancedPlaySimulator] DRM license request: ${url}`);
        drmRequests.push(url);
      }
      
      // Capture all network requests for analysis
      networkRequests.push({
        url: url,
        method: request.method(),
        resourceType: resourceType,
        headers: request.headers()
      });
    });

    // Navigate to iframe
    await page.goto(iframeUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    logger.info(`[EnhancedPlaySimulator] Navigated to iframe: ${iframeUrl}`);
    
    // Wait for initial content to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if iframe is broken
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body.textContent);
    
    if (title.includes('File not found') || title.includes('We can\'t find') || 
        bodyText.includes('File not found') || bodyText.includes('We can\'t find')) {
      logger.error(`[EnhancedPlaySimulator] Iframe is broken: ${title}`);
      return {
        success: false,
        error: 'Iframe is broken and shows "File not found" error',
        iframeStatus: 'broken',
        iframeTitle: title
      };
    }

    // Try to find and click play button
    logger.info(`[EnhancedPlaySimulator] Looking for play button...`);
    
    let playButtonFound = false;
    let playButtonInfo = null;

    for (const selector of this.playButtonSelectors) {
      try {
        const elements = await page.$$(selector);
        logger.info(`[EnhancedPlaySimulator] Checking selector ${selector}: found ${elements.length} elements`);
        
        for (const element of elements) {
          try {
            const isVisible = await element.isIntersectingViewport();
            const text = await element.evaluate(el => el.textContent?.trim() || '');
            const tagName = await element.evaluate(el => el.tagName.toLowerCase());
            const className = await element.evaluate(el => el.className || '');
            const ariaLabel = await element.evaluate(el => el.getAttribute('aria-label') || '');
            
            logger.info(`[EnhancedPlaySimulator] Element: ${tagName} "${text}" (visible: ${isVisible}, class: ${className}, aria: ${ariaLabel})`);
            
            // Check if this is a valid play button
            if (tagName === 'video' || 
                text.toLowerCase().includes('play') || 
                text.toLowerCase().includes('start') ||
                text.toLowerCase().includes('watch') ||
                ariaLabel.toLowerCase().includes('play') ||
                ariaLabel.toLowerCase().includes('start') ||
                className.includes('play') ||
                className.includes('watch') ||
                selector.includes('play')) {
              playButtonInfo = {
                element: element,
                selector: selector,
                text: text,
                isVisible: isVisible,
                tagName: tagName,
                className: className,
                ariaLabel: ariaLabel
              };
              playButtonFound = true;
              logger.info(`[EnhancedPlaySimulator] Found play button: ${selector} - "${text}"`);
              break;
            }
          } catch (elementError) {
            logger.debug(`[EnhancedPlaySimulator] Error checking element: ${elementError.message}`);
          }
        }
        if (playButtonFound) break;
      } catch (error) {
        logger.debug(`[EnhancedPlaySimulator] Selector ${selector} not found: ${error.message}`);
      }
    }

    if (playButtonFound && playButtonInfo) {
      try {
        logger.info(`[EnhancedPlaySimulator] Attempting to click play button...`);
        
        // Scroll to button if needed
        await playButtonInfo.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try different click methods
        try {
          await playButtonInfo.element.click();
          logger.info(`[EnhancedPlaySimulator] Clicked play button successfully`);
        } catch (clickError) {
          logger.warn(`[EnhancedPlaySimulator] Direct click failed, trying JavaScript click...`);
          await playButtonInfo.element.evaluate(el => el.click());
        }
        
        // Wait for stream to load after click
        logger.info(`[EnhancedPlaySimulator] Waiting for stream to load after click...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        
      } catch (error) {
        logger.warn(`[EnhancedPlaySimulator] Play button click failed: ${error.message}`);
      }
    } else {
      logger.info(`[EnhancedPlaySimulator] No play button found, trying to trigger video play directly...`);
      
      // Try to trigger video play programmatically
      try {
        await page.evaluate(() => {
          const videos = document.querySelectorAll('video');
          videos.forEach(video => {
            if (video.paused) {
              video.play().catch(e => console.log('Video play failed:', e));
            }
          });
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.warn(`[EnhancedPlaySimulator] Programmatic video play failed: ${error.message}`);
      }
    }

    // Wait longer for dynamic content to load
    logger.info(`[EnhancedPlaySimulator] Waiting for dynamic content to load...`);
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Check for video elements and sources
    const videoInfo = await page.evaluate(() => {
      const results = [];
      
      // Check video elements
      const videos = document.querySelectorAll('video');
      videos.forEach((video, index) => {
        results.push({
          type: 'video',
          index: index,
          src: video.src,
          currentSrc: video.currentSrc,
          poster: video.poster,
          duration: video.duration,
          readyState: video.readyState,
          paused: video.paused,
          ended: video.ended
        });
      });
      
      // Check source elements
      const sources = document.querySelectorAll('source');
      sources.forEach((source, index) => {
        results.push({
          type: 'source',
          index: index,
          src: source.src,
          type: source.type
        });
      });
      
      return results;
    });

    logger.info(`[EnhancedPlaySimulator] Found ${videoInfo.length} video elements/sources`);
    videoInfo.forEach(info => {
      logger.info(`[EnhancedPlaySimulator] ${info.type}: ${info.src || info.currentSrc} (paused: ${info.paused}, ended: ${info.ended})`);
    });

    // Check for JavaScript variables that might contain stream URLs
    const jsStreams = await page.evaluate(() => {
      const results = [];
      
      // Check window variables
      for (const key in window) {
        if (typeof window[key] === 'string' && 
            (window[key].includes('.m3u8') || window[key].includes('.mpd') || 
             window[key].includes('.mp4') || window[key].includes('.webm'))) {
          results.push(`${key}: ${window[key]}`);
        }
      }
      
      return results;
    });

    if (jsStreams.length > 0) {
      logger.info(`[EnhancedPlaySimulator] Found JavaScript streams:`);
      jsStreams.forEach(stream => logger.info(`[EnhancedPlaySimulator] ${stream}`));
    }

    // Combine all captured streams
    const allStreams = [...capturedStreams];
    videoInfo.forEach(info => {
      if (info.src) allStreams.push(info.src);
      if (info.currentSrc && info.currentSrc !== info.src) allStreams.push(info.currentSrc);
    });

    // Filter out invalid streams
    const validStreams = allStreams.filter(url => 
      url && 
      !url.includes('favicon') && 
      !url.includes('analytics') && 
      !url.includes('google') &&
      !url.match(/\.(ico|png|jpg|jpeg|gif|css|js)$/i)
    );

    logger.info(`[EnhancedPlaySimulator] Total valid streams found: ${validStreams.length}`);
    validStreams.forEach(stream => logger.info(`[EnhancedPlaySimulator] Valid stream: ${stream}`));

    return {
      success: validStreams.length > 0,
      streams: validStreams,
      allStreams: allStreams,
      videoInfo: videoInfo,
      jsStreams: jsStreams,
      drmRequests: drmRequests,
      networkRequests: networkRequests,
      playButtonFound: playButtonFound,
      playButtonInfo: playButtonInfo
    };
  }
}

export default EnhancedPlaySimulator;





