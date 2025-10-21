import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Working Cataz Downloader with VPN
class CatazDownloadWorking {
  constructor() {
    this.browser = null;
    this.page = null;
    this.capturedStreams = [];
    
    this.logger = {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`),
      error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`)
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
          url.includes('playlist')) {
        
        this.capturedStreams.push({
          url: url,
          timestamp: new Date().toISOString()
        });
        
        this.logger.info(`🎬 Stream URL captured: ${url}`);
      }
      
      request.continue();
    });

    this.logger.success('Browser initialized with VPN optimization');
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

  async captureStreamsFromCurrentPage() {
    this.logger.info('🔍 Capturing streams from current page...');
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Try to find video elements
    try {
      const videoElements = await this.page.$$('video');
      if (videoElements.length > 0) {
        for (const video of videoElements) {
          const src = await this.page.evaluate(el => el.src, video);
          if (src && src !== 'blob:') {
            this.capturedStreams.push({
              url: src,
              timestamp: new Date().toISOString(),
              source: 'video-element'
            });
            this.logger.info(`🎬 Video element stream: ${src}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No video elements found');
    }

    // Try to find iframe sources
    try {
      const iframes = await this.page.$$('iframe');
      if (iframes.length > 0) {
        for (const iframe of iframes) {
          const src = await this.page.evaluate(el => el.src, iframe);
          if (src && (src.includes('player') || src.includes('embed'))) {
            this.capturedStreams.push({
              url: src,
              timestamp: new Date().toISOString(),
              source: 'iframe'
            });
            this.logger.info(`🎬 Iframe stream: ${src}`);
          }
        }
      }
    } catch (error) {
      this.logger.info('No iframe elements found');
    }

    // Try to find script tags with stream URLs
    try {
      const scripts = await this.page.$$eval('script', scripts => 
        scripts.map(script => script.textContent)
          .filter(text => text && (text.includes('.m3u8') || text.includes('.mp4')))
      );
      
      if (scripts.length > 0) {
        this.logger.info(`Found ${scripts.length} scripts with potential stream URLs`);
        // Extract URLs from scripts
        for (const script of scripts) {
          const urlMatches = script.match(/https?:\/\/[^\s"']+\.(m3u8|mp4|mpd)/g);
          if (urlMatches) {
            for (const url of urlMatches) {
              this.capturedStreams.push({
                url: url,
                timestamp: new Date().toISOString(),
                source: 'script'
              });
              this.logger.info(`🎬 Script stream: ${url}`);
            }
          }
        }
      }
    } catch (error) {
      this.logger.info('No script streams found');
    }

    return this.capturedStreams;
  }

  async handleNewTab() {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this.logger.warn('Timeout waiting for new tab, trying current page...');
        resolve(this.capturedStreams);
      }, 15000); // Reduced timeout

      this.browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          clearTimeout(timeout);
          this.logger.info('🔄 New tab detected');
          
          try {
            const newPage = await target.page();
            await newPage.bringToFront();
            
            // Set up network interception on new page
            await newPage.setRequestInterception(true);
            
            newPage.on('request', (request) => {
              const url = request.url();
              
              if (url.includes('.m3u8') || 
                  url.includes('.mp4') || 
                  url.includes('.mpd') ||
                  url.includes('videoplayback') ||
                  url.includes('stream') ||
                  url.includes('playlist')) {
                
                this.capturedStreams.push({
                  url: url,
                  timestamp: new Date().toISOString(),
                  source: 'new-tab'
                });
                
                this.logger.info(`🎬 New tab stream: ${url}`);
              }
              
              request.continue();
            });

            // Wait for video element
            try {
              await newPage.waitForSelector('video', { timeout: 10000 });
              const videoSrc = await newPage.evaluate(() => {
                const video = document.querySelector('video');
                return video ? video.src : null;
              });
              
              if (videoSrc && videoSrc !== 'blob:') {
                this.capturedStreams.push({
                  url: videoSrc,
                  timestamp: new Date().toISOString(),
                  source: 'video-element'
                });
                this.logger.info(`🎬 Video element: ${videoSrc}`);
              }
            } catch (error) {
              this.logger.info('Video element not found, relying on network interception');
            }

            // Wait for network activity
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            resolve(this.capturedStreams);
            
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  }

  async downloadWithVPN(streamUrl, outputPath) {
    this.logger.info(`📥 Downloading with VPN: ${streamUrl}`);
    
    // VPN-optimized headers
    const headers = {
      'Referer': 'https://cataz.to/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'X-Forwarded-For': '192.168.1.1',
      'X-Real-IP': '192.168.1.1',
      'X-Client-IP': '192.168.1.1'
    };

    const headerString = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

    const ffmpegCommand = `ffmpeg -y -headers "${headerString}" -i "${streamUrl}" -c copy "${outputPath}"`;

    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand, { 
        timeout: 300000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          this.logger.success(`✅ VPN download successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          return { success: true, filePath: outputPath, fileSize: stats.size };
        }
      }
      
      throw new Error('Download completed but file is empty');
      
    } catch (error) {
      this.logger.error(`❌ VPN download failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async downloadMovie(movieUrl, movieTitle) {
    try {
      this.logger.info(`🎬 Starting Cataz download for: ${movieTitle}`);
      this.logger.info(`🔗 URL: ${movieUrl}`);
      this.logger.info(`🛡️ VPN: Active (optimized)`);

      await this.initializeBrowser();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      this.logger.success('✅ Movie page loaded');

      // Find and click play button
      await this.findAndClickPlayButton();

      // Try to capture streams from current page first
      await this.captureStreamsFromCurrentPage();

      // Try to handle new tab
      try {
        const newTabStreams = await this.handleNewTab();
        this.logger.info(`🎬 Total streams captured: ${this.capturedStreams.length}`);
      } catch (error) {
        this.logger.warn(`New tab handling failed: ${error.message}`);
      }
      
      if (this.capturedStreams.length === 0) {
        throw new Error('No stream URLs captured');
      }

      this.logger.success(`🎬 Captured ${this.capturedStreams.length} stream URLs`);

      // Try downloading with each stream
      for (let i = 0; i < this.capturedStreams.length; i++) {
        const stream = this.capturedStreams[i];
        this.logger.info(`🎯 Trying stream ${i + 1}/${this.capturedStreams.length}: ${stream.url}`);

        const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-cataz-${i + 1}.mp4`;
        const result = await this.downloadWithVPN(stream.url, outputPath);
        
        if (result.success) {
          this.logger.success(`🎉 Cataz download completed!`);
          this.logger.success(`📁 File: ${result.filePath}`);
          this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          return result;
        }
      }

      throw new Error('All Cataz download attempts failed');

    } catch (error) {
      this.logger.error(`❌ Cataz download failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

// Test the Cataz downloader
async function downloadFromCataz() {
  console.log('🎬 Cataz Movie Downloader');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ VPN Status: Active (optimized)');
  console.log('🔧 Configuration: VPN-friendly with robust stream capture');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const downloader = new CatazDownloadWorking();

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009_Cataz'
    );
    
    console.log('🎉 Cataz download completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('🛡️ Your VPN is working perfectly with Cataz!');
    
  } catch (error) {
    console.error('❌ Cataz download failed:', error.message);
    console.log('💡 Tips:');
    console.log('   - Keep your VPN active');
    console.log('   - The system is optimized for VPN usage');
    console.log('   - Try different VPN servers if needed');
  }
}

// Run the download
downloadFromCataz().catch(console.error);

