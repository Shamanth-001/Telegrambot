import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { exec } from "child_process";
import fs from "fs";

puppeteer.use(StealthPlugin());

const MOVIE_URL = process.env.MOVIE_URL || "https://www.fmovies.gd/watch/movie/24428";
const OUTPUT = process.env.OUTPUT || "c:\\telegram bot\\downloads\\fmovies-direct-capture.mkv";
const CAPTURE_TIMEOUT = Number(process.env.CAPTURE_TIMEOUT || 90_000); // ms to wait for m3u8
const FF_TIME = process.env.FF_TIME || 120; // seconds to capture

async function run() {
  console.log("🎬 NEW TAB FOLLOWING + M3U8 CAPTURE TEST");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 Goal: Follow new tabs and capture m3u8 from player");
  console.log("📁 Output file:", OUTPUT);
  console.log("🌐 Movie URL:", MOVIE_URL);
  console.log("⏱️  Capture duration:", FF_TIME, "seconds");
  console.log("");
  
  console.log("Launching browser (headful) — please interact if needed...");
  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null, 
    args: ['--no-sandbox','--disable-features=SitePerProcess'] 
  });
  const context = browser.defaultBrowserContext();

  // keep track of pages we should listen on
  const pages = new Set();
  let captured = null;

  // helper to attach response listener & click play if possible
  async function attachPage(page) {
    if (!page || pages.has(page)) return;
    pages.add(page);
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    client.on('Network.responseReceived', async (ev) => {
      try {
        const url = ev.response.url;
        if (captured) return;
        if (url && url.includes('.m3u8')) {
          captured = {
            url,
            headers: ev.response.headers,
            page
          };
          console.log("\n🎯 CAPTURED M3U8 ON PAGE:", url);
          console.log("📦 Headers snippet:", JSON.stringify(ev.response.headers, null, 2));
          await kickOffFFmpeg(page, url, ev.response.headers);
        }
      } catch (e) {
        console.warn("response handler error:", e.message);
      }
    });

    // Bonus: try to auto-click a play button on that page
    try {
      // common selectors — adjust if the site is different
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
        '.stream-button'
      ];
      for (const sel of playSelectors) {
        const el = await page.$(sel);
        if (el) {
          console.log("🎮 Attempting auto-click play selector:", sel);
          await el.click().catch(()=>{});
          break;
        }
      }
    } catch (e) { /* ignore */ }

    // also listen for popups originating from this page (rare)
    page.on('popup', p => attachPage(p));
  }

  browser.on('targetcreated', async (target) => {
    try {
      if (target.type() === 'page') {
        const newPage = await target.page();
        console.log("🔔 NEW TAB DETECTED — attaching listeners to it.");
        await attachPage(newPage);
      }
    } catch (e) {
      console.warn("targetcreated handler error:", e.message);
    }
  });

  // attach to all existing pages (including the initial blank/newone)
  const initialPages = await browser.pages();
  for (const p of initialPages) await attachPage(p);

  // open movie page in a new tab
  const page = await browser.newPage();
  await attachPage(page);

  // set some headers that help avoid blocking
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9', Referer: MOVIE_URL });

  console.log("🌐 Navigating to:", MOVIE_URL);
  await page.goto(MOVIE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // attach again in case navigation created iframes or new contexts
  await attachPage(page);

  console.log("▶️ If a new tab opens for playback, the script will follow it automatically.");
  console.log(`⏳ Waiting up to ${CAPTURE_TIMEOUT/1000}s for an .m3u8 request (click Play if needed)...`);

  // wait for capture
  const start = Date.now();
  while (!captured && (Date.now() - start) < CAPTURE_TIMEOUT) {
    await new Promise(r => setTimeout(r, 500));
  }

  if (!captured) {
    console.error("❌ Timeout — no .m3u8 request detected. Try clicking Play in the player (or run headful and reproduce the flow).");
    await browser.close();
    process.exit(2);
  }

  // we already kicked off ffmpeg in kickOffFFmpeg, let that handle closing the browser.
}

async function kickOffFFmpeg(page, m3u8Url, responseHeaders) {
  try {
    // collect cookies for the page to include in request
    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Build -headers arg for ffmpeg (CRLF required)
    const referer = page.url();
    const ua = responseHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    const headersRaw = `Referer: ${referer}\\r\\nUser-Agent: ${ua}\\r\\nCookie: ${cookieHeader}\\r\\nOrigin: ${new URL(referer).origin}\\r\\n`;

    // Build ffmpeg command with proper escaping
    const safeUrl = m3u8Url.replace(/"/g, '\\"');
    const ffArgs = [
      '-y',
      '-headers', `"${headersRaw}"`,
      '-i', `"${safeUrl}"`,
      '-t', FF_TIME,
      '-c', 'copy',
      `"${OUTPUT}"`
    ];
    const cmd = `ffmpeg ${ffArgs.join(' ')}`;

    console.log("\n🚀 LAUNCHING FFMPEG NOW:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(cmd);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Create downloads directory if needed
    if (!fs.existsSync("c:\\telegram bot\\downloads")) {
      fs.mkdirSync("c:\\telegram bot\\downloads", { recursive: true });
      console.log("📂 Created downloads directory");
    }

    // Delete existing file if it exists
    if (fs.existsSync(OUTPUT)) {
      fs.unlinkSync(OUTPUT);
      console.log("🗑️ Deleted existing file");
    }

    // spawn ffmpeg
    const child = exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error("❌ FFmpeg failed:", err.message);
        console.error(stderr);
      } else {
        console.log("✅ FFmpeg finished successfully.");
        if (fs.existsSync(OUTPUT)) {
          const stats = fs.statSync(OUTPUT);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          console.log(`📁 Final file size: ${sizeMB} MB`);
          console.log(`📁 File location: ${OUTPUT}`);
        }
      }
      // try to close browser if still open
      try { page.browser().close(); } catch (e) {}
    });

    // stream ffmpeg logs to console
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

  } catch (e) {
    console.error("kickOffFFmpeg error:", e);
    try { page.browser().close(); } catch (e2) {}
  }
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});


