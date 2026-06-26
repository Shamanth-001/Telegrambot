#!/usr/bin/env python3
"""
Ultimate Movie Scraper - Final Integration
Replaces the existing movie_scraper.py with comprehensive download capabilities
"""

import os
import asyncio
import logging
import random
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

class MovieScraperUltimate:
    """Ultimate movie scraper with comprehensive fallback system"""
    
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
        
        # Torrent sources for fallback
        self.torrent_sources = {
            'yts': 'https://yts.mx/api/v2/list_movies.json',
            'piratebay': 'https://thepiratebay.org',
            '1337x': 'https://1337x.to',
            'rarbg': 'https://rarbg.to'
        }
        
        # Cloudscraper for Cloudflare bypass
        self.scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'mobile': False
            }
        )
        
        # Proxy support
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
                '--log-level=3'
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
                'Cache-Control': 'max-age=0'
            }
        )
        
        page = await context.new_page()
        
        # Inject stealth scripts
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            window.chrome = {
                runtime: {},
            };
            
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({
                    query: () => Promise.resolve({ state: 'granted' }),
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
                logger.info("Cloudflare challenge detected, waiting...")
                await page.wait_for_timeout(5000)
                
                # Try to click "I'm not a robot" if present
                not_robot = await page.locator('input[type="checkbox"]').count()
                if not_robot > 0:
                    await page.locator('input[type="checkbox"]').first.click()
                    await page.wait_for_timeout(3000)
            
            return True
            
        except Exception as e:
            logger.error(f"Cloudflare bypass failed: {e}")
            return False
    
    async def _extract_video_urls(self, page) -> List[str]:
        """Extract video URLs from page - enhanced for actual movie files"""
        video_urls = []
        
        def handle_response(response):
            url = response.url
            # More specific filtering for actual movie files
            if any(ext in url.lower() for ext in ['.mp4', '.m3u8', '.mkv', '.avi', '.webm', '.mov', '.flv']):
                # Filter out trailers, ads, and small files
                if not any(blocked in url.lower() for blocked in ['trailer', 'preview', 'ad', 'banner', 'logo', 'intro']):
                    video_urls.append(url)
        
        page.on('response', handle_response)
        
        # Wait longer for video URLs to load
        await page.wait_for_timeout(8000)
        
        # Also try to find video elements directly
        try:
            video_elements = await page.locator('video').all()
            for video in video_elements:
                src = await video.get_attribute('src')
                if src and not any(blocked in src.lower() for blocked in ['trailer', 'preview', 'ad']):
                    video_urls.append(src)
        except:
            pass
        
        # Try to find iframe sources
        try:
            iframes = await page.locator('iframe').all()
            for iframe in iframes:
                src = await iframe.get_attribute('src')
                if src and any(ext in src.lower() for ext in ['.mp4', '.m3u8', '.mkv']):
                    video_urls.append(src)
        except:
            pass
        
        return video_urls
    
    async def _search_streaming_site(self, movie_name: str, site_name: str, page) -> Optional[str]:
        """Search a specific streaming site"""
        try:
            logger.info(f"Searching {site_name} for: {movie_name}")
            
            for domain in self.streaming_sites[site_name]:
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
                        
                        # Try multiple play button selectors - more aggressive
                        play_selectors = [
                            'button[class*="play"]',
                            '.play-button',
                            '.btn-play',
                            '[data-action="play"]',
                            'button:has-text("Play")',
                            'button:has-text("Watch")',
                            '.vjs-play-control',
                            '.vjs-big-play-button',
                            'button:has-text("▶")',
                            'button:has-text("►")',
                            '.play-btn',
                            '#play-button',
                            '.watch-btn',
                            '.stream-btn',
                            '[onclick*="play"]',
                            '[onclick*="watch"]'
                        ]
                        
                        for selector in play_selectors:
                            try:
                                if await page.locator(selector).count() > 0:
                                    await page.locator(selector).first.click()
                                    await page.wait_for_timeout(3000)
                                    logger.info(f"Clicked play button: {selector}")
                                    break
                            except:
                                continue
                        
                        # Try clicking on video element itself
                        try:
                            video_elements = await page.locator('video').all()
                            if video_elements:
                                await video_elements[0].click()
                                await page.wait_for_timeout(2000)
                                logger.info("Clicked on video element directly")
                        except:
                            pass
                        
                        # Extract video URLs
                        video_urls = await self._extract_video_urls(page)
                        
                        if video_urls:
                            logger.info(f"Found video URL on {site_name}: {video_urls[0]}")
                            return video_urls[0]
                        
                except Exception as e:
                    logger.warning(f"{site_name} domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"{site_name} search failed: {e}")
            return None
    
    async def _search_torrents(self, movie_name: str) -> List[Dict]:
        """Search torrents as fallback"""
        try:
            logger.info(f"Searching torrents for: {movie_name}")
            
            torrents = []
            
            # Search YTS API
            try:
                yts_url = f"{self.torrent_sources['yts']}?query_term={movie_name}&sort_by=seeds&order_by=desc"
                async with aiohttp.ClientSession() as session:
                    async with session.get(yts_url, timeout=15) as response:
                        if response.status == 200:
                            data = await response.json()
                            movies = data.get('data', {}).get('movies', [])
                            
                            for movie in movies:
                                for torrent in movie.get('torrents', []):
                                    if torrent['quality'] not in ['2160p', '4K']:
                                        torrents.append({
                                            'title': f"{movie['title']} ({movie.get('year', 'N/A')})",
                                            'quality': torrent['quality'],
                                            'seeds': torrent['seeds'],
                                            'size': torrent['size'],
                                            'torrent_url': torrent['url'],
                                            'magnet': f"magnet:?xt=urn:btih:{torrent['hash']}",
                                            'source': 'YTS'
                                        })
            except Exception as e:
                logger.warning(f"YTS search failed: {e}")
            
            return torrents
            
        except Exception as e:
            logger.error(f"Torrent search failed: {e}")
            return []
    
    async def _download_with_ytdlp(self, video_url: str, movie_name: str) -> Optional[str]:
        """Download video using yt-dlp - enhanced for actual movies"""
        try:
            logger.info(f"Downloading with yt-dlp: {video_url}")
            
            output_path = self.download_dir / f"{movie_name}.%(ext)s"
            
            ydl_opts = {
                'outtmpl': str(output_path),
                'format': 'best[height<=1080][filesize>50M]',  # Ensure file is >50MB (not trailer)
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
                'min_filesize': 50 * 1024 * 1024,  # Minimum 50MB file size
                'max_filesize': 5 * 1024 * 1024 * 1024,  # Maximum 5GB file size
                'http_headers': {
                    'User-Agent': self._get_random_user_agent(),
                    'Referer': video_url.split('/')[0] + '//' + video_url.split('/')[2]
                }
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)
                
                if info and 'requested_downloads' in info:
                    downloaded_file = info['requested_downloads'][0]['filepath']
                    logger.info(f"Downloaded: {downloaded_file}")
                    return downloaded_file
                
        except Exception as e:
            logger.error(f"yt-dlp download failed: {e}")
        
        return None
    
    async def search_and_download(self, movie_name: str, task_id: str) -> Optional[str]:
        """Main search and download method - integrates with existing bot system"""
        logger.info(f"[{task_id}] Starting ultimate search for: {movie_name}")
        
        # Try streaming sites first with Playwright
        browser = await self._create_stealth_browser()
        page = await self._setup_stealth_page(browser)
        
        try:
            # Try each streaming site with multiple attempts
            for site_name in ['cataz', 'fmovies', 'einthusan', 'mkvcinemas']:
                logger.info(f"[{task_id}] Attempting {site_name}...")
                
                # Try multiple times for each site
                for attempt in range(2):  # 2 attempts per site
                    try:
                        video_url = await self._search_streaming_site(movie_name, site_name, page)
                        if video_url:
                            logger.info(f"[{task_id}] Found video URL on {site_name}: {video_url}")
                            downloaded_file = await self._download_with_ytdlp(video_url, movie_name)
                            if downloaded_file:
                                logger.info(f"[{task_id}] Successfully downloaded via {site_name}")
                                return downloaded_file
                            else:
                                logger.warning(f"[{task_id}] Download failed for {site_name}, trying next...")
                        else:
                            logger.warning(f"[{task_id}] No video URL found on {site_name}, attempt {attempt + 1}")
                    except Exception as e:
                        logger.warning(f"[{task_id}] {site_name} attempt {attempt + 1} failed: {e}")
                        await page.wait_for_timeout(2000)  # Wait before retry
            
            # No torrent fallback - focus only on streaming
            logger.warning(f"[{task_id}] All streaming sites failed - no torrent fallback")
            return None
            
        except Exception as e:
            logger.error(f"[{task_id}] Ultimate search failed: {e}")
            return None
        finally:
            await browser.close()

# Test function
async def test_ultimate_scraper():
    """Test the ultimate scraper"""
    scraper = MovieScraperUltimate()
    
    # Test with a popular movie
    result = await scraper.search_and_download("Inception 2010", "test_001")
    
    if result:
        if result.startswith("torrents_found:"):
            print(f"SUCCESS: Found {result.split(':')[1]} torrents")
        else:
            print(f"SUCCESS: Downloaded: {result}")
    else:
        print("FAILED: Download failed")

if __name__ == "__main__":
    asyncio.run(test_ultimate_scraper())
