#!/usr/bin/env python3
"""
Comprehensive Movie Downloader with Multi-Source Fallback
Advanced Playwright automation + Anti-bot bypass + Termux compatibility
"""

import asyncio
import logging
import os
import random
import time
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import aiohttp
import yt_dlp
from playwright.async_api import async_playwright, Browser, Page, TimeoutError as PlaywrightTimeoutError
from bs4 import BeautifulSoup
import cloudscraper
import re
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ComprehensiveMovieDownloader:
    """Advanced movie downloader with multi-source fallback system"""
    
    def __init__(self, download_path: str = "downloads/movies"):
        self.download_path = Path(download_path)
        self.download_path.mkdir(parents=True, exist_ok=True)
        
        # Enhanced user agents for better anti-bot
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        ]
        
        # Working domains (updated 2024)
        self.streaming_sites = {
            'cataz': [
                'https://cataz.to',
                'https://cataz.ru',
                'https://cataz.net'
            ],
            'fmovies': [
                'https://fmovies24.to',
                'https://fmovies.llc',
                'https://fmovies-hd.to',
                'https://fmovies.ps'
            ],
            'einthusan': [
                'https://einthusan.tv',
                'https://www.einthusan.tv'
            ],
            'mkvcinemas': [
                'https://mkvcinemas.skin',
                'https://mkvcinemas.baby',
                'https://mkvcinemas.boats'
            ]
        }
        
        # Torrent sources for fallback
        self.torrent_sources = {
            'yts': 'https://yts.mx/api/v2/list_movies.json',
            'piratebay': 'https://thepiratebay.org',
            '1337x': 'https://1337x.to',
            'rarbg': 'https://rarbg.to'
        }
        
        # Indian movie specific sources
        self.indian_sources = {
            'einthusan': 'https://einthusan.tv',
            'moviesrulz': 'https://moviesrulz.skin',
            'tamilrockers': 'https://tamilrockers.skin',
            'filmy4wap': 'https://filmy4wap.skin'
        }
        
        # Cloudscraper for Cloudflare bypass
        self.scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'mobile': False
            }
        )
        
    async def create_stealth_browser(self) -> Browser:
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
    
    async def setup_stealth_page(self, browser: Browser) -> Page:
        """Setup stealth page with realistic fingerprint"""
        context = await browser.new_context(
            user_agent=random.choice(self.user_agents),
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
    
    async def search_cataz(self, movie_name: str, page: Page) -> Optional[str]:
        """Search and download from Cataz with advanced bypass"""
        try:
            logger.info(f"🎬 Searching Cataz for: {movie_name}")
            
            for domain in self.streaming_sites['cataz']:
                try:
                    # Navigate to search page
                    search_url = f"{domain}/search/{movie_name.replace(' ', '%20')}"
                    await page.goto(search_url, wait_until='networkidle', timeout=30000)
                    
                    # Wait for page to load
                    await page.wait_for_timeout(3000)
                    
                    # Check for Cloudflare challenge
                    if await page.locator('.cf-challenge').count() > 0:
                        logger.info("🛡️ Cloudflare challenge detected, waiting...")
                        await page.wait_for_timeout(5000)
                    
                    # Look for movie results
                    movie_links = await page.locator('a[href*="/movie/"]').all()
                    
                    if movie_links:
                        # Click on first movie
                        await movie_links[0].click()
                        await page.wait_for_timeout(3000)
                        
                        # Look for play button or video player
                        play_selectors = [
                            'button[class*="play"]',
                            '.play-button',
                            '.btn-play',
                            '[data-action="play"]',
                            'button:has-text("Play")',
                            'button:has-text("Watch")'
                        ]
                        
                        for selector in play_selectors:
                            if await page.locator(selector).count() > 0:
                                await page.locator(selector).first.click()
                                await page.wait_for_timeout(2000)
                                break
                        
                        # Monitor network requests for video URLs
                        video_urls = []
                        
                        def handle_response(response):
                            url = response.url
                            if any(ext in url.lower() for ext in ['.mp4', '.m3u8', '.mkv', '.avi']):
                                video_urls.append(url)
                        
                        page.on('response', handle_response)
                        
                        # Wait for video URLs
                        await page.wait_for_timeout(5000)
                        
                        if video_urls:
                            logger.info(f"✅ Found video URL on Cataz: {video_urls[0]}")
                            return video_urls[0]
                        
                except Exception as e:
                    logger.warning(f"❌ Cataz domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Cataz search failed: {e}")
            return None
    
    async def search_fmovies(self, movie_name: str, page: Page) -> Optional[str]:
        """Search and download from FMovies with advanced bypass"""
        try:
            logger.info(f"🎬 Searching FMovies for: {movie_name}")
            
            for domain in self.streaming_sites['fmovies']:
                try:
                    # Navigate to search page
                    search_url = f"{domain}/search/{movie_name.replace(' ', '%20')}"
                    await page.goto(search_url, wait_until='networkidle', timeout=30000)
                    
                    # Wait for page to load
                    await page.wait_for_timeout(3000)
                    
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
                            '.player-container'
                        ]
                        
                        for selector in video_selectors:
                            if await page.locator(selector).count() > 0:
                                # Try to get video source
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
                        
                        # Monitor network requests
                        video_urls = []
                        
                        def handle_response(response):
                            url = response.url
                            if any(ext in url.lower() for ext in ['.mp4', '.m3u8', '.mkv', '.avi']):
                                video_urls.append(url)
                        
                        page.on('response', handle_response)
                        
                        # Wait for video URLs
                        await page.wait_for_timeout(5000)
                        
                        if video_urls:
                            logger.info(f"✅ Found video URL on FMovies: {video_urls[0]}")
                            return video_urls[0]
                        
                except Exception as e:
                    logger.warning(f"❌ FMovies domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ FMovies search failed: {e}")
            return None
    
    async def search_einthusan(self, movie_name: str, page: Page) -> Optional[str]:
        """Search and download from Einthusan with advanced bypass"""
        try:
            logger.info(f"🎬 Searching Einthusan for: {movie_name}")
            
            for domain in self.streaming_sites['einthusan']:
                try:
                    # Navigate to search page
                    search_url = f"{domain}/search/{movie_name.replace(' ', '%20')}"
                    await page.goto(search_url, wait_until='networkidle', timeout=30000)
                    
                    # Wait for page to load
                    await page.wait_for_timeout(3000)
                    
                    # Look for movie results
                    movie_links = await page.locator('a[href*="/movie/"]').all()
                    
                    if movie_links:
                        # Click on first movie
                        await movie_links[0].click()
                        await page.wait_for_timeout(3000)
                        
                        # Look for play button
                        play_selectors = [
                            'button[class*="play"]',
                            '.play-button',
                            '.btn-play',
                            '[data-action="play"]',
                            'button:has-text("Play")',
                            'button:has-text("Watch")'
                        ]
                        
                        for selector in play_selectors:
                            if await page.locator(selector).count() > 0:
                                await page.locator(selector).first.click()
                                await page.wait_for_timeout(2000)
                                break
                        
                        # Monitor network requests for m3u8 URLs
                        video_urls = []
                        
                        def handle_response(response):
                            url = response.url
                            if '.m3u8' in url.lower() or '.mp4' in url.lower():
                                video_urls.append(url)
                        
                        page.on('response', handle_response)
                        
                        # Wait for video URLs
                        await page.wait_for_timeout(5000)
                        
                        if video_urls:
                            logger.info(f"✅ Found video URL on Einthusan: {video_urls[0]}")
                            return video_urls[0]
                        
                except Exception as e:
                    logger.warning(f"❌ Einthusan domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Einthusan search failed: {e}")
            return None
    
    async def search_torrents(self, movie_name: str) -> List[Dict]:
        """Search torrents as fallback"""
        try:
            logger.info(f"🔍 Searching torrents for: {movie_name}")
            
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
                logger.warning(f"❌ YTS search failed: {e}")
            
            return torrents
            
        except Exception as e:
            logger.error(f"❌ Torrent search failed: {e}")
            return []
    
    async def download_with_ytdlp(self, video_url: str, movie_name: str) -> Optional[str]:
        """Download video using yt-dlp"""
        try:
            logger.info(f"📥 Downloading with yt-dlp: {video_url}")
            
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
                    'User-Agent': random.choice(self.user_agents),
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
    
    async def download_movie(self, movie_name: str) -> Optional[str]:
        """Main download method with multi-source fallback"""
        logger.info(f"🎬 Starting comprehensive download for: {movie_name}")
        
        # Try streaming sites first with Playwright
        browser = await self.create_stealth_browser()
        page = await self.setup_stealth_page(browser)
        
        try:
            # Try Cataz
            video_url = await self.search_cataz(movie_name, page)
            if video_url:
                downloaded_file = await self.download_with_ytdlp(video_url, movie_name)
                if downloaded_file:
                    return downloaded_file
            
            # Try FMovies
            video_url = await self.search_fmovies(movie_name, page)
            if video_url:
                downloaded_file = await self.download_with_ytdlp(video_url, movie_name)
                if downloaded_file:
                    return downloaded_file
            
            # Try Einthusan
            video_url = await self.search_einthusan(movie_name, page)
            if video_url:
                downloaded_file = await self.download_with_ytdlp(video_url, movie_name)
                if downloaded_file:
                    return downloaded_file
            
        finally:
            await browser.close()
        
        # Fallback to torrents
        logger.info("🔄 Streaming sites failed, trying torrents...")
        torrents = await self.search_torrents(movie_name)
        
        if torrents:
            # Return torrent info for user to download
            logger.info(f"✅ Found {len(torrents)} torrents")
            return f"torrents_found:{len(torrents)}"
        
        logger.error("❌ All download methods failed")
        return None

# Test function
async def test_downloader():
    """Test the comprehensive downloader"""
    downloader = ComprehensiveMovieDownloader()
    
    # Test with a popular movie
    result = await downloader.download_movie("Inception 2010")
    
    if result:
        if result.startswith("torrents_found:"):
            print(f"SUCCESS: Found {result.split(':')[1]} torrents")
        else:
            print(f"SUCCESS: Downloaded: {result}")
    else:
        print("FAILED: Download failed")

if __name__ == "__main__":
    asyncio.run(test_downloader())
