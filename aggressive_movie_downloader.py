#!/usr/bin/env python3
"""
Aggressive Movie Downloader - Focus on Streaming Sites Only
Enhanced extraction techniques for actual movie files
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

class AggressiveMovieDownloader:
    """Aggressive movie downloader focused only on streaming sites"""
    
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
        
    def _get_random_user_agent(self) -> str:
        """Get random user agent"""
        return random.choice(self.user_agents)
    
    async def _create_stealth_browser(self):
        """Create stealth browser with advanced anti-bot measures"""
        playwright = await async_playwright().start()
        
        browser = await playwright.chromium.launch(
            headless=False,  # Set to False to see what's happening
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
        
        # Inject advanced stealth scripts
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
    
    async def _search_cataz_aggressive(self, movie_name: str, page) -> Optional[str]:
        """Aggressive Cataz search with multiple techniques"""
        try:
            logger.info(f"🎬 Aggressive Cataz search for: {movie_name}")
            
            for domain in self.streaming_sites['cataz']:
                try:
                    logger.info(f"Trying domain: {domain}")
                    
                    # Try different search URLs
                    search_urls = [
                        f"{domain}/search/{movie_name.replace(' ', '%20')}",
                        f"{domain}/search/{movie_name.replace(' ', '+')}",
                        f"{domain}/search/{movie_name.replace(' ', '-')}",
                        f"{domain}/?s={movie_name.replace(' ', '+')}"
                    ]
                    
                    for search_url in search_urls:
                        try:
                            logger.info(f"Trying search URL: {search_url}")
                            await page.goto(search_url, wait_until='networkidle', timeout=30000)
                            await page.wait_for_timeout(3000)
                            
                            # Check for Cloudflare
                            if await page.locator('.cf-challenge').count() > 0:
                                logger.info("Cloudflare detected, waiting...")
                                await page.wait_for_timeout(5000)
                            
                            # Look for movie results with multiple selectors
                            movie_selectors = [
                                'a[href*="/movie/"]',
                                'a[href*="/film/"]',
                                'a[href*="/watch/"]',
                                '.movie-item a',
                                '.film-item a',
                                '.search-result a',
                                '.result-item a'
                            ]
                            
                            movie_links = []
                            for selector in movie_selectors:
                                links = await page.locator(selector).all()
                                if links:
                                    movie_links.extend(links)
                                    break
                            
                            if movie_links:
                                logger.info(f"Found {len(movie_links)} movie links")
                                
                                # Try first few movie links
                                for i, link in enumerate(movie_links[:3]):
                                    try:
                                        logger.info(f"Trying movie link {i+1}")
                                        await link.click()
                                        await page.wait_for_timeout(5000)
                                        
                                        # Try to find video player
                                        video_found = await self._extract_video_aggressive(page)
                                        if video_found:
                                            logger.info(f"✅ Found video on Cataz: {video_found}")
                                            return video_found
                                        
                                        # Go back to search
                                        await page.go_back()
                                        await page.wait_for_timeout(2000)
                                        
                                    except Exception as e:
                                        logger.warning(f"Movie link {i+1} failed: {e}")
                                        continue
                            
                        except Exception as e:
                            logger.warning(f"Search URL failed: {e}")
                            continue
                        
                except Exception as e:
                    logger.warning(f"Cataz domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Aggressive Cataz search failed: {e}")
            return None
    
    async def _extract_video_aggressive(self, page) -> Optional[str]:
        """Aggressive video extraction with multiple techniques"""
        try:
            video_urls = []
            
            # Method 1: Monitor network requests
            def handle_response(response):
                url = response.url
                if any(ext in url.lower() for ext in ['.mp4', '.m3u8', '.mkv', '.avi', '.webm', '.mov', '.flv']):
                    if not any(blocked in url.lower() for blocked in ['trailer', 'preview', 'ad', 'banner', 'logo', 'intro']):
                        video_urls.append(url)
                        logger.info(f"Found video URL: {url}")
            
            page.on('response', handle_response)
            
            # Method 2: Try clicking play buttons
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
                '[onclick*="watch"]',
                '.video-play',
                '.player-play'
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
            
            # Method 3: Try clicking video element
            try:
                video_elements = await page.locator('video').all()
                if video_elements:
                    await video_elements[0].click()
                    await page.wait_for_timeout(2000)
                    logger.info("Clicked on video element")
            except:
                pass
            
            # Method 4: Look for iframes
            try:
                iframes = await page.locator('iframe').all()
                for iframe in iframes:
                    src = await iframe.get_attribute('src')
                    if src and any(ext in src.lower() for ext in ['.mp4', '.m3u8', '.mkv']):
                        video_urls.append(src)
                        logger.info(f"Found iframe video: {src}")
            except:
                pass
            
            # Method 5: Look for video elements directly
            try:
                video_elements = await page.locator('video').all()
                for video in video_elements:
                    src = await video.get_attribute('src')
                    if src and not any(blocked in src.lower() for blocked in ['trailer', 'preview', 'ad']):
                        video_urls.append(src)
                        logger.info(f"Found video element: {src}")
            except:
                pass
            
            # Wait for network requests
            await page.wait_for_timeout(10000)
            
            if video_urls:
                # Return the best video URL (prefer mp4, then m3u8)
                for ext in ['.mp4', '.mkv', '.avi', '.m3u8', '.webm']:
                    for url in video_urls:
                        if ext in url.lower():
                            return url
                
                # Return first URL if no preference found
                return video_urls[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Video extraction failed: {e}")
            return None
    
    async def _download_with_ytdlp(self, video_url: str, movie_name: str) -> Optional[str]:
        """Download video using yt-dlp with enhanced options"""
        try:
            logger.info(f"📥 Downloading with yt-dlp: {video_url}")
            
            output_path = self.download_path / f"{movie_name}.%(ext)s"
            
            ydl_opts = {
                'outtmpl': str(output_path),
                'format': 'best[height<=1080]',
                'quiet': False,  # Show progress
                'no_warnings': False,
                'extract_flat': False,
                'writesubtitles': False,
                'writeautomaticsub': False,
                'ignoreerrors': True,
                'no_check_certificate': True,
                'prefer_insecure': True,
                'http_chunk_size': 10485760,
                'retries': 5,
                'fragment_retries': 5,
                'socket_timeout': 60,
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
            logger.error(f"yt-dlp download failed: {e}")
        
        return None
    
    async def download_movie(self, movie_name: str, task_id: str = "default") -> Optional[str]:
        """Main download method - streaming sites only"""
        logger.info(f"[{task_id}] Starting aggressive download for: {movie_name}")
        
        # Create stealth browser
        browser = await self._create_stealth_browser()
        page = await self._setup_stealth_page(browser)
        
        try:
            # Try Cataz first (most reliable)
            logger.info(f"[{task_id}] Trying Cataz...")
            video_url = await self._search_cataz_aggressive(movie_name, page)
            if video_url:
                downloaded_file = await self._download_with_ytdlp(video_url, movie_name)
                if downloaded_file:
                    logger.info(f"[{task_id}] Successfully downloaded via Cataz")
                    return downloaded_file
            
            logger.warning(f"[{task_id}] All streaming sites failed")
            return None
            
        except Exception as e:
            logger.error(f"[{task_id}] Aggressive download failed: {e}")
            return None
        finally:
            await browser.close()

# Test function
async def test_aggressive_downloader():
    """Test the aggressive downloader"""
    downloader = AggressiveMovieDownloader()
    
    # Test with a popular movie
    result = await downloader.download_movie("Inception 2010", "test_001")
    
    if result:
        print(f"SUCCESS: Downloaded: {result}")
    else:
        print("FAILED: Download failed")

if __name__ == "__main__":
    asyncio.run(test_aggressive_downloader())

