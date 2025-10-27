#!/usr/bin/env python3
"""
Robust Movie Downloader - Multiple Sources, No Buffering
"""

import requests
from bs4 import BeautifulSoup
import re
import os
import sys
import time
import random
from urllib.parse import urljoin, urlparse, quote
import subprocess

class RobustMovieDownloader:
    def __init__(self):
        self.session = requests.Session()
        self.setup_session()
        
    def setup_session(self):
        """Setup session with proper headers and proxies"""
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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
        
    def search_multiple_sites(self, movie_title):
        """Search multiple movie sites"""
        print(f"Searching for '{movie_title}' on multiple sites...")
        
        all_results = []
        
        # Try different search variations
        search_terms = [
            movie_title,
            movie_title.replace(' ', '-'),
            movie_title.replace(' ', '_'),
            movie_title.split()[0] if ' ' in movie_title else movie_title
        ]
        
        sites = [
            ('Cataz', 'https://cataz.to/search/'),
            ('FlixHQ', 'https://flixhq.to/search/'),
            ('FMovies', 'https://fmovies.to/search/'),
            ('SolarMovie', 'https://solarmovie.pe/search/'),
            ('Movies7', 'https://movies7.to/search/')
        ]
        
        for site_name, base_url in sites:
            for search_term in search_terms:
                try:
                    results = self._search_site(site_name, base_url, search_term)
                    if results:
                        all_results.extend(results)
                        print(f"Found {len(results)} results on {site_name}")
                        break  # Move to next site if we found results
                except Exception as e:
                    print(f"{site_name} failed: {e}")
                    continue
                    
                # Add delay between requests
                time.sleep(random.uniform(1, 3))
        
        return all_results
    
    def _search_site(self, site_name, base_url, search_term):
        """Search a specific site"""
        try:
            search_url = base_url + quote(search_term)
            print(f"  Trying {site_name}: {search_url}")
            
            response = self.session.get(search_url, timeout=30)
            if response.status_code != 200:
                return None
                
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Find movie links based on site
            movie_links = []
            
            if 'cataz' in base_url.lower():
                movie_links = self._extract_cataz_links(soup, base_url)
            elif 'flixhq' in base_url.lower():
                movie_links = self._extract_flixhq_links(soup, base_url)
            elif 'fmovies' in base_url.lower():
                movie_links = self._extract_fmovies_links(soup, base_url)
            else:
                movie_links = self._extract_generic_links(soup, base_url)
            
            return movie_links
            
        except Exception as e:
            print(f"  {site_name} error: {e}")
            return None
    
    def _extract_cataz_links(self, soup, base_url):
        """Extract links from Cataz"""
        links = []
        for link in soup.find_all('a', href=True):
            href = link.get('href')
            if href and ('/movie/' in href or '/watch/' in href):
                title = link.get_text(strip=True)
                if title and len(title) > 3:
                    full_url = urljoin(base_url, href)
                    links.append({
                        'title': title,
                        'url': full_url,
                        'site': 'cataz'
                    })
        return links[:5]
    
    def _extract_flixhq_links(self, soup, base_url):
        """Extract links from FlixHQ"""
        links = []
        for link in soup.find_all('a', href=True):
            href = link.get('href')
            if href and '/movie/' in href:
                title = link.get_text(strip=True)
                if title and len(title) > 3:
                    full_url = urljoin(base_url, href)
                    links.append({
                        'title': title,
                        'url': full_url,
                        'site': 'flixhq'
                    })
        return links[:5]
    
    def _extract_fmovies_links(self, soup, base_url):
        """Extract links from FMovies"""
        links = []
        for link in soup.find_all('a', href=True):
            href = link.get('href')
            if href and '/movie/' in href:
                title = link.get_text(strip=True)
                if title and len(title) > 3:
                    full_url = urljoin(base_url, href)
                    links.append({
                        'title': title,
                        'url': full_url,
                        'site': 'fmovies'
                    })
        return links[:5]
    
    def _extract_generic_links(self, soup, base_url):
        """Extract links from generic sites"""
        links = []
        for link in soup.find_all('a', href=True):
            href = link.get('href')
            if href and any(keyword in href.lower() for keyword in ['/movie/', '/watch/', '/film/']):
                title = link.get_text(strip=True)
                if title and len(title) > 3:
                    full_url = urljoin(base_url, href)
                    links.append({
                        'title': title,
                        'url': full_url,
                        'site': 'generic'
                    })
        return links[:5]
    
    def try_direct_download_sites(self, movie_title):
        """Try direct download sites"""
        print(f"\nTrying direct download sites for '{movie_title}'...")
        
        direct_sites = [
            {
                'name': 'PSARips',
                'url': f'https://psarips.com/search/{movie_title.replace(" ", "+")}',
                'selectors': {
                    'result': '.post-title a',
                    'download': '.download-links a'
                }
            },
            {
                'name': 'YTS',
                'url': f'https://yts.mx/browse-movies/{movie_title.replace(" ", "+")}',
                'selectors': {
                    'result': '.browse-movie-title a',
                    'download': '.download-torrent'
                }
            }
        ]
        
        for site in direct_sites:
            try:
                print(f"  Trying {site['name']}...")
                response = self.session.get(site['url'], timeout=30)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Look for download links
                    download_links = []
                    for link in soup.find_all('a', href=True):
                        href = link.get('href')
                        if href and any(ext in href.lower() for ext in ['.torrent', '.magnet:', 'download']):
                            download_links.append({
                                'url': href,
                                'text': link.get_text(strip=True),
                                'site': site['name']
                            })
                    
                    if download_links:
                        print(f"  Found {len(download_links)} download links on {site['name']}")
                        return download_links[:3]
                        
            except Exception as e:
                print(f"  {site['name']} failed: {e}")
                continue
        
        return None
    
    def try_ytdlp_download(self, movie_title):
        """Try yt-dlp for direct download"""
        print(f"\nTrying yt-dlp for '{movie_title}'...")
        
        # Common streaming sites to try
        sites_to_try = [
            f'https://flixhq.to/search/{movie_title.replace(" ", "-")}',
            f'https://fmovies.to/search/{movie_title.replace(" ", "-")}',
            f'https://solarmovie.pe/search/{movie_title.replace(" ", "-")}',
            f'https://movies7.to/search/{movie_title.replace(" ", "-")}'
        ]
        
        for site_url in sites_to_try:
            try:
                print(f"  Trying yt-dlp with: {site_url}")
                
                # Create downloads directory
                os.makedirs('downloads', exist_ok=True)
                
                # Try yt-dlp
                output_path = f'./downloads/{movie_title.replace(" ", "_")}.%(ext)s'
                cmd = [
                    'yt-dlp',
                    '-f', 'best[height<=1080]',
                    '-o', output_path,
                    site_url
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                
                if result.returncode == 0:
                    print(f"  SUCCESS! Downloaded with yt-dlp")
                    # Find the downloaded file
                    for file in os.listdir('downloads'):
                        if movie_title.replace(" ", "_").lower() in file.lower():
                            filepath = os.path.join('downloads', file)
                            print(f"  File: {filepath}")
                            return filepath
                else:
                    print(f"  yt-dlp failed: {result.stderr}")
                    
            except Exception as e:
                print(f"  yt-dlp error: {e}")
                continue
        
        return None
    
    def download_movie(self, movie_title):
        """Main download function"""
        print(f"ROBUST MOVIE DOWNLOADER")
        print("=" * 30)
        print(f"Target: {movie_title}")
        print()
        
        # Method 1: Try yt-dlp first (fastest)
        print("Method 1: Trying yt-dlp...")
        result = self.try_ytdlp_download(movie_title)
        if result:
            print(f"SUCCESS! Downloaded: {result}")
            return result
        
        # Method 2: Try direct download sites
        print("\nMethod 2: Trying direct download sites...")
        direct_links = self.try_direct_download_sites(movie_title)
        if direct_links:
            print(f"Found {len(direct_links)} direct download links")
            for link in direct_links:
                print(f"  - {link['text']}: {link['url']}")
            print("Manual download required - use these links")
            return direct_links
        
        # Method 3: Try streaming sites
        print("\nMethod 3: Trying streaming sites...")
        streaming_results = self.search_multiple_sites(movie_title)
        if streaming_results:
            print(f"Found {len(streaming_results)} streaming options")
            for result in streaming_results[:3]:
                print(f"  - {result['title']} ({result['site']}): {result['url']}")
            print("Try these URLs manually or with StreamFab")
            return streaming_results
        
        print("\nNo working download methods found")
        print("\nAlternative solutions:")
        print("1. Use StreamFab manually with any streaming site")
        print("2. Try torrent sites (1337x.to, thepiratebay.org)")
        print("3. Use browser extensions (Video DownloadHelper)")
        
        return None

def main():
    """Main function"""
    if len(sys.argv) > 1:
        movie_title = ' '.join(sys.argv[1:])
    else:
        movie_title = "The Prestige 2006"
    
    downloader = RobustMovieDownloader()
    result = downloader.download_movie(movie_title)
    
    if result:
        if isinstance(result, str) and os.path.exists(result):
            print(f"\nFile downloaded: {os.path.abspath(result)}")
        else:
            print(f"\nFound options: {result}")

if __name__ == "__main__":
    main()





