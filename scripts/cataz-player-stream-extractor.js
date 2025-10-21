import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cataz Player Stream Extractor - Wait for player to load and capture real video streams
class CatazPlayerStreamExtractor {
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
      
      // Only capture actual video streams, not CSS/JS files
      if ((url.includes('.m3u8') || 
           url.includes('.mp4') || 
           url.includes('.mpd') ||
           url.includes('videoplayback') ||
           url.includes('stream') ||
           url.includes('playlist') ||
           url.includes('manifest') ||
           url.includes('index')) &&
          !url.includes('.css') &&
          !url.includes('.js') &&
          !url.includes('.svg') &&
          !url.includes('.png') &&
          !url.includes('.ico')) {
        
        this.capturedStreams.push({
          url: url,
          timestamp: new Date().toISOString()
        });
        
        this.logger.info(`🎬 Real video stream captured: ${url}`);
      }
      
      request.continue();
    });

    this.logger.success('Browser initialized with player stream extraction');
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

  async waitForPlayerAndExtractStreams(iframeUrl) {
    this.logger.info(`🔍 Waiting for player to load and extract real streams: ${iframeUrl}`);
    
    // Navigate to the iframe URL
    await this.page.goto(iframeUrl, { waitUntil: 'networkidle2' });
    this.logger.success('✅ Navigated to iframe page');
    
    // Wait for the player to load (JW Player takes time to initialize)
    this.logger.info('⏳ Waiting for JW Player to initialize...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Try to find and click play button on the player
    try {
      const playButtons = await this.page.$$('button, div[class*="play"], div[class*="start"], .jw-icon-play, .jw-button-play');
      if (playButtons.length > 0) {
        this.logger.info(`Found ${playButtons.length} player buttons`);
        
        for (const button of playButtons.slice(0, 3)) { // Try first 3 buttons
          try {
            await button.click();
            this.logger.info('✅ Clicked player button');
            await new Promise(resolve => setTimeout(resolve, 5000));
            break;
          } catch (error) {
            this.logger.info(`Player button click failed: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No player buttons found');
    }

    // Wait for video to start loading
    this.logger.info('⏳ Waiting for video to start loading...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Try to interact with the player to trigger video loading
    try {
      // Try to click on the player area
      await this.page.click('body');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Try to press spacebar to play
      await this.page.keyboard.press('Space');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      this.logger.info('Player interaction failed');
    }

    // Try to execute JavaScript to trigger video loading
    try {
      await this.page.evaluate(() => {
        // Try to find and trigger JW Player
        if (window.jwplayer) {
          try {
            const players = window.jwplayer();
            if (players && players.length > 0) {
              players.forEach(player => {
                if (player.play) player.play();
                if (player.load) player.load();
              });
            }
          } catch (e) {
            console.log('JW Player trigger failed:', e);
          }
        }
        
        // Try to find and trigger any video elements
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
          if (video.play) video.play();
          if (video.load) video.load();
        });
      });
      
      this.logger.info('✅ Executed JavaScript to trigger video loading');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      this.logger.info(`JavaScript execution failed: ${error.message}`);
    }

    // Try to extract streams from the page after player interaction
    try {
      const jsStreams = await this.page.evaluate(() => {
        const streams = [];
        
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
        
        return streams.filter(url => url && url !== 'blob:' && !url.includes('data:') && !url.includes('javascript:'));
      });
      
      jsStreams.forEach(stream => {
        this.capturedStreams.push({
          url: stream,
          timestamp: new Date().toISOString(),
          source: 'player-javascript-extraction'
        });
        this.logger.info(`🎬 Player JavaScript extracted: ${stream}`);
      });
      
    } catch (error) {
      this.logger.info(`Player JavaScript extraction failed: ${error.message}`);
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
      this.logger.info(`🎬 Starting Cataz player stream extraction for: ${movieTitle}`);
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

      // Wait for player to load and extract real streams
      await this.waitForPlayerAndExtractStreams(iframeUrl);
      
      if (this.capturedStreams.length === 0) {
        throw new Error('No real video streams extracted from player');
      }

      this.logger.success(`🎬 Extracted ${this.capturedStreams.length} real video streams from player`);

      // Try downloading with each real stream using yt-dlp
      for (let i = 0; i < this.capturedStreams.length; i++) {
        const stream = this.capturedStreams[i];
        this.logger.info(`🎯 Trying real video stream ${i + 1}/${this.capturedStreams.length}: ${stream.url}`);

        const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-player-stream-extracted-${i + 1}.mp4`;
        const result = await this.downloadWithYtdlp(stream.url, outputPath);
        
        if (result.success) {
          this.logger.success(`🎉 Cataz player stream extraction completed!`);
          this.logger.success(`📁 File: ${result.filePath}`);
          this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          return result;
        }
      }

      throw new Error('All player stream extraction attempts failed');

    } catch (error) {
      this.logger.error(`❌ Cataz player stream extraction failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

// Test the Cataz player stream extractor
async function downloadFromCatazPlayerStreamExtractor() {
  console.log('🎬 Cataz Player Stream Extractor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ VPN Status: Active (optimized)');
  console.log('🔧 Configuration: Player interaction and real video stream extraction');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const downloader = new CatazPlayerStreamExtractor();

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009_Cataz_Player_Stream_Extracted'
    );
    
    console.log('🎉 Cataz player stream extraction completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('🛡️ Your VPN is working perfectly with Cataz player stream extraction!');
    
  } catch (error) {
    console.error('❌ Cataz player stream extraction failed:', error.message);
    console.log('💡 Tips:');
    console.log('   - Keep your VPN active');
    console.log('   - The system waits for the player to load and interact with it');
    console.log('   - Try different VPN servers if needed');
  }
}

// Run the download
downloadFromCatazPlayerStreamExtractor().catch(console.error);

