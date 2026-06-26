#!/usr/bin/env python3
"""
Simple Movie Downloader - Direct Web Scraping Solution
No buffering, no browser automation issues!
"""

import requests
from bs4 import BeautifulSoup
import re
import os
import sys
from urllib.parse import urljoin, urlparse
import time

class SimpleMovieDownloader:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
    def search_cataz(self, movie_title):
        """Search Cataz for movie"""
        print(f"Searching for '{movie_title}' on Cataz...")
        
        try:
            search_url = f"https://cataz.to/search/{movie_title.replace(' ', '%20')}"
            print(f"URL: {search_url}")
            
            response = self.session.get(search_url, timeout=30)
            if response.status_code != 200:
                print(f"Failed to access Cataz: {response.status_code}")
                return None
                
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Find movie links
            movie_links = []
            for link in soup.find_all('a', href=True):
                href = link.get('href')
                if href and ('/movie/' in href or '/watch/' in href):
                    title = link.get_text(strip=True)
                    if title and len(title) > 3 and 'prestige' in title.lower():
                        full_url = urljoin('https://cataz.to', href)
                        movie_links.append({
                            'title': title,
                            'url': full_url,
                            'site': 'cataz'
                        })
            
            print(f"Found {len(movie_links)} results on Cataz")
            return movie_links[:3]  # Return top 3 results
            
        except Exception as e:
            print(f"Cataz search failed: {e}")
            return None
    
    def extract_download_links(self, movie_url):
        """Extract direct download links from movie page"""
        print(f"Extracting download links from: {movie_url}")
        
        try:
            response = self.session.get(movie_url, timeout=30)
            if response.status_code != 200:
                return None
                
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for various download link patterns
            download_links = []
            
            # Pattern 1: Direct download links
            for link in soup.find_all('a', href=True):
                href = link.get('href')
                if href and any(ext in href.lower() for ext in ['.mp4', '.mkv', '.avi', '.mov', '.m3u8']):
                    download_links.append({
                        'url': href,
                        'text': link.get_text(strip=True),
                        'type': 'direct'
                    })
            
            # Pattern 2: Server links
            for link in soup.find_all('a', href=True):
                href = link.get('href')
                if href and any(server in href.lower() for server in ['server', 'embed', 'player', 'watch']):
                    download_links.append({
                        'url': href,
                        'text': link.get_text(strip=True),
                        'type': 'server'
                    })
            
            # Pattern 3: Look for JavaScript variables containing URLs
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string:
                    # Look for video URLs in JavaScript
                    urls = re.findall(r'https?://[^\s\'"]+\.(?:mp4|mkv|avi|mov|m3u8)', script.string)
                    for url in urls:
                        download_links.append({
                            'url': url,
                            'text': 'JavaScript URL',
                            'type': 'js'
                        })
            
            print(f"Found {len(download_links)} potential download links")
            return download_links
            
        except Exception as e:
            print(f"Failed to extract links: {e}")
            return None
    
    def download_movie(self, download_url, filename):
        """Download movie from direct URL"""
        print(f"Downloading: {filename}")
        print(f"URL: {download_url}")
        
        try:
            # Create downloads directory
            os.makedirs('downloads', exist_ok=True)
            
            # Start download
            response = self.session.get(download_url, stream=True, timeout=60)
            response.raise_for_status()
            
            filepath = os.path.join('downloads', filename)
            total_size = int(response.headers.get('content-length', 0))
            
            with open(filepath, 'wb') as f:
                downloaded = 0
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = (downloaded / total_size) * 100
                            print(f"\rProgress: {percent:.1f}% ({downloaded // 1024 // 1024} MB)", end='')
            
            print(f"\nDownload complete: {filepath}")
            return filepath
            
        except Exception as e:
            print(f"\nDownload failed: {e}")
            return None
    
    def find_working_download(self, movie_title):
        """Find and download working movie"""
        print(f"FINDING WORKING DOWNLOAD FOR: {movie_title}")
        print("=" * 50)
        
        # Search Cataz
        movies = self.search_cataz(movie_title)
        
        if not movies:
            print("No movies found on Cataz")
            return None
        
        print(f"\nFound {len(movies)} movies:")
        for i, movie in enumerate(movies, 1):
            print(f"   {i}. {movie['title']}")
        
        # Try each movie
        for movie in movies:
            print(f"\nTrying: {movie['title']}")
            
            download_links = self.extract_download_links(movie['url'])
            if not download_links:
                print("No download links found")
                continue
            
            # Try each download link
            for link in download_links:
                print(f"Trying link: {link['text']} ({link['type']})")
                
                # Make URL absolute
                if link['url'].startswith('//'):
                    link['url'] = 'https:' + link['url']
                elif link['url'].startswith('/'):
                    link['url'] = urljoin(movie['url'], link['url'])
                
                # Try to download
                filename = f"{movie_title.replace(' ', '_')}.mp4"
                result = self.download_movie(link['url'], filename)
                
                if result:
                    print(f"SUCCESS! Downloaded: {result}")
                    return result
                else:
                    print("This link didn't work, trying next...")
        
        print("No working download links found")
        return None

def main():
    """Main function"""
    print("PYTHON MOVIE DOWNLOADER")
    print("======================")
    print("No buffering, no browser issues!")
    print()
    
    downloader = SimpleMovieDownloader()
    
    # Get movie title from command line or use default
    if len(sys.argv) > 1:
        movie_title = ' '.join(sys.argv[1:])
    else:
        movie_title = "The Prestige 2006"
    
    print(f"Target: {movie_title}")
    print()
    
    # Find and download
    result = downloader.find_working_download(movie_title)
    
    if result:
        print(f"\nSUCCESS! Movie downloaded: {result}")
        print(f"Location: {os.path.abspath(result)}")
    else:
        print("\nFailed to download movie")
        print("\nTry these alternatives:")
        print("1. Check if movie exists on: https://cataz.to")
        print("2. Try different movie title variations")
        print("3. Use torrent sites for direct downloads")

if __name__ == "__main__":
    main()





