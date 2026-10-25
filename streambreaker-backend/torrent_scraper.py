"""
StreamBreaker Torrent Scraper

Searches several public torrent indexes in parallel and returns magnet links
ranked by relevance and seeders:

  - Knaben     (aggregator API — best general coverage incl. Indian titles)
  - YTS        (movies, exact match by IMDb ID)
  - EZTV       (TV, exact match by IMDb ID + season/episode)
  - TorrentsCSV / APIBay (fallbacks)

Results are cached in memory for a short time so the website and the Telegram
bot can reuse the same search.
"""

import asyncio
import logging
import re
import time
from dataclasses import asdict, dataclass, field
from urllib.parse import quote, quote_plus

import aiohttp

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://explodie.org:6969/announce",
    "udp://open.demonii.com:1337/announce",
]

YTS_BASES = ["https://movies-api.accel.li", "https://yts.lt", "https://yts.am"]
EZTV_BASES = ["https://eztvx.to", "https://eztv.re", "https://eztv.wf"]
APIBAY_BASES = ["https://apibay.org"]

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=12)
EZTV_TIMEOUT = aiohttp.ClientTimeout(total=7)
CACHE_TTL = 20 * 60
_cache: dict[tuple, tuple[float, list]] = {}


@dataclass
class TorrentResult:
    title: str
    quality: str        # 4K / 1080p / 720p / 480p / Unknown
    rip: str            # BluRay / WEB / HDTV / DVD / CAM / ""
    codec: str          # x265 / x264 / AV1 / ""
    size: str
    size_bytes: int
    seeders: int
    leechers: int
    info_hash: str
    magnet: str
    source: str
    is_cam: bool
    languages: list[str] = field(default_factory=list)  # audio languages named in the release

    def to_dict(self):
        return asdict(self)


# ============================================================
# Helpers
# ============================================================

def build_magnet(info_hash: str, name: str) -> str:
    tr = "".join(f"&tr={quote(t, safe='')}" for t in TRACKERS)
    return f"magnet:?xt=urn:btih:{info_hash}&dn={quote_plus(name)}{tr}"


def short_magnet(info_hash: str, name: str) -> str:
    """Compact magnet (fewer trackers) — fits better in Telegram messages."""
    tr = "".join(f"&tr={quote(t, safe='')}" for t in TRACKERS[:2])
    return f"magnet:?xt=urn:btih:{info_hash}&dn={quote_plus(name)[:80]}{tr}"


def format_size(size_bytes: int) -> str:
    if not size_bytes or size_bytes <= 0:
        return "Unknown"
    gb = size_bytes / (1024 ** 3)
    if gb >= 1:
        return f"{gb:.2f} GB"
    return f"{size_bytes / (1024 ** 2):.0f} MB"


_CAM_RE = re.compile(r"\b(cam|camrip|hdcam|ts|hdts|telesync|tc|telecine|hdtc|pre-?dvd|scr|dvdscr|screener)\b", re.I)


def parse_tags(title: str) -> tuple[str, str, str, bool]:
    """Return (quality, rip, codec, is_cam) parsed from a release name."""
    t = title.replace(".", " ").replace("_", " ")
    tu = t.upper()

    if re.search(r"\b(2160P|4K|UHD)\b", tu):
        quality = "4K"
    elif re.search(r"\b1080P\b", tu):
        quality = "1080p"
    elif re.search(r"\b720P\b", tu):
        quality = "720p"
    elif re.search(r"\b(480P|576P|360P)\b", tu):
        quality = "480p"
    else:
        quality = "Unknown"

    is_cam = bool(_CAM_RE.search(t))
    if is_cam:
        rip = "CAM"
    elif re.search(r"\b(BLU-?RAY|BRRIP|BDRIP|BDREMUX|REMUX)\b", tu):
        rip = "BluRay"
    elif re.search(r"\b(WEB-?DL|WEBRIP|WEB|AMZN|NF|DSNP|HMAX|ATVP)\b", tu):
        rip = "WEB"
    elif re.search(r"\bHDTV\b", tu):
        rip = "HDTV"
    elif re.search(r"\bDVD(RIP)?\b", tu):
        rip = "DVD"
    else:
        rip = ""

    if re.search(r"\b(X265|H 265|H265|HEVC)\b", tu):
        codec = "x265"
    elif re.search(r"\bAV1\b", tu):
        codec = "AV1"
    elif re.search(r"\b(X264|H 264|H264|AVC)\b", tu):
        codec = "x264"
    else:
        codec = ""

    return quality, rip, codec, is_cam


