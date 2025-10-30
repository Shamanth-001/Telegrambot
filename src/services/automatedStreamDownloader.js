import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { exec } from 'child_process';
import util from 'util';
import { logger } from '../utils/logger.js';

puppeteer.use(StealthPlugin());
const execPromise = util.promisify(exec);

// Streaming sites configuration
const sites = [
  {
    name: 'Hicine',
    searchUrl: 'https://hicine.info/search/{query}',
    selectors: ['.movie-item a', '.film-item a', 'a[href*="/movie/"]', 'a[href*="/watch/"]']
  },
  {
    name: 'Einthusan',
    searchUrl: 'https://einthusan.tv/movie/results/?lang=kannada&query={query}',
    selectors: ['a[href*="/movie/watch/"]']
  },
  {
    name: 'Yesmovies',
    searchUrl: 'https://yesmovies.ag/search/{query}',
    selectors: ['.movie-item a', '.film-item a']
  },
  {
    name: 'HDToday',
    searchUrl: 'https://hdtoday.tv/search/{query}',
    selectors: ['.movie-item a', '.film-item a']
  },
  {
    name: 'Putlocker',
    searchUrl: 'https://putlocker.li/search/{query}',
    selectors: ['.movie-item a', '.film-item a']
  },
  {
    name: 'Solarmovie',
    searchUrl: 'https://solarmovie.pe/search/{query}',
    selectors: ['.movie-item a', '.film-item a']
  },
  {
    name: 'Movie4K',
    searchUrl: 'https://movie4k.to/search/{query}',
    selectors: ['.movie-item a', '.film-item a']
  }
];

/**
 * Enhanced automated streaming downloader with 5 extraction methods from Cataz lessons
 * @param {string} title - Movie title to search for
 * @returns {Object|null} Download result with file path and metadata
 */
