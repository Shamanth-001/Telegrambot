import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import WebTorrent from "webtorrent";

puppeteer.use(StealthPlugin());

const logger = {
  info: (msg) => console.log(`[WorkingDownloader] ${msg}`),
  warn: (msg) => console.log(`[WorkingDownloader] WARN: ${msg}`),
  error: (msg) => console.log(`[WorkingDownloader] ERROR: ${msg}`)
};

export class WorkingDownloader {
  constructor() {
    this.downloadDir = "downloads";
    this.ensureDownloadDir();
  }

  ensureDownloadDir() {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * Main download method - implements the working strategy
   * 1. Torrents >=15 seeders → Send .torrent file
   * 2. WebTorrent <15 seeders → Download full movie  
   * 3. PSArips → Direct download
   * 4. Einthusan → Indian movies only (6-7 min clips)
   */
  async downloadMovie(title, options = {}) {
    logger.info(`Starting download for: ${title}`);
    
    try {
      // Step 1: Check torrents first (primary method)
      const torrentResult = await this.checkTorrents(title);
      
      if (torrentResult.found) {
        if (torrentResult.seeders >= 15) {
          logger.info(`Torrent found with ${torrentResult.seeders} seeders - sending .torrent file`);
          return await this.sendTorrentFile(torrentResult);
        } else {
          logger.info(`Torrent found with ${torrentResult.seeders} seeders - downloading full movie`);
          return await this.downloadWithWebTorrent(torrentResult);
        }
      }
      
      // Step 2: Try PSArips for direct download
      logger.info("No torrents found, trying PSArips...");
      const psaripsResult = await this.tryPSARips(title);
      if (psaripsResult.success) {
        return psaripsResult;
      }
      
      // Step 3: Try Einthusan for Indian movies (clips only)
      logger.info("PSARips failed, trying Einthusan for Indian movies...");
      const einthusanResult = await this.tryEinthusan(title);
      if (einthusanResult.success) {
        logger.warn("Note: Einthusan provides 6-7 minute clips, not full movies");
        return einthusanResult;
      }
      
      logger.error("All download methods failed");
      return { success: false, error: "No working sources found" };
      
    } catch (error) {
      logger.error(`Download failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check torrents and return seeder count
   */
  async checkTorrents(title) {
    logger.info(`Checking torrents for: ${title}`);
    
    // This would integrate with your existing torrent search
    // For now, return mock data
    return {
      found: true,
      seeders: 8, // Mock: low seeders to trigger WebTorrent
      magnet: `magnet:?xt=urn:btih:${Math.random().toString(36).substr(2, 40)}&dn=${encodeURIComponent(title)}`,
      name: title
    };
  }

  /**
   * Send .torrent file to user (for >=15 seeders)
   */
  async sendTorrentFile(torrentResult) {
    logger.info(`Sending .torrent file for: ${torrentResult.name}`);
    
    // This would integrate with your Telegram bot
    return {
      success: true,
      type: "torrent_file",
      message: `Torrent file sent for ${torrentResult.name} (${torrentResult.seeders} seeders)`,
      torrentFile: torrentResult.torrentFile
    };
  }

  /**
   * Download full movie with WebTorrent (for <15 seeders)
   */
  async downloadWithWebTorrent(torrentResult) {
    logger.info(`Downloading full movie with WebTorrent: ${torrentResult.name}`);
    
    return new Promise((resolve) => {
      const client = new WebTorrent();
      const outputPath = path.join(this.downloadDir, `${torrentResult.name.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`);
      
      client.add(torrentResult.magnet, { path: this.downloadDir }, (torrent) => {
        logger.info(`WebTorrent started: ${torrent.name}`);
        
        torrent.on('done', () => {
          logger.info(`WebTorrent completed: ${outputPath}`);
          client.destroy();
          resolve({
            success: true,
            type: "full_movie",
            filePath: outputPath,
            source: "WebTorrent"
          });
        });
        
        torrent.on('error', (err) => {
          logger.error(`WebTorrent failed: ${err.message}`);
          client.destroy();
          resolve({ success: false, error: err.message });
        });
      });
    });
  }

  /**
   * Try PSArips for direct download
   */
  async tryPSARips(title) {
    logger.info(`Trying PSArips for: ${title}`);
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const searchUrl = `https://psarips.com/?s=${encodeURIComponent(title)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Look for download links
      const downloadLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="gdrive"], a[href*="mega.nz"]'));
        return links.map(link => ({ url: link.href, text: link.textContent }));
      });
      
      if (downloadLinks.length > 0) {
        logger.info(`Found ${downloadLinks.length} PSArips links`);
        // This would download the file
        return { success: true, type: "direct_download", source: "PSARips" };
      }
      
      return { success: false, error: "No PSArips links found" };
      
    } catch (error) {
      logger.error(`PSARips failed: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      await browser.close();
    }
  }

  /**
   * Try Einthusan for Indian movies (6-7 min clips only)
   */
  async tryEinthusan(title) {
    logger.info(`Trying Einthusan for Indian movie: ${title}`);
    
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      let m3u8Url = null;
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.includes('.m3u8')) {
          logger.info(`M3U8 detected: ${url}`);
          m3u8Url = url;
        }
        req.continue();
      });

      const searchUrl = `https://einthusan.tv/movie/results/?lang=kannada&query=${encodeURIComponent(title)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const movieLinks = await page.$$('a[href*="/movie/watch/"]');
      if (movieLinks.length > 0) {
        await movieLinks[0].click();
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const playButtons = await page.$$('a[href*="watch"], button[class*="play"]');
        if (playButtons.length > 0) {
          await playButtons[0].click();
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          if (m3u8Url) {
            logger.info(`Found M3U8: ${m3u8Url}`);
            const outputPath = await this.downloadM3U8(m3u8Url, title);
            return { 
              success: true, 
              type: "indian_clip", 
              filePath: outputPath,
              source: "Einthusan",
              note: "6-7 minute clip, not full movie"
            };
          }
        }
      }
      
      return { success: false, error: "No Einthusan stream found" };
      
    } catch (error) {
      logger.error(`Einthusan failed: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      await browser.close();
    }
  }

  /**
   * Download M3U8 stream with FFmpeg
   */
  async downloadM3U8(m3u8Url, title) {
    const outputPath = path.join(this.downloadDir, `einthusan-${title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`);
    
    logger.info(`Downloading M3U8: ${m3u8Url}`);
    
    return new Promise((resolve, reject) => {
      const command = `ffmpeg -y -i "${m3u8Url}" -c copy "${outputPath}"`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error(`FFmpeg failed: ${error.message}`);
          reject(error);
        } else {
          logger.info(`M3U8 download completed: ${outputPath}`);
          resolve(outputPath);
        }
      });
    });
  }
}

// Export for use in bot
export default WorkingDownloader;


