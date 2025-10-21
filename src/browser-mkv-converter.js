// Browser-based MKV Converter - Ultimate Solution
import puppeteer from 'puppeteer';
// // Removed network-config import - using streamlined approach // Removed - not needed for streamlined system

export async function convertWithBrowser(streamUrl, outputPath, headers = {}) {
  console.log(`[BrowserMKV] Starting browser-based conversion: ${streamUrl}`);
  console.log(`[BrowserMKV] Output: ${outputPath}`);
  
  let browser = null;
  
  try {
    // Use streamlined network configuration
    const networkConfig = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      referer: 'https://einthusan.tv/'
    };
    
    browser = await puppeteer.launch({
      headless: true,
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
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      ...networkConfig
    });
    
    const page = await browser.newPage();
    
    // Set headers
    await page.setExtraHTTPHeaders(headers);
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`[BrowserMKV] Navigating to stream URL...`);
    
    // Navigate to the stream URL
    await page.goto(streamUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    console.log(`[BrowserMKV] Page loaded, starting download...`);
    
    // Wait for video element to load
    try {
      await page.waitForSelector('video', { timeout: 15000 });
      console.log(`[BrowserMKV] Video element found`);
    } catch (error) {
      console.log(`[BrowserMKV] No video element found, trying alternative selectors...`);
    }
    
    // Get the playlist URL from video element
    const videoSrc = await page.evaluate(() => {
      // Try video element first
      const video = document.querySelector('video');
      if (video) {
        return video.src || video.currentSrc;
      }
      
      // Try iframe players
      const iframe = document.querySelector('iframe[src*="player"], iframe[src*="embed"]');
      if (iframe) {
        return iframe.src;
      }
      
      // Look for streaming URLs in page content
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        const streamMatch = content.match(/https?:\/\/[^\s"']+\.(m3u8|mp4)[^\s"']*/);
        if (streamMatch) {
          return streamMatch[0];
        }
      }
      
      return null;
    });
    
    if (!videoSrc) {
      throw new Error('Could not find video source - page may not have loaded properly or video may be protected');
    }
    
    console.log(`[BrowserMKV] Video source found: ${videoSrc}`);
    
    // Use FFmpeg with the browser-discovered URL
    const { spawn } = await import('child_process');
    
    const ffmpegArgs = [
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-headers', Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\\r\\n'),
      '-timeout', '60000000',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-reconnect_at_eof', '1',
      '-rtbufsize', '100M',
      '-fflags', '+genpts+igndts',
      '-avoid_negative_ts', 'make_zero',
      '-analyzeduration', '2000000',
      '-probesize', '2000000',
      '-i', videoSrc,
      '-c', 'copy',
      '-f', 'matroska',
      '-y', outputPath
    ];
    
    console.log(`[BrowserMKV] Running FFmpeg with browser-discovered URL...`);
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...networkConfig
      });
      
      let stderr = '';
      let stdout = '';
      
      ffmpeg.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        if (output.includes('time=')) {
          const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2})/);
          if (timeMatch) {
            console.log(`[BrowserMKV] Progress: ${timeMatch[1]}`);
          }
        }
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`[BrowserMKV] ✅ Browser-based conversion successful: ${outputPath}`);
          resolve({
            success: true,
            filePath: outputPath,
            format: 'mkv',
            method: 'browser_discovery',
            stderr: stderr,
            stdout: stdout
          });
        } else {
          console.log(`[BrowserMKV] ❌ Browser-based conversion failed with code: ${code}`);
          reject(new Error(`Browser-based conversion failed with code ${code}: ${stderr}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        console.log(`[BrowserMKV] ❌ FFmpeg spawn error: ${error.message}`);
        reject(error);
      });
    });
    
  } catch (error) {
    console.log(`[BrowserMKV] ❌ Browser conversion error: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Test function for browser-based conversion
export async function testBrowserConversion(streamUrl, headers = {}) {
  console.log(`[BrowserMKV] Testing browser-based conversion...`);
  
  try {
    const testOutputPath = `./test-browser-mkv-${Date.now()}.mkv`;
    
    console.log(`[BrowserMKV] Running browser test conversion...`);
    
    const result = await convertWithBrowser(streamUrl, testOutputPath, headers);
    
    if (result.success) {
      console.log(`[BrowserMKV] ✅ Browser test successful!`);
      
      // Clean up test file
      const fs = await import('fs');
      if (fs.existsSync(testOutputPath)) {
        fs.unlinkSync(testOutputPath);
        console.log(`[BrowserMKV] Test file cleaned up`);
      }
      
      return { success: true, message: 'Browser-based conversion test successful' };
    } else {
      return { success: false, error: 'Browser test conversion failed' };
    }
    
  } catch (error) {
    console.log(`[BrowserMKV] ❌ Browser test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}
