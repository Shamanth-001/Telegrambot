#!/usr/bin/env python3
"""
Domain Auction Downloader - Using Recently Auctioned Domains
Based on nicsell.com domain auctions for movie download sites
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

class DomainAuctionDownloader:
    """Downloader using recently auctioned movie domains from nicsell.com"""
    
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
        
        # Recently auctioned movie domains from nicsell.com
        self.auctioned_domains = {
            'moviesmod': [
                'https://moviesmod.com.pl',  # Recently auctioned on nicsell.com
                'https://moviesmod.li',
                'https://moviesmods.lol',
                'https://moviesmods.net'
            ],
            'filmy4wap': [
                'https://filmy4wap.skin',
                'https://filmy4wap.com',
                'https://filmy4wap.in'
            ],
            'moviesflix': [
                'https://moviesflix.com',
                'https://moviesflix.in',
                'https://moviesflix.pro'
            ],
            'hdmoviesflix': [
                'https://hdmoviesflix.com',
                'https://hdmoviesflix.in'
            ],
            'bollyflix': [
                'https://bollyflix.com',
                'https://bollyflix.in'
            ]
        }
        
        # Cloudscraper for bypass
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
    
    async def _check_domain_availability(self, domain: str) -> bool:
        """Check if recently auctioned domain is accessible"""
        try:
            logger.info(f"🔍 Checking domain availability: {domain}")
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    domain, 
                    headers={'User-Agent': self._get_random_user_agent()},
                    timeout=15
                ) as response:
                    if response.status == 200:
                        logger.info(f"✅ Domain accessible: {domain}")
                        return True
                    else:
                        logger.warning(f"❌ Domain returned status {response.status}: {domain}")
                        return False
        except Exception as e:
            logger.warning(f"❌ Domain not accessible: {domain} - {e}")
            return False
    
    async def _create_stealth_browser(self):
        """Create stealth browser for recently auctioned domains"""
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
        """Setup stealth page for auctioned domains"""
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
        
        # Inject advanced stealth scripts for auctioned domains
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
    
    async def _search_auctioned_domain(self, movie_name: str, site_name: str, page) -> Optional[str]:
        """Search recently auctioned domain for movies"""
        try:
            logger.info(f"🎬 Searching {site_name} (auctioned domain) for: {movie_name}")
            
            for domain in self.auctioned_domains[site_name]:
                # Check if domain is accessible first
                if not await self._check_domain_availability(domain):
                    continue
                
                try:
                    logger.info(f"Trying auctioned domain: {domain}")
                    
                    # Try different search URLs for auctioned domains
                    search_urls = [
                        f"{domain}/search/{movie_name.replace(' ', '%20')}",
                        f"{domain}/search/{movie_name.replace(' ', '+')}",
                        f"{domain}/?s={movie_name.replace(' ', '+')}",
                        f"{domain}/search/{movie_name.replace(' ', '-')}",
                        f"{domain}/movie/{movie_name.replace(' ', '-').lower()}",
                        f"{domain}/film/{movie_name.replace(' ', '-').lower()}"
                    ]
                    
                    for search_url in search_urls:
                        try:
                            logger.info(f"Trying search URL: {search_url}")
                            await page.goto(search_url, wait_until='networkidle', timeout=30000)
                            await page.wait_for_timeout(5000)
                            
                            # Check for Cloudflare or other protection
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
                                '.result-item a',
                                '.post-item a',
                                '.item a',
                                '.card a'
                            ]
                            
                            movie_links = []
                            for selector in movie_selectors:
                                links = await page.locator(selector).all()
                                if links:
                                    movie_links.extend(links)
                                    logger.info(f"Found {len(links)} links with selector: {selector}")
                                    break
                            
                            if movie_links:
                                logger.info(f"Found {len(movie_links)} total movie links")
                                
                                # Try first few movie links
                                for i, link in enumerate(movie_links[:5]):  # Try more links
                                    try:
                                        logger.info(f"Trying movie link {i+1}")
                                        await link.click()
                                        await page.wait_for_timeout(5000)
                                        
                                        # Look for download links
                                        download_url = await self._extract_download_links_auctioned(page)
                                        if download_url:
                                            logger.info(f"✅ Found download link on auctioned domain: {download_url}")
                                            return download_url
                                        
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
                    logger.warning(f"Auctioned domain {domain} failed: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Auctioned domain search failed: {e}")
            return None
    
    async def _extract_download_links_auctioned(self, page) -> Optional[str]:
        """Extract download links from recently auctioned domains"""
        try:
            # Look for download buttons/links with more selectors
            download_selectors = [
                'a[href*="download"]',
                'a[href*=".mp4"]',
                'a[href*=".mkv"]',
                'a[href*=".avi"]',
                'a[href*=".webm"]',
                '.download-btn',
                '.download-link',
                '.download-button',
                'button[onclick*="download"]',
                'a:has-text("Download")',
                'a:has-text("720p")',
                'a:has-text("1080p")',
                'a:has-text("HD")',
                'a:has-text("Watch")',
                'a:has-text("Stream")',
                '.play-btn',
                '.watch-btn',
                '.stream-btn',
                '[data-download]',
                '[data-url]'
            ]
            
            for selector in download_selectors:
                try:
                    links = await page.locator(selector).all()
                    for link in links:
                        href = await link.get_attribute('href')
                        if href and any(ext in href.lower() for ext in ['.mp4', '.mkv', '.avi', '.webm', '.m3u8']):
                            # Check if it's a direct download link
                            if not any(blocked in href.lower() for blocked in ['trailer', 'preview', 'ad', 'banner']):
                                logger.info(f"Found download link: {href}")
                                return href
                except:
                    continue
            
            # Look for iframe sources
            try:
                iframes = await page.locator('iframe').all()
                for iframe in iframes:
                    src = await iframe.get_attribute('src')
                    if src and any(ext in src.lower() for ext in ['.mp4', '.mkv', '.avi', '.m3u8']):
                        logger.info(f"Found iframe video: {src}")
                        return src
            except:
                pass
            
            # Look for video elements
            try:
                video_elements = await page.locator('video').all()
                for video in video_elements:
                    src = await video.get_attribute('src')
                    if src and not any(blocked in src.lower() for blocked in ['trailer', 'preview', 'ad']):
                        logger.info(f"Found video element: {src}")
                        return src
            except:
                pass
            
            return None
            
        except Exception as e:
            logger.error(f"Download link extraction failed: {e}")
            return None
    
    async def _download_with_ytdlp(self, video_url: str, movie_name: str) -> Optional[str]:
        """Download video using yt-dlp"""
        try:
            logger.info(f"📥 Downloading with yt-dlp: {video_url}")
            
            output_path = self.download_path / f"{movie_name}.%(ext)s"
            
            ydl_opts = {
                'outtmpl': str(output_path),
                'format': 'best[height<=1080]',
                'quiet': False,
                'no_warnings': False,
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
            logger.error(f"yt-dlp download failed: {e}")
        
        return None
    
    async def download_movie(self, movie_name: str, task_id: str = "default") -> Optional[str]:
        """Main download method using recently auctioned domains"""
        logger.info(f"[{task_id}] Starting auctioned domain download for: {movie_name}")
        
        # Try recently auctioned domains first
        browser = await self._create_stealth_browser()
        page = await self._setup_stealth_page(browser)
        
        try:
            # Try each site with auctioned domains
            for site_name in ['moviesmod', 'filmy4wap', 'moviesflix', 'hdmoviesflix', 'bollyflix']:
                logger.info(f"[{task_id}] Trying {site_name} with auctioned domains...")
                
                download_url = await self._search_auctioned_domain(movie_name, site_name, page)
                if download_url:
                    downloaded_file = await self._download_with_ytdlp(download_url, movie_name)
                    if downloaded_file:
                        logger.info(f"[{task_id}] Successfully downloaded via {site_name} (auctioned domain)")
                        return downloaded_file
            
            logger.warning(f"[{task_id}] All auctioned domains failed")
            return None
            
        except Exception as e:
            logger.error(f"[{task_id}] Auctioned domain download failed: {e}")
            return None
        finally:
            await browser.close()

# Test function
async def test_auctioned_downloader():
    """Test the auctioned domain downloader"""
    downloader = DomainAuctionDownloader()
    
    # Test with a popular movie
    result = await downloader.download_movie("Inception 2010", "test_001")
    
    if result:
        print(f"SUCCESS: Downloaded: {result}")
    else:
        print("FAILED: Download failed")

if __name__ == "__main__":
    asyncio.run(test_auctioned_downloader())