LANGUAGE_NAMES = {
    "kn": "Kannada", "hi": "Hindi", "ta": "Tamil", "te": "Telugu", "ml": "Malayalam",
    "mr": "Marathi", "bn": "Bengali", "pa": "Punjabi", "en": "English",
}
_LANG_RE = re.compile(r"\b(" + "|".join(LANGUAGE_NAMES.values()) + r")\b", re.I)


def parse_languages(title: str) -> list[str]:
    found = []
    for m in _LANG_RE.finditer(title.replace(".", " ").replace("_", " ")):
        name = m.group(1).capitalize()
        if name not in found:
            found.append(name)
    if re.search(r"\b(multi|dual[ ._-]?audio)\b", title, re.I) and "Multi" not in found:
        found.append("Multi")
    return found


# Not a video release: soundtracks, music, books, games, samples
_JUNK_RE = re.compile(r"(?i)\b(soundtracks?|ost|flac|mp3|aac[ ._-]?album|album|discography|e-?book|epub|pdf|"
                      r"audiobook|pc[ ._-]?game|repack[ ._-]?by|sample|trailer)\b")


def _make(title, info_hash, size_bytes, seeders, leechers, source) -> TorrentResult | None:
    if _JUNK_RE.search(title or ""):
        return None
    info_hash = (info_hash or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}|[a-z2-7]{32}", info_hash):
        return None
    quality, rip, codec, is_cam = parse_tags(title)
    size_bytes = int(size_bytes or 0)
    return TorrentResult(
        languages=parse_languages(title),
        title=title.strip(),
        quality=quality,
        rip=rip,
        codec=codec,
        size=format_size(size_bytes),
        size_bytes=size_bytes,
        seeders=int(seeders or 0),
        leechers=int(leechers or 0),
        info_hash=info_hash,
        magnet=build_magnet(info_hash, title.strip()),
        source=source,
        is_cam=is_cam,
    )


async def _get_json(session, url, params=None, timeout=None):
    try:
        async with session.get(url, params=params, headers=HEADERS,
                               timeout=timeout or REQUEST_TIMEOUT, ssl=False) as resp:
            if resp.status == 200:
                return await resp.json(content_type=None)
            logger.warning(f"HTTP {resp.status} from {url}")
    except Exception as e:
        logger.warning(f"Fetch error {url}: {e}")
    return None


# ============================================================
# Matching
# ============================================================

_NOISE = {"the", "a", "an", "of", "and", "in", "to", "for", "on", "at", "by", "is", "it", "from"}


def _normalize(text: str) -> str:
    t = text.lower().replace("&", " and ").replace("'", "").replace("’", "")
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    # Join spelled-out initials so "K.G.F" and "KGF" compare equal
    return re.sub(r"\b[a-z](?: [a-z]\b)+", lambda m: m.group(0).replace(" ", ""), t)


def _title_words(title: str) -> list[str]:
    return [w for w in _normalize(title).split() if w not in _NOISE]


# Words that may follow the title in a release name (year/quality/language/edition tags)
_TAIL_OK = {
    "kannada", "hindi", "tamil", "telugu", "malayalam", "english", "marathi", "bengali", "punjabi",
    "multi", "dual", "dubbed", "audio", "org", "original", "uncut", "extended", "remastered", "proper",
    "repack", "hq", "hdrip", "webrip", "web", "dl", "bluray", "brrip", "bdrip", "dvdrip", "hdtv", "x264",
    "x265", "hevc", "imax", "directors", "theatrical", "esub", "esubs", "subs", "nf", "amzn", "zee5",
    "hotstar", "jiohotstar", "aha", "sunnxt", "pre", "dvdscr", "camrip", "cam", "hdcam", "hdts", "ts",
    "tc", "predvd", "complete", "season", "uhd", "hdr", "remux", "v2", "v3", "yts", "yify", "rarbg",
    "us", "uk", "au", "nz", "ca", "in",
}


