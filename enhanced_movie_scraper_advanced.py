#!/usr/bin/env python3
"""
Enhanced Movie Scraper with Advanced Anti-Bot Bypass
Integrates with existing bot system for comprehensive movie downloading
"""

import asyncio
import logging
import os
import random
import time
from pathlib import Path
from typing import Optional, List, Dict, Any
import aiohttp
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import yt_dlp
import cloudscraper
import re
import json

logger = logging.getLogger(__name__)

class EnhancedMovieScraperAdvanced:
    """Advanced movie scraper with comprehensive anti-bot bypass"""
    
    def __init__(self):
        self.download_dir = Path(os.getenv('DOWNLOAD_DIR', './downloads'))
        self.download_dir.mkdir(exist_ok=True, parents=True)
        
        # Enhanced user agents
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        ]
        
        # Updated working domains (December 2024)
        self.streaming_sites = {
            'cataz': [
                'https://cataz.to',
                'https://cataz.ru',
                'https://cataz.net',
                'https://cataz.is'
            ],
            'fmovies': [
                'https://fmovies24.to',
                'https://fmovies.llc',
                'https://fmovies-hd.to',
                'https://fmovies.ps',
                'https://fmovies.to'
            ],
            'einthusan': [
                'https://einthusan.tv',
                'https://www.einthusan.tv',
                'https://einthusan.com'
            ],
            'mkvcinemas': [
                'https://mkvcinemas.skin',
                'https://mkvcinemas.baby',
                'https://mkvcinemas.boats',
                'https://mkvcinemas.lol'
            ],
            'ytstv': [
                'https://yts.mx',
                'https://yts.lt',
                'https://yts.am'
            ]
        }
        
        # Cloudscraper for Cloudflare bypass
        self.scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'mobile': False
            }
        )
        
        # Proxy support (if available)
        self.proxies = self._load_proxies()
        
    def _load_proxies(self) -> List[str]:
        """Load proxy list from environment"""
        proxy_env = os.getenv('PROXY_LIST', '')
        if proxy_env:
            return [p.strip() for p in proxy_env.split(',') if p.strip()]
        return []
    
    def _get_random_user_agent(self) -> str:
        """Get random user agent"""
        return random.choice(self.user_agents)
    
    def _get_random_proxy(self) -> Optional[str]:
        """Get random proxy if available"""
        if self.proxies:
            return random.choice(self.proxies)
        return None
    
    async def _check_site_availability(self, domain: str) -> bool:
        """Check if site is accessible"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    domain, 
                    headers={'User-Agent': self._get_random_user_agent()},
                    timeout=10,
                    proxy=self._get_random_proxy()
                ) as response:
                    return response.status == 200
        except:
            return False
    
    async def _create_stealth_browser(self):
        """Create stealth browser with advanced anti-bot measures"""
        playwright = await async_playwright().start()
        
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-first-run',
                '--disable-logging',
                '--disable-gpu-logging',
                '--silent',
                '--log-level=3',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-domain-reliability',
                '--disable-component-extensions-with-background-pages',
                '--disable-background-networking',
                '--disable-sync-preferences',
                '--disable-default-apps',
                '--disable-extensions-file-access-check',
                '--disable-extensions-http-throttling',
                '--disable-extensions-except',
                '--disable-extensions-https-throttling',
                '--disable-extensions-http-throttling',
                '--disable-extensions-https-throttling'
            ]
        )
        
        return browser
    
    async def _setup_stealth_page(self, browser):
        """Setup stealth page with realistic fingerprint"""
        context = await browser.new_context(
            user_agent=self._get_random_user_agent(),
            viewport={'width': 1920, 'height': 1080},
            locale='en-US',
            timezone_id='America/New_York',
            extra_http_headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"'
            }
        )
        
        page = await context.new_page()
        
        # Inject advanced stealth scripts
        await page.add_init_script("""
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin' }
                ],
            });
            
            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            // Mock chrome object
            window.chrome = {
                runtime: {
                    onConnect: undefined,
                    onMessage: undefined
                },
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Mock permissions
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({
                    query: () => Promise.resolve({ state: 'granted' }),
                }),
            });
            
            // Mock screen properties
            Object.defineProperty(screen, 'availHeight', {
                get: () => 1040,
            });
            Object.defineProperty(screen, 'availWidth', {
                get: () => 1920,
            });
            Object.defineProperty(screen, 'colorDepth', {
                get: () => 24,
            });
            Object.defineProperty(screen, 'pixelDepth', {
                get: () => 24,
            });
            
            // Mock hardware concurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 4,
            });
            
            // Mock device memory
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8,
            });
            
            // Mock connection
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 50,
                    downlink: 2
                }),
            });
        """)
        
        return page
    
    async def _bypass_cloudflare(self, page, url: str) -> bool:
        """Bypass Cloudflare protection"""
        try:
            await page.goto(url, wait_until='networkidle', timeout=30000)
            
            # Check for Cloudflare challenge
            if await page.locator('.cf-challenge').count() > 0:
                logger.info("🛡️ Cloudflare challenge detected, waiting...")
                await page.wait_for_timeout(5000)
                
                # Try to click "I'm not a robot" if present
                not_robot = await page.locator('input[type="checkbox"]').count()
                if not_robot > 0:
                    await page.locator('input[type="checkbox"]').first.click()
                    await page.wait_for_timeout(3000)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Cloudflare bypass failed: {e}")
            return False
    
    async def _extract_video_urls(self, page) -> List[str]:
        """Extract video URLs from page"""
        video_urls = []
        
        def handle_response(response):
            url = response.url
            if any(ext in url.lower() for ext in ['.mp4', '.m3u8', '.mkv', '.avi', '.webm']):
                video_urls.append(url)
        
        page.on('response', handle_response)
        
        # Wait for video URLs
        await page.wait_for_timeout(5000)
        
        return video_urls
    
    async def _search_cataz_advanced(self, movie_name: str, page) -> Optional[str]:
        """Advanced Cataz search with multiple bypass techniques"""
        try:
            logger.info(f"🎬 Advanced Cataz search for: {movie_name}")
            
            for domain in self.streaming_sites['cataz']:
                try:
                    if not await self._check_site_availability(domain):
                        continue
                    
                    search_url = f"{domain}/search/{movie_name.replace(' ', '%20')}"
                    
                    # Bypass Cloudflare
                    if not await self._bypass_cloudflare(page, search_url):
                        continue
                    
                    # Look for movie results
                    movie_links = await page.locator('a[href*="/movie/"]').all()
                    
                    if movie_links:
                        # Click on first movie
                        await movie_links[0].click()
                        await page.wait_for_timeout(3000)
                        
                        # Try multiple play button selectors
                        play_selectors = [
                            'button[class*="play"]',
                            '.play-button',
                            '.btn-play',
                            '[data-action="play"]',
                            'button:has-text("Play")',
                            'button:has-text("Watch")',
                            '.vjs-play-control',
                            '.vjs-big-play-button'
                        ]
                        
                        for selector in play_selectors:
                            if await page.locator(selector).count() > 0:
                                await page.locator(selector).first.click()
                                await page.wait_for_timeout(2000)
                                break
                        
                        # Extract video URLs
                        video_urls = await self._extract_video_urls(page)
                        
                        if video_urls:
                            logger.info(f"✅ Found video URL on Cataz: {video_urls[0]}")
                            return video_urls[0]
                        
                except Exception as e:
                    logger.warning(f"❌ Cataz domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Advanced Cataz search failed: {e}")
            return None
    
    async def _search_fmovies_advanced(self, movie_name: str, page) -> Optional[str]:
        """Advanced FMovies search with multiple bypass techniques"""
        try:
            logger.info(f"🎬 Advanced FMovies search for: {movie_name}")
            
            for domain in self.streaming_sites['fmovies']:
                try:
                    if not await self._check_site_availability(domain):
                        continue
                    
                    search_url = f"{domain}/search/{movie_name.replace(' ', '%20')}"
                    
                    # Bypass Cloudflare
                    if not await self._bypass_cloudflare(page, search_url):
                        continue
                    
                    # Look for movie results
                    movie_links = await page.locator('a[href*="/movie/"], a[href*="/film/"]').all()
                    
                    if movie_links:
                        # Click on first movie
                        await movie_links[0].click()
                        await page.wait_for_timeout(3000)
                        
                        # Look for video player
                        video_selectors = [
                            'video',
                            'iframe[src*="player"]',
                            'iframe[src*="embed"]',
                            '.video-player',
                            '.player-container',
                            '#player',
                            '.player'
                        ]
                        
                        for selector in video_selectors:
                            if await page.locator(selector).count() > 0:
                                video_element = page.locator(selector).first
                                
                                # Check if it's a video element
                                if selector == 'video':
                                    src = await video_element.get_attribute('src')
                                    if src:
                                        logger.info(f"✅ Found video URL on FMovies: {src}")
                                        return src
                                
                                # Check if it's an iframe
                                elif 'iframe' in selector:
                                    iframe_src = await video_element.get_attribute('src')
                                    if iframe_src:
                                        # Navigate to iframe source
                                        await page.goto(iframe_src, wait_until='networkidle')
                                        await page.wait_for_timeout(3000)
                                        
                                        # Look for video in iframe
                                        video_src = await page.locator('video').get_attribute('src')
                                        if video_src:
                                            logger.info(f"✅ Found video URL in FMovies iframe: {video_src}")
                                            return video_src
                        
                        # Extract video URLs from network requests
                        video_urls = await self._extract_video_urls(page)
                        
                        if video_urls:
                            logger.info(f"✅ Found video URL on FMovies: {video_urls[0]}")
                            return video_urls[0]
                        
                except Exception as e:
                    logger.warning(f"❌ FMovies domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Advanced FMovies search failed: {e}")
            return None
    
    async def _search_einthusan_advanced(self, movie_name: str, page) -> Optional[str]:
        """Advanced Einthusan search with multiple bypass techniques"""
        try:
            logger.info(f"🎬 Advanced Einthusan search for: {movie_name}")
            
            for domain in self.streaming_sites['einthusan']:
                try:
                    if not await self._check_site_availability(domain):
                        continue
                    
                    search_url = f"{domain}/search/{movie_name.replace(' ', '%20')}"
                    
                    # Bypass Cloudflare
                    if not await self._bypass_cloudflare(page, search_url):
                        continue
                    
                    # Look for movie results
                    movie_links = await page.locator('a[href*="/movie/"]').all()
                    
                    if movie_links:
                        # Click on first movie
                        await movie_links[0].click()
                        await page.wait_for_timeout(3000)
                        
                        # Try multiple play button selectors
                        play_selectors = [
                            'button[class*="play"]',
                            '.play-button',
                            '.btn-play',
                            '[data-action="play"]',
                            'button:has-text("Play")',
                            'button:has-text("Watch")',
                            '.vjs-play-control',
                            '.vjs-big-play-button'
                        ]
                        
                        for selector in play_selectors:
                            if await page.locator(selector).count() > 0:
                                await page.locator(selector).first.click()
                                await page.wait_for_timeout(2000)
                                break
                        
                        # Extract video URLs (especially m3u8 for Einthusan)
                        video_urls = await self._extract_video_urls(page)
                        
                        if video_urls:
                            logger.info(f"✅ Found video URL on Einthusan: {video_urls[0]}")
                            return video_urls[0]
                        
                except Exception as e:
                    logger.warning(f"❌ Einthusan domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Advanced Einthusan search failed: {e}")
            return None
    
    async def _download_with_ytdlp(self, video_url: str, movie_name: str) -> Optional[str]:
        """Download video using yt-dlp with enhanced options"""
        try:
            logger.info(f"📥 Downloading with yt-dlp: {video_url}")
            
            output_path = self.download_dir / f"{movie_name}.%(ext)s"
            
            ydl_opts = {
                'outtmpl': str(output_path),
                'format': 'best[height<=1080]',
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'writesubtitles': False,
                'writeautomaticsub': False,
                'ignoreerrors': True,
                'no_check_certificate': True,
                'prefer_insecure': True,
                'http_chunk_size': 10485760,
                'retries': 3,
                'fragment_retries': 3,
                'socket_timeout': 30,
                'http_headers': {
                    'User-Agent': self._get_random_user_agent(),
                    'Referer': video_url.split('/')[0] + '//' + video_url.split('/')[2]
                }
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)
                
                if info and 'requested_downloads' in info:
                    downloaded_file = info['requested_downloads'][0]['filepath']
                    logger.info(f"✅ Downloaded: {downloaded_file}")
                    return downloaded_file
                
        except Exception as e:
            logger.error(f"❌ yt-dlp download failed: {e}")
        
        return None
    
    async def search_and_download(self, movie_name: str, task_id: str) -> Optional[str]:
        """Main search and download method with advanced bypass"""
        logger.info(f"[{task_id}] Starting advanced search for: {movie_name}")
        
        # Create stealth browser
        browser = await self._create_stealth_browser()
        page = await self._setup_stealth_page(browser)
        
        try:
            # Try Cataz first
            logger.info(f"[{task_id}] Trying Cataz...")
            video_url = await self._search_cataz_advanced(movie_name, page)
            if video_url:
                downloaded_file = await self._download_with_ytdlp(video_url, movie_name)
                if downloaded_file:
                    return downloaded_file
            
            # Try FMovies
            logger.info(f"[{task_id}] Trying FMovies...")
            video_url = await self._search_fmovies_advanced(movie_name, page)
            if video_url:
                downloaded_file = await self._download_with_ytdlp(video_url, movie_name)
                if downloaded_file:
                    return downloaded_file
            
            # Try Einthusan
            logger.info(f"[{task_id}] Trying Einthusan...")
            video_url = await self._search_einthusan_advanced(movie_name, page)
            if video_url:
                downloaded_file = await self._download_with_ytdlp(video_url, movie_name)
                if downloaded_file:
                    return downloaded_file
            
            logger.warning(f"[{task_id}] All streaming sites failed")
            return None
            
        except Exception as e:
            logger.error(f"[{task_id}] Advanced search failed: {e}")
            return None
        finally:
            await browser.close()

# Test function
async def test_advanced_scraper():
    """Test the advanced scraper"""
    scraper = EnhancedMovieScraperAdvanced()
    
    # Test with a popular movie
    result = await scraper.search_and_download("Inception 2010", "test_001")
    
    if result:
        print(f"✅ Downloaded: {result}")
    else:
        print("❌ Download failed")

if __name__ == "__main__":
    asyncio.run(test_advanced_scraper())

