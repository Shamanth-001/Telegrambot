import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

// Import all our enhanced modules
import ProxyManager from './proxy-manager.js';
import { RetryManager, createRetryManager } from './retry-manager.js';
import FallbackSourceManager from './fallback-source-manager.js';
import SessionPersistenceManager from './session-persistence-manager.js';

const execAsync = promisify(exec);

// Ultimate Cataz Downloader with all enhancements
class UltimateCatazDownloader {
  constructor(options = {}) {
    this.options = {
      headless: false,
      timeout: 30000,
      useProxy: false,
      useRetry: true,
      useFallback: true,
      useSessionPersistence: true,
      maxRetryAttempts: 5,
      fallbackSources: 3,
      sessionDir: './sessions',
      proxyConfigPath: './proxy-config.json',
      ...options
    };

    // Initialize managers
    this.proxyManager = new ProxyManager(this.options.proxyConfigPath);
    this.retryManager = createRetryManager('network');
    this.fallbackManager = new FallbackSourceManager();
    this.sessionManager = new SessionPersistenceManager(this.options.sessionDir);

    // Browser and page instances
    this.browser = null;
    this.page = null;
    this.currentSession = null;
    this.capturedStreams = [];

    // Enhanced logging
    this.logger = {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      warn: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`),
      error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`),
      success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`)
    };
  }

  // Initialize browser with all enhancements
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
        '--disable-blink-features=AutomationControlled'
      ]
    };

    // Add proxy configuration if enabled
    if (this.options.useProxy) {
      const proxy = this.proxyManager.getNextProxy();
      const proxyConfig = this.proxyManager.getPuppeteerProxyConfig(proxy);
      Object.assign(launchOptions, proxyConfig);
      this.logger.info(`Using proxy: ${proxy.name} (${proxy.host}:${proxy.port})`);
    }

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Set up session persistence
    if (this.options.useSessionPersistence) {
      this.currentSession = this.sessionManager.getOrCreateSession('cataz.to');
      
      // Apply saved cookies
      const cookies = this.sessionManager.getPuppeteerCookies(this.currentSession.id);
      if (cookies.length > 0) {
        await this.page.setCookie(...cookies);
        this.logger.info(`Applied ${cookies.length} saved cookies`);
      }
    }

    // Set up enhanced headers
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    await this.page.setUserAgent(userAgent);
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Set up network interception
    await this.setupNetworkInterception();

    this.logger.success('Browser initialized with all enhancements');
  }

  // Enhanced network interception
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
      
      request.continue();
    });

    this.page.on('response', (response) => {
      const url = response.url();
      const status = response.status();
      
      if (status >= 400) {
        this.logger.warn(`⚠️ HTTP ${status} for: ${url}`);
      }
    });
  }

  // Enhanced play button detection with retry
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

    return this.retryManager.execute(async (attempt, context) => {
      this.logger.info(`🎯 Play button attempt ${attempt}`);
      
      for (const selector of playButtonSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            this.logger.info(`🎯 Found play button with selector: ${selector}`);
            
            // Scroll to element and click
            await this.page.evaluate((el) => el.scrollIntoView(), element);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await element.click();
            this.logger.success('✅ Play button clicked successfully');
            return true;
          }
        } catch (error) {
          this.logger.warn(`Selector ${selector} failed: ${error.message}`);
        }
      }
      
      throw new Error('No play button found with any selector');
    }, { name: 'playButtonClick' });
  }

  // Enhanced new tab handling with session persistence
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
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            // Capture and save session data
            if (this.options.useSessionPersistence && this.currentSession) {
              const cookies = await newPage.cookies();
              const headers = await newPage.evaluate(() => {
                return {
                  'User-Agent': navigator.userAgent,
                  'Accept': '*/*',
                  'Accept-Language': navigator.language,
                  'Accept-Encoding': 'gzip, deflate, br',
                  'DNT': '1',
                  'Connection': 'keep-alive'
                };
              });

              this.sessionManager.addCookies(this.currentSession.id, cookies);
              this.sessionManager.updateHeaders(this.currentSession.id, headers);
              this.logger.success('✅ Session data captured and saved');
            }
            
            resolve(this.capturedStreams);
            
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  }

  // Enhanced download with multiple bypass techniques
  async downloadWithBypass(streamUrl, outputPath, attempt = 1) {
    const MAX_BYPASS_ATTEMPTS = 5;
    this.logger.info(`🎯 Bypass attempt ${attempt}/${MAX_BYPASS_ATTEMPTS}`);
    
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

    // Add session cookies if available
    if (this.currentSession) {
      const sessionHeaders = this.sessionManager.getSessionHeaders(this.currentSession.id);
      Object.assign(headers, sessionHeaders);
      
      const cookies = this.sessionManager.getPuppeteerCookies(this.currentSession.id);
      if (cookies.length > 0) {
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        headers['Cookie'] = cookieString;
      }
    }

    // Apply different bypass techniques
    switch (attempt) {
      case 1:
        // Default headers
        break;
      case 2:
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0';
        break;
      case 3:
        headers['Referer'] = 'https://cataz.to/';
        break;
      case 4:
        headers['X-Forwarded-For'] = '192.168.1.1';
        headers['X-Real-IP'] = '192.168.1.1';
        headers['X-Client-IP'] = '192.168.1.1';
        headers['CF-Connecting-IP'] = '192.168.1.1';
        break;
      case 5:
        delete headers['Range'];
        break;
    }

    const headerString = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

    const ffmpegCommand = `ffmpeg -y -headers "${headerString}" -i "${streamUrl}" -c copy "${outputPath}"`;

    this.logger.info(`📥 Download attempt ${attempt}: ${streamUrl}`);

    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand, { 
        timeout: 300000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          this.logger.success(`✅ Download successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          return { success: true, filePath: outputPath, fileSize: stats.size };
        }
      }
      
      throw new Error('Download completed but file is empty or missing');
      
    } catch (error) {
      this.logger.error(`❌ Download attempt ${attempt} failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Main download method with all enhancements
  async downloadMovie(movieUrl, movieTitle = 'movie') {
    try {
      this.logger.info(`🎬 Starting ultimate download for: ${movieTitle}`);
      this.logger.info(`🔗 URL: ${movieUrl}`);

      // Initialize browser with all enhancements
      await this.initializeBrowser();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      this.logger.success('✅ Movie page loaded successfully');

      // Find and click play button with retry
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

        // Try multiple bypass attempts for each stream
        for (let attempt = 1; attempt <= 5; attempt++) {
          const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-ultimate-${i + 1}-attempt-${attempt}.mp4`;
          
          const result = await this.downloadWithBypass(stream.url, outputPath, attempt);
          
          if (result.success) {
            this.logger.success(`🎉 Download completed successfully!`);
            this.logger.success(`📁 File: ${result.filePath}`);
            this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
            return result;
          }
        }
      }

      // If all Cataz attempts failed, try fallback sources
      if (this.options.useFallback) {
        this.logger.warn('❌ All Cataz download attempts failed, trying fallback sources...');
        const fallbackResult = await this.fallbackManager.downloadWithFallback(movieTitle, this.options.fallbackSources);
        
        if (fallbackResult.success) {
          this.logger.success(`🎉 Fallback download successful from ${fallbackResult.source}!`);
          return fallbackResult;
        }
      }

      throw new Error('All download methods failed');

    } catch (error) {
      this.logger.error(`❌ Download failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }

  // Get comprehensive statistics
  getStats() {
    return {
      sessionStats: this.sessionManager.getSessionStats(),
      proxyStats: this.proxyManager.getProxyStats(),
      retryStats: this.retryManager.getStats(),
      fallbackStats: this.fallbackManager.getSourceStats(),
      capturedStreams: this.capturedStreams.length
    };
  }

  // Health check for all components
  async healthCheck() {
    const health = {
      browser: false,
      proxy: false,
      retry: false,
      fallback: false,
      session: false
    };

    try {
      // Test browser
      if (this.browser) {
        const pages = await this.browser.pages();
        health.browser = pages.length > 0;
      }

      // Test proxy manager
      const proxyStats = this.proxyManager.getProxyStats();
      health.proxy = Object.keys(proxyStats).length > 0;

      // Test retry manager
      const retryHealth = await this.retryManager.healthCheck();
      health.retry = retryHealth.status === 'healthy';

      // Test fallback manager
      const fallbackHealth = await this.fallbackManager.healthCheck();
      health.fallback = Object.values(fallbackHealth).some(h => h.status === 'healthy');

      // Test session manager
      const sessionStats = this.sessionManager.getSessionStats();
      health.session = sessionStats.totalSessions >= 0;

    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
    }

    return health;
  }
}

// Export the class
export default UltimateCatazDownloader;

// Example usage
async function main() {
  const downloader = new UltimateCatazDownloader({
    headless: false,
    useProxy: false,
    useRetry: true,
    useFallback: true,
    useSessionPersistence: true,
    maxRetryAttempts: 3,
    fallbackSources: 3
  });

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009'
    );
    
    console.log('🎉 Download completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Show statistics
    const stats = downloader.getStats();
    console.log('\n📊 System Statistics:');
    console.log(`Sessions: ${stats.sessionStats.totalSessions}`);
    console.log(`Captured Streams: ${stats.capturedStreams}`);
    console.log(`Proxy Stats: ${Object.keys(stats.proxyStats).length} proxies`);
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
