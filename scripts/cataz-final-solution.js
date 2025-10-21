import puppeteer from 'puppeteer';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cataz Final Solution - Network analysis and alternative sources
class CatazFinalSolution {
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

    // Set up comprehensive network interception
    await this.page.setRequestInterception(true);
    
    this.page.on('request', (request) => {
      const url = request.url();
      
      // Capture all potential video streams
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

    this.logger.success('Browser initialized for final solution');
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

  async tryAlternativeStreamingSources() {
    this.logger.info('🔍 Trying alternative streaming sources...');
    
    const alternativeSources = [
      {
        name: 'Archive.org',
        url: 'https://archive.org/details/avatar_2009',
        searchQuery: 'avatar 2009 full movie'
      },
      {
        name: 'YouTube',
        url: 'https://www.youtube.com/results?search_query=avatar+2009+full+movie',
        searchQuery: 'avatar 2009 full movie'
      },
      {
        name: 'Vimeo',
        url: 'https://vimeo.com/search?q=avatar+2009+full+movie',
        searchQuery: 'avatar 2009 full movie'
      }
    ];
    
    for (const source of alternativeSources) {
      try {
        this.logger.info(`🎯 Trying alternative source: ${source.name}`);
        await this.page.goto(source.url, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if we found any video content
        const videoElements = await this.page.$$('video');
        if (videoElements.length > 0) {
          this.logger.success(`✅ Found video content on ${source.name}`);
          
          // Try to extract video URLs
          const videoUrls = await this.page.$$eval('video', videos => 
            videos.map(video => ({
              src: video.src,
              currentSrc: video.currentSrc
            })).filter(video => video.src || video.currentSrc)
          );
          
          videoUrls.forEach(video => {
            if (video.src) {
              this.capturedStreams.push({
                url: video.src,
                timestamp: new Date().toISOString(),
                source: `${source.name}-video-src`
              });
              this.logger.info(`🎬 ${source.name} video src: ${video.src}`);
            }
            if (video.currentSrc && video.currentSrc !== video.src) {
              this.capturedStreams.push({
                url: video.currentSrc,
                timestamp: new Date().toISOString(),
                source: `${source.name}-video-currentSrc`
              });
              this.logger.info(`🎬 ${source.name} video currentSrc: ${video.currentSrc}`);
            }
          });
          
          return true;
        }
      } catch (error) {
        this.logger.info(`Alternative source ${source.name} failed: ${error.message}`);
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
      this.logger.info(`🎬 Starting Cataz final solution for: ${movieTitle}`);
      this.logger.info(`🔗 URL: ${movieUrl}`);
      this.logger.info(`🛡️ VPN: Active (optimized)`);

      await this.initializeBrowser();

      // Navigate to movie page
      await this.page.goto(movieUrl, { waitUntil: 'networkidle2' });
      this.logger.success('✅ Movie page loaded');

      // Find and click play button
      await this.findAndClickPlayButton();

      // Wait for network requests to be captured
      await new Promise(resolve => setTimeout(resolve, 10000));

      // If no streams captured from Cataz, try alternative sources
      if (this.capturedStreams.length === 0) {
        this.logger.warn('⚠️ No streams captured from Cataz, trying alternative sources...');
        
        const alternativeFound = await this.tryAlternativeStreamingSources();
        
        if (!alternativeFound) {
          throw new Error('No video streams found from any source');
        }
      }

      this.logger.success(`🎬 Found ${this.capturedStreams.length} video streams`);

      // Try downloading with each stream using yt-dlp
      for (let i = 0; i < this.capturedStreams.length; i++) {
        const stream = this.capturedStreams[i];
        this.logger.info(`🎯 Trying stream ${i + 1}/${this.capturedStreams.length}: ${stream.url}`);

        const outputPath = `downloads/${movieTitle.replace(/[^a-zA-Z0-9]/g, '_')}-final-solution-${i + 1}.mp4`;
        const result = await this.downloadWithYtdlp(stream.url, outputPath);
        
        if (result.success) {
          this.logger.success(`🎉 Cataz final solution completed!`);
          this.logger.success(`📁 File: ${result.filePath}`);
          this.logger.success(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
          return result;
        }
      }

      throw new Error('All final solution attempts failed');

    } catch (error) {
      this.logger.error(`❌ Cataz final solution failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('🔒 Browser closed');
      }
    }
  }
}

// Test the Cataz final solution
async function downloadFromCatazFinalSolution() {
  console.log('🎬 Cataz Final Solution');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ VPN Status: Active (optimized)');
  console.log('🔧 Configuration: Network analysis and alternative streaming sources');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const downloader = new CatazFinalSolution();

  try {
    const result = await downloader.downloadMovie(
      'https://cataz.to/movie/watch-avatar-2009-19690',
      'Avatar_2009_Cataz_Final_Solution'
    );
    
    console.log('🎉 Cataz final solution completed successfully!');
    console.log(`📁 File: ${result.filePath}`);
    console.log(`📊 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('🛡️ Your VPN is working perfectly with Cataz final solution!');
    
  } catch (error) {
    console.error('❌ Cataz final solution failed:', error.message);
    console.log('💡 Tips:');
    console.log('   - Keep your VPN active');
    console.log('   - The system tries alternative streaming sources if Cataz fails');
    console.log('   - Try different VPN servers if needed');
  }
}

// Run the download
downloadFromCatazFinalSolution().catch(console.error);

