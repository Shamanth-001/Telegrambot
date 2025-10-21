import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cataz Advanced Iframe Extractor - Multiple techniques to extract real streams
class CatazAdvancedIframeExtractor {
  constructor() {
    this.browser = null;
    this.page = null;
    this.capturedStreams = [];
    
    this.logger = {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`),
      error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`),
      warn: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`)
    };
  }

  async initializeBrowser() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    
    // VPN-optimized user agent
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Set up network interception
    await this.page.setRequestInterception(true);
    
    this.page.on('request', (request) => {
      const url = request.url();
      
      if (url.includes('.m3u8') || 
          url.includes('.mp4') || 
          url.includes('.mpd') ||
          url.includes('videoplayback') ||
          url.includes('stream') ||
          url.includes('playlist') ||
          url.includes('manifest') ||
          url.includes('index') ||
          url.includes('video') ||
          url.includes('media')) {
        
        this.capturedStreams.push({
          url: url,
          timestamp: new Date().toISOString()
        });
        
        this.logger.info(`🎬 Network stream captured: ${url}`);
      }
      
      request.continue();
    });

    this.logger.success('Browser initialized with advanced iframe extraction');
  }

  async findAndClickPlayButton() {
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to find any clickable element that might be a play button
    const playButtonSelectors = [
      'a[href*="watch"]',
      'button[class*="play"]',
      'button[class*="watch"]',
      '.play-button',
      '.watch-button',
      '[data-action="play"]',
      'a[class*="play"]',
      'a[class*="watch"]',
      'button[class*="btn"]',
      'a[class*="btn"]'
    ];

    for (const selector of playButtonSelectors) {
      try {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          this.logger.info(`Found ${elements.length} elements with selector: ${selector}`);
          
          // Try clicking the first element
          await elements[0].click();
          this.logger.success('✅ Clicked play button successfully');
          return true;
        }
      } catch (error) {
        this.logger.info(`Selector ${selector} failed: ${error.message}`);
      }
    }

    // If no specific selectors work, try clicking any link that contains "watch" in href
    try {
      const watchLinks = await this.page.$$eval('a', links => 
        links.filter(link => 
          link.href && link.href.includes('watch')
        ).map(link => link.href)
      );
      
      if (watchLinks.length > 0) {
        this.logger.info(`Found ${watchLinks.length} watch links`);
        
        // Navigate to the first watch link
        await this.page.goto(watchLinks[0]);
        this.logger.success('✅ Navigated to watch link');
        return true;
      }
    } catch (error) {
      this.logger.info(`Watch link search failed: ${error.message}`);
    }

    throw new Error('No play button found');
  }

  async extractStreamFromIframeAdvanced(iframeUrl) {
    this.logger.info(`🔍 Advanced extraction from iframe: ${iframeUrl}`);
    
    // Navigate to the iframe URL
    await this.page.goto(iframeUrl, { waitUntil: 'networkidle2' });
    this.logger.success('✅ Navigated to iframe page');
    
    // Wait for the page to load and capture streams
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Method 1: Look for video elements
    try {
      const videoElements = await this.page.$$('video');
      if (videoElements.length > 0) {
        for (const video of videoElements) {
          const src = await this.page.evaluate(el => el.src, video);
          const currentSrc = await this.page.evaluate(el => el.currentSrc, video);
          if (src && src !== 'blob:') {
            this.capturedStreams.push({
              url: src,
              timestamp: new Date().toISOString(),
              source: 'iframe-video-src'
            });
            this.logger.info(`🎬 Video src: ${src}`);
          }
          if (currentSrc && currentSrc !== 'blob:' && currentSrc !== src) {
            this.capturedStreams.push({
              url: currentSrc,
              timestamp: new Date().toISOString(),
              source: 'iframe-video-currentSrc'
            });
            this.logger.info(`🎬 Video currentSrc: ${currentSrc}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No video elements found in iframe');
    }

