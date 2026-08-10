"""
StreamBreaker Torrent Scraper
Scrapes 1337x and The Pirate Bay for movie/series torrent links in real-time.
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

# --- Headers to mimic a real Chrome browser ---
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
    "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="8"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}

# 1337x mirrors (fallback chain)
MIRRORS_1337X = [
    "https://1337x.to",
    "https://1337x.st",
    "https://1337x.gd",
    "https://1337x.ws",
    "https://1377x.to",
]

# TPB / Pirate Bay API proxies
APIBAY_URLS = [
    "https://apibay.org",
    "https://tpb.party",
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
    if "CAM" in t or "HDCAM" in t or "HDTS" in t or "TELESYNC" in t:
        return "CAM"
    return "Unknown"


def _format_size(size_bytes: int) -> str:
    """Convert bytes to human-readable size string."""
    if size_bytes <= 0:
        return "Unknown"
    gb = size_bytes / (1024 ** 3)
    if gb >= 1:
        return f"{gb:.1f} GB"
    mb = size_bytes / (1024 ** 2)
    return f"{mb:.0f} MB"


def _normalize(text: str) -> str:
    """Normalize a string for comparison: lowercase, remove punctuation, collapse spaces."""
    t = text.lower()
    t = re.sub(r'[^a-z0-9\s]', ' ', t)  # Replace non-alphanumeric with space
    t = re.sub(r'\s+', ' ', t).strip()  # Collapse whitespace
    return t


def _relevance_score(query: str, torrent_title: str) -> float:
    """
    Score how relevant a torrent title is to the search query.
    Returns 0.0-1.0 (1.0 = perfect match).
    
    Strategy:
    - Extract meaningful keywords from the query (ignore year, common words)
    - Check what fraction of query keywords appear in the torrent title
    - Give bonus for exact phrase matches
    """
    q_norm = _normalize(query)
    t_norm = _normalize(torrent_title)
    
    # Extract keywords (skip common noise words and years)
    noise = {'the', 'a', 'an', 'of', 'and', 'in', 'to', 'for', 'on', 'at', 'by', 'is', 'it'}
    q_words = [w for w in q_norm.split() if w not in noise and not re.match(r'^(19|20)\d{2}$', w)]
    
    if not q_words:
        return 0.5  # Can't determine relevance
    
    # Count how many query words appear in the torrent title
    matched = sum(1 for w in q_words if w in t_norm)
    word_score = matched / len(q_words)
    
    # Bonus: check if the main title phrase (without year) appears as a substring
    q_no_year = re.sub(r'\b(19|20)\d{2}\b', '', q_norm).strip()
    phrase_bonus = 0.15 if q_no_year and q_no_year in t_norm else 0.0
    
    return min(1.0, word_score + phrase_bonus)


# ============================================================
# 1337x Scraper
# ============================================================

async def _fetch_html(session: aiohttp.ClientSession, url: str, timeout: int = 15) -> Optional[str]:
    """Fetch HTML from a URL with error handling."""
    try:
        async with session.get(
            url,
            headers=HEADERS,
            timeout=aiohttp.ClientTimeout(total=timeout),
            ssl=False,  # Skip SSL verification for mirrors
        ) as resp:
            if resp.status == 200:
                return await resp.text()
            logger.warning(f"HTTP {resp.status} from {url}")
    except Exception as e:
        logger.warning(f"Fetch error for {url}: {e}")
    return None


def _extract_1337x_links(html: str, base_url: str) -> list[str]:
    """Extract torrent detail page links from 1337x search results using regex."""
    pattern = r'href="(/torrent/\d+/[^"]+/)"'
    matches = re.findall(pattern, html)
    return [urljoin(base_url, m) for m in matches[:12]]


def _extract_1337x_magnet(html: str) -> Optional[str]:
    """Extract magnet link from a 1337x torrent detail page."""
    match = re.search(r'href="(magnet:\?xt=urn:btih:[^"]+)"', html)
    return match.group(1) if match else None


def _extract_1337x_info(html: str) -> dict:
    """Extract size, seeders, leechers from 1337x detail page."""
    info = {"size": "Unknown", "seeders": 0, "leechers": 0}

    size_match = re.search(r'<li>\s*<strong>Total size</strong>\s*<span>([\d.]+ [A-Za-z]+)</span>', html)
    if size_match:
        info["size"] = size_match.group(1)

    seed_match = re.search(r'<span class="seeds">\s*(\d+)\s*</span>', html)
    if seed_match:
        info["seeders"] = int(seed_match.group(1))

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

    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        html = None
        used_base = MIRRORS_1337X[0]

        for mirror in MIRRORS_1337X:
            search_url = f"{mirror}/category-search/{encoded}/{category}/1/"
            html = await _fetch_html(session, search_url)
            if html and "torrent" in html.lower():
                used_base = mirror
                break
            # Also try plain search if category search fails
            search_url = f"{mirror}/search/{encoded}/1/"
            html = await _fetch_html(session, search_url)
            if html and "torrent" in html.lower():
                used_base = mirror
                break

        if not html:
            logger.error("All 1337x mirrors failed")
            return results

        links = _extract_1337x_links(html, used_base)
        if not links:
            return results

        sem = asyncio.Semaphore(3)

        async def fetch_with_sem(url):
            async with sem:
                await asyncio.sleep(0.3)  # Small delay between requests
                return await _scrape_1337x_detail(session, url)

        tasks = [fetch_with_sem(link) for link in links]
        detail_results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in detail_results:
            if isinstance(r, TorrentResult) and r.seeders > 0:
                results.append(r)

    return results


# ============================================================
# APIBay (The Pirate Bay API) — JSON API, no HTML scraping
# ============================================================

async def search_apibay(query: str, media_type: str = "movie") -> list[TorrentResult]:
    """Search via APIBay (TPB proxy API). Returns JSON directly."""
    results = []
    encoded = quote_plus(query)
    # Categories: 201 = Movies, 205 = TV Shows
    cat = "201" if media_type == "movie" else "205"

    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        data = None
        for base_url in APIBAY_URLS:
            api_url = f"{base_url}/q.php?q={encoded}&cat={cat}"
            try:
                async with session.get(
                    api_url,
                    headers=HEADERS,
                    timeout=aiohttp.ClientTimeout(total=10),
                    ssl=False,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data and len(data) > 0 and data[0].get("id") != "0":
                            break
                        data = None
            except Exception as e:
                logger.warning(f"APIBay error ({base_url}): {e}")
                continue

        if not data:
            return results

        trackers = [
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://open.stealth.si:80/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://explodie.org:6969/announce",
            "udp://tracker.tiny-vps.com:6969/announce",
            "udp://tracker.cyberia.is:6969/announce",
        ]
        tracker_str = "&".join([f"tr={t}" for t in trackers])

        for item in data[:15]:
            if item.get("id") == "0":
                continue

            info_hash = item.get("info_hash", "")
            name = item.get("name", "Unknown")
            seeders = int(item.get("seeders", 0))
            leechers = int(item.get("leechers", 0))
            size_bytes = int(item.get("size", 0))

            if seeders == 0 or not info_hash:
                continue

            magnet = f"magnet:?xt=urn:btih:{info_hash}&dn={quote_plus(name)}&{tracker_str}"

            results.append(TorrentResult(
                title=name,
                quality=_detect_quality(name),
                size=_format_size(size_bytes),
                seeders=seeders,
                leechers=leechers,
                magnet=magnet,
                source="TPB",
            ))

    return results


# ============================================================
# YTS Scraper (public API)
# ============================================================

async def search_yts(query: str) -> list[TorrentResult]:
    """Search YTS API for movie torrents. YTS only has movies, not series."""
    results = []

    yts_domains = ["https://yts.mx", "https://yts.lt", "https://yts.bz"]

    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        data = None
        for domain in yts_domains:
            api_url = f"{domain}/api/v2/list_movies.json"
            try:
                async with session.get(api_url, params={
                    "query_term": query,
                    "limit": 10,
                    "sort_by": "seeds",
                }, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10), ssl=False) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get("data", {}).get("movies"):
                            break
                        data = None
            except Exception as e:
                logger.warning(f"YTS API error ({domain}): {e}")
                continue

        if not data:
            return results

    movies = data.get("data", {}).get("movies") or []

    for movie in movies:
        torrents = movie.get("torrents", [])
        movie_title = movie.get("title_long", movie.get("title", "Unknown"))
        for t in torrents:
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
# Main search function — combines all sources
# ============================================================

async def search_torrents(query: str, media_type: str = "movie") -> list[TorrentResult]:
    """
    Search all torrent sources in parallel and return combined, deduplicated results
    filtered by relevance and sorted by seeders (highest first).
    """
    tasks = [
        search_1337x(query, media_type),
        search_apibay(query, media_type),
    ]

    if media_type == "movie":
        tasks.append(search_yts(query))

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

    # Filter by relevance — discard results below 50% match
    scored = []
    for r in combined:
        score = _relevance_score(query, r.title)
        if score >= 0.5:
            scored.append((score, r))

    # Sort: relevance first (desc), then seeders (desc)
    scored.sort(key=lambda x: (x[0], x[1].seeders), reverse=True)

    return [r for _, r in scored]