def _title_matches(title: str, release: str) -> bool:
    """The release name must start with the title, followed by a year/quality/language tag."""
    words = _title_words(title)
    if not words:
        return True
    # Drop a leading [group] / (tag) and "www.site.tld - " prefixes
    raw = re.sub(r"^\s*(\[[^\]]*\]|\([^)]*\)|【[^】]*】)\s*", "", release)
    rel = re.sub(r"^www \S+ \S+ ", "", _normalize(raw))
    rel_words = [w for w in rel.split() if w not in _NOISE]
    n = len(words)
    if rel_words[:n] != words:
        return False
    nxt = rel_words[n] if len(rel_words) > n else ""
    if not nxt or nxt[0].isdigit() or nxt in _TAIL_OK or re.fullmatch(r"s\d{1,2}(e\d{1,3})?", nxt):
        return True
    # "Toxic" must not match "A Toxic Love Story"; long titles are distinctive enough
    return n >= 3


def _year_ok(release: str, year: str, title: str) -> bool:
    """Reject releases that clearly belong to a different year (e.g. Dune 1984 vs 2021)."""
    if not year:
        return True
    title_years = set(re.findall(r"\b(?:19|20)\d{2}\b", title))
    years = [y for y in re.findall(r"\b(?:19|20)\d{2}\b", release) if y not in title_years]
    if not years:
        return True
    y = int(year)
    return any(abs(int(r) - y) <= 1 for r in years)


_SE_RE = re.compile(r"\bs(\d{1,2})[ ._-]?e(\d{1,3})\b|\b(\d{1,2})x(\d{2,3})\b", re.I)
_SEASON_RANGE_RE = re.compile(r"\bs(\d{1,2})\s*-\s*s?(\d{1,2})\b", re.I)
_SEASON_RE = re.compile(r"\b(?:s|season[ ._-]?)(\d{1,2})\b(?![ ._-]?e\d)", re.I)


def _episode_ok(release: str, season: int, episode: int) -> bool:
    """For series: match the exact episode, or a pack that contains the season."""
    if not season:
        return True
    eps = [(int(m.group(1) or m.group(3)), int(m.group(2) or m.group(4))) for m in _SE_RE.finditer(release)]
    if episode:
        return (season, episode) in eps
    # Season pack wanted: no single-episode releases
    if eps:
        return False
    for m in _SEASON_RANGE_RE.finditer(release):
        if int(m.group(1)) <= season <= int(m.group(2)):
            return True
    seasons = [int(s) for s in _SEASON_RE.findall(release)]
    if seasons:
        return season in seasons
    return bool(re.search(r"\bcomplete\b", release, re.I))


# ============================================================
# Sources
# ============================================================

async def search_knaben(session, query: str) -> list[TorrentResult]:
    payload = {
        "search_type": "100%",
        "search_field": "title",
        "query": query,
        "order_by": "seeders",
        "order_direction": "desc",
        "size": 60,
        "hide_unsafe": True,
        "hide_xxx": True,
    }
    try:
        async with session.post("https://api.knaben.org/v1", json=payload, headers=HEADERS,
                                timeout=REQUEST_TIMEOUT, ssl=False) as resp:
            if resp.status != 200:
                logger.warning(f"Knaben HTTP {resp.status}")
                return []
            data = await resp.json(content_type=None)
    except Exception as e:
        logger.warning(f"Knaben error: {e}")
        return []

    out = []
    for h in data.get("hits", []):
        r = _make(h.get("title", ""), h.get("hash"), h.get("bytes"),
                  h.get("seeders"), h.get("peers"), h.get("tracker") or "Knaben")
        if r:
            out.append(r)
    return out


async def search_yts(session, imdb_id: str = "", query: str = "") -> list[TorrentResult]:
    term = imdb_id or query
    if not term:
        return []
    data = None
    for base in YTS_BASES:
        data = await _get_json(session, f"{base}/api/v2/list_movies.json",
                               {"query_term": term, "limit": 5})
        if data and data.get("status") == "ok":
            break
    movies = ((data or {}).get("data") or {}).get("movies") or []
    if imdb_id:
        movies = [m for m in movies if m.get("imdb_code") == imdb_id]

    out = []
    for m in movies[:1]:
        name = m.get("title_long") or m.get("title", "")
        for t in m.get("torrents", []):
            label = f"{name} [{t.get('quality', '')}] [{t.get('type', '')}] [{t.get('video_codec', '')}] YTS"
            r = _make(label, t.get("hash"), t.get("size_bytes"), t.get("seeds"), t.get("peers"), "YTS")
            if r:
                out.append(r)
    return out


