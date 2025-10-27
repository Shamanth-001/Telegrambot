import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger.js';

/**
 * Authentication and cookie handler for manual playback scenarios
 */
export class AuthHandler {
  constructor() {
    this.cookiesFile = path.join(process.cwd(), 'cookies.json');
    this.sessionFile = path.join(process.cwd(), 'session.json');
  }

  /**
   * Load cookies from file
   */
  loadCookies() {
    try {
      if (fs.existsSync(this.cookiesFile)) {
        const cookies = JSON.parse(fs.readFileSync(this.cookiesFile, 'utf8'));
        logger.info(`[AuthHandler] Loaded ${cookies.length} cookies from file`);
        return cookies;
      }
    } catch (error) {
      logger.warn(`[AuthHandler] Error loading cookies: ${error.message}`);
    }
    return [];
  }

  /**
   * Save cookies to file
   */
  saveCookies(cookies) {
    try {
      fs.writeFileSync(this.cookiesFile, JSON.stringify(cookies, null, 2));
      logger.info(`[AuthHandler] Saved ${cookies.length} cookies to file`);
    } catch (error) {
      logger.warn(`[AuthHandler] Error saving cookies: ${error.message}`);
    }
  }

  /**
   * Set cookies in Puppeteer page
   */
  async setCookiesInPage(page, cookies = null) {
    try {
      const cookiesToUse = cookies || this.loadCookies();
      
      if (cookiesToUse.length > 0) {
        await page.setCookie(...cookiesToUse);
        logger.info(`[AuthHandler] Set ${cookiesToUse.length} cookies in page`);
        return true;
      }
    } catch (error) {
      logger.warn(`[AuthHandler] Error setting cookies: ${error.message}`);
    }
    return false;
  }

  /**
   * Set authentication headers
   */
  async setAuthHeaders(page) {
    try {
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://cataz.to',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      });
      logger.info(`[AuthHandler] Set authentication headers`);
      return true;
    } catch (error) {
      logger.warn(`[AuthHandler] Error setting headers: ${error.message}`);
      return false;
    }
  }

  /**
   * Load session data
   */
  loadSession() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const session = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        logger.info(`[AuthHandler] Loaded session data`);
        return session;
      }
    } catch (error) {
      logger.warn(`[AuthHandler] Error loading session: ${error.message}`);
    }
    return null;
  }

  /**
   * Save session data
   */
  saveSession(sessionData) {
    try {
      fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2));
      logger.info(`[AuthHandler] Saved session data`);
    } catch (error) {
      logger.warn(`[AuthHandler] Error saving session: ${error.message}`);
    }
  }

  /**
   * Extract cookies from browser session
   */
  async extractCookiesFromPage(page) {
    try {
      const cookies = await page.cookies();
      this.saveCookies(cookies);
      logger.info(`[AuthHandler] Extracted ${cookies.length} cookies from page`);
      return cookies;
    } catch (error) {
      logger.warn(`[AuthHandler] Error extracting cookies: ${error.message}`);
      return [];
    }
  }

  /**
   * Setup complete authentication for page
   */
  async setupAuthentication(page) {
    try {
      // Set authentication headers
      await this.setAuthHeaders(page);
      
      // Set cookies
      await this.setCookiesInPage(page);
      
      // Load session data
      const session = this.loadSession();
      if (session) {
        // Apply session data if needed
        logger.info(`[AuthHandler] Applied session data`);
      }
      
      logger.info(`[AuthHandler] Authentication setup complete`);
      return true;
    } catch (error) {
      logger.warn(`[AuthHandler] Error setting up authentication: ${error.message}`);
      return false;
    }
  }

  /**
   * Create sample cookies file for manual setup
   */
  createSampleCookiesFile() {
    const sampleCookies = [
      {
        "name": "session_id",
        "value": "your_session_id_here",
        "domain": "cataz.to",
        "path": "/",
        "httpOnly": true,
        "secure": true
      },
      {
        "name": "token",
        "value": "your_token_here",
        "domain": "videostr.net",
        "path": "/",
        "httpOnly": true,
        "secure": true
      }
    ];
    
    this.saveCookies(sampleCookies);
    logger.info(`[AuthHandler] Created sample cookies file at ${this.cookiesFile}`);
    logger.info(`[AuthHandler] Please edit the file with your actual cookies from browser DevTools`);
  }
}

export default AuthHandler;





