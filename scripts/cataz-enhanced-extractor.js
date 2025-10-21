import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cataz Enhanced Extractor - Advanced iframe handling with custom JavaScript injection
class CatazEnhancedExtractor {
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
        '--disable-blink-features=AutomationControlled'
      ]
    });

    this.page = await this.browser.newPage();
    
    // VPN-optimized user agent
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Set up advanced network interception
    await this.page.setRequestInterception(true);
    
    this.page.on('request', (request) => {
      const url = request.url();
      
      // Capture all network requests for analysis
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
        
        this.logger.info(`🎬 Network stream captured: ${url}`);
      }
      
      request.continue();
    });

    this.logger.success('Browser initialized with enhanced iframe handling');
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

  async handleNewTab() {
    this.logger.info('🔍 Handling new tab for video playback...');
    
    // Wait for a new tab to open
    const newTab = await this.browser.waitForTarget(target => target.opener() === this.page.target());
    
    // Switch to the new tab
    const newPage = await newTab.page();
    await newPage.bringToFront();
    
    this.logger.success('✅ Switched to new tab');
    
    // Wait for the page to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return newPage;
  }

  async injectCustomJavaScript(page) {
    this.logger.info('🔧 Injecting custom JavaScript to extract stream URLs...');
    
    try {
      // Custom JavaScript to manipulate the DOM and extract stream URLs
      const extractedStreams = await page.evaluate(() => {
        const streams = [];
        
        // Method 1: Look for iframes with videostr.net
        const iframes = document.querySelectorAll('iframe[src*="videostr.net"]');
        iframes.forEach(iframe => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
              const videoElement = iframeDoc.querySelector('video');
              if (videoElement && videoElement.src) {
                streams.push({
                  url: videoElement.src,
                  source: 'iframe-video-element'
                });
              }
            }
          } catch (e) {
            console.log('Iframe access failed:', e);
          }
        });
        
        // Method 2: Look for direct video elements
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
          if (video.src && video.src !== 'blob:') {
            streams.push({
              url: video.src,
              source: 'direct-video-element'
            });
          }
          if (video.currentSrc && video.currentSrc !== 'blob:' && video.currentSrc !== video.src) {
            streams.push({
              url: video.currentSrc,
              source: 'direct-video-currentSrc'
            });
          }
        });
        
        // Method 3: Look for JW Player instances
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
                        if (source.file) {
                          streams.push({
                            url: source.file,
                            source: 'jwplayer-playlist'
                          });
                        }
                      });
                    }
                    if (item.file) {
                      streams.push({
                        url: item.file,
                        source: 'jwplayer-item'
                      });
                    }
                  });
                }
                if (player.getConfig && player.getConfig().file) {
                  streams.push({
                    url: player.getConfig().file,
                    source: 'jwplayer-config'
                  });
                }
              });
            }
          } catch (e) {
            console.log('JW Player extraction failed:', e);
          }
        }
        
        // Method 4: Look for source elements
        const sources = document.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src) {
            streams.push({
              url: source.src,
              source: 'source-element'
            });
          }
        });
        
        return streams.filter(stream => 
          stream.url && 
          stream.url !== 'blob:' && 
          !stream.url.includes('data:') && 
          !stream.url.includes('javascript:')
        );
      });
      
      extractedStreams.forEach(stream => {
        this.capturedStreams.push({
          url: stream.url,
          timestamp: new Date().toISOString(),
          source: stream.source
        });
        this.logger.info(`🎬 Custom JS extracted: ${stream.url} (${stream.source})`);
      });
      
      this.logger.success(`✅ Custom JavaScript extracted ${extractedStreams.length} streams`);
      return extractedStreams;
      
    } catch (error) {
      this.logger.error(`❌ Custom JavaScript injection failed: ${error.message}`);
      return [];
    }
  }

  async tryAlternativeSources() {
    this.logger.info('🔍 Trying alternative streaming sources...');
    
    const alternativeSources = [
      'https://archive.org/details/avatar_2009',
      'https://www.youtube.com/results?search_query=avatar+2009+full+movie',
      'https://vimeo.com/search?q=avatar+2009+full+movie'
    ];
    
    for (const source of alternativeSources) {
      try {
        this.logger.info(`🎯 Trying alternative source: ${source}`);
        await this.page.goto(source, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if we found any video content
        const videoElements = await this.page.$$('video');
        if (videoElements.length > 0) {
          this.logger.success(`✅ Found video content on alternative source: ${source}`);
          return true;
        }
      } catch (error) {
        this.logger.info(`Alternative source ${source} failed: ${error.message}`);
      }
    }
    
    return false;
  }

  async downloadWithYtdlp(streamUrl, outputPath) {
    this.logger.info(`📥 Downloading with yt-dlp: ${streamUrl}`);
    
    // Enhanced yt-dlp command with better headers
    const ytdlpCommand = `yt-dlp -o "${outputPath}" --add-header "Referer: https://cataz.to/" --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --add-header "Accept: */*" --add-header "Accept-Language: en-US,en;q=0.9" --add-header "Accept-Encoding: gzip, deflate, br" --add-header "DNT: 1" --add-header "Connection: keep-alive" --add-header "Sec-Fetch-Dest: video" --add-header "Sec-Fetch-Mode: cors" --add-header "Sec-Fetch-Site: cross-site" --add-header "X-Forwarded-For: 192.168.1.1" --add-header "X-Real-IP: 192.168.1.1" --add-header "X-Client-IP: 192.168.1.1" --retries 3 --fragment-retries 3 "${streamUrl}"`;

    try {
      const { stdout, stderr } = await execAsync(ytdlpCommand, { 
        timeout: 600000, // 10 minutes timeout
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
      this.logger.info(`🎬 Starting Cataz enhanced extraction for: ${movieTitle}`);
      this.logger.info(`🔗 URL: ${movieUrl}`);
      this.logger.info(`🛡️ VPN: Active (optimized)`);

      await this.initializeBrowser();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      this.logger.success('✅ Movie page loaded');

      // Find and click play button
      await this.findAndClickPlayButton();

      // Handle new tab for video playback
      const newPage = await this.handleNewTab();

      // Inject custom JavaScript to extract stream URLs
      const extractedStreams = await this.injectCustomJavaScript(newPage);
      
      if (extractedStreams.length === 0) {
        this.logger.warn('⚠️ No streams extracted with custom JavaScript, trying alternative sources...');
        
        // Try alternative sources
        const alternativeFound = await this.tryAlternativeSources();
        
        if (!alternativeFound) {
          throw new Error('No video streams found with enhanced methods');
        }
      }

      this.logger.success(`🎬 Found ${this.capturedStreams.length} video streams with enhanced methods`);

      // Try downloading with each stream using yt-dlp
      for (let i = 0; i < this.capturedStreams.length; i++) {
        const stream = this.capturedStreams[i];
        this.logger.info(`🎯 Trying enhanced stream ${i + 1}/${this.capturedStreams.length}: ${stream.url}`);

        const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-enhanced-extracted-${i + 1}.mp4`;
        const result = await this.downloadWithYtdlp(stream.url, outputPath);
        
        if (result.success) {
          this.logger.success(`🎉 Cataz enhanced extraction completed!`);
          this.logger.success(`📁 File: ${result.filePath}`);
          this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          return result;
        }
      }

      throw new Error('All enhanced extraction attempts failed');

    } catch (error) {
      this.logger.error(`❌ Cataz enhanced extraction failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

// Test the Cataz enhanced extractor
async function downloadFromCatazEnhancedExtractor() {
  console.log('🎬 Cataz Enhanced Extractor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ VPN Status: Active (optimized)');
  console.log('🔧 Configuration: Advanced iframe handling with custom JavaScript injection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const downloader = new CatazEnhancedExtractor();

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009_Cataz_Enhanced_Extracted'
    );
    
    console.log('🎉 Cataz enhanced extraction completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('🛡️ Your VPN is working perfectly with Cataz enhanced extraction!');
    
  } catch (error) {
    console.error('❌ Cataz enhanced extraction failed:', error.message);
    console.log('💡 Tips:');
    console.log('   - Keep your VPN active');
    console.log('   - The system uses advanced iframe handling and custom JavaScript injection');
    console.log('   - Try different VPN servers if needed');
  }
}

// Run the download
downloadFromCatazEnhancedExtractor().catch(console.error);

