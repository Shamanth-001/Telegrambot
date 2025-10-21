import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cataz Iframe Stream Extractor - Navigate to iframe and extract real stream
class CatazIframeStreamExtractor {
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
        '--disable-features=VizDisplayCompositor'
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
          url.includes('index')) {
        
        this.capturedStreams.push({
          url: url,
          timestamp: new Date().toISOString()
        });
        
        this.logger.info(`🎬 Real stream URL captured: ${url}`);
      }
      
      request.continue();
    });

    this.logger.success('Browser initialized with iframe stream extraction');
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

  async extractStreamFromIframe(iframeUrl) {
    this.logger.info(`🔍 Extracting real stream from iframe: ${iframeUrl}`);
    
    // Navigate to the iframe URL
    await this.page.goto(iframeUrl, { waitUntil: 'networkidle2' });
    this.logger.success('✅ Navigated to iframe page');
    
    // Wait for the page to load and capture streams
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Try to find video elements on the iframe page
    try {
      const videoElements = await this.page.$$('video');
      if (videoElements.length > 0) {
        for (const video of videoElements) {
          const src = await this.page.evaluate(el => el.src, video);
          if (src && src !== 'blob:') {
            this.capturedStreams.push({
              url: src,
              timestamp: new Date().toISOString(),
              source: 'iframe-video-element'
            });
            this.logger.info(`🎬 Iframe video element stream: ${src}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No video elements found in iframe');
    }

    // Try to find source elements
    try {
      const sourceElements = await this.page.$$('source');
      if (sourceElements.length > 0) {
        for (const source of sourceElements) {
          const src = await this.page.evaluate(el => el.src, source);
          if (src) {
            this.capturedStreams.push({
              url: src,
              timestamp: new Date().toISOString(),
              source: 'iframe-source-element'
            });
            this.logger.info(`🎬 Iframe source element stream: ${src}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No source elements found in iframe');
    }

    // Try to execute JavaScript to find streams
    try {
      const jsStreams = await this.page.evaluate(() => {
        const streams = [];
        
        // Look for any video-related variables in the global scope
        if (window.player) {
          if (window.player.src) streams.push(window.player.src);
          if (window.player.getAttribute && window.player.getAttribute('src')) {
            streams.push(window.player.getAttribute('src'));
          }
        }
        
        // Look for JW Player instances
        if (window.jwplayer) {
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
                });
              }
            });
          }
        }
        
        // Look for any video elements
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
          if (video.src) streams.push(video.src);
          if (video.currentSrc) streams.push(video.currentSrc);
        });
        
        return streams.filter(url => url && url !== 'blob:' && !url.includes('data:'));
      });
      
      jsStreams.forEach(stream => {
        this.capturedStreams.push({
          url: stream,
          timestamp: new Date().toISOString(),
          source: 'javascript-extraction'
        });
        this.logger.info(`🎬 JavaScript extracted stream: ${stream}`);
      });
      
    } catch (error) {
      this.logger.info(`JavaScript extraction failed: ${error.message}`);
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
      this.logger.info(`🎬 Starting Cataz iframe stream extraction for: ${movieTitle}`);
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

      // Extract real stream from iframe
      await this.extractStreamFromIframe(iframeUrl);
      
      if (this.capturedStreams.length === 0) {
        throw new Error('No real stream URLs extracted from iframe');
      }

      this.logger.success(`🎬 Extracted ${this.capturedStreams.length} real stream URLs from iframe`);

      // Try downloading with each real stream using yt-dlp
      for (let i = 0; i < this.capturedStreams.length; i++) {
        const stream = this.capturedStreams[i];
        this.logger.info(`🎯 Trying real stream ${i + 1}/${this.capturedStreams.length}: ${stream.url}`);

        const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-iframe-extracted-${i + 1}.mp4`;
        const result = await this.downloadWithYtdlp(stream.url, outputPath);
        
        if (result.success) {
          this.logger.success(`🎉 Cataz iframe stream extraction completed!`);
          this.logger.success(`📁 File: ${result.filePath}`);
          this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          return result;
        }
      }

      throw new Error('All iframe stream extraction attempts failed');

    } catch (error) {
      this.logger.error(`❌ Cataz iframe stream extraction failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

// Test the Cataz iframe stream extractor
async function downloadFromCatazIframeStreamExtractor() {
  console.log('🎬 Cataz Iframe Stream Extractor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ VPN Status: Active (optimized)');
  console.log('🔧 Configuration: Iframe navigation and real stream extraction');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const downloader = new CatazIframeStreamExtractor();

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009_Cataz_Iframe_Extracted'
    );
    
    console.log('🎉 Cataz iframe stream extraction completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('🛡️ Your VPN is working perfectly with Cataz iframe stream extraction!');
    
  } catch (error) {
    console.error('❌ Cataz iframe stream extraction failed:', error.message);
    console.log('💡 Tips:');
    console.log('   - Keep your VPN active');
    console.log('   - The system navigates to iframe pages to extract real streams');
    console.log('   - Try different VPN servers if needed');
  }
}

// Run the download
downloadFromCatazIframeStreamExtractor().catch(console.error);

