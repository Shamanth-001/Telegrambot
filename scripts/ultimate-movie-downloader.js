import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = "c:\\telegram bot\\downloads";
const DURATION = 120; // 2 minutes
const MAX_ATTEMPTS = 5;

// Multiple movie sources to try
const MOVIE_SOURCES = [
  {
    name: "Fmovies",
    url: "https://www.fmovies.gd/watch/movie/24428",
    selectors: ['a[class*="play" i]', 'button[class*="play" i]', '.play-btn', '.watch-button']
  },
  {
    name: "Fmovies Alternative",
    url: "https://www.fmovies.gd/watch/movie/24429", 
    selectors: ['a[class*="play" i]', 'button[class*="play" i]', '.play-btn', '.watch-button']
  },
  {
    name: "Cataz",
    url: "https://cataz.to/movie/watch-our-fault-2025-135628",
    selectors: ['a[class*="play" i]', 'button[class*="play" i]', '.play-btn', '.watch-button']
  }
];

async function run() {
  console.log("🎬 ULTIMATE MOVIE DOWNLOADER - 2 MINUTE CAPTURE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 Goal: Download 2-minute clip from ANY working movie source");
  console.log("📁 Output directory:", OUTPUT_DIR);
  console.log("⏱️  Duration:", DURATION, "seconds");
  console.log("🔄 Will try multiple sources and methods until success");
  console.log("");

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n🚀 ATTEMPT ${attempt}/${MAX_ATTEMPTS}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    for (const source of MOVIE_SOURCES) {
      console.log(`\n🎬 Testing ${source.name}: ${source.url}`);
      
      try {
        const result = await trySource(source, attempt);
        if (result.success) {
          console.log(`\n✅ SUCCESS! Downloaded 2-minute clip from ${source.name}`);
          console.log(`📁 File: ${result.filePath}`);
          if (fs.existsSync(result.filePath)) {
            const stats = fs.statSync(result.filePath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`📊 File size: ${sizeMB} MB`);
          }
          return;
        }
      } catch (error) {
        console.log(`❌ ${source.name} failed:`, error.message);
      }
    }

    console.log(`\n⏳ Attempt ${attempt} failed, trying again in 5 seconds...`);
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log("\n❌ All attempts failed. Could not download 2-minute movie clip.");
}

async function trySource(source, attempt) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=SitePerProcess',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-extensions',
      '--disable-plugins-discovery',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const page = await browser.newPage();
    let m3u8Url = null;
    let downloadStarted = false;

    // Set headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    // Network interception for m3u8
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('.m3u8') && !m3u8Url && !downloadStarted) {
        m3u8Url = url;
        console.log(`🎯 M3U8 detected: ${url}`);
        downloadStarted = true;
        startDownload(url, source.name, attempt);
      }
      req.continue();
    });

    // Navigate to movie page
    console.log(`🌐 Navigating to: ${source.url}`);
    await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Try to click play button
    console.log("🎮 Looking for play button...");
    for (const selector of source.selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`✅ Found play button: ${selector}`);
          await element.click();
          console.log("✅ Play button clicked!");
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Wait for m3u8 or video to start
    console.log("⏳ Waiting for video to start...");
    const startTime = Date.now();
    while (!downloadStarted && (Date.now() - startTime) < 30000) {
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!downloadStarted) {
      // Try screen recording as fallback
      console.log("🎥 No m3u8 detected, trying screen recording...");
      return await tryScreenRecording(browser, source.name, attempt);
    }

    // Wait for download to complete and check if file was created
    console.log("⏳ Waiting for download to complete...");
    await new Promise(r => setTimeout(r, 15000));
    
    const outputPath = getOutputPath(source.name, attempt);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      await browser.close();
      return { success: true, filePath: outputPath };
    } else {
      console.log("❌ FFmpeg download failed, trying screen recording...");
      return await tryScreenRecording(browser, source.name, attempt);
    }

  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function startDownload(m3u8Url, sourceName, attempt) {
  const outputPath = getOutputPath(sourceName, attempt);
  
  console.log(`\n🚀 STARTING DOWNLOAD: ${sourceName}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🎯 M3U8 URL: ${m3u8Url}`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`⏱️  Duration: ${DURATION} seconds`);

  // Delete existing file
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Try FFmpeg with multiple approaches
  const approaches = [
    // Approach 1: Basic FFmpeg
    `ffmpeg -y -i "${m3u8Url}" -t ${DURATION} -c copy "${outputPath}"`,
    
    // Approach 2: With protocol whitelist
    `ffmpeg -y -protocol_whitelist file,http,https,tcp,tls -i "${m3u8Url}" -t ${DURATION} -c copy "${outputPath}"`,
    
    // Approach 3: With allowed extensions
    `ffmpeg -y -allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls -i "${m3u8Url}" -t ${DURATION} -c copy "${outputPath}"`,
    
    // Approach 4: With ignore unknown
    `ffmpeg -y -ignore_unknown -allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls -i "${m3u8Url}" -t ${DURATION} -c copy "${outputPath}"`
  ];

  for (let i = 0; i < approaches.length; i++) {
    console.log(`\n🔧 Trying approach ${i + 1}/${approaches.length}:`);
    console.log(approaches[i]);
    
    const success = await new Promise(resolve => {
      exec(approaches[i], (error, stdout, stderr) => {
        if (error) {
          console.log(`❌ Approach ${i + 1} failed:`, error.message);
          resolve(false);
        } else {
          console.log(`✅ Approach ${i + 1} succeeded!`);
          resolve(true);
        }
      });
    });

    if (success && fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 0) {
        console.log(`✅ Download completed! File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        return;
      }
    }
  }

  console.log("❌ All FFmpeg approaches failed");
}

async function tryScreenRecording(browser, sourceName, attempt) {
  const outputPath = getOutputPath(sourceName, attempt, 'recording');
  
  console.log(`\n🎥 STARTING SCREEN RECORDING: ${sourceName}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📁 Output: ${outputPath}`);
  console.log(`⏱️  Duration: ${DURATION} seconds`);

  // Delete existing file
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Try FFmpeg screen recording
  const ffmpegCmd = `ffmpeg -y -f gdigrab -framerate 30 -i desktop -t ${DURATION} -c:v libx264 -preset ultrafast -c:a aac "${outputPath}"`;
  console.log(`🎬 FFmpeg command: ${ffmpegCmd}`);

  const success = await new Promise(resolve => {
    const child = exec(ffmpegCmd, (error, stdout, stderr) => {
      if (error) {
        console.log("❌ Screen recording failed:", error.message);
        resolve(false);
      } else {
        console.log("✅ Screen recording completed!");
        resolve(true);
      }
    });
    
    // Stream output to console
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });

  await browser.close();

  if (success && fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    if (stats.size > 0) {
      console.log(`✅ Screen recording completed! File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      return { success: true, filePath: outputPath };
    }
  }

  return { success: false, filePath: null };
}

function getOutputPath(sourceName, attempt, type = 'download') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${sourceName.toLowerCase().replace(/\s+/g, '-')}-${type}-attempt-${attempt}-${timestamp}.mp4`;
  return path.join(OUTPUT_DIR, filename);
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});