async def search_eztv(session, imdb_id: str, season: int, episode: int) -> list[TorrentResult]:
    if not imdb_id:
        return []
    numeric = imdb_id.replace("tt", "")
    out = []
    # Ask every mirror at once and use the first that answers (blocked mirrors just time out)
    firsts = await asyncio.gather(*[
        _get_json(session, f"{b}/api/get-torrents", {"imdb_id": numeric, "limit": 100, "page": 1}, timeout=EZTV_TIMEOUT)
        for b in EZTV_BASES
    ])
    for base, first in zip(EZTV_BASES, firsts):
        if not first or "torrents" not in first:
            continue
        pages = [first]
        total = int(first.get("torrents_count") or 0)
        extra = min((total - 1) // 100, 4)  # cap at 500 torrents
        if extra > 0:
            more = await asyncio.gather(*[
                _get_json(session, f"{base}/api/get-torrents", {"imdb_id": numeric, "limit": 100, "page": p})
                for p in range(2, extra + 2)
            ])
            pages += [m for m in more if m]
        for page in pages:
            for t in page.get("torrents") or []:
                try:
                    s, e = int(t.get("season") or 0), int(t.get("episode") or 0)
                except ValueError:
                    s, e = 0, 0
                if season and s != season:
                    continue
                if episode and e != episode:
                    continue
                if season and not episode and e:
                    continue  # season pack wanted
                r = _make(t.get("title") or t.get("filename", ""), t.get("hash"), t.get("size_bytes"),
                          t.get("seeds"), t.get("peers"), "EZTV")
                if r:
                    out.append(r)
        break
    return out


async def search_torrents_csv(session, query: str) -> list[TorrentResult]:
    data = await _get_json(session, "https://torrents-csv.com/service/search", {"q": query, "size": 30})
    out = []
    for t in (data or {}).get("torrents", []):
        r = _make(t.get("name", ""), t.get("infohash"), t.get("size_bytes"),
                  t.get("seeders"), t.get("leechers"), "TorrentsCSV")
        if r:
            out.append(r)
    return out


async def search_apibay(session, query: str, media_type: str) -> list[TorrentResult]:
    cat = "201" if media_type == "movie" else "205"
    out = []
    for base in APIBAY_BASES:
        data = await _get_json(session, f"{base}/q.php", {"q": query, "cat": cat})
        if not isinstance(data, list):
            continue
        for item in data:
            if item.get("id") == "0":
                continue
            r = _make(item.get("name", ""), item.get("info_hash"), item.get("size"),
                      item.get("seeders"), item.get("leechers"), "TPB")
            if r:
                out.append(r)
        break
    return out


# ============================================================
# Main entry point
# ============================================================

async def search_torrents(
    title: str,
    media_type: str = "movie",
    year: str = "",
    imdb_id: str = "",
    season: int = 0,
    episode: int = 0,
    limit: int = 30,
    language: str = "",
) -> list[TorrentResult]:
    """
    Search all sources in parallel. `title` is the clean title (no year / SxxEyy);
    filters are applied with `year` for movies and `season`/`episode` for series.
    `language` is the title's original language (ISO 639-1, e.g. "kn"); releases in
    that language rank above dubs.
    """
    title = (title or "").strip()
    if not title:
        return []

    key = (title.lower(), media_type, year, imdb_id, season, episode, language)
    lang_name = LANGUAGE_NAMES.get(language, "") if language != "en" else ""
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1][:limit]

    if media_type == "movie":
        query = f"{title} {year}".strip()
    elif season and episode:
        query = f"{title} S{season:02d}E{episode:02d}"
    elif season:
        query = f"{title} S{season:02d}"
    else:
        query = title

    async with aiohttp.ClientSession() as session:
        tasks = [search_knaben(session, query), search_apibay(session, query, media_type)]
        if media_type == "movie":
            tasks += [search_yts(session, imdb_id=imdb_id, query="" if imdb_id else query),
                      search_torrents_csv(session, query)]
        else:
            tasks.append(search_eztv(session, imdb_id, season, episode))
            if season and not episode:
                # Packs are often named "Season 1" rather than "S01"
                tasks.append(search_knaben(session, f"{title} Season {season}"))
        if lang_name:
            # Indian-language releases are usually tagged "Kannada", "Tamil", ...
            tasks.append(search_knaben(session, f"{query} {lang_name}"))
            tasks.append(search_torrents_csv(session, f"{title} {lang_name}"))
        groups = await asyncio.gather(*tasks, return_exceptions=True)

    combined: dict[str, TorrentResult] = {}
    for group in groups:
        if isinstance(group, Exception):
            logger.error(f"Scraper error: {group}")
            continue
        for r in group:
            if r.seeders <= 0:
                continue
            # YTS results are matched by IMDb ID, so their titles are trusted
            trusted = r.source == "YTS" and imdb_id
            if not trusted:
                if not _title_matches(title, r.title):
                    continue
                if media_type == "movie" and not _year_ok(r.title, year, title):
                    continue
                if media_type != "movie" and not _episode_ok(r.title, season, episode):
                    continue
            existing = combined.get(r.info_hash)
            if existing is None or r.seeders > existing.seeders:
                combined[r.info_hash] = r

    def is_multi_season(r: TorrentResult) -> bool:
        if media_type == "movie" or not season or episode:
            return False
        return bool(_SEASON_RANGE_RE.search(r.title) or re.search(r"complete[ ._-]series", r.title, re.I))

    def is_dub(r: TorrentResult) -> bool:
        """Tagged only with other languages (e.g. a Hindi dub of a Kannada film)."""
        if not lang_name or not r.languages:
            return False
        return lang_name not in r.languages and "Multi" not in r.languages

    results = sorted(combined.values(), key=lambda r: (r.is_cam, is_dub(r), is_multi_season(r), -r.seeders))
    _cache[key] = (time.time(), results)
    if len(_cache) > 500:
        oldest = sorted(_cache.items(), key=lambda kv: kv[1][0])[:100]
        for k, _ in oldest:
            _cache.pop(k, None)
    return results[:limit]


