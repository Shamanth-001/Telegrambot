"""
StreamBreaker Torrent Scraper
Scrapes 1337x and YTS for movie/series torrent links in real-time.
Returns structured results with quality, size, seeders, and magnet links.
"""

import aiohttp
import asyncio
import re
import logging
from dataclasses import dataclass, asdict
from typing import Optional
from urllib.parse import quote_plus, urljoin

logger = logging.getLogger(__name__)

# --- Headers to mimic a real browser ---
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# 1337x mirrors (fallback chain)
MIRRORS_1337X = [
    "https://1337x.to",
    "https://1337x.st",
    "https://1337x.gd",
    "https://1337x.ws",
]


@dataclass
class TorrentResult:
    title: str
    quality: str
    size: str
    seeders: int
    leechers: int
    magnet: str
    source: str

    def to_dict(self):
        return asdict(self)


def _detect_quality(title: str) -> str:
    """Extract quality tag from torrent title."""
    t = title.upper()
    if "2160P" in t or "4K" in t or "UHD" in t:
        return "4K"
    if "1080P" in t or "FULLHD" in t or "FHD" in t:
        return "1080p"
    if "720P" in t or "HD" in t:
        return "720p"
    if "480P" in t:
        return "480p"
    if "CAM" in t or "HDCAM" in t or "TS" in t or "HDTS" in t:
        return "CAM"
    return "Unknown"


def _parse_size(size_str: str) -> float:
    """Convert size string like '1.5 GB' to float MB for sorting."""
    try:
        parts = size_str.strip().split()
        val = float(parts[0])
        unit = parts[1].upper() if len(parts) > 1 else "MB"
        if "GB" in unit:
            return val * 1024
        elif "KB" in unit:
            return val / 1024
        return val  # MB
    except Exception:
        return 0


# ============================================================
# 1337x Scraper
# ============================================================

