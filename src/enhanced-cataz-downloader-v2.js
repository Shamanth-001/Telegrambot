import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Enhanced logger
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`)
};

// Proxy/VPN configuration
const PROXY_CONFIGS = [
  { host: '127.0.0.1', port: 8080, username: '', password: '' },
  { host: '127.0.0.1', port: 1080, username: '', password: '' },
  // Add more proxy configurations as needed
];

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 5,
  baseDelay: 2000,
  maxDelay: 30000,
  backoffMultiplier: 2
};

// Enhanced headers with rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Alternative sources for fallback
const ALTERNATIVE_SOURCES = [
  {
    name: 'Archive.org',
    searchUrl: (title) => `https://archive.org/search.php?query=${encodeURIComponent(title)}`,
    downloader: 'yt-dlp'
  },
  {
    name: 'YouTube',
    searchUrl: (title) => `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' full movie')}`,
    downloader: 'yt-dlp'
  },
  {
    name: 'Vimeo',
    searchUrl: (title) => `https://vimeo.com/search?q=${encodeURIComponent(title)}`,
    downloader: 'yt-dlp'
  }
];

class EnhancedCatazDownloader {
  constructor(options = {}) {
    this.options = {
      headless: false,
      timeout: 30000,
      useProxy: false,
      proxyIndex: 0,
      retryAttempts: RETRY_CONFIG.maxAttempts,
      ...options
    };
    
    this.browser = null;
    this.page = null;
    this.capturedStreams = [];
    this.sessionData = null;
  }

  // Exponential backoff retry logic
  async retryWithBackoff(operation, context = '') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        logger.info(`${context} - Attempt ${attempt}/${this.options.retryAttempts}`);
        
        const result = await operation();
        if (result) {
          logger.success(`${context} - Success on attempt ${attempt}`);
          return result;
        }
        