def pick_best(results: list[TorrentResult], max_items: int = 5,
              max_bytes: int = 25 * 1024 ** 3) -> list[TorrentResult]:
    """Pick a short, varied list: the best-seeded release for each quality, non-CAM first.
    Releases bigger than `max_bytes` (e.g. 90 GB remuxes) are only used if nothing else exists."""
    reasonable = [r for r in results if not r.size_bytes or r.size_bytes <= max_bytes]
    if reasonable:
        results = reasonable
    order = ["1080p", "720p", "4K", "480p", "Unknown"]
    # `results` is already ranked, so the first hit per quality is the best one
    best: dict[str, TorrentResult] = {}
    for r in results:
        if not r.is_cam and r.quality not in best:
            best[r.quality] = r
    picked = [best[q] for q in order if q in best]
    # Fill remaining slots with the next best-seeded non-duplicates
    for r in results:
        if len(picked) >= max_items:
            break
        if r not in picked and not r.is_cam:
            picked.append(r)
    if not picked:  # only CAM copies exist (fresh theatrical release)
        picked = results[:max_items]
    return picked[:max_items]


# ============================================================
# .torrent files (from public caches; magnets work for everything)
# ============================================================

TORRENT_CACHES = [
    "https://itorrents.org/torrent/{HASH}.torrent",
    "https://yts.gg/torrent/download/{HASH}",
]
_torrent_files: dict[str, tuple[float, bytes | None]] = {}


def _looks_like_torrent(data: bytes) -> bool:
    # A .torrent is a bencoded dict containing an "info" dictionary
    return data[:1] == b"d" and b"4:info" in data[:200_000]


async def fetch_torrent_file(info_hash: str) -> bytes | None:
    """Download the .torrent for an info hash from a public cache, or None if none has it."""
    info_hash = info_hash.lower()
    if not re.fullmatch(r"[0-9a-f]{40}", info_hash):
        return None
    hit = _torrent_files.get(info_hash)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    data = None
    async with aiohttp.ClientSession(headers=HEADERS) as session:
        for template in TORRENT_CACHES:
            url = template.replace("{HASH}", info_hash.upper())
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=15), ssl=False) as resp:
                    if resp.status == 200:
                        body = await resp.read()
                        if len(body) < 10_000_000 and _looks_like_torrent(body):
                            data = body
                            break
            except Exception as e:
                logger.warning(f"Torrent cache {url}: {e}")
    _torrent_files[info_hash] = (time.time(), data)
    if len(_torrent_files) > 300:
        _torrent_files.pop(next(iter(_torrent_files)))
    return data


def torrent_filename(name: str) -> str:
    clean = re.sub(r'[\\/:*?"<>|]+', " ", name).strip()[:120] or "download"
    return f"{clean}.torrent"