async def _fetch_html(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    """Fetch HTML from a URL with error handling."""
    try:
        async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                return await resp.text()
            logger.warning(f"HTTP {resp.status} from {url}")
    except Exception as e:
        logger.warning(f"Fetch error for {url}: {e}")
    return None


def _extract_1337x_links(html: str, base_url: str) -> list[str]:
    """Extract torrent detail page links from 1337x search results using regex."""
    # Pattern matches links like /torrent/12345/Movie-Name/
    pattern = r'href="(/torrent/\d+/[^"]+/)"'
    matches = re.findall(pattern, html)
    return [urljoin(base_url, m) for m in matches[:15]]  # Limit to 15


def _extract_1337x_magnet(html: str) -> Optional[str]:
    """Extract magnet link from a 1337x torrent detail page."""
    match = re.search(r'href="(magnet:\?xt=urn:btih:[^"]+)"', html)
    return match.group(1) if match else None


def _extract_1337x_info(html: str) -> dict:
    """Extract size, seeders, leechers from 1337x detail page."""
    info = {"size": "Unknown", "seeders": 0, "leechers": 0}

    # Size - look in the info list
    size_match = re.search(r'<li>\s*<strong>Total size</strong>\s*<span>([\d.]+ [A-Za-z]+)</span>', html)
    if size_match:
        info["size"] = size_match.group(1)

    # Seeders
    seed_match = re.search(r'<span class="seeds">\s*(\d+)\s*</span>', html)
    if seed_match:
        info["seeders"] = int(seed_match.group(1))

    # Leechers
    leech_match = re.search(r'<span class="leeches">\s*(\d+)\s*</span>', html)
    if leech_match:
        info["leechers"] = int(leech_match.group(1))

    return info


async def _scrape_1337x_detail(session: aiohttp.ClientSession, url: str) -> Optional[TorrentResult]:
    """Scrape a single 1337x torrent detail page."""
    html = await _fetch_html(session, url)
    if not html:
        return None

    magnet = _extract_1337x_magnet(html)
    if not magnet:
        return None

    info = _extract_1337x_info(html)

    # Extract title from the page
    title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    title = title_match.group(1).strip() if title_match else url.split("/")[-2].replace("-", " ")

    return TorrentResult(
        title=title,
        quality=_detect_quality(title),
        size=info["size"],
        seeders=info["seeders"],
        leechers=info["leechers"],
        magnet=magnet,
        source="1337x",
    )


async def search_1337x(query: str, media_type: str = "movie") -> list[TorrentResult]:
    """Search 1337x for torrents. Tries mirrors if primary is down."""
    category = "Movies" if media_type == "movie" else "TV"
    encoded = quote_plus(query)
    results = []

    async with aiohttp.ClientSession() as session:
        html = None
        used_base = MIRRORS_1337X[0]

        for mirror in MIRRORS_1337X:
            search_url = f"{mirror}/category-search/{encoded}/{category}/1/"
            html = await _fetch_html(session, search_url)
            if html:
                used_base = mirror
                break

        if not html:
            logger.error("All 1337x mirrors failed")
            return results

        links = _extract_1337x_links(html, used_base)
        if not links:
            return results

        # Fetch detail pages concurrently (max 5 at a time)
        sem = asyncio.Semaphore(5)

        async def fetch_with_sem(url):
            async with sem:
                return await _scrape_1337x_detail(session, url)

        tasks = [fetch_with_sem(link) for link in links]
        detail_results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in detail_results:
            if isinstance(r, TorrentResult) and r.seeders > 0:
                results.append(r)

    return results


# ============================================================
# YTS Scraper (uses their public API — no HTML scraping needed)
# ============================================================

async def search_yts(query: str) -> list[TorrentResult]:
    """Search YTS API for movie torrents. YTS only has movies, not series."""
    results = []
    api_url = "https://yts.mx/api/v2/list_movies.json"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(api_url, params={
                "query_term": query,
                "limit": 10,
                "sort_by": "seeds",
            }, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return results
                data = await resp.json()
    except Exception as e:
        logger.warning(f"YTS API error: {e}")
        return results

    movies = data.get("data", {}).get("movies") or []

    for movie in movies:
        torrents = movie.get("torrents", [])
        movie_title = movie.get("title_long", movie.get("title", "Unknown"))
        for t in torrents:
            # YTS provides torrent hashes, construct magnet links
            torrent_hash = t.get("hash", "")
            if not torrent_hash:
                continue

            title_encoded = quote_plus(movie_title)
            magnet = (
                f"magnet:?xt=urn:btih:{torrent_hash}"
                f"&dn={title_encoded}"
                f"&tr=udp://open.stealth.si:80/announce"
                f"&tr=udp://tracker.opentrackr.org:1337/announce"
                f"&tr=udp://tracker.torrent.eu.org:451/announce"
                f"&tr=udp://explodie.org:6969/announce"
                f"&tr=udp://tracker.tiny-vps.com:6969/announce"
            )

            results.append(TorrentResult(
                title=f"{movie_title} [{t.get('quality', '?')}] [{t.get('type', 'web')}]",
                quality=t.get("quality", "Unknown"),
                size=t.get("size", "Unknown"),
                seeders=t.get("seeds", 0),
                leechers=t.get("peers", 0),
                magnet=magnet,
                source="YTS",
            ))

    return results


# ============================================================
# TorrentGalaxy Scraper
# ============================================================

async def search_torrentgalaxy(query: str, media_type: str = "movie") -> list[TorrentResult]:
    """Search TorrentGalaxy for torrents."""
    results = []
    encoded = quote_plus(query)
    # Category: 1 = Movies, 41 = TV
    cat = "1" if media_type == "movie" else "41"
    search_url = f"https://torrentgalaxy.to/torrents.php?search={encoded}&cat={cat}&sort=seeders&order=desc"

    async with aiohttp.ClientSession() as session:
        html = await _fetch_html(session, search_url)
        if not html:
            return results

        # Extract rows — each torrent is in a div with class tgxtablerow
        row_pattern = r'<div class="tgxtablerow[^"]*">(.*?)</div>\s*</div>\s*</div>\s*</div>'
        # Simpler approach: extract magnet links and titles directly
        magnet_pattern = r'href="(magnet:\?xt=urn:btih:[^"]+)"'
        magnets = re.findall(magnet_pattern, html)

        # Extract torrent names — they're in links with /torrent/ path
        name_pattern = r'<a[^>]*href="/torrent/[^"]*"[^>]*title="([^"]*)"'
        names = re.findall(name_pattern, html)

        # Extract size — look for spans with size info
        size_pattern = r'<span class="badge badge-secondary[^"]*">\s*([\d.]+ [A-Z]+)\s*</span>'
        sizes = re.findall(size_pattern, html)

        # Extract seeders/leechers
        seed_pattern = r'<font color="green"[^>]*>\s*<b>(\d+)</b>'
        seeds = re.findall(seed_pattern, html)
        leech_pattern = r'<font color="red"[^>]*>\s*<b>(\d+)</b>'
        leeches = re.findall(leech_pattern, html)

        count = min(len(magnets), len(names), 15)
        for i in range(count):
            seeders = int(seeds[i]) if i < len(seeds) else 0
            leechers = int(leeches[i]) if i < len(leeches) else 0
            size = sizes[i] if i < len(sizes) else "Unknown"
            title = names[i]

            if seeders == 0:
                continue

            results.append(TorrentResult(
                title=title,
                quality=_detect_quality(title),
                size=size,
                seeders=seeders,
                leechers=leechers,
                magnet=magnets[i],
                source="TorrentGalaxy",
            ))

    return results


# ============================================================
# Main search function — combines all sources
# ============================================================

async def search_torrents(query: str, media_type: str = "movie") -> list[TorrentResult]:
    """
    Search all torrent sources in parallel and return combined, deduplicated results
    sorted by seeders (highest first).
    """
    tasks = [search_1337x(query, media_type)]

    if media_type == "movie":
        tasks.append(search_yts(query))

    tasks.append(search_torrentgalaxy(query, media_type))

    all_results = await asyncio.gather(*tasks, return_exceptions=True)

    combined: list[TorrentResult] = []
    seen_hashes: set[str] = set()

    for result_group in all_results:
        if isinstance(result_group, Exception):
            logger.error(f"Scraper error: {result_group}")
            continue
        for r in result_group:
            # Deduplicate by info hash
            hash_match = re.search(r'btih:([a-fA-F0-9]+)', r.magnet)
            if hash_match:
                info_hash = hash_match.group(1).lower()
                if info_hash in seen_hashes:
                    continue
                seen_hashes.add(info_hash)
            combined.append(r)

    # Sort by seeders descending
    combined.sort(key=lambda x: x.seeders, reverse=True)

    return combined
