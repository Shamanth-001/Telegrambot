import aiohttp
import logging
import re

YTS_API = "https://yts.mx/api/v2/list_movies.json"

logger = logging.getLogger(__name__)


def _build_magnet(torrent: dict, title: str) -> str:
    """Build a magnet link from a YTS torrent dict."""
    hash_ = torrent.get("hash", "")
    encoded_title = re.sub(r"[^a-zA-Z0-9 ]", "", title).replace(" ", "+")
    trackers = (
        "udp%3A%2F%2Fopen.demonii.com%3A1337%2Fannounce"
        "&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80"
        "&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969"
        "&tr=udp%3A%2F%2Fglotorrents.pw%3A6969%2Fannounce"
        "&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce"
    )
    return f"magnet:?xt=urn:btih:{hash_}&dn={encoded_title}&tr={trackers}"


async def find_yts_links(title: str, year: str = "") -> list[dict]:
    """
    Search YTS for a movie and return up to 3 direct download options by quality.

    Returns a list of dicts:
        [{"quality": "1080p", "size": "1.9 GB", "magnet": "magnet:?...", "type": "BluRay"}]

    Returns [] if nothing found or on error.
    """
    query = f"{title} {year}".strip()

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=8)
        ) as session:
            params = {
                "query_term": query,
                "limit": 5,
                "sort_by": "rating",
                "order_by": "desc",
            }
            async with session.get(YTS_API, params=params) as resp:
                if resp.status != 200:
                    logger.warning(f"YTS API returned {resp.status}")
                    return []
                data = await resp.json()

        movies = data.get("data", {}).get("movies", [])
        if not movies:
            # Retry without year if initial search had year
            if year:
                return await find_yts_links(title)
            return []

        # Pick the best matching movie (first result is most relevant by YTS ranking)
        movie = movies[0]
        torrents = movie.get("torrents", [])
        movie_title = movie.get("title", title)

        # Priority quality order
        QUALITY_ORDER = ["2160p", "1080p.bluray", "1080p", "720p.bluray", "720p", "480p"]

        # Sort torrents by preferred quality order
        def quality_rank(t):
            q = t.get("quality", "") + ("." + t.get("type", "").lower() if t.get("type") else "")
            try:
                return QUALITY_ORDER.index(q)
            except ValueError:
                # Try matching just the resolution
                for i, pref in enumerate(QUALITY_ORDER):
                    if pref.startswith(t.get("quality", "")):
                        return i
                return 99

        sorted_torrents = sorted(torrents, key=quality_rank)[:3]

        results = []
        for t in sorted_torrents:
            quality = t.get("quality", "?")
            size = t.get("size", "?")
            codec = t.get("video_codec", "")
            quality_label = f"{quality} {'BluRay' if 'bluray' in t.get('type','').lower() else 'WEB'}"
            if codec:
                quality_label += f" {codec}"

            results.append({
                "quality": quality_label,
                "size": size,
                "magnet": _build_magnet(t, movie_title),
                "seeds": t.get("seeds", 0),
            })

        return results

    except aiohttp.ClientError as e:
        logger.error(f"YTS request failed: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error in find_yts_links: {e}")
        return []
