/**
 * Advanced Anti-Bot Detection Bypass
 * Enhanced techniques for bypassing modern anti-bot systems
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import UserAgent from 'user-agents';
import { logger } from './utils/logger.js';

puppeteer.use(StealthPlugin());

export class AdvancedAntiBot {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    ];
    
    this.viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 }
    ];
  }

  /**
   * Create browser with advanced anti-detection
   */
  async createStealthBrowser() {
    const browser = await puppeteer.launch({
      headless: false, // Use false for better anti-detection
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-back-forward-cache',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--disable-windows10-custom-titlebar',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu',
        '--no-zygote',
        '--no-first-run',
        '--disable-accelerated-2d-canvas',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox'
      ]
    });

    return browser;
  }

  /**
   * Setup page with advanced anti-detection
   */
  async setupStealthPage(browser) {
    const page = await browser.newPage();
    
    // Random viewport
    const viewport = this.viewports[Math.floor(Math.random() * this.viewports.length)];
    await page.setViewport(viewport);
    
    // Random user agent
    const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    await page.setUserAgent(userAgent);
    
    // Override navigator properties
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      Object.defineProperty(navigator, 'permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' }),
        }),
      });
    });

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    return page;
  }

  /**
   * Human-like mouse movement
   */
  async humanMouseMove(page, fromX, fromY, toX, toY) {
    const steps = Math.floor(Math.random() * 10) + 5;
    const stepX = (toX - fromX) / steps;
    const stepY = (toY - fromY) / steps;
    
    for (let i = 0; i <= steps; i++) {
      const x = fromX + (stepX * i) + (Math.random() - 0.5) * 10;
      const y = fromY + (stepY * i) + (Math.random() - 0.5) * 10;
      
      await page.mouse.move(x, y);
      await page.waitForTimeout(Math.random() * 50 + 10);
    }
  }

  /**
   * Human-like click with movement
   */
  async humanClick(page, selector) {
    const element = await page.$(selector);
    if (!element) return false;
    
    const box = await element.boundingBox();
    if (!box) return false;
    
    // Move to element with human-like movement
    await this.humanMouseMove(page, 0, 0, box.x + box.width / 2, box.y + box.height / 2);
    
    // Random delay before click
    await page.waitForTimeout(Math.random() * 200 + 100);
    
    // Click with slight randomness
    await page.mouse.click(
      box.x + box.width / 2 + (Math.random() - 0.5) * 10,
      box.y + box.height / 2 + (Math.random() - 0.5) * 10
    );
    
    return true;
  }

  /**
   * Handle CAPTCHA detection
   */
  async handleCaptcha(page) {
    // Check for common CAPTCHA selectors
    const captchaSelectors = [
      '.captcha',
      '.recaptcha',
      '.hcaptcha',
      '[data-captcha]',
      '.cf-challenge',
      '.cloudflare-challenge'
    ];
    
    for (const selector of captchaSelectors) {
      const captcha = await page.$(selector);
      if (captcha) {
        logger.warn('CAPTCHA detected, waiting for manual solve...');
        await page.waitForTimeout(30000); // Wait 30 seconds
        return true;
      }
    }
    
    return false;
  }

  /**
   * Bypass Cloudflare protection
   */
  async bypassCloudflare(page, url) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      
      // Check for Cloudflare challenge
      const challenge = await page.$('.cf-challenge');
      if (challenge) {
        logger.info('Cloudflare challenge detected, waiting...');
        await page.waitForTimeout(5000);
        
        // Try to click "I'm not a robot" if present
        const notRobot = await page.$('input[type="checkbox"]');
        if (notRobot) {
          await this.humanClick(page, 'input[type="checkbox"]');
          await page.waitForTimeout(3000);
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Cloudflare bypass failed:', error);
      return false;
    }
  }

  /**
   * Advanced play button detection and clicking
   */
  async findAndClickPlayButton(page) {
    const playSelectors = [
      // Video.js
      '.vjs-play-control',
      '.vjs-big-play-button',
      '.vjs-play-button',
      
      // JW Player
      '.jw-play',
      '.jw-display-icon-container',
      '.jw-icon-play',
      
      // Generic
      '.play-button',
      '.btn-play',
      '.play-btn',
      '.start-button',
      '.watch-button',
      
      // Data attributes
      '[data-testid*="play"]',
      '[data-testid*="watch"]',
      '[aria-label*="play"]',
      '[title*="play"]',
      
      // SVG icons
      'svg[class*="play"]',
      'i[class*="play"]',
      
      // Button elements
      'button[class*="play"]',
      'button[class*="watch"]',
      'div[class*="play"]',
      'div[class*="watch"]'
    ];
    
    for (const selector of playSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isIntersectingViewport();
          if (isVisible) {
            logger.info(`Found play button with selector: ${selector}`);
            await this.humanClick(page, selector);
            await page.waitForTimeout(2000);
            return true;
          }
        }
      } catch (error) {
        // Continue to next selector
        continue;
      }
    }
    
    return false;
  }

  /**
   * Monitor network requests for video URLs
   */
  async monitorVideoRequests(page) {
    const videoUrls = [];
    
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'];
      
      if (contentType && contentType.includes('video/')) {
        videoUrls.push(url);
        logger.info(`Found video URL: ${url}`);
      }
    });
    
    return videoUrls;
  }

  /**
   * Complete anti-bot workflow
   */
  async executeAntiBotWorkflow(url) {
    const browser = await this.createStealthBrowser();
    const page = await this.setupStealthPage(browser);
    
    try {
      // Bypass Cloudflare
      await this.bypassCloudflare(page, url);
      
      // Handle CAPTCHA
      await this.handleCaptcha(page);
      
      // Find and click play button
      await this.findAndClickPlayButton(page);
      
      // Monitor for video URLs
      const videoUrls = await this.monitorVideoRequests(page);
      
      return {
        success: true,
        videoUrls: videoUrls,
        page: page
      };
      
    } catch (error) {
      logger.error('Anti-bot workflow failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default AdvancedAntiBot;