export async function downloadMovieFromStreaming(title) {
  logger.info(`[AutomatedStreamDownloader] Starting enhanced download for: ${title}`);
  
  // Re-enabled streaming downloader with M3U8 capture only (NO screen recording)
  logger.info(`[AutomatedStreamDownloader] Starting M3U8 stream capture for: ${title}`);
  
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
        for (const site of sites) {
          try {
            logger.info(`[AutomatedStreamDownloader] Trying ${site.name}...`);
            
            // 1. Search and navigate
            const searchUrl = site.searchUrl.replace('{query}', encodeURIComponent(title));
            await page.goto(searchUrl, { 
              waitUntil: 'networkidle0',
              timeout: 15000 
            });
            
            // Wait for results to load
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Handle Einthusan popup specifically
            if (site.name === 'Einthusan') {
              logger.info(`[AutomatedStreamDownloader] Handling Einthusan popup...`);
              try {
                const popupHandled = await page.evaluate(() => {
                  // Look for various popup button patterns
                  const buttonSelectors = [
                    'button:contains("AGREE")',
                    'button:contains("Agree")',
                    'button:contains("Accept")',
                    'button:contains("Accept All")',
                    '.qc-cmp2-summary-buttons button:last-child',
                    'button[class*="primary"]',
                    'button[class*="agree"]',
                    '[data-testid*="agree"]',
                    '.consent-button',
                    '.accept-button'
                  ];
                  
                  for (const selector of buttonSelectors) {
                    try {
                      const buttons = document.querySelectorAll(selector);
                      for (const button of buttons) {
                        if (button.textContent && (button.textContent.includes('AGREE') || button.textContent.includes('Agree') || button.textContent.includes('Accept'))) {
                          button.click();
                          return true;
                        }
                      }
                    } catch (e) {
                      continue;
                    }
                  }
                  
                  // Try to find buttons by text content
                  const allButtons = document.querySelectorAll('button');
                  for (const button of allButtons) {
                    if (button.textContent && (button.textContent.includes('AGREE') || button.textContent.includes('Agree') || button.textContent.includes('Accept'))) {
                      button.click();
                      return true;
                    }
                  }
                  
                  return false;
                });
                
                if (popupHandled) {
                  logger.info(`[AutomatedStreamDownloader] Successfully handled Einthusan popup`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                  logger.warn(`[AutomatedStreamDownloader] Could not find Einthusan popup button`);
                }
              } catch (e) {
                logger.warn(`[AutomatedStreamDownloader] Einthusan popup handling failed: ${e.message}`);
              }
            }
        
        // 2. Click first result
        let movieLink = null;
        for (const selector of site.selectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              movieLink = element;
              logger.info(`[AutomatedStreamDownloader] Found movie link with selector: ${selector}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (!movieLink) {
          logger.warn(`[AutomatedStreamDownloader] No movie results found on ${site.name}`);
          
          // Fallback: Try direct yt-dlp on search page
          try {
            const currentUrl = page.url();
            logger.info(`[AutomatedStreamDownloader] Trying direct yt-dlp on search page: ${currentUrl}`);
            
            const outputPath = `downloads/${title.replace(/[^a-zA-Z0-9]/g, '_')}_${site.name}_direct.mp4`;
            await execPromise(`yt-dlp -f "best[height<=1080]" -o "${outputPath}" "${currentUrl}"`);
            
            const fs = require('fs');
            const stats = fs.statSync(outputPath);
            const fileSizeInMB = stats.size / (1024 * 1024);
            
            if (fileSizeInMB > 500) {
              logger.info(`[AutomatedStreamDownloader] SUCCESS: Direct yt-dlp download!`);
              return {
                filePath: outputPath,
                fileSize: stats.size,
                sourceUrl: currentUrl,
                sourceName: site.name,
                streamUrl: currentUrl
              };
            }
          } catch (e) {
            logger.warn(`[AutomatedStreamDownloader] Direct yt-dlp failed: ${e.message}`);
          }
          
          continue;
        }
        
            await movieLink.click();
            logger.info(`[AutomatedStreamDownloader] Clicked movie link on ${site.name}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Handle additional popups on movie page (especially for Einthusan)
            if (site.name === 'Einthusan') {
              try {
                const additionalPopupHandled = await page.evaluate(() => {
                  const allButtons = document.querySelectorAll('button');
                  for (const button of allButtons) {
                    if (button.textContent && (button.textContent.includes('AGREE') || button.textContent.includes('Agree') || button.textContent.includes('Accept'))) {
                      button.click();
                      return true;
                    }
                  }
                  return false;
                });
                
                if (additionalPopupHandled) {
                  logger.info(`[AutomatedStreamDownloader] Handled additional Einthusan popup`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              } catch (e) {
                // Continue if no additional popup
              }
            }
        
        const currentUrl = page.url();
        logger.info(`[AutomatedStreamDownloader] Movie URL: ${currentUrl}`);
        
        // 3. Try multiple play button selectors (from Cataz lessons)
        const playButtonSelectors = [
          '.play-btn', '.btn-play', '[class*="play"]', '.vjs-big-play-button', 
          '.jw-play', '.player-play', 'a[href*="watch"]', 'button[class*="play"]',
          'button[class*="watch"]', '.play-button', '.watch-button', '[data-action="play"]',
          'a[class*="play"]', 'a[class*="watch"]', 'button[class*="btn"]', 'a[class*="btn"]'
        ];
        
        let playClicked = false;
        for (const selector of playButtonSelectors) {
          try {
            const playButton = await page.$(selector);
            if (playButton) {
              await playButton.click();
              logger.info(`[AutomatedStreamDownloader] Clicked play button with selector: ${selector}`);
              playClicked = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (playClicked) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        // 4. Try multiple stream extraction methods (5 methods from Cataz lessons)
        const streams = await extractStreamsMultiMethod(page);
        
        if (streams.length > 0) {
          logger.info(`[AutomatedStreamDownloader] Found ${streams.length} video streams using multiple methods`);
          
          // 5. Try to download each stream
          for (let i = 0; i < streams.length; i++) {
            const stream = streams[i];
            try {
              logger.info(`[AutomatedStreamDownloader] Attempting download ${i + 1}/${streams.length}: ${stream}`);
              
              const outputPath = `downloads/${title.replace(/[^a-zA-Z0-9]/g, '_')}_${site.name}_${i + 1}.mp4`;
              
              // Use ffmpeg to download the stream
              await execPromise(`ffmpeg -i "${stream}" -c copy "${outputPath}" -y`);
              
              // 6. Validate file size
              const fs = require('fs');
              const stats = fs.statSync(outputPath);
              const fileSizeInMB = stats.size / (1024 * 1024);
              
              logger.info(`[AutomatedStreamDownloader] Download completed: ${fileSizeInMB.toFixed(2)} MB`);
              
              if (fileSizeInMB > 500) {
                logger.info(`[AutomatedStreamDownloader] SUCCESS: Real movie downloaded!`);
                return {
                  filePath: outputPath,
                  fileSize: stats.size,
                  sourceUrl: currentUrl,
                  sourceName: site.name,
                  streamUrl: stream
                };
              } else {
                logger.warn(`[AutomatedStreamDownloader] File too small (${fileSizeInMB.toFixed(2)} MB) - might be trailer`);
                // Clean up small file
                fs.unlinkSync(outputPath);
              }
              
            } catch (error) {
              logger.error(`[AutomatedStreamDownloader] Failed to download stream ${i + 1}:`, error.message);
              continue;
            }
          }
        } else {
          logger.warn(`[AutomatedStreamDownloader] No video streams captured on ${site.name}`);
        }
        
      } catch (error) {
        logger.error(`[AutomatedStreamDownloader] ${site.name} failed:`, error.message);
      }
    }
    
    logger.error(`[AutomatedStreamDownloader] No streaming sources worked for: ${title}`);
    return null;
    
  } catch (error) {
    logger.error(`[AutomatedStreamDownloader] Main error:`, error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extract streams using 5 different methods from Cataz lessons
 * @param {Object} page - Puppeteer page object
 * @returns {Array} Array of valid stream URLs
 */
async function extractStreamsMultiMethod(page) {
  const streams = new Set();
  
  // Method 1: Request interception (already implemented)
  await extractFromRequestInterception(page, streams);
  
  // Method 2: Iframe navigation + extraction (Cataz lesson)
  await extractFromIframes(page, streams);
  
  // Method 3: Video element extraction (Cataz lesson)
  await extractFromVideoElements(page, streams);
  
  // Method 4: JW Player detection (Cataz lesson)
  await extractFromJWPlayer(page, streams);
  
  // Method 5: Direct script parsing (Cataz lesson)
  await extractFromScripts(page, streams);
  
  return Array.from(streams).filter(isValidStream);
}

/**
 * Method 1: Request interception
 */
async function extractFromRequestInterception(page, streams) {
  // Set up request interception to capture video streams
  await page.setRequestInterception(true);
  
  page.on('request', (request) => {
    const url = request.url();
    // Capture actual video streams
    if (url.includes('.m3u8') || url.includes('.mpd') || 
        url.includes('videoplayback') || url.includes('googlevideo') ||
        url.includes('manifest') || url.includes('playlist') ||
        url.includes('stream') || url.includes('video')) {
      logger.info(`[Method1] Captured stream: ${url}`);
      streams.add(url);
    }
    request.continue();
  });
  
  // Wait for streams to be captured
  await new Promise(resolve => setTimeout(resolve, 15000));
}

/**
 * Method 2: Extract from iframes (Cataz lesson)
 */
async function extractFromIframes(page, streams) {
  try {
    const iframes = await page.$$('iframe');
    logger.info(`[Method2] Found ${iframes.length} iframe elements`);
    
    for (const iframe of iframes) {
      try {
        const src = await page.evaluate(el => el.src, iframe);
        if (src && (src.includes('embed') || src.includes('player'))) {
          logger.info(`[Method2] Found video iframe: ${src}`);
          
          const newPage = await page.browser().newPage();
          await newPage.goto(src, { waitUntil: 'networkidle2', timeout: 15000 });
          
          // Extract from iframe page
          const iframeStreams = await newPage.evaluate(() => {
            const s = [];
            document.querySelectorAll('video').forEach(v => {
              if (v.src && v.src !== 'blob:') s.push(v.src);
              if (v.currentSrc && v.currentSrc !== 'blob:') s.push(v.currentSrc);
            });
            document.querySelectorAll('source').forEach(src => {
              if (src.src) s.push(src.src);
            });
            return s;
          });
          
          iframeStreams.forEach(s => streams.add(s));
          await newPage.close();
        }
      } catch (e) {
        // Continue to next iframe
      }
    }
  } catch (error) {
    logger.error(`[Method2] Iframe extraction failed:`, error.message);
  }
}

/**
 * Method 3: JW Player detection (Cataz lesson)
 */
async function extractFromJWPlayer(page, streams) {
  try {
    const jwStreams = await page.evaluate(() => {
      const s = [];
      if (window.jwplayer) {
        try {
          const player = window.jwplayer();
          if (player.getPlaylist) {
            const playlist = player.getPlaylist();
            playlist.forEach(item => {
              if (item.sources) {
                item.sources.forEach(source => {
                  if (source.file) s.push(source.file);
                });
              }
              if (item.file) s.push(item.file);
            });
          }
          if (player.getConfig && player.getConfig().file) {
            s.push(player.getConfig().file);
          }
        } catch (e) {}
      }
      return s;
    });
    
    jwStreams.forEach(s => streams.add(s));
    if (jwStreams.length > 0) {
      logger.info(`[Method3] Found ${jwStreams.length} JW Player streams`);
    }
  } catch (error) {
    logger.error(`[Method3] JW Player extraction failed:`, error.message);
  }
}

/**
 * Method 4: Video element extraction (Cataz lesson)
 */
async function extractFromVideoElements(page, streams) {
  try {
    const videoStreams = await page.evaluate(() => {
      const s = [];
      document.querySelectorAll('video').forEach(v => {
        if (v.src && v.src !== 'blob:' && !v.src.includes('data:')) s.push(v.src);
        if (v.currentSrc && v.currentSrc !== 'blob:' && !v.currentSrc.includes('data:')) s.push(v.currentSrc);
      });
      document.querySelectorAll('source').forEach(src => {
        if (src.src && !src.src.includes('blob:') && !src.src.includes('data:')) s.push(src.src);
      });
      return s;
    });
    
    videoStreams.forEach(s => streams.add(s));
    if (videoStreams.length > 0) {
      logger.info(`[Method4] Found ${videoStreams.length} video element streams`);
    }
  } catch (error) {
    logger.error(`[Method4] Video element extraction failed:`, error.message);
  }
}

/**
 * Method 5: Direct script parsing (Cataz lesson)
 */
async function extractFromScripts(page, streams) {
  try {
    const scriptStreams = await page.evaluate(() => {
      const s = [];
      
      // Look for common streaming patterns in scripts
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const content = script.textContent || script.innerHTML;
        
        // Look for HLS manifests
        const hlsMatches = content.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
        if (hlsMatches) {
          hlsMatches.forEach(match => s.push(match));
        }
        
        // Look for MP4 streams
        const mp4Matches = content.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/g);
        if (mp4Matches) {
          mp4Matches.forEach(match => s.push(match));
        }
        
        // Look for DASH manifests
        const dashMatches = content.match(/https?:\/\/[^\s"']+\.mpd[^\s"']*/g);
        if (dashMatches) {
          dashMatches.forEach(match => s.push(match));
        }
      });
      
      return s;
    });
    
    scriptStreams.forEach(s => streams.add(s));
    if (scriptStreams.length > 0) {
      logger.info(`[Method5] Found ${scriptStreams.length} script-based streams`);
    }
  } catch (error) {
    logger.error(`[Method5] Script parsing failed:`, error.message);
  }
}

/**
 * Validate stream URL (exclude blob: and data: URLs)
 */
function isValidStream(url) {
  return url && 
         url !== 'blob:' && 
         !url.includes('data:') &&
         !url.includes('.css') &&
         !url.includes('.js') &&
         !url.includes('favicon') &&
         !url.includes('analytics') &&
         !url.includes('tracking') &&
         !url.includes('sharethis');
}

export default { downloadMovieFromStreaming };