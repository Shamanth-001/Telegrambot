import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

puppeteer.use(StealthPlugin());

const MOVIE_URL = process.env.MOVIE_URL || "https://www.fmovies.gd/watch/movie/24428";
const OUTPUT_FILE = process.env.OUTPUT || "c:\\telegram bot\\downloads\\fmovies-automated.mp4";
const RECORDING_TIME = process.env.RECORDING_TIME || 120; // seconds

async function run() {
  console.log("🎬 FMOVIES AUTOMATED DOWNLOADER");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 Goal: Real-time m3u8 capture + instant FFmpeg download");
  console.log("📁 Output file:", OUTPUT_FILE);
  console.log("🌐 Movie URL:", MOVIE_URL);
  console.log("⏱️  Duration:", RECORDING_TIME, "seconds");
  console.log("🔧 Method: Real-time network interception + instant download");
  console.log("");

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
      '--disable-extensions-except',
      '--disable-extensions',
      '--disable-plugins-discovery',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });
  
  const context = browser.defaultBrowserContext();
  const pages = new Set();
  let m3u8Url = null;
  let downloadStarted = false;

  // helper to attach response listener & click play if possible
  async function attachPage(page) {
    if (!page || pages.has(page)) return;
    pages.add(page);
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    // Intercept network requests to catch the m3u8 URL
    await page.setRequestInterception(true);
    
    page.on("request", (req) => {
      const url = req.url();
      if (url && url.includes(".m3u8") && !downloadStarted) {
        console.log("🎯 DETECTED M3U8 URL:", url);
        m3u8Url = url;
        downloadStarted = true;
        
        // Start FFmpeg download IMMEDIATELY
        startFFmpegDownload(url);
        req.abort(); // prevent browser from downloading, we will use FFmpeg
      } else {
        req.continue();
      }
    });

    client.on('Network.responseReceived', async (ev) => {
      try {
        const url = ev.response.url;
        if (url && url.includes('.m3u8') && !downloadStarted) {
          console.log("🎯 M3U8 DETECTED via response:", url);
          console.log("📦 Headers:", JSON.stringify(ev.response.headers, null, 2));
          m3u8Url = url;
          downloadStarted = true;
          
          // Start FFmpeg download IMMEDIATELY
          startFFmpegDownload(url);
        }
      } catch (e) {
        console.warn("response handler error:", e.message);
      }
    });

    // Try to auto-click play buttons
    try {
      const playSelectors = [
        'button[aria-label*="play"]', 
        '.vjs-big-play-button', 
        '.play-btn', 
        '.play', 
        '#play', 
        'button.play',
        'a[class*="play" i]',
        'button[class*="play" i]',
        '.play-button',
        '.btn-play',
        '.watch-button',
        '.stream-button',
        'a[href*="watch"]',
        'a[href*="play"]',
        '.watch-now',
        '.play-movie'
      ];
      for (const sel of playSelectors) {
        const el = await page.$(sel);
        if (el) {
          console.log("🎮 Auto-clicking play selector:", sel);
          await el.click().catch(()=>{});
          // Wait a bit for navigation
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      }
    } catch (e) { /* ignore */ }

    page.on('popup', p => attachPage(p));
  }

  browser.on('targetcreated', async (target) => {
    try {
      if (target.type() === 'page') {
        const newPage = await target.page();
        console.log("🔔 NEW TAB/PAGE DETECTED — attaching listeners to it.");
        await attachPage(newPage);
      }
    } catch (e) {
      console.warn("targetcreated handler error:", e.message);
    }
  });

  // Handle page navigation/redirects
  const handleNavigation = async (frame) => {
    if (frame === page.mainFrame()) {
      console.log("🔄 PAGE NAVIGATED TO:", frame.url());
      await attachPage(page);
    }
  };

  // attach to all existing pages
  const initialPages = await browser.pages();
  for (const p of initialPages) await attachPage(p);

  // open movie page
  const page = await browser.newPage();
  await attachPage(page);
  
  // Add navigation handler after page is created
  page.on('framenavigated', handleNavigation);

  // set headers
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 
    'Accept-Language': 'en-US,en;q=0.9', 
    'Referer': MOVIE_URL,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });

  console.log("🌐 Navigating to:", MOVIE_URL);
  await page.goto(MOVIE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  await attachPage(page);

  console.log("▶️ If a new tab opens for playback, the script will follow it automatically.");
  console.log("🔄 If page redirects after clicking play, the script will follow the redirect.");
  console.log("🎥 When m3u8 is detected, FFmpeg will start downloading IMMEDIATELY");
  console.log("⏳ Waiting for video to start playing (click Play if needed)...");

  // Try to click play button immediately after page load
  try {
    console.log("🎮 Attempting to auto-click play button...");
    const playSelectors = [
      'button[aria-label*="play"]', 
      '.vjs-big-play-button', 
      '.play-btn', 
      '.play', 
      '#play', 
      'button.play',
      'a[class*="play" i]',
      'button[class*="play" i]',
      '.play-button',
      '.btn-play',
      '.watch-button',
      '.stream-button',
      'a[href*="watch"]',
      'a[href*="play"]',
      '.watch-now',
      '.play-movie'
    ];
    
    for (const sel of playSelectors) {
      const el = await page.$(sel);
      if (el) {
        console.log("🎮 Found and clicking play selector:", sel);
        await el.click();
        console.log("✅ Play button clicked, waiting for navigation...");
        await new Promise(r => setTimeout(r, 3000)); // Wait for navigation
        break;
      }
    }
  } catch (e) {
    console.log("ℹ️ No play button found or already playing");
  }

  // Wait for m3u8 detection
  const start = Date.now();
  while (!m3u8Url && (Date.now() - start) < 120000) { // 2 minutes max wait
    await new Promise(r => setTimeout(r, 500));
  }

  if (!m3u8Url) {
    console.error("❌ Timeout — no m3u8 detected. Try clicking Play in the player.");
    await browser.close();
  } else {
    console.log("✅ M3U8 detected and download started!");
    // Keep browser open for a bit to let FFmpeg start
    await new Promise(r => setTimeout(r, 10000));
    await browser.close();
  }
}

