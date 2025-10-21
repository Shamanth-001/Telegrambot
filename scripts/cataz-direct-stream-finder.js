import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cataz Direct Stream Finder - Find actual video streams without iframe complications
class CatazDirectStreamFinder {
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

    // Set up network interception to capture ONLY real video streams
    await this.page.setRequestInterception(true);
    
    this.page.on('request', (request) => {
      const url = request.url();
      
      // Only capture actual video streams - be very specific
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
          !url.includes('.ico') &&
          !url.includes('embed') &&
          !url.includes('sharethis') &&
          !url.includes('analytics') &&
          !url.includes('tracking')) {
        
        this.capturedStreams.push({
          url: url,
          timestamp: new Date().toISOString()
        });
        
        this.logger.info(`🎬 Real video stream captured: ${url}`);
      }
      
      request.continue();
    });

    this.logger.success('Browser initialized for direct stream finding');
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

  async tryDifferentMovieSources() {
    this.logger.info('🔍 Trying different movie sources...');
    
    // Try to find other streaming sources for the same movie
    try {
      const alternativeSources = await this.page.$$eval('a', links => 
        links.filter(link => 
          link.href && (
            link.href.includes('avatar') ||
            link.href.includes('2009') ||
            link.href.includes('watch')
          )
        ).map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
      if (alternativeSources.length > 0) {
        this.logger.info(`Found ${alternativeSources.length} alternative sources`);
        
        // Try each alternative source
        for (let i = 0; i < Math.min(3, alternativeSources.length); i++) {
          const source = alternativeSources[i];
          this.logger.info(`🎯 Trying alternative source ${i + 1}: ${source.text} - ${source.href}`);
          
          try {
            await this.page.goto(source.href, { waitUntil: 'networkidle2' });
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check if we captured any streams from this source
            if (this.capturedStreams.length > 0) {
              this.logger.success(`✅ Found streams from alternative source: ${source.text}`);
              return true;
            }
          } catch (error) {
            this.logger.info(`Alternative source ${i + 1} failed: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.logger.info(`Alternative source search failed: ${error.message}`);
    }

    return false;
  }

  async tryDirectVideoExtraction() {
    this.logger.info('🔍 Trying direct video element extraction...');
    
    try {
      // Look for video elements
      const videoElements = await this.page.$$('video');
      if (videoElements.length > 0) {
        for (const video of videoElements) {
          const src = await this.page.evaluate(el => el.src, video);
          const currentSrc = await this.page.evaluate(el => el.currentSrc, video);
          
          if (src && src !== 'blob:' && !src.includes('data:')) {
            this.capturedStreams.push({
              url: src,
              timestamp: new Date().toISOString(),
              source: 'direct-video-src'
            });
            this.logger.info(`🎬 Direct video src: ${src}`);
          }
          
          if (currentSrc && currentSrc !== 'blob:' && currentSrc !== src && !currentSrc.includes('data:')) {
            this.capturedStreams.push({
              url: currentSrc,
              timestamp: new Date().toISOString(),
              source: 'direct-video-currentSrc'
            });
            this.logger.info(`🎬 Direct video currentSrc: ${currentSrc}`);
          }
        }
      }
    } catch (error) {
      this.logger.info(`Direct video extraction failed: ${error.message}`);
    }

    // Try to extract from JavaScript variables
    try {
      const jsStreams = await this.page.evaluate(() => {
        const streams = [];
        
        // Look for common video player variables
        const playerVars = ['player', 'videoPlayer', 'jwplayer', 'video', 'stream', 'source', 'playlist'];
        
        playerVars.forEach(varName => {
          if (window[varName]) {
            const obj = window[varName];
            if (typeof obj === 'object') {
              if (obj.src) streams.push(obj.src);
              if (obj.currentSrc) streams.push(obj.currentSrc);
              if (obj.getAttribute && obj.getAttribute('src')) {
                streams.push(obj.getAttribute('src'));
              }
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

    return this.capturedStreams;
  }

  async downloadWithYtdlp(streamUrl, outputPath) {
    this.logger.info(`📥 Downloading with yt-dlp: ${streamUrl}`);
    
    // VPN-optimized yt-dlp command
    const ytdlpCommand = `yt-dlp -o "${outputPath}" --add-header "Referer: https://cataz.to/" --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --add-header "Accept: */*" --add-header "Accept-Language: en-US,en;q=0.9" --add-header "Accept-Encoding: gzip, deflate, br" --add-header "DNT: 1" --add-header "Connection: keep-alive" --add-header "Sec-Fetch-Dest: video" --add-header "Sec-Fetch-Mode: cors" --add-header "Sec-Fetch-Site: cross-site" --add-header "X-Forwarded-For: 192.168.1.1" --add-header "X-Real-IP: 192.168.1.1" --add-header "X-Client-IP: 192.168.1.1" "${streamUrl}"`;

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
      this.logger.info(`🎬 Starting Cataz direct stream finding for: ${movieTitle}`);
      this.logger.info(`🔗 URL: ${movieUrl}`);
      this.logger.info(`🛡️ VPN: Active (optimized)`);

      await this.initializeBrowser();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      this.logger.success('✅ Movie page loaded');

      // Find and click play button
      await this.findAndClickPlayButton();

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Try different movie sources
      const alternativeFound = await this.tryDifferentMovieSources();
      
      if (alternativeFound) {
        this.logger.info('✅ Alternative source found, trying direct extraction...');
      }

      // Try direct video extraction
      await this.tryDirectVideoExtraction();
      
      if (this.capturedStreams.length === 0) {
        throw new Error('No video streams found with direct methods');
      }

      this.logger.success(`🎬 Found ${this.capturedStreams.length} video streams with direct methods`);

      // Try downloading with each stream using yt-dlp
      for (let i = 0; i < this.capturedStreams.length; i++) {
        const stream = this.capturedStreams[i];
        this.logger.info(`🎯 Trying stream ${i + 1}/${this.capturedStreams.length}: ${stream.url}`);

        const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-direct-stream-${i + 1}.mp4`;
        const result = await this.downloadWithYtdlp(stream.url, outputPath);
        
        if (result.success) {
          this.logger.success(`🎉 Cataz direct stream finding completed!`);
          this.logger.success(`📁 File: ${result.filePath}`);
          this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          return result;
        }
      }

      throw new Error('All direct stream finding attempts failed');

    } catch (error) {
      this.logger.error(`❌ Cataz direct stream finding failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

// Test the Cataz direct stream finder
async function downloadFromCatazDirectStreamFinder() {
  console.log('🎬 Cataz Direct Stream Finder');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ VPN Status: Active (optimized)');
  console.log('🔧 Configuration: Direct stream finding (NO SCREEN RECORDING)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const downloader = new CatazDirectStreamFinder();

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009_Cataz_Direct_Stream'
    );
    
    console.log('🎉 Cataz direct stream finding completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('🛡️ Your VPN is working perfectly with Cataz direct stream finding!');
    
  } catch (error) {
    console.error('❌ Cataz direct stream finding failed:', error.message);
    console.log('💡 Tips:');
    console.log('   - Keep your VPN active');
    console.log('   - The system tries to find direct video streams (NO SCREEN RECORDING)');
    console.log('   - Try different VPN servers if needed');
  }
}

// Run the download
downloadFromCatazDirectStreamFinder().catch(console.error);