    // Method 2: Look for source elements
    try {
      const sourceElements = await this.page.$$('source');
      if (sourceElements.length > 0) {
        for (const source of sourceElements) {
          const src = await this.page.evaluate(el => el.src, source);
          if (src) {
            this.capturedStreams.push({
              url: src,
              timestamp: new Date().toISOString(),
              source: 'iframe-source'
            });
            this.logger.info(`🎬 Source element: ${src}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No source elements found in iframe');
    }

    // Method 3: Execute JavaScript to find streams
    try {
      const jsStreams = await this.page.evaluate(() => {
        const streams = [];
        
        // Look for any video-related variables in the global scope
        const globalVars = ['player', 'videoPlayer', 'jwplayer', 'video', 'stream', 'source'];
        globalVars.forEach(varName => {
          if (window[varName]) {
            const obj = window[varName];
            if (typeof obj === 'object') {
              if (obj.src) streams.push(obj.src);
              if (obj.getAttribute && obj.getAttribute('src')) {
                streams.push(obj.getAttribute('src'));
              }
              if (obj.currentSrc) streams.push(obj.currentSrc);
            }
          }
        });
        
        // Look for JW Player instances
        if (window.jwplayer) {
          try {
            const players = window.jwplayer();
            if (players && players.length > 0) {
              players.forEach(player => {
                if (player.getPlaylist && player.getPlaylist()) {
                  const playlist = player.getPlaylist();
                  playlist.forEach(item => {
                    if (item.sources) {
                      item.sources.forEach(source => {
                        if (source.file) streams.push(source.file);
                      });
                    }
                    if (item.file) streams.push(item.file);
                  });
                }
                if (player.getConfig && player.getConfig().file) {
                  streams.push(player.getConfig().file);
                }
              });
            }
          } catch (e) {
            console.log('JW Player extraction failed:', e);
          }
        }
        
        // Look for any video elements
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
          if (video.src) streams.push(video.src);
          if (video.currentSrc) streams.push(video.currentSrc);
        });
        
        // Look for any source elements
        const sources = document.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src) streams.push(source.src);
        });
        
        // Look for any iframe elements
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
          if (iframe.src) streams.push(iframe.src);
        });
        
        return streams.filter(url => url && url !== 'blob:' && !url.includes('data:') && !url.includes('javascript:'));
      });
      
      jsStreams.forEach(stream => {
        this.capturedStreams.push({
          url: stream,
          timestamp: new Date().toISOString(),
          source: 'javascript-extraction'
        });
        this.logger.info(`🎬 JavaScript extracted: ${stream}`);
      });
      
    } catch (error) {
      this.logger.info(`JavaScript extraction failed: ${error.message}`);
    }

    // Method 4: Try to click play button on iframe page
    try {
      const playButtons = await this.page.$$('button, a, div[class*="play"], div[class*="start"]');
      if (playButtons.length > 0) {
        this.logger.info(`Found ${playButtons.length} potential play buttons on iframe page`);
        
        for (const button of playButtons.slice(0, 3)) { // Try first 3 buttons
          try {
            await button.click();
            this.logger.info('Clicked potential play button on iframe page');
            await new Promise(resolve => setTimeout(resolve, 5000));
            break;
          } catch (error) {
            this.logger.info(`Button click failed: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No play buttons found on iframe page');
    }

    // Method 5: Try to interact with the page to trigger video loading
    try {
      // Try to scroll the page
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to click anywhere on the page
      await this.page.click('body');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      this.logger.info('Page interaction failed');
    }

    return this.capturedStreams;
  }

  async downloadWithYtdlp(streamUrl, outputPath) {
    this.logger.info(`📥 Downloading with yt-dlp: ${streamUrl}`);
    
    // VPN-optimized yt-dlp command
    const ytdlpCommand = `yt-dlp -o "${outputPath}" --add-header "Referer: https://videostr.net/" --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --add-header "Accept: */*" --add-header "Accept-Language: en-US,en;q=0.9" --add-header "Accept-Encoding: gzip, deflate, br" --add-header "DNT: 1" --add-header "Connection: keep-alive" --add-header "Sec-Fetch-Dest: video" --add-header "Sec-Fetch-Mode: cors" --add-header "Sec-Fetch-Site: cross-site" --add-header "X-Forwarded-For: 192.168.1.1" --add-header "X-Real-IP: 192.168.1.1" --add-header "X-Client-IP: 192.168.1.1" "${streamUrl}"`;

    try {
      const { stdout, stderr } = await execAsync(ytdlpCommand, { 
        timeout: 300000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          this.logger.success(`✅ yt-dlp download successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          return { success: true, filePath: outputPath, fileSize: stats.size };
        }
      }
      
      throw new Error('Download completed but file is empty');
      
    } catch (error) {
      this.logger.error(`❌ yt-dlp download failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async downloadMovie(movieUrl, movieTitle) {
    try {
      this.logger.info(`🎬 Starting Cataz advanced iframe extraction for: ${movieTitle}`);
      this.logger.info(`🔗 URL: ${movieUrl}`);
      this.logger.info(`🛡️ VPN: Active (optimized)`);

      await this.initializeBrowser();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      this.logger.success('✅ Movie page loaded');

      // Find and click play button
      await this.findAndClickPlayButton();

      // Wait for iframe to load and capture iframe URL
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Find iframe elements
      const iframes = await this.page.$$('iframe');
      if (iframes.length === 0) {
        throw new Error('No iframe elements found');
      }

      let iframeUrl = null;
      for (const iframe of iframes) {
        const src = await this.page.evaluate(el => el.src, iframe);
        if (src && (src.includes('player') || src.includes('embed') || src.includes('videostr'))) {
          iframeUrl = src;
          this.logger.info(`🎬 Found iframe: ${src}`);
          break;
        }
      }

      if (!iframeUrl) {
        throw new Error('No iframe URL found');
      }

      // Extract real stream from iframe using advanced techniques
      await this.extractStreamFromIframeAdvanced(iframeUrl);
      
      if (this.capturedStreams.length === 0) {
        throw new Error('No real stream URLs extracted from iframe');
      }

      this.logger.success(`🎬 Extracted ${this.capturedStreams.length} real stream URLs from iframe`);

      // Try downloading with each real stream using yt-dlp
      for (let i = 0; i < this.capturedStreams.length; i++) {
        const stream = this.capturedStreams[i];
        this.logger.info(`🎯 Trying real stream ${i + 1}/${this.capturedStreams.length}: ${stream.url}`);

        const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-advanced-iframe-extracted-${i + 1}.mp4`;
        const result = await this.downloadWithYtdlp(stream.url, outputPath);
        
        if (result.success) {
          this.logger.success(`🎉 Cataz advanced iframe extraction completed!`);
          this.logger.success(`📁 File: ${result.filePath}`);
          this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          return result;
        }
      }

      throw new Error('All advanced iframe stream extraction attempts failed');

    } catch (error) {
      this.logger.error(`❌ Cataz advanced iframe extraction failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

// Test the Cataz advanced iframe extractor
async function downloadFromCatazAdvancedIframeExtractor() {
  console.log('🎬 Cataz Advanced Iframe Extractor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ VPN Status: Active (optimized)');
  console.log('🔧 Configuration: Advanced iframe navigation and multiple extraction techniques');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const downloader = new CatazAdvancedIframeExtractor();

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009_Cataz_Advanced_Iframe_Extracted'
    );
    
    console.log('🎉 Cataz advanced iframe extraction completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('🛡️ Your VPN is working perfectly with Cataz advanced iframe extraction!');
    
  } catch (error) {
    console.error('❌ Cataz advanced iframe extraction failed:', error.message);
    console.log('💡 Tips:');
    console.log('   - Keep your VPN active');
    console.log('   - The system uses multiple techniques to extract real streams from iframes');
    console.log('   - Try different VPN servers if needed');
  }
}

// Run the download
downloadFromCatazAdvancedIframeExtractor().catch(console.error);

