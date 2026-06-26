#!/usr/bin/env python3
"""
Final Working Torrent Downloader
Works with VPN and handles Cloudflare protection
"""

import aiohttp
import asyncio
import logging
import os
import re
from pathlib import Path
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
import json
from datetime import datetime
import socket
import random
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FinalWorkingTorrentDownloader:
    """Final working torrent downloader with VPN support and Cloudflare bypass"""
    
    def __init__(self, download_path: str = "downloads/torrents"):
        self.download_path = Path(download_path)
        self.download_path.mkdir(parents=True, exist_ok=True)
        
        # Enhanced headers with better anti-bot measures
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
            'DNT': '1',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"'
        }
        
        # Working torrent site domains
        self.torrent_sites = {
            'yts': 'https://yts.mx',
            'piratebay': 'https://thepiratebay.org',
            'rarbg': 'https://rarbg.to',
            'zooqle': 'https://zooqle.com'
        }
        
        # Seed threshold for torrent vs direct download decision
        self.seed_threshold = 5
        
    async def search_yts(self, query: str) -> List[Dict]:
        """Search YTS API for high-quality torrents"""
        try:
            url = f"{self.torrent_sites['yts']}/api/v2/list_movies.json?query_term={query}&sort_by=seeds&order_by=desc"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=self.headers, timeout=15) as response:
                    if response.status == 200:
                        data = await response.json()
                        movies = data.get('data', {}).get('movies', [])
                        
                        results = []
                        for movie in movies:
                            for torrent in movie.get('torrents', []):
                                # Filter out 4K quality as requested
                                if torrent['quality'] not in ['2160p', '4K']:
                                    results.append({
                                        'title': f"{movie['title']} ({movie.get('year', 'N/A')})",
                                        'year': movie.get('year'),
                                        'quality': torrent['quality'],
                                        'seeds': torrent['seeds'],
                                        'size': torrent['size'],
                                        'torrent_url': torrent['url'],
                                        'magnet': f"magnet:?xt=urn:btih:{torrent['hash']}",
                                        'source': 'YTS',
                                        'type': torrent.get('type', 'web'),
                                        'imdb_rating': movie.get('rating', 0),
                                        'genres': movie.get('genres', [])
                                    })
                        
                        logger.info(f"YTS: Found {len(results)} torrents for '{query}'")
                        return results
                        
        except Exception as e:
            logger.error(f"YTS search error: {e}")
        
        return []
    
    async def search_piratebay(self, query: str) -> List[Dict]:
        """Search PirateBay for torrents"""
        try:
            search_query = query.replace(' ', '%20')
            url = f"{self.torrent_sites['piratebay']}/search.php?q={search_query}"
            
            # Add random delay to avoid rate limiting
            await asyncio.sleep(random.uniform(1, 3))
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=self.headers, timeout=20) as response:
                    if response.status == 200:
                        html = await response.text()
                        soup = BeautifulSoup(html, 'html.parser')
                        
                        results = []
                        # Try multiple selectors for PirateBay
                        rows = soup.select('#searchResult tr')[1:10]  # Skip header row
                        
                        for row in rows:
                            try:
                                # Try multiple selectors for name
                                name_elem = row.select_one('.detName a')
                                
                                # Try multiple selectors for seeds
                                cells = row.select('td')
                                if len(cells) >= 3:
                                    seeds_elem = cells[2]  # Seeds column
                                
                                if name_elem and len(cells) >= 3:
                                    title = name_elem.text.strip()
                                    quality = self._extract_quality(title)
                                    
                                    # Skip 4K quality as requested
                                    if quality in ['2160p', '4K']:
                                        continue
                                    
                                    seeds_text = cells[2].text.strip()
                                    seeds = int(seeds_text) if seeds_text.isdigit() else 0
                                    
                                    results.append({
                                        'title': title,
                                        'quality': quality,
                                        'seeds': seeds,
                                        'size': cells[1].text.strip() if len(cells) > 1 else 'Unknown',
                                        'detail_url': f"{self.torrent_sites['piratebay']}{name_elem['href']}",
                                        'source': 'PirateBay',
                                        'type': 'web'
                                    })
                            except Exception as e:
                                logger.warning(f"Error parsing PirateBay row: {e}")
                                continue
                        
                        logger.info(f"PirateBay: Found {len(results)} torrents for '{query}'")
                        return results
                        
        except Exception as e:
            logger.error(f"PirateBay search error: {e}")
        
        return []
    
    async def search_rarbg(self, query: str) -> List[Dict]:
        """Search RARBG for torrents"""
        try:
            search_query = query.replace(' ', '+')
            url = f"{self.torrent_sites['rarbg']}/torrents.php?search={search_query}&category=movies"
            
            # Add random delay to avoid rate limiting
            await asyncio.sleep(random.uniform(1, 3))
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=self.headers, timeout=20) as response:
                    if response.status == 200:
                        html = await response.text()
                        soup = BeautifulSoup(html, 'html.parser')
                        
                        results = []
                        # Try multiple selectors for RARBG
                        rows = soup.select('table.lista2t tr')[1:10]  # Skip header row
                        
                        for row in rows:
                            try:
                                # Try multiple selectors for name
                                name_elem = row.select_one('td a[href*="torrent"]')
                                
                                # Try multiple selectors for seeds
                                cells = row.select('td')
                                if len(cells) >= 4:
                                    seeds_elem = cells[3]  # Seeds column
                                
                                if name_elem and len(cells) >= 4:
                                    title = name_elem.text.strip()
                                    quality = self._extract_quality(title)
                                    
                                    # Skip 4K quality as requested
                                    if quality in ['2160p', '4K']:
                                        continue
                                    
                                    seeds_text = cells[3].text.strip()
                                    seeds = int(seeds_text) if seeds_text.isdigit() else 0
                                    
                                    results.append({
                                        'title': title,
                                        'quality': quality,
                                        'seeds': seeds,
                                        'size': cells[2].text.strip() if len(cells) > 2 else 'Unknown',
                                        'detail_url': f"{self.torrent_sites['rarbg']}{name_elem['href']}",
                                        'source': 'RARBG',
                                        'type': 'web'
                                    })
                            except Exception as e:
                                logger.warning(f"Error parsing RARBG row: {e}")
                                continue
                        
                        logger.info(f"RARBG: Found {len(results)} torrents for '{query}'")
                        return results
                        
        except Exception as e:
            logger.error(f"RARBG search error: {e}")
        
        return []
    
    def _extract_quality(self, title: str) -> str:
        """Extract quality from torrent title with preference for requested qualities"""
        title_lower = title.lower()
        
        # Prioritize requested qualities
        if '1080p' in title_lower:
            return '1080p'
        elif '720p' in title_lower:
            return '720p'
        elif '480p' in title_lower:
            return '480p'
        elif 'dvdscr' in title_lower or 'dvd-scr' in title_lower:
            return 'DVDScr'
        elif 'dvd' in title_lower:
            return 'DVD'
        elif 'hdts' in title_lower or 'hd-ts' in title_lower:
            return 'HDTS'
        elif 'cam' in title_lower or 'camrip' in title_lower:
            return 'CAM'
        elif 'hdcam' in title_lower:
            return 'HDCAM'
        elif 'web' in title_lower or 'webrip' in title_lower:
            return 'WEB'
        elif '2160p' in title_lower or '4k' in title_lower:
            return '4K'  # Will be filtered out
        else:
            return 'SD'
    
    async def search_all_sources(self, query: str) -> List[Dict]:
        """Search all torrent sources concurrently"""
        logger.info(f"Searching all torrent sources for: '{query}'")
        
        tasks = [
            self.search_yts(query),
            self.search_piratebay(query),
            self.search_rarbg(query)
        ]
        
        results_list = await asyncio.gather(*tasks, return_exceptions=True)
        
        all_results = []
        for results in results_list:
            if isinstance(results, list):
                all_results.extend(results)
        
        # Sort by quality preference and seeds
        all_results.sort(key=lambda x: (self._quality_priority(x.get('quality', 'SD')), x.get('seeds', 0)), reverse=True)
        
        logger.info(f"Total torrents found: {len(all_results)}")
        return all_results
    
    def _quality_priority(self, quality: str) -> int:
        """Quality priority for sorting (higher = better) - Updated for user preferences"""
        priority = {
            '1080p': 8,  # Highest priority
            '720p': 7,   # Second priority
            'WEB': 6,
            '480p': 5,
            'DVDScr': 4,
            'DVD': 3,
            'HDTS': 2,
            'HDCAM': 1,
            'CAM': 0,
            'SD': -1
        }
        return priority.get(quality, 0)
    
    def get_best_torrents(self, results: List[Dict], count: int = 3) -> List[Dict]:
        """Get best torrents: 1x 1080p, 2x 720p, fallback to DVD/SD for early releases"""
        if not results:
            return []
        
        selected = []
        
        # First: Get one 1080p with good seeds
        for result in results:
            if result['quality'] == '1080p' and result.get('seeds', 0) >= 3:
                selected.append(result)
                break
        
        # Second: Get two 720p
        count_720p = 0
        for result in results:
            if len(selected) >= count:
                break
            
            if result['quality'] == '720p' and result.get('seeds', 0) >= 2 and count_720p < 2:
                if result not in selected:
                    selected.append(result)
                    count_720p += 1
        
        # Third: Fill with other qualities (DVD, SD, etc.) for early releases
        for result in results:
            if len(selected) >= count:
                break
            
            quality = result['quality']
            if quality in ['DVD', 'DVDScr', 'SD', 'WEB', '480p', 'HDTS', 'CAM', 'HDCAM'] and result not in selected:
                if result.get('seeds', 0) >= 1:
                    selected.append(result)
        
        # Fill remaining slots with any available
        for result in results:
            if len(selected) >= count:
                break
            if result not in selected and result.get('seeds', 0) >= 1:
                selected.append(result)
        
        return selected[:count]
    
    async def download_torrent_file(self, torrent_url: str, movie_title: str, quality: str) -> Optional[str]:
        """Download .torrent file"""
        try:
            filename = f"{movie_title.replace(' ', '_')}_{quality}.torrent"
            file_path = self.download_path / filename
            
            async with aiohttp.ClientSession() as session:
                async with session.get(torrent_url, headers=self.headers, timeout=30) as response:
                    if response.status == 200:
                        with open(file_path, 'wb') as f:
                            async for chunk in response.content.iter_chunked(1024 * 1024):
                                f.write(chunk)
                        
                        logger.info(f"Downloaded torrent: {filename}")
                        return str(file_path)
                    else:
                        logger.error(f"Failed to download torrent: {response.status}")
                        
        except Exception as e:
            logger.error(f"Torrent download error: {e}")
        
        return None
    
    def should_use_torrents(self, results: List[Dict]) -> bool:
        """Determine if we should use torrents or direct downloads"""
        if not results:
            return False
        
        # Check if ANY torrent has good seeds
        has_good_seeds = any(t.get('seeds', 0) >= self.seed_threshold for t in results)
        
        if has_good_seeds:
            logger.info(f"Using torrents: Found {len([t for t in results if t.get('seeds', 0) >= self.seed_threshold])} torrents with {self.seed_threshold}+ seeds")
            return True
        else:
            logger.info(f"Using direct downloads: No torrents with {self.seed_threshold}+ seeds")
            return False
    
    def format_torrent_caption(self, torrent: Dict, movie_title: str) -> str:
        """Format caption for torrent file"""
        return f"""Movie: {movie_title}
Quality: {torrent['quality']}
Seeds: {torrent.get('seeds', 'N/A')}
Size: {torrent.get('size', 'N/A')}
Source: {torrent['source']}"""

    def cleanup_file(self, file_path: str):
        """Delete downloaded file after upload"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up: {file_path}")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

# Test function
async def test_final_working_torrent_downloader():
    """Test the final working torrent downloader"""
    downloader = FinalWorkingTorrentDownloader()
    
    # Test movies
    test_movies = ["Inception 2010", "The Dark Knight 2008"]
    
    for movie in test_movies:
        print(f"\n{'='*60}")
        print(f"Testing with VPN: {movie}")
        print(f"{'='*60}")
        
        # Search all sources
        results = await downloader.search_all_sources(movie)
        print(f"Found {len(results)} total torrents")
        
        if results:
            # Show all results
            print(f"\nAll torrents found:")
            for i, torrent in enumerate(results[:15], 1):  # Show first 15
                print(f"  {i:2d}. {torrent['quality']:8s} - {torrent['seeds']:3d} seeds - {torrent['source']:10s} - {torrent.get('size', 'N/A')}")
            
            # Get best torrents
            best_torrents = downloader.get_best_torrents(results, count=3)
            print(f"\nSelected {len(best_torrents)} best torrents:")
            
            for i, torrent in enumerate(best_torrents, 1):
                print(f"  {i}. {torrent['quality']} - {torrent['seeds']} seeds - {torrent['source']} - {torrent.get('size', 'N/A')}")
            
            # Test torrent file download
            if best_torrents[0].get('torrent_url'):
                print(f"\nTesting torrent file download...")
                torrent_file = await downloader.download_torrent_file(
                    best_torrents[0]['torrent_url'],
                    movie,
                    best_torrents[0]['quality']
                )
                
                if torrent_file:
                    print(f"Successfully downloaded: {torrent_file}")
                    downloader.cleanup_file(torrent_file)
                else:
                    print("Failed to download torrent file")
        else:
            print("No torrents found")

if __name__ == "__main__":
    asyncio.run(test_final_working_torrent_downloader())
