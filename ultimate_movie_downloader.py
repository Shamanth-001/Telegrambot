#!/usr/bin/env python3
"""
Ultimate Movie Downloader - Complete Solution
Integrates with existing bot system for comprehensive movie downloading
"""

import asyncio
import logging
import os
import random
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
import aiohttp
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Browser, Page, TimeoutError as PlaywrightTimeoutError
import yt_dlp
import cloudscraper
import re
import json

logger = logging.getLogger(__name__)

class UltimateMovieDownloader:
    """Ultimate movie downloader with comprehensive fallback system"""
    
    def __init__(self, download_path: str = "downloads/movies"):
        self.download_path = Path(download_path)
        self.download_path.mkdir(parents=True, exist_ok=True)
        
        # Enhanced user agents
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        ]
        
        # Working domains (December 2024)
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
            ]
        }
        
        # Torrent sources
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
    
    async def _create_stealth_browser(self) -> Browser:
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
    
    async def _setup_stealth_page(self, browser: Browser) -> Page:
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
    
    async def _bypass_cloudflare(self, page: Page, url: str) -> bool:
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
    
    async def _extract_video_urls(self, page: Page) -> List[str]:
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
    
    async def _search_streaming_site(self, movie_name: str, site_name: str, page: Page) -> Optional[str]:
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
        """Download video using yt-dlp"""
        try:
            logger.info(f"Downloading with yt-dlp: {video_url}")
            
            output_path = self.download_path / f"{movie_name}.%(ext)s"
            
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
                    logger.info(f"Downloaded: {downloaded_file}")
                    return downloaded_file
                
        except Exception as e:
            logger.error(f"yt-dlp download failed: {e}")
        
        return None
    
    async def download_movie(self, movie_name: str, task_id: str = "default") -> Dict[str, Any]:
        """Main download method with comprehensive fallback"""
        logger.info(f"[{task_id}] Starting ultimate download for: {movie_name}")
        
        result = {
            'success': False,
            'method': None,
            'file_path': None,
            'torrents': [],
            'error': None
        }
        
        # Try streaming sites first with Playwright
        browser = await self._create_stealth_browser()
        page = await self._setup_stealth_page(browser)
        
        try:
            # Try each streaming site
            for site_name in ['cataz', 'fmovies', 'einthusan', 'mkvcinemas']:
                video_url = await self._search_streaming_site(movie_name, site_name, page)
                if video_url:
                    downloaded_file = await self._download_with_ytdlp(video_url, movie_name)
                    if downloaded_file:
                        result['success'] = True
                        result['method'] = f'streaming_{site_name}'
                        result['file_path'] = downloaded_file
                        logger.info(f"[{task_id}] Successfully downloaded via {site_name}")
                        return result
            
            # Fallback to torrents
            logger.info(f"[{task_id}] Streaming sites failed, trying torrents...")
            torrents = await self._search_torrents(movie_name)
            
            if torrents:
                result['success'] = True
                result['method'] = 'torrents'
                result['torrents'] = torrents
                logger.info(f"[{task_id}] Found {len(torrents)} torrents")
                return result
            
            result['error'] = "All download methods failed"
            logger.error(f"[{task_id}] All download methods failed")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"[{task_id}] Download failed: {e}")
        finally:
            await browser.close()
        
        return result

# Integration with existing bot system
class MovieScraperIntegration:
    """Integration class for existing bot system"""
    
    def __init__(self):
        self.downloader = UltimateMovieDownloader()
    
    async def search_and_download(self, movie_name: str, task_id: str) -> Optional[str]:
        """Main method for bot integration"""
        result = await self.downloader.download_movie(movie_name, task_id)
        
        if result['success']:
            if result['method'].startswith('streaming_'):
                return result['file_path']
            elif result['method'] == 'torrents':
                # Return torrent info for bot to handle
                return f"torrents_found:{len(result['torrents'])}"
        
        return None

# Test function
async def test_ultimate_downloader():
    """Test the ultimate downloader"""
    downloader = UltimateMovieDownloader()
    
    # Test with a popular movie
    result = await downloader.download_movie("Inception 2010", "test_001")
    
    print(f"Success: {result['success']}")
    print(f"Method: {result['method']}")
    if result['file_path']:
        print(f"File: {result['file_path']}")
    if result['torrents']:
        print(f"Torrents: {len(result['torrents'])} found")
    if result['error']:
        print(f"Error: {result['error']}")

if __name__ == "__main__":
    asyncio.run(test_ultimate_downloader())

