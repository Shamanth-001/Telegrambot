import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// VPN-Optimized Cataz Downloader
class VPNOptimizedDownloader {
  constructor(options = {}) {
    this.options = {
      headless: false,
      timeout: 30000,
      useVPN: true,  // Assume VPN is already active
      vpnOptimized: true,
      maxRetryAttempts: 3,
      fallbackSources: 3,
      ...options
    };

    this.browser = null;
    this.page = null;
    this.capturedStreams = [];
    this.sessionData = null;

    this.logger = {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      warn: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`),
      error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`),
      success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`)
    };
  }

  // Initialize browser optimized for VPN usage
  async initializeBrowser() {
    const launchOptions = {
      headless: this.options.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        // VPN-optimized settings
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--no-zygote',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // VPN-optimized user agents (more diverse)
    const vpnUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];

    const userAgent = vpnUserAgents[Math.floor(Math.random() * vpnUserAgents.length)];
    await this.page.setUserAgent(userAgent);
    await this.page.setViewport({ width: 1920, height: 1080 });

    // VPN-optimized headers
    await this.page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    });

    // Set up network interception
    await this.setupNetworkInterception();

    this.logger.success('Browser initialized with VPN optimization');
  }

  // Enhanced network interception for VPN
  async setupNetworkInterception() {
    await this.page.setRequestInterception(true);
    
    this.page.on('request', (request) => {
      const url = request.url();
      
      // Capture stream URLs
      if (url.includes('.m3u8') || 
          url.includes('.mp4') || 
          url.includes('.mpd') ||
          url.includes('videoplayback') ||
          url.includes('stream') ||
          url.includes('playlist')) {
        
        this.capturedStreams.push({
          url: url,
          timestamp: new Date().toISOString(),
          headers: request.headers(),
          method: request.method()
        });
        
        this.logger.info(`🎬 Stream URL captured: ${url}`);
      }
      
      // VPN-optimized request handling
      const headers = request.headers();
      
      // Add VPN-friendly headers
      headers['X-Forwarded-For'] = this.generateRandomIP();
      headers['X-Real-IP'] = this.generateRandomIP();
      headers['X-Client-IP'] = this.generateRandomIP();
      headers['CF-Connecting-IP'] = this.generateRandomIP();
      
      request.continue({ headers });
    });

    this.page.on('response', (response) => {
      const url = response.url();
      const status = response.status();
      
      if (status >= 400) {
        this.logger.warn(`⚠️ HTTP ${status} for: ${url}`);
      }
    });
  }

  // Generate random IP for VPN simulation
  generateRandomIP() {
    const ip = [
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256)
    ].join('.');
    return ip;
  }

  // VPN-optimized play button detection
  async findAndClickPlayButton() {
    const playButtonSelectors = [
      'a[href*="watch-movie"]',
      'a[href*="watch"]',
      'button[class*="play"]',
      'button[class*="watch"]',
      '.play-button',
      '.watch-button',
      '[data-action="play"]',
      'a:contains("Watch")',
      'a:contains("Play")',
      'button:contains("Watch")',
      'button:contains("Play")'
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
      this.logger.info(`🎯 Play button attempt ${attempt}`);
      
      for (const selector of playButtonSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            this.logger.info(`🎯 Found play button with selector: ${selector}`);
            
            // Scroll to element and click
            await this.page.evaluate((el) => el.scrollIntoView(), element);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await element.click();
            this.logger.success('✅ Play button clicked successfully');
            return true;
          }
        } catch (error) {
          this.logger.warn(`Selector ${selector} failed: ${error.message}`);
        }
      }
      
      if (attempt < 3) {
        this.logger.info('⏳ Waiting before retry...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    throw new Error('No play button found with any selector');
  }

  // VPN-optimized new tab handling
  async handleNewTabAndExtractStreams() {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for new tab'));
      }, 30000);

      this.browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          clearTimeout(timeout);
          this.logger.info('🔄 New tab detected, switching context...');
          
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
                  headers: request.headers(),
                  source: 'new-tab'
                });
                
                this.logger.info(`🎬 New tab stream captured: ${url}`);
              }
              
              request.continue();
            });

            // Wait for video element or network requests
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
                this.logger.info(`🎬 Video element stream: ${videoSrc}`);
              }
            } catch (error) {
              this.logger.warn('Video element not found, relying on network interception');
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

  // VPN-optimized download with enhanced bypass
  async downloadWithVPNBypass(streamUrl, outputPath, attempt = 1) {
    this.logger.info(`🎯 VPN bypass attempt ${attempt}`);
    
    let headers = {
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
      'Range': 'bytes=0-'
    };

    // VPN-specific headers
    headers['X-Forwarded-For'] = this.generateRandomIP();
    headers['X-Real-IP'] = this.generateRandomIP();
    headers['X-Client-IP'] = this.generateRandomIP();
    headers['CF-Connecting-IP'] = this.generateRandomIP();
    headers['X-Forwarded-Proto'] = 'https';
    headers['X-Forwarded-Host'] = 'cataz.to';

    // Apply different bypass techniques
    switch (attempt) {
      case 1:
        // Default VPN headers
        break;
      case 2:
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0';
        break;
      case 3:
        headers['Referer'] = 'https://cataz.to/';
        delete headers['Range'];
        break;
    }

    const headerString = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

    const ffmpegCommand = `ffmpeg -y -headers "${headerString}" -i "${streamUrl}" -c copy "${outputPath}"`;

    this.logger.info(`📥 VPN download attempt ${attempt}: ${streamUrl}`);

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
      
      throw new Error('Download completed but file is empty or missing');
      
    } catch (error) {
      this.logger.error(`❌ VPN download attempt ${attempt} failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Main download method optimized for VPN
  async downloadMovie(movieUrl, movieTitle = 'movie') {
    try {
      this.logger.info(`🎬 Starting VPN-optimized download for: ${movieTitle}`);
      this.logger.info(`🔗 URL: ${movieUrl}`);
      this.logger.info(`🛡️ VPN Status: Active (optimized)`);

      // Initialize browser with VPN optimization
      await this.initializeBrowser();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      this.logger.success('✅ Movie page loaded successfully');

      // Find and click play button
      await this.findAndClickPlayButton();

      // Handle new tab and extract streams
      const streams = await this.handleNewTabAndExtractStreams();
      
      if (streams.length === 0) {
        throw new Error('No stream URLs captured');
      }

      this.logger.success(`🎬 Captured ${streams.length} stream URLs`);

      // Try downloading with each stream URL
      for (let i = 0; i < streams.length; i++) {
        const stream = streams[i];
        this.logger.info(`🎯 Trying stream ${i + 1}/${streams.length}: ${stream.url}`);

        // Try multiple VPN bypass attempts for each stream
        for (let attempt = 1; attempt <= 3; attempt++) {
          const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-vpn-${i + 1}-attempt-${attempt}.mp4`;
          
          const result = await this.downloadWithVPNBypass(stream.url, outputPath, attempt);
          
          if (result.success) {
            this.logger.success(`🎉 VPN download completed successfully!`);
            this.logger.success(`📁 File: ${result.filePath}`);
            this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
            return result;
          }
        }
      }

      throw new Error('All VPN download attempts failed');

    } catch (error) {
      this.logger.error(`❌ VPN download failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

export default VPNOptimizedDownloader;














