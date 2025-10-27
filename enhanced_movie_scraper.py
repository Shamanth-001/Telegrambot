#!/usr/bin/env python3
"""
Enhanced Movie Scraper with Advanced Anti-Bot Detection
Integrates with existing Telegram bot system
"""

import os
import asyncio
import logging
from pathlib import Path
import yt_dlp
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
import re
import random
import json
from typing import Dict, List, Optional, Tuple
import aiohttp
import time
import subprocess
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, quote

logger = logging.getLogger(__name__)

class EnhancedMovieScraper:
    def __init__(self):
        self.download_dir = Path(os.getenv('DOWNLOAD_DIR', './downloads'))
        self.download_dir.mkdir(exist_ok=True)
        
        self.min_quality = os.getenv('MIN_QUALITY', '720p')
        self.prefer_quality = os.getenv('PREFER_QUALITY', '1080p')
        
        # Enhanced site configuration with anti-bot measures
        self.sites = [
            {
                'name': 'fmovies', 
                'url': 'https://fmovies.to', 
                'search': '/filter?keyword=', 
                'enabled': True,
                'anti_bot': True,
                'cloudflare': True,
                'captcha': True,
                'method': 'playwright'  # Use Playwright for complex sites
            },
            {
                'name': 'cataz', 
                'url': 'https://cataz.to', 
                'search': '/search/', 
                'enabled': True,
                'anti_bot': True,
                'cloudflare': False,
                'captcha': False,
                'method': 'playwright'
            },
            {
                'name': 'einthusan', 
                'url': 'https://einthusan.tv', 
                'search': '/movie/results/?query=', 
                'enabled': True,
                'anti_bot': False,
                'cloudflare': False,
                'captcha': False,
                'method': 'requests'  # Use requests for simple sites
            },
            {
                'name': 'mkvcinemas', 
                'url': 'https://mkvcinemas.kim', 
                'search': '/?s=', 
                'enabled': True,
                'anti_bot': True,
                'cloudflare': True,
                'captcha': True,
                'method': 'playwright'
            },
            {
                'name': 'ytstv', 
                'url': 'https://yts.mx', 
                'search': '/browse-movies/', 
                'enabled': True,
                'anti_bot': False,
                'cloudflare': False,
                'captcha': False,
                'method': 'requests'
            }
        ]
        
        # Anti-bot configuration
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
        ]
        
        self.viewports = [
            {'width': 1920, 'height': 1080},
            {'width': 1366, 'height': 768},
            {'width': 1440, 'height': 900},
            {'width': 1536, 'height': 864},
            {'width': 1280, 'height': 720}
        ]
        
        # Setup session for requests
        self.session = requests.Session()
        self.setup_session()

    def setup_session(self):
        """Setup session with proper headers"""
        self.session.headers.update({
            'User-Agent': random.choice(self.user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        })

    async def search_and_download(self, movie_name: str, task_id: str):
        """Enhanced search and download with anti-bot measures"""
        logger.info(f"🎬 Starting enhanced search for: {movie_name}")
        
        # Try each site with enhanced anti-bot measures
        for site in self.sites:
            if not site['enabled']:
                continue
                
            logger.info(f"🌐 Trying {site['name']} with {site['method']} method...")
            
            try:
                # Check site availability first
                if not await self._check_site_availability(site):
                    logger.warning(f"❌ Site {site['name']} not accessible")
                    continue
                
                # Try yt-dlp first (fastest)
                result = await self._try_ytdlp_enhanced(movie_name, site, task_id)
                if result:
                    logger.info(f"✅ Success with yt-dlp on {site['name']}")
                    return result
                
                # Try site-specific method
                if site['method'] == 'playwright':
                    result = await self._try_playwright_enhanced(movie_name, site, task_id)
                else:
                    result = await self._try_requests_enhanced(movie_name, site, task_id)
                
                if result:
                    logger.info(f"✅ Success with {site['method']} on {site['name']}")
                    return result
                    
            except Exception as e:
                logger.error(f"❌ Error with {site['name']}: {str(e)}")
                continue
        
        logger.error("❌ Failed to download from all sites")
        return None

    async def _check_site_availability(self, site: dict) -> bool:
        """Check if site is accessible"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(site['url'], timeout=10) as response:
                    return response.status == 200
        except Exception as e:
            logger.warning(f"Site {site['name']} not accessible: {str(e)}")
            return False

    async def _try_ytdlp_enhanced(self, movie_name: str, site: dict, task_id: str):
        """Enhanced yt-dlp with better error handling"""
        try:
            # Construct search URL
            search_url = site['url'] + site['search'] + movie_name.replace(' ', '+')
            
            # Enhanced yt-dlp options
            ydl_opts = {
                'outtmpl': str(self.download_dir / f"{task_id}_%(title)s.%(ext)s"),
                'format': 'best[height<=1080]/best',
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'writeinfojson': False,
                'writesubtitles': False,
                'writeautomaticsub': False,
                'ignoreerrors': True,
                'no_check_certificate': True,
                'user_agent': random.choice(self.user_agents),
                'http_headers': {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                }
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([search_url])
                
            # Check if file was downloaded
            downloaded_file = self._find_downloaded_file(task_id)
            if downloaded_file:
                logger.info(f"✅ Downloaded via yt-dlp: {downloaded_file}")
                return downloaded_file
                
        except Exception as e:
            logger.warning(f"⚠️ yt-dlp failed for {site['name']}: {str(e)}")
        
        return None

    async def _try_playwright_enhanced(self, movie_name: str, site: dict, task_id: str):
        """Enhanced Playwright with anti-bot measures"""
        try:
            async with async_playwright() as p:
                # Launch browser with anti-detection measures
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
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
                )
                
                # Create context with anti-detection
                context = await browser.new_context(
                    user_agent=random.choice(self.user_agents),
                    viewport=random.choice(self.viewports),
                    extra_http_headers={
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                    }
                )
                
                page = await context.new_page()
                
                # Override navigator properties
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
                """)
                
                # Navigate to site
                search_url = site['url'] + site['search'] + movie_name.replace(' ', '+')
                logger.info(f"🔍 Navigating to: {search_url}")
                await page.goto(search_url, wait_until='networkidle')
                
                # Handle Cloudflare if present
                if site.get('cloudflare', False):
                    await self._handle_cloudflare(page)
                
                # Handle CAPTCHA if present
                if site.get('captcha', False):
                    await self._handle_captcha(page)
                
                # Wait for page to load
                await page.wait_for_timeout(random.randint(2000, 5000))
                
                # Site-specific scraping
                if site['name'] == 'fmovies':
                    return await self._scrape_fmovies_enhanced(page, movie_name, task_id)
                elif site['name'] == 'cataz':
                    return await self._scrape_cataz_enhanced(page, movie_name, task_id)
                elif site['name'] == 'mkvcinemas':
                    return await self._scrape_mkvcinemas_enhanced(page, movie_name, task_id)
                
        except Exception as e:
            logger.error(f"❌ Playwright failed for {site['name']}: {str(e)}")
        
        return None

    async def _try_requests_enhanced(self, movie_name: str, site: dict, task_id: str):
        """Enhanced requests-based scraping"""
        try:
            # Construct search URL
            search_url = site['url'] + site['search'] + movie_name.replace(' ', '+')
            logger.info(f"🔍 Searching: {search_url}")
            
            # Make request with anti-bot headers
            response = self.session.get(search_url, timeout=30)
            response.raise_for_status()
            
            # Parse HTML
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Site-specific parsing
            if site['name'] == 'einthusan':
                return await self._parse_einthusan(soup, movie_name, task_id)
            elif site['name'] == 'ytstv':
                return await self._parse_ytstv(soup, movie_name, task_id)
                
        except Exception as e:
            logger.error(f"❌ Requests failed for {site['name']}: {str(e)}")
        
        return None

    async def _handle_cloudflare(self, page):
        """Handle Cloudflare protection"""
        try:
            # Check for Cloudflare challenge
            challenge = await page.query_selector('.cf-challenge')
            if challenge:
                logger.info("☁️ Cloudflare challenge detected, waiting...")
                await page.wait_for_timeout(5000)
                
                # Try to click "I'm not a robot" if present
                not_robot = await page.query_selector('input[type="checkbox"]')
                if not_robot:
                    await not_robot.click()
                    await page.wait_for_timeout(3000)
        except Exception as e:
            logger.warning(f"⚠️ Cloudflare handling failed: {str(e)}")

    async def _handle_captcha(self, page):
        """Handle CAPTCHA detection"""
        try:
            captcha_selectors = [
                '.captcha',
                '.recaptcha',
                '.hcaptcha',
                '[data-captcha]',
                '.cf-challenge',
                '.cloudflare-challenge'
            ]
            
            for selector in captcha_selectors:
                captcha = await page.query_selector(selector)
                if captcha:
                    logger.warn('🤖 CAPTCHA detected, waiting for manual solve...')
                    await page.wait_for_timeout(30000)  # Wait 30 seconds
                    return True
        except Exception as e:
            logger.warning(f"⚠️ CAPTCHA handling failed: {str(e)}")
        
        return False

    async def _scrape_fmovies_enhanced(self, page, movie_name: str, task_id: str):
        """Enhanced fmovies scraping with anti-bot measures"""
        try:
            # Wait for search results
            await page.wait_for_selector('.film-list', timeout=10000)
            
            # Find movie links
            movie_links = await page.query_selector_all('.film-list .film-poster')
            logger.info(f"🎬 Found {len(movie_links)} movies on fmovies")
            
            for i, link in enumerate(movie_links[:3]):  # Try first 3 results
                try:
                    logger.info(f"🔍 Trying movie {i+1} on fmovies...")
                    
                    # Human-like delay
                    await page.wait_for_timeout(random.randint(1000, 3000))
                    
                    # Click on movie
                    await link.click()
                    await page.wait_for_timeout(3000)
                    
                    # Look for play button
                    play_selectors = [
                        '.vjs-play-control',
                        '.vjs-big-play-button',
                        '.vjs-play-button',
                        '.play-button',
                        '.btn-play',
                        '.watch-button',
                        'button[class*="play"]',
                        'div[class*="play"]'
                    ]
                    
                    for selector in play_selectors:
                        play_button = await page.query_selector(selector)
                        if play_button:
                            logger.info(f"▶️ Found play button: {selector}")
                            # Human-like click
                            await page.wait_for_timeout(random.randint(500, 1500))
                            await play_button.click()
                            await page.wait_for_timeout(5000)
                            
                            # Look for video element
                            video = await page.query_selector('video')
                            if video:
                                src = await video.get_attribute('src')
                                if src:
                                    logger.info(f"🎥 Found video source: {src[:50]}...")
                                    return await self._download_video_url(src, movie_name, task_id)
                    
                    # Go back to search results
                    await page.go_back()
                    await page.wait_for_timeout(2000)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Error with movie {i+1}: {str(e)}")
                    continue
            
        except Exception as e:
            logger.error(f"❌ fmovies scraping failed: {str(e)}")
        
        return None

    async def _scrape_cataz_enhanced(self, page, movie_name: str, task_id: str):
        """Enhanced cataz scraping"""
        try:
            # Wait for search results
            await page.wait_for_selector('.movie-list', timeout=10000)
            
            # Find movie links
            movie_links = await page.query_selector_all('.movie-list .movie-item')
            logger.info(f"🎬 Found {len(movie_links)} movies on cataz")
            
            for i, link in enumerate(movie_links[:3]):
                try:
                    logger.info(f"🔍 Trying movie {i+1} on cataz...")
                    
                    await page.wait_for_timeout(random.randint(1000, 3000))
                    await link.click()
                    await page.wait_for_timeout(3000)
                    
                    # Look for video sources
                    video_sources = await page.query_selector_all('source[type="video/mp4"]')
                    for source in video_sources:
                        src = await source.get_attribute('src')
                        if src:
                            logger.info(f"🎥 Found video source: {src[:50]}...")
                            return await self._download_video_url(src, movie_name, task_id)
                    
                    await page.go_back()
                    await page.wait_for_timeout(2000)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Error with cataz movie {i+1}: {str(e)}")
                    continue
            
        except Exception as e:
            logger.error(f"❌ cataz scraping failed: {str(e)}")
        
        return None

    async def _scrape_mkvcinemas_enhanced(self, page, movie_name: str, task_id: str):
        """Enhanced mkvcinemas scraping"""
        try:
            # Wait for search results
            await page.wait_for_selector('.movie-list', timeout=10000)
            
            # Find movie links
            movie_links = await page.query_selector_all('.movie-list .movie-item')
            logger.info(f"🎬 Found {len(movie_links)} movies on mkvcinemas")
            
            for i, link in enumerate(movie_links[:3]):
                try:
                    logger.info(f"🔍 Trying movie {i+1} on mkvcinemas...")
                    
                    await page.wait_for_timeout(random.randint(1000, 3000))
                    await link.click()
                    await page.wait_for_timeout(3000)
                    
                    # Look for download links
                    download_links = await page.query_selector_all('a[href*="download"]')
                    for dl_link in download_links:
                        href = await dl_link.get_attribute('href')
                        if href:
                            logger.info(f"📥 Found download link: {href[:50]}...")
                            return await self._download_video_url(href, movie_name, task_id)
                    
                    await page.go_back()
                    await page.wait_for_timeout(2000)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Error with mkvcinemas movie {i+1}: {str(e)}")
                    continue
            
        except Exception as e:
            logger.error(f"❌ mkvcinemas scraping failed: {str(e)}")
        
        return None

    async def _parse_einthusan(self, soup, movie_name: str, task_id: str):
        """Parse einthusan search results"""
        try:
            # Find movie links
            movie_links = soup.find_all('a', class_='movie-item')
            logger.info(f"🎬 Found {len(movie_links)} movies on einthusan")
            
            for i, link in enumerate(movie_links[:3]):
                try:
                    logger.info(f"🔍 Trying movie {i+1} on einthusan...")
                    
                    movie_url = urljoin('https://einthusan.tv', link.get('href'))
                    response = self.session.get(movie_url, timeout=30)
                    
                    if response.status_code == 200:
                        movie_soup = BeautifulSoup(response.content, 'html.parser')
                        
                        # Look for video player
                        video = movie_soup.find('video')
                        if video and video.get('src'):
                            src = video.get('src')
                            logger.info(f"🎥 Found video source: {src[:50]}...")
                            return await self._download_video_url(src, movie_name, task_id)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Error with einthusan movie {i+1}: {str(e)}")
                    continue
            
        except Exception as e:
            logger.error(f"❌ einthusan parsing failed: {str(e)}")
        
        return None

    async def _parse_ytstv(self, soup, movie_name: str, task_id: str):
        """Parse ytstv search results"""
        try:
            # Find movie links
            movie_links = soup.find_all('div', class_='browse-movie-wrap')
            logger.info(f"🎬 Found {len(movie_links)} movies on ytstv")
            
            for i, link in enumerate(movie_links[:3]):
                try:
                    logger.info(f"🔍 Trying movie {i+1} on ytstv...")
                    
                    movie_link = link.find('a')
                    if movie_link:
                        movie_url = urljoin('https://yts.mx', movie_link.get('href'))
                        response = self.session.get(movie_url, timeout=30)
                        
                        if response.status_code == 200:
                            movie_soup = BeautifulSoup(response.content, 'html.parser')
                            
                            # Look for torrent links
                            torrent_links = movie_soup.find_all('a', href=lambda x: x and '.torrent' in x)
                            for torrent in torrent_links:
                                href = torrent.get('href')
                                if href:
                                    logger.info(f"📥 Found torrent: {href[:50]}...")
                                    return await self._download_torrent(href, movie_name, task_id)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Error with ytstv movie {i+1}: {str(e)}")
                    continue
            
        except Exception as e:
            logger.error(f"❌ ytstv parsing failed: {str(e)}")
        
        return None

    async def _download_video_url(self, url: str, movie_name: str, task_id: str):
        """Download video from direct URL"""
        try:
            ydl_opts = {
                'outtmpl': str(self.download_dir / f"{task_id}_%(title)s.%(ext)s"),
                'format': 'best[height<=1080]/best',
                'quiet': True,
                'no_warnings': True,
                'user_agent': random.choice(self.user_agents),
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
                
            downloaded_file = self._find_downloaded_file(task_id)
            if downloaded_file:
                logger.info(f"✅ Successfully downloaded: {downloaded_file}")
                return downloaded_file
                
        except Exception as e:
            logger.error(f"❌ Video download failed: {str(e)}")
        
        return None

    async def _download_torrent(self, torrent_url: str, movie_name: str, task_id: str):
        """Download torrent file"""
        try:
            # Download torrent file
            torrent_path = self.download_dir / f"{task_id}.torrent"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(torrent_url) as response:
                    if response.status == 200:
                        with open(torrent_path, 'wb') as f:
                            async for chunk in response.content.iter_chunked(8192):
                                f.write(chunk)
                        
                        logger.info(f"✅ Torrent downloaded: {torrent_path}")
                        return str(torrent_path)
                        
        except Exception as e:
            logger.error(f"❌ Torrent download failed: {str(e)}")
        
        return None

    def _find_downloaded_file(self, task_id: str):
        """Find downloaded file by task ID"""
        try:
            for file_path in self.download_dir.glob(f"{task_id}_*"):
                if file_path.is_file():
                    return str(file_path)
        except Exception as e:
            logger.error(f"❌ File search failed: {str(e)}")
        
        return None

# Usage example
async def main():
    scraper = EnhancedMovieScraper()
    result = await scraper.search_and_download("Inception", "test-123")
    if result:
        print(f"✅ Downloaded: {result}")
    else:
        print("❌ Download failed")

if __name__ == "__main__":
    asyncio.run(main())

