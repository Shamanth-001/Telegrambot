import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());
const execAsync = promisify(exec);

/**
 * Extract HLS/MP4 stream URLs from Cataz JW Player
 * @param {string} movieUrl - Cataz movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function extractCatazStream(movieUrl, outputPath) {
  let browser;
  
  try {
    logger.info(`[CatazStreamExtractor] Starting extraction for: ${movieUrl}`);
    
    // Launch Puppeteer with stealth plugin and enhanced anti-detection
    browser = await puppeteer.launch({
      headless: true, // Changed to headless for better performance
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
        '--disable-client-side-phishing-detection',
        '--disable-sync',
        '--disable-default-apps',
        '--disable-extensions',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-component-extensions-with-background-pages'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic browser settings with enhanced stealth
    await page.setExtraHTTPHeaders({ 
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8', 
      'Referer': 'https://cataz.to/',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Use a more recent and realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    
    // Override webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Override the plugins property to use a custom getter
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Override the languages property to use a custom getter
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Override the permissions property to use a custom getter
      Object.defineProperty(navigator, 'permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' }),
        }),
      });
    });
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    let streamUrl = null;
    let m3u8Url = null;
    let mp4Url = null;
    
    // Enhanced network request interception to capture streaming URLs
    const capturedStreams = [];
    
    page.on('request', (request) => {
      const url = request.url();
      const resourceType = request.resourceType();
      
      // Block unnecessary resources to improve performance
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
        return;
      }
      
      // Enhanced stream detection
      if (url.includes('.m3u8') && !url.includes('trailer') && !url.includes('preview') && !url.includes('thumb')) {
        logger.info(`[CatazStreamExtractor] Found HLS stream: ${url}`);
        m3u8Url = url;
        streamUrl = url;
        capturedStreams.push(url);
      }
      
      // Look for MP4 streams
      if (url.includes('.mp4') && !url.includes('trailer') && !url.includes('preview') && !url.includes('thumb')) {
        logger.info(`[CatazStreamExtractor] Found MP4 stream: ${url}`);
        mp4Url = url;
        if (!streamUrl) streamUrl = url;
        capturedStreams.push(url);
      }
      
      // Look for DASH streams
      if (url.includes('.mpd') && !url.includes('trailer') && !url.includes('preview') && !url.includes('thumb')) {
        logger.info(`[CatazStreamExtractor] Found DASH stream: ${url}`);
        streamUrl = url;
        capturedStreams.push(url);
      }
      
      // Look for other video formats
      if ((url.includes('.webm') || url.includes('.mkv') || url.includes('.avi') || 
           url.includes('.mov') || url.includes('.flv')) && 
          !url.includes('trailer') && !url.includes('preview') && !url.includes('thumb')) {
        logger.info(`[CatazStreamExtractor] Found video stream: ${url}`);
        if (!streamUrl) streamUrl = url;
        capturedStreams.push(url);
      }
      
      // Look for streaming domains and CDNs (but exclude YouTube and JS libraries)
      if ((url.includes('stream') || url.includes('video') || url.includes('player') || 
           url.includes('embed') || url.includes('cdn')) && 
          !url.includes('youtube.com') && !url.includes('youtu.be') && 
          !url.includes('trailer') && !url.includes('preview') && !url.includes('thumb') &&
          !url.includes('.js') && !url.includes('.css') && !url.includes('cloudflare') &&
          !url.includes('jquery') && !url.includes('bootstrap') && !url.includes('vue')) {
        logger.info(`[CatazStreamExtractor] Found potential stream URL: ${url}`);
        capturedStreams.push(url);
      }
      
      request.continue();
    });
    
    // Navigate to movie page with retry logic
    logger.info(`[CatazStreamExtractor] Navigating to: ${movieUrl}`);
    
    let navigationSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(movieUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        
        // Wait for page to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
        
        // Check if we're on the right page
        const currentUrl = page.url();
        if (currentUrl.includes('cataz.to') || currentUrl.includes('watch')) {
          navigationSuccess = true;
          break;
        }
      } catch (error) {
        logger.warn(`[CatazStreamExtractor] Navigation attempt ${attempt} failed: ${error.message}`);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    if (!navigationSuccess) {
      throw new Error('Failed to navigate to movie page after 3 attempts');
    }
    
    // Enhanced play button detection and clicking
    logger.info(`[CatazStreamExtractor] Looking for big play button...`);
    
    // Wait for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Look for the big play button with enhanced detection
    const playButtonSelectors = [
      'a[href*="watch-movie"]',
      'a[href*="watch"]', 
      '.dp-w-c-play',  // Specific Cataz play button class
      '.btn.btn-radius.btn-focus',  // Specific Cataz watch button class
      'a[class*="btn"][href*="watch"]',  // Button links with watch
      'button[class*="watch"]',
      'button[class*="play"]',
      '[class*="watch"]',
      '[class*="play"]',
      'a[class*="btn"]',
      'button[class*="btn"]',
      'div[class*="play"]',
      'div[class*="watch"]',
      '.play-button',
      '.watch-button',
      '.btn-play',
      '.btn-watch'
    ];
    
    let playButtonFound = false;
    let playButtonInfo = null;
    
    // First, try to find the play button with enhanced detection
    for (const selector of playButtonSelectors) {
      try {
        const elements = await page.$$(selector);
        logger.info(`[CatazStreamExtractor] Checking selector ${selector}: found ${elements.length} elements`);
        
        for (const element of elements) {
          try {
            const isVisible = await element.isIntersectingViewport();
            const text = await element.evaluate(el => el.textContent?.trim() || '');
            const href = await element.evaluate(el => el.href || '');
            const className = await element.evaluate(el => el.className || '');
            
            logger.info(`[CatazStreamExtractor] Element: "${text}" (visible: ${isVisible}, href: ${href}, class: ${className})`);
            
            // Check if this is a valid play/watch button (remove visibility requirement)
            if ((
              text.toLowerCase().includes('watch') || 
              text.toLowerCase().includes('play') || 
              text.toLowerCase().includes('start') ||
              href.includes('watch-movie') ||
              href.includes('watch') ||
              className.includes('dp-w-c-play') ||
              className.includes('btn-focus')
            )) {
              playButtonInfo = {
                element: element,
                selector: selector,
                text: text,
                isVisible: isVisible,
                href: href,
                className: className
              };
              playButtonFound = true;
              logger.info(`[CatazStreamExtractor] Found play button: ${selector} - "${text}" (href: ${href})`);
              break;
            }
          } catch (elementError) {
            logger.debug(`[CatazStreamExtractor] Error checking element: ${elementError.message}`);
          }
        }
        if (playButtonFound) break;
    } catch (error) {
        logger.debug(`[CatazStreamExtractor] Selector ${selector} not found: ${error.message}`);
      }
    }
    
    if (playButtonFound && playButtonInfo) {
      try {
        logger.info(`[CatazStreamExtractor] Found play button: "${playButtonInfo.text}" (href: ${playButtonInfo.href})`);
        
        // Try to click the button first, but if it fails, navigate directly
        let navigationSuccess = false;
        
        try {
          // Scroll to button
          await playButtonInfo.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try to click the button
          await playButtonInfo.element.click();
          logger.info(`[CatazStreamExtractor] Clicked play button`);
          
          // Wait for navigation
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
            logger.info(`[CatazStreamExtractor] Successfully navigated to streaming page: ${page.url()}`);
            navigationSuccess = true;
          } catch (navError) {
            logger.info(`[CatazStreamExtractor] No navigation after click, trying direct navigation...`);
          }
        } catch (clickError) {
          logger.warn(`[CatazStreamExtractor] Button click failed: ${clickError.message}, trying direct navigation...`);
        }
        
        // If click didn't work, navigate directly to the watch-movie URL
        if (!navigationSuccess && playButtonInfo.href && playButtonInfo.href.includes('watch-movie')) {
          logger.info(`[CatazStreamExtractor] Directly navigating to watch-movie URL: ${playButtonInfo.href}`);
          await page.goto(playButtonInfo.href, { waitUntil: 'networkidle2' });
          logger.info(`[CatazStreamExtractor] Navigated to: ${page.url()}`);
          navigationSuccess = true;
        }
        
        if (!navigationSuccess) {
          throw new Error('Failed to navigate to streaming page');
        }
        
        // Wait for streaming page to load
      await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        logger.error(`[CatazStreamExtractor] Failed to access streaming page: ${error.message}`);
        throw new Error('Failed to access streaming page');
      }
    } else {
      logger.warn(`[CatazStreamExtractor] No play button found, proceeding with current page`);
    }
    
    // Wait for video player to load with multiple detection methods
    logger.info(`[CatazStreamExtractor] Waiting for video player to load...`);
    
    const playerSelectors = [
      'video',
      '.jwplayer',
      '[class*="player"]',
      '[class*="video"]',
      '[id*="player"]',
      '[id*="video"]',
      'iframe[src*="player"]',
      'iframe[src*="embed"]',
      '.embed-responsive',
      '.video-container'
    ];
    
    let playerDetected = false;
    for (const selector of playerSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        logger.info(`[CatazStreamExtractor] Player detected with selector: ${selector}`);
        playerDetected = true;
        break;
      } catch (error) {
        logger.debug(`[CatazStreamExtractor] Selector ${selector} not found: ${error.message}`);
      }
    }
    
    if (playerDetected) {
      // Wait for streams to load
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Try to extract stream URL from video element
      const videoInfo = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          return {
            src: video.src || video.currentSrc,
            sources: Array.from(video.querySelectorAll('source')).map(s => s.src),
            duration: video.duration,
            readyState: video.readyState
          };
        }
        return null;
      });
      
      if (videoInfo && videoInfo.src && videoInfo.src !== 'blob:') {
        logger.info(`[CatazStreamExtractor] Found video source: ${videoInfo.src}`);
        streamUrl = videoInfo.src;
      } else if (videoInfo && videoInfo.sources && videoInfo.sources.length > 0) {
        logger.info(`[CatazStreamExtractor] Found video sources: ${videoInfo.sources.join(', ')}`);
        streamUrl = videoInfo.sources[0];
      }
      
      // Also check for iframe players with enhanced detection
      const iframeInfo = await page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe[src]');
        const results = [];
        
        for (const iframe of iframes) {
          const src = iframe.src;
          if (src && (src.includes('player') || src.includes('embed') || src.includes('youtube') || src.includes('vimeo') || src.includes('videostr.net') || src.includes('stream'))) {
            results.push(src);
          }
        }
        
        return results;
      });
      
      if (iframeInfo && iframeInfo.length > 0) {
        logger.info(`[CatazStreamExtractor] Found iframe players: ${iframeInfo.join(', ')}`);
        
        // Try to extract streams from iframe players
        for (const iframeUrl of iframeInfo) {
          if (iframeUrl.includes('videostr.net') || iframeUrl.includes('player') || iframeUrl.includes('embed')) {
            logger.info(`[CatazStreamExtractor] Extracting streams from iframe: ${iframeUrl}`);
            
            try {
              // Navigate to the iframe URL
              await page.goto(iframeUrl, { waitUntil: 'networkidle2' });
              logger.info(`[CatazStreamExtractor] Navigated to iframe: ${iframeUrl}`);
              
              // Wait for iframe to load
              await new Promise(resolve => setTimeout(resolve, 10000));
              
              // Try to find video elements in iframe with enhanced detection
              const iframeVideoInfo = await page.evaluate(() => {
                const results = [];
                
                // Look for video elements
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                  if (video.src && video.src !== 'blob:') {
                    results.push({ type: 'video', url: video.src });
                  }
                  if (video.currentSrc && video.currentSrc !== 'blob:' && video.currentSrc !== video.src) {
                    results.push({ type: 'video-current', url: video.currentSrc });
                  }
                });
                
                // Look for source elements
                const sources = document.querySelectorAll('source');
                sources.forEach(source => {
                  if (source.src) {
                    results.push({ type: 'source', url: source.src });
                  }
                });
                
                // Look for iframe elements (nested iframes)
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                  if (iframe.src && (iframe.src.includes('player') || iframe.src.includes('embed') || iframe.src.includes('stream'))) {
                    results.push({ type: 'nested-iframe', url: iframe.src });
                  }
                });
                
                // Look for JavaScript variables that might contain stream URLs
                const scriptTags = document.querySelectorAll('script');
                scriptTags.forEach(script => {
                  const content = script.textContent || '';
                  // Look for common streaming patterns
                  const patterns = [
                    /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,
                    /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi,
                    /https?:\/\/[^"'\s]+\.webm[^"'\s]*/gi,
                    /https?:\/\/[^"'\s]+\.mkv[^"'\s]*/gi,
                    /https?:\/\/[^"'\s]+\.avi[^"'\s]*/gi,
                    /https?:\/\/[^"'\s]+\.mov[^"'\s]*/gi,
                    /https?:\/\/[^"'\s]+\.flv[^"'\s]*/gi
                  ];
                  
                  patterns.forEach(pattern => {
                    const matches = content.match(pattern);
                    if (matches) {
                      matches.forEach(match => {
                        if (!match.includes('trailer') && !match.includes('preview') && !match.includes('thumb')) {
                          results.push({ type: 'script-stream', url: match });
                        }
                      });
                    }
                  });
                });
                
                // Look for data attributes
                const elementsWithData = document.querySelectorAll('[data-src], [data-url], [data-stream], [data-video]');
                elementsWithData.forEach(element => {
                  const dataSrc = element.getAttribute('data-src');
                  const dataUrl = element.getAttribute('data-url');
                  const dataStream = element.getAttribute('data-stream');
                  const dataVideo = element.getAttribute('data-video');
                  
                  [dataSrc, dataUrl, dataStream, dataVideo].forEach(url => {
                    if (url && (url.includes('.mp4') || url.includes('.m3u8') || url.includes('.webm') || url.includes('.mkv'))) {
                      results.push({ type: 'data-attribute', url: url });
                    }
                  });
                });
                
                return results;
              });
              
              if (iframeVideoInfo && iframeVideoInfo.length > 0) {
                logger.info(`[CatazStreamExtractor] Found ${iframeVideoInfo.length} streams in iframe`);
                for (const stream of iframeVideoInfo) {
                  logger.info(`[CatazStreamExtractor] Iframe stream (${stream.type}): ${stream.url}`);
                  capturedStreams.push(stream.url);
                }
                
                if (!streamUrl) {
                  streamUrl = iframeVideoInfo[0].url;
                }
              } else {
                logger.info(`[CatazStreamExtractor] No direct video streams found in iframe, trying DRM bypass approach...`);
                
                // Try to use the iframe URL directly with DRM bypass tools
                if (iframeUrl.includes('videostr.net') || iframeUrl.includes('player')) {
                  logger.info(`[CatazStreamExtractor] Using iframe URL for DRM bypass: ${iframeUrl}`);
                  capturedStreams.push(iframeUrl);
                  if (!streamUrl) {
                    streamUrl = iframeUrl;
                  }
                }
              }
              
              // Navigate back to original page
              await page.goto(movieUrl, { waitUntil: 'networkidle2' });
              
            } catch (iframeError) {
              logger.warn(`[CatazStreamExtractor] Iframe extraction failed: ${iframeError.message}`);
            }
          }
        }
        
        if (!streamUrl && iframeInfo.length > 0) {
          streamUrl = iframeInfo[0];
        }
      }
      
      // Check for dynamically loaded content and JavaScript variables
      const dynamicContent = await page.evaluate(() => {
        const results = {
          windowVars: [],
          scriptVars: [],
          dataAttributes: []
        };
        
        // Check window variables
        const windowKeys = Object.keys(window);
        for (const key of windowKeys) {
          if (key.toLowerCase().includes('stream') || 
              key.toLowerCase().includes('video') || 
              key.toLowerCase().includes('player') ||
              key.toLowerCase().includes('source')) {
            try {
              const value = window[key];
              if (typeof value === 'string' && (value.includes('http') || value.includes('.m3u8') || value.includes('.mp4'))) {
                results.windowVars.push(`${key}: ${value}`);
              }
            } catch (e) {
              // Ignore errors accessing window properties
            }
          }
        }
        
        // Check for data attributes on video elements
        const videoElements = document.querySelectorAll('video, [data-src], [data-stream], [data-url]');
        for (const element of videoElements) {
          const attrs = element.attributes;
          for (const attr of attrs) {
            if (attr.name.includes('src') || attr.name.includes('stream') || attr.name.includes('url')) {
              if (attr.value && (attr.value.includes('http') || attr.value.includes('.m3u8') || attr.value.includes('.mp4'))) {
                results.dataAttributes.push(`${attr.name}: ${attr.value}`);
              }
            }
          }
        }
        
        return results;
      });
      
      if (dynamicContent.windowVars.length > 0 || dynamicContent.dataAttributes.length > 0) {
        logger.info(`[CatazStreamExtractor] Found dynamic content:`, dynamicContent);
        
        // Try to extract URLs from dynamic content
        const allDynamicUrls = [...dynamicContent.windowVars, ...dynamicContent.dataAttributes];
        for (const item of allDynamicUrls) {
          const urlMatch = item.match(/https?:\/\/[^\s]+/);
          if (urlMatch) {
            const url = urlMatch[0];
            if (!url.includes('recaptcha') && !url.includes('google') && !url.includes('analytics')) {
              logger.info(`[CatazStreamExtractor] Found dynamic stream URL: ${url}`);
              if (!streamUrl) {
                streamUrl = url;
              }
            }
          }
        }
      }
    } else {
      logger.warn(`[CatazStreamExtractor] No video player detected, continuing with stream extraction...`);
    }
    
    // If no stream URL found, try to extract from page content
    if (!streamUrl) {
      logger.info(`[CatazStreamExtractor] Extracting stream URL from page content...`);
      
      const pageContent = await page.evaluate(() => {
        const results = {
          hls: [],
          mp4: [],
          dash: [],
          other: []
        };
        
        // Look for common streaming patterns in the page
        const scripts = Array.from(document.querySelectorAll('script'));
        const allText = document.body.innerText + ' ' + scripts.map(s => s.textContent).join(' ');
        
        // Enhanced regex patterns for different stream types
        const patterns = {
          hls: [
            /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,
            /["']([^"']*\.m3u8[^"']*)["']/gi,
            /src\s*[:=]\s*["']([^"']*\.m3u8[^"']*)["']/gi
          ],
          mp4: [
            /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi,
            /["']([^"']*\.mp4[^"']*)["']/gi,
            /src\s*[:=]\s*["']([^"']*\.mp4[^"']*)["']/gi
          ],
          dash: [
            /https?:\/\/[^"'\s]+\.mpd[^"'\s]*/gi,
            /["']([^"']*\.mpd[^"']*)["']/gi
          ],
          other: [
            /https?:\/\/[^"'\s]+\.(webm|mkv|avi|mov|flv)[^"'\s]*/gi,
            /["']([^"']*\.(webm|mkv|avi|mov|flv)[^"']*)["']/gi
          ]
        };
        
        // Extract URLs using all patterns
        for (const [type, patternList] of Object.entries(patterns)) {
          for (const pattern of patternList) {
            const matches = allText.match(pattern);
            if (matches) {
              results[type].push(...matches.filter(m => 
                !m.includes('trailer') && 
                !m.includes('preview') && 
                !m.includes('thumb') &&
                !m.includes('recaptcha') &&
                !m.includes('google') &&
                !m.includes('analytics') &&
                m.length > 10
              ));
            }
          }
        }
        
        // Remove duplicates and prioritize by type
        for (const type of Object.keys(results)) {
          results[type] = [...new Set(results[type])];
        }
        
        return results;
      });
      
      // Prioritize stream types
      const streamTypes = ['hls', 'mp4', 'dash', 'other'];
      for (const type of streamTypes) {
        if (pageContent[type] && pageContent[type].length > 0) {
          const selectedUrl = pageContent[type][0];
          logger.info(`[CatazStreamExtractor] Found ${type.toUpperCase()} stream URL: ${selectedUrl}`);
          streamUrl = selectedUrl;
            break;
        }
      }
      
      // Log all found streams for debugging
      logger.info(`[CatazStreamExtractor] All found streams:`, pageContent);
    }
    
    // Final fallback: Try to trigger video loading by simulating user interaction
    if (!streamUrl) {
      logger.info(`[CatazStreamExtractor] Trying final fallback - simulating user interaction...`);
      
      try {
        // Try to click on video elements to trigger loading
        const videoElements = await page.$$('video, [class*="player"], [class*="video"]');
        for (const element of videoElements) {
          try {
            await element.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (e) {
            // Ignore click errors
          }
        }
        
        // Wait a bit more for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try to extract again after interaction
        const postInteractionUrl = await page.evaluate(() => {
          const video = document.querySelector('video');
          if (video && video.src && video.src !== 'blob:') {
            return video.src;
          }
          return null;
        });
        
        if (postInteractionUrl) {
          logger.info(`[CatazStreamExtractor] Found stream URL after interaction: ${postInteractionUrl}`);
          streamUrl = postInteractionUrl;
        }
      } catch (error) {
        logger.warn(`[CatazStreamExtractor] Final fallback failed: ${error.message}`);
      }
    }
    
    // Prioritize captured streams over YouTube embeds
    if (capturedStreams.length > 0) {
      // Filter out YouTube embeds and prioritize real streaming URLs
      const realStreams = capturedStreams.filter(url => 
        !url.includes('youtube.com') && !url.includes('youtu.be') &&
        !url.includes('embed') && !url.includes('trailer')
      );
      
      if (realStreams.length > 0) {
        streamUrl = realStreams[0];
        logger.info(`[CatazStreamExtractor] Using captured stream URL: ${streamUrl}`);
      } else {
        logger.warn(`[CatazStreamExtractor] All captured streams are YouTube embeds, using fallback`);
      }
    }
    
    if (!streamUrl) {
      throw new Error('No stream URL found on Cataz page');
    }
    
    logger.info(`[CatazStreamExtractor] Final stream URL: ${streamUrl}`);
    logger.info(`[CatazStreamExtractor] Total captured streams: ${capturedStreams.length}`);
    
        // Check if we have a DRM-protected iframe URL that needs special handling
        if (streamUrl && (streamUrl.includes('videostr.net') || streamUrl.includes('embed') || streamUrl.includes('player'))) {
          logger.info(`[CatazStreamExtractor] Detected iframe player, using enhanced iframe handler...`);
          
          try {
            // Use enhanced iframe handler that mimics play button behavior
            const { handleIframeWithPlayButton } = await import('./enhanced-iframe-handler.js');
            
            const enhancedResult = await handleIframeWithPlayButton(streamUrl, outputPath);
            
            if (enhancedResult.success) {
              logger.info(`[CatazStreamExtractor] Enhanced iframe handler successful: ${enhancedResult.filePath} (${(enhancedResult.fileSize / 1024 / 1024).toFixed(2)} MB)`);
              return {
                success: true,
                filePath: enhancedResult.filePath,
                fileSize: enhancedResult.fileSize,
                method: enhancedResult.method || 'Enhanced Iframe Handler',
                streamUrl: enhancedResult.streamUrl,
                allStreams: enhancedResult.allStreams,
                drmRequests: enhancedResult.drmRequests
              };
            } else {
              logger.warn(`[CatazStreamExtractor] Enhanced iframe handler failed: ${enhancedResult.error}`);
              
              // If enhanced handler fails, try DRM bypass as fallback
              logger.info(`[CatazStreamExtractor] Trying DRM bypass as fallback...`);
              const { downloadWithSmartFallback } = await import('./drm-bypass-tools.js');
              
              const drmResult = await downloadWithSmartFallback(streamUrl, outputPath);
              
              if (drmResult.success) {
                logger.info(`[CatazStreamExtractor] DRM bypass fallback successful: ${drmResult.filePath} (${(drmResult.fileSize / 1024 / 1024).toFixed(2)} MB)`);
                return {
                  success: true,
                  filePath: drmResult.filePath,
                  fileSize: drmResult.fileSize,
                  method: drmResult.source || 'DRM Bypass Fallback',
                  streamUrl: streamUrl,
                  duration: drmResult.duration || 0
                };
              } else {
                logger.warn(`[CatazStreamExtractor] DRM bypass fallback also failed: ${drmResult.error}`);
                return {
                  success: false,
                  error: `Both enhanced iframe handler and DRM bypass failed. Enhanced handler: ${enhancedResult.error}. DRM bypass: ${drmResult.error}`,
                  suggestion: 'The iframe may be completely broken or require special authentication. Try accessing the video manually in a browser.',
                  iframeStatus: enhancedResult.iframeStatus || 'failed',
                  allStreams: enhancedResult.allStreams
                };
              }
            }
          } catch (enhancedError) {
            logger.warn(`[CatazStreamExtractor] Enhanced iframe handler not available: ${enhancedError.message}`);
            
            // Fallback to basic iframe check
            try {
              const iframePage = await browser.newPage();
              await iframePage.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
              });
              
              await iframePage.goto(streamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              const iframeTitle = await iframePage.title();
              const iframeBody = await iframePage.evaluate(() => document.body.textContent);
              
              await iframePage.close();
              
              // Check if the iframe is broken
              if (iframeTitle.includes('File not found') || iframeTitle.includes('We can\'t find') || 
                  iframeBody.includes('File not found') || iframeBody.includes('We can\'t find')) {
                logger.error(`[CatazStreamExtractor] Iframe is broken: ${iframeTitle}`);
                return {
                  success: false,
                  error: 'The video file has been removed or is no longer available. This is a common issue with streaming sites where files get taken down due to copyright issues.',
                  suggestion: 'Try a different movie or check if the movie is available on other streaming platforms.',
                  iframeStatus: 'broken',
                  iframeTitle: iframeTitle
                };
              }
            } catch (basicError) {
              logger.warn(`[CatazStreamExtractor] Basic iframe check also failed: ${basicError.message}`);
            }
          }
        }
        
        // Enhanced URL validation to prevent favicon and non-video downloads
        if (streamUrl) {
          const invalidExtensions = /\.(png|jpg|jpeg|ico|gif|css|js|woff|woff2|ttf|svg|webp|bmp|tiff)$/i;
          const invalidKeywords = ['favicon', 'analytics', 'google', 'tracking', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'ads', 'advertisement', 'banner', 'logo', 'icon', 'thumbnail', 'preview', 'poster', 'cover'];
          const validVideoPatterns = /\.(m3u8|mpd|mp4|ts|webm|mkv|avi|mov|flv|m4v|3gp|wmv)$/i;
          
          // Check for invalid extensions
          if (invalidExtensions.test(streamUrl)) {
            logger.error(`[CatazStreamExtractor] Invalid extension detected: ${streamUrl}`);
            return {
              success: false,
              error: 'The system detected a non-video resource (favicon, image, CSS, JS, etc.) instead of the actual movie stream.',
              suggestion: 'The video stream may be loading dynamically. Try clicking the play button manually to trigger the stream loading.',
              detectedUrl: streamUrl,
              urlType: 'invalid-extension'
            };
          }
          
          // Check for invalid keywords
          const lowerUrl = streamUrl.toLowerCase();
          for (const keyword of invalidKeywords) {
            if (lowerUrl.includes(keyword)) {
              logger.error(`[CatazStreamExtractor] Invalid keyword '${keyword}' detected: ${streamUrl}`);
              return {
                success: false,
                error: `The system detected a non-video resource containing '${keyword}' instead of the actual movie stream.`,
                suggestion: 'The video stream may be loading dynamically. Try clicking the play button manually to trigger the stream loading.',
                detectedUrl: streamUrl,
                urlType: 'invalid-keyword'
              };
            }
          }
          
          // Check for valid video patterns
          if (!validVideoPatterns.test(streamUrl)) {
            logger.warn(`[CatazStreamExtractor] No valid video pattern detected: ${streamUrl}`);
            // Don't return error here, just log warning and continue
          }
        }
    
    // Download using yt-dlp with enhanced configuration
    logger.info(`[CatazStreamExtractor] Downloading with yt-dlp...`);
    
    // Get cookies and headers from the page
    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Enhanced yt-dlp command with multiple fallback options
    const ytdlpCommands = [
      // Primary command with full headers
      `yt-dlp -o "${outputPath}" --no-playlist --add-header "Referer: ${movieUrl}" --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" --add-header "Cookie: ${cookieHeader}" --add-header "Accept: */*" --add-header "Accept-Language: en-US,en;q=0.9" --add-header "Accept-Encoding: gzip, deflate, br" --add-header "Cache-Control: no-cache" --add-header "Pragma: no-cache" --retries 3 --fragment-retries 3 --socket-timeout 30 --concurrent-fragments 4 "${streamUrl}"`,
      
      // Fallback command with minimal headers
      `yt-dlp -o "${outputPath}" --no-playlist --add-header "Referer: ${movieUrl}" --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" --retries 2 --fragment-retries 2 "${streamUrl}"`,
      
      // Basic command without headers
      `yt-dlp -o "${outputPath}" --no-playlist --retries 2 "${streamUrl}"`
    ];
    
    let downloadSuccess = false;
    let downloadError = null;
    
    for (let i = 0; i < ytdlpCommands.length; i++) {
      try {
        logger.info(`[CatazStreamExtractor] Trying download method ${i + 1}/${ytdlpCommands.length}`);
        const { stdout, stderr } = await execAsync(ytdlpCommands[i], { 
          timeout: 600000, // 10 minutes timeout
          maxBuffer: 1024 * 1024 * 50 // 50MB buffer
        });
      
      logger.info(`[CatazStreamExtractor] yt-dlp stdout: ${stdout}`);
      if (stderr) logger.info(`[CatazStreamExtractor] yt-dlp stderr: ${stderr}`);
      
        // Check for downloaded file with multiple extensions
        const possiblePaths = [
          outputPath,
          outputPath + '.mp4',
          outputPath + '.webm',
          outputPath + '.mkv',
          outputPath + '.avi',
          outputPath + '.mov',
          outputPath + '.flv'
        ];
      
      let downloadedFile = null;
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            const stats = fs.statSync(path);
            if (stats.size > 1024) { // At least 1KB
              downloadedFile = path;
              break;
            }
          }
      }
      
      if (downloadedFile) {
        const stats = fs.statSync(downloadedFile);
        const fileSize = stats.size;
        
        logger.info(`[CatazStreamExtractor] Download successful: ${downloadedFile} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
          downloadSuccess = true;
        return {
          success: true,
          filePath: downloadedFile,
          fileSize: fileSize,
          streamUrl: streamUrl,
            source: 'Cataz Stream Extractor',
            method: `yt-dlp method ${i + 1}`,
            stdout: stdout,
            stderr: stderr
        };
      } else {
          throw new Error('Downloaded file not found or too small');
        }
        
      } catch (error) {
        logger.warn(`[CatazStreamExtractor] Download method ${i + 1} failed: ${error.message}`);
        downloadError = error;
        
        // Clean up any partial files
        const possiblePaths = [
          outputPath,
          outputPath + '.mp4',
          outputPath + '.webm',
          outputPath + '.mkv',
          outputPath + '.avi',
          outputPath + '.mov',
          outputPath + '.flv'
        ];
        
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            try {
              fs.unlinkSync(path);
            } catch (cleanupError) {
              logger.debug(`[CatazStreamExtractor] Could not clean up ${path}: ${cleanupError.message}`);
            }
          }
        }
        
        if (i < ytdlpCommands.length - 1) {
          logger.info(`[CatazStreamExtractor] Trying next download method...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!downloadSuccess) {
      throw new Error(`All download methods failed. Last error: ${downloadError?.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    logger.error(`[CatazStreamExtractor] Error: ${error.message}`);
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