        throw new Error('Operation returned falsy result');
        
      } catch (error) {
        lastError = error;
        logger.warn(`${context} - Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.options.retryAttempts) {
          const delay = Math.min(
            RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
            RETRY_CONFIG.maxDelay
          );
          
          logger.info(`${context} - Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`${context} - All ${this.options.retryAttempts} attempts failed. Last error: ${lastError.message}`);
  }

  // Initialize browser with proxy support
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
        '--disable-features=VizDisplayCompositor'
      ]
    };

    // Add proxy configuration if enabled
    if (this.options.useProxy && PROXY_CONFIGS[this.options.proxyIndex]) {
      const proxy = PROXY_CONFIGS[this.options.proxyIndex];
      launchOptions.args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
      
      if (proxy.username && proxy.password) {
        launchOptions.args.push(`--proxy-auth=${proxy.username}:${proxy.password}`);
      }
      
      logger.info(`Using proxy: ${proxy.host}:${proxy.port}`);
    }

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();
    
    // Set random user agent
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    await this.page.setUserAgent(userAgent);
    
    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    logger.info('Browser initialized successfully');
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
          headers: request.headers()
        });
        
        logger.info(`🎬 Stream URL captured: ${url}`);
      }
      
      request.continue();
    });

    this.page.on('response', (response) => {
      const url = response.url();
      const status = response.status();
      
      if (status >= 400) {
        logger.warn(`⚠️ HTTP ${status} for: ${url}`);
      }
    });
  }

  // Dynamic selector detection for play buttons
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
      'a:contains("Play")'
    ];

    for (const selector of playButtonSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          logger.info(`🎯 Found play button with selector: ${selector}`);
          
          // Scroll to element and click
          await this.page.evaluate((el) => el.scrollIntoView(), element);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await element.click();
          logger.success('✅ Play button clicked successfully');
          return true;
        }
      } catch (error) {
        logger.warn(`Selector ${selector} failed: ${error.message}`);
      }
    }
    
    throw new Error('No play button found with any selector');
  }

  // Handle new tab detection and stream extraction
  async handleNewTabAndExtractStreams() {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for new tab'));
      }, 30000);

      this.browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          clearTimeout(timeout);
          logger.info('🔄 New tab detected, switching context...');
          
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
                
                logger.info(`🎬 New tab stream captured: ${url}`);
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
                logger.info(`🎬 Video element stream: ${videoSrc}`);
              }
            } catch (error) {
              logger.warn('Video element not found, relying on network interception');
            }

            // Wait for network activity
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            // Capture session data
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

            this.sessionData = { cookies, headers };
            logger.success('✅ Session data captured successfully');
            
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
    logger.info(`🎯 Bypass attempt ${attempt}/${MAX_BYPASS_ATTEMPTS}`);
    
    let headers = {
      'Referer': 'https://cataz.to/',
      'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
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
    if (this.sessionData && this.sessionData.cookies) {
      const cookieString = this.sessionData.cookies
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
      headers['Cookie'] = cookieString;
    }

    // Apply different bypass techniques based on attempt
    switch (attempt) {
      case 1:
        // Default headers
        break;
      case 2:
        // Change User-Agent to Firefox
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0';
        break;
      case 3:
        // Change Referer to base domain
        headers['Referer'] = 'https://cataz.to/';
        break;
      case 4:
        // Add proxy-related headers
        headers['X-Forwarded-For'] = '192.168.1.1';
        headers['X-Real-IP'] = '192.168.1.1';
        headers['X-Client-IP'] = '192.168.1.1';
        headers['CF-Connecting-IP'] = '192.168.1.1';
        break;
      case 5:
        // Remove Range header for full download
        delete headers['Range'];
        break;
    }

    const headerString = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

    const ffmpegCommand = `ffmpeg -y -headers "${headerString}" -i "${streamUrl}" -c copy "${outputPath}"`;

    logger.info(`📥 Download attempt ${attempt}: ${streamUrl}`);
    logger.info(`🔧 FFmpeg command: ${ffmpegCommand}`);

    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand, { 
        timeout: 300000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      
      // Check if file was created and has content
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          logger.success(`✅ Download successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          return { success: true, filePath: outputPath, fileSize: stats.size };
        }
      }
      
      throw new Error('Download completed but file is empty or missing');
      
    } catch (error) {
      logger.error(`❌ Download attempt ${attempt} failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Try alternative sources as fallback
  async tryAlternativeSources(movieTitle) {
    logger.info(`🔄 Trying alternative sources for: ${movieTitle}`);
    
    for (const source of ALTERNATIVE_SOURCES) {
      try {
        logger.info(`🔍 Searching ${source.name}...`);
        
        const searchUrl = source.searchUrl(movieTitle);
        const { stdout } = await execAsync(`yt-dlp --get-url "${searchUrl}"`);
        
        if (stdout.trim()) {
          const downloadUrl = stdout.trim();
          logger.success(`✅ Found on ${source.name}: ${downloadUrl}`);
          
          const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-${source.name.toLowerCase()}.mp4`;
          const { stdout: downloadResult } = await execAsync(`yt-dlp -o "${outputPath}" "${downloadUrl}"`);
          
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            if (stats.size > 0) {
              logger.success(`✅ Downloaded from ${source.name}: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
              return { success: true, filePath: outputPath, source: source.name };
            }
          }
        }
      } catch (error) {
        logger.warn(`❌ ${source.name} failed: ${error.message}`);
      }
    }
    
    return { success: false, error: 'All alternative sources failed' };
  }

  // Main download method
  async downloadMovie(movieUrl, movieTitle = 'movie') {
    try {
      logger.info(`🎬 Starting enhanced download for: ${movieTitle}`);
      logger.info(`🔗 URL: ${movieUrl}`);

      // Initialize browser
      await this.initializeBrowser();
      await this.setupNetworkInterception();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      logger.info('✅ Movie page loaded successfully');

      // Find and click play button
      await this.retryWithBackoff(
        () => this.findAndClickPlayButton(),
        'Play button click'
      );

      // Handle new tab and extract streams
      const streams = await this.handleNewTabAndExtractStreams();
      
      if (streams.length === 0) {
        throw new Error('No stream URLs captured');
      }

      logger.success(`🎬 Captured ${streams.length} stream URLs`);

      // Try downloading with each stream URL
      for (let i = 0; i < streams.length; i++) {
        const stream = streams[i];
        logger.info(`🎯 Trying stream ${i + 1}/${streams.length}: ${stream.url}`);

        // Try multiple bypass attempts for each stream
        for (let attempt = 1; attempt <= 5; attempt++) {
          const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-cataz-${i + 1}-attempt-${attempt}.mp4`;
          
          const result = await this.downloadWithBypass(stream.url, outputPath, attempt);
          
          if (result.success) {
            logger.success(`🎉 Download completed successfully!`);
            logger.success(`📁 File: ${result.filePath}`);
            logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
            return result;
          }
        }
      }

      // If all Cataz attempts failed, try alternative sources
      logger.warn('❌ All Cataz download attempts failed, trying alternative sources...');
      const fallbackResult = await this.tryAlternativeSources(movieTitle);
      
      if (fallbackResult.success) {
        return fallbackResult;
      }

      throw new Error('All download methods failed');

    } catch (error) {
      logger.error(`❌ Download failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        logger.info('🔒 Browser closed');
      }
    }
  }
}

// Export the class
export default EnhancedCatazDownloader;

// Example usage
async function main() {
  const downloader = new EnhancedCatazDownloader({
    headless: false,
    useProxy: false,
    retryAttempts: 3
  });

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009'
    );
    
    console.log('🎉 Download completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