async function startFFmpegDownload(m3u8Url) {
  try {
    console.log("\n🚀 STARTING FFMPEG DOWNLOAD:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎯 M3U8 URL:", m3u8Url);
    console.log("📁 Output file:", OUTPUT_FILE);
    console.log("⏱️  Duration:", RECORDING_TIME, "seconds");
    console.log("⚡ Starting download IMMEDIATELY to avoid URL expiration...");
    
    // Create downloads directory if needed
    if (!fs.existsSync("c:\\telegram bot\\downloads")) {
      fs.mkdirSync("c:\\telegram bot\\downloads", { recursive: true });
    }
    
    // Delete existing file if it exists
    if (fs.existsSync(OUTPUT_FILE)) {
      fs.unlinkSync(OUTPUT_FILE);
      console.log("🗑️ Deleted existing file");
    }

    // FFmpeg command with all the fixes we've learned
    const ffmpegCmd = `ffmpeg -y -protocol_whitelist file,http,https,tcp,tls,crypto -allowed_extensions ALL -i "${m3u8Url}" -t ${RECORDING_TIME} -c copy "${OUTPUT_FILE}"`;
    
    console.log("🎬 FFmpeg command:");
    console.log(ffmpegCmd);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    // Start FFmpeg immediately
    const child = exec(ffmpegCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("❌ FFmpeg failed:", err.message);
        if (stderr) console.error("Stderr:", stderr);
      } else {
        console.log("✅ FFmpeg completed successfully!");
        if (fs.existsSync(OUTPUT_FILE)) {
          const stats = fs.statSync(OUTPUT_FILE);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          console.log(`📁 Video downloaded: ${sizeMB} MB`);
          console.log(`📁 File location: ${OUTPUT_FILE}`);
        }
      }
    });
    
    // Stream FFmpeg output to console
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    
  } catch (e) {
    console.error("startFFmpegDownload error:", e);
  }
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
