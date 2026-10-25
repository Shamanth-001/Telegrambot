"""
request_processor.py — Local download worker for StreamBreaker (runs on the PC with Radarr/Sonarr).

    Telegram bot / website (hub on Render)
        │  user taps "Send me the file here"  → request stored on the hub
        ▼
    REQUEST LOOP (every 60 s)  GET  {HUB_URL}/api/sync/requests
        │  movie  → Radarr: add / search
        │  series → Sonarr: add unmonitored, then monitor + search just the episode/season asked for
        │  progress → POST {HUB_URL}/api/sync/requests/{id}
        ▼
    Radarr/Sonarr → Prowlarr → qBittorrent → import into MOVIE_ROOT / SERIES_ROOT
        │  "On Import" webhook → POST http://localhost:8585/webhook
        ▼
    UPLOAD  file → private channel (Telethon), unmonitor in Radarr/Sonarr, delete local copy
        │  POST {HUB_URL}/api/sync/media  → hub adds it to the library and sends it to requesters
        ▼
    Folder scan (every 5 min) catches imports whose webhook was missed.
    Library re-sync (every 30 min) rebuilds the hub's library after a redeploy.

Setup in Radarr and Sonarr:  Settings → Connect → + Webhook
    URL http://localhost:8585/webhook   Triggers: On Import, On Upgrade
"""
import asyncio
import os
import re
import sys
import time

import aiohttp
from aiohttp import web
from dotenv import load_dotenv
from telethon import TelegramClient

from bot_utils import format_caption, format_size
from db_manager import DBManager
from radarr_client import RadarrClient
from sonarr_client import SonarrClient

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────
BOT2_TOKEN    = os.getenv("BOT2_TOKEN")
SERIES_TOKEN  = os.getenv("SERIES_BOT_TOKEN")
CHANNEL_ID    = int(os.getenv("CHANNEL_ID", "0"))
API_ID        = int(os.getenv("API_ID", "0"))
API_HASH      = os.getenv("API_HASH", "")
# The hub is the API the bot and website use (Render). AWS_SYNC_URL is the old name.
HUB_URL       = (os.getenv("HUB_URL") or os.getenv("AWS_SYNC_URL") or "https://telegrambot-p8yg.onrender.com").rstrip("/")
SYNC_SECRET   = os.getenv("SYNC_SECRET", "")
WEBHOOK_PORT  = int(os.getenv("WEBHOOK_PORT", "8585"))
MAX_FILE_SIZE = 2_000 * 1024 * 1024          # Telegram bot upload limit (2 GB)
MOVIE_DIR     = os.getenv("MOVIE_ROOT", r"C:\telegrambot\completed\movies")
SERIES_DIR    = os.getenv("SERIES_ROOT", r"C:\telegrambot\completed\series")
RADARR_PROFILE = os.getenv("RADARR_PROFILE", "HD - 720p/1080p")
SONARR_PROFILE = os.getenv("SONARR_PROFILE", "HD - 720p/1080p")
DELETE_AFTER_UPLOAD = os.getenv("DELETE_AFTER_UPLOAD", "1") != "0"
VIDEO_EXTS    = {".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv"}
SKIP_DIRS     = {"failed_uploads", "sample", "samples", "extras", "featurettes"}

db     = DBManager()
radarr = RadarrClient()
sonarr = SonarrClient()

movie_client = None
series_client = None
_upload_lock = asyncio.Lock()   # one upload at a time keeps Telegram happy

# Upload tracking state for dashboard
active_uploads = {}


def to_local(path: str) -> str:
    """Radarr/Sonarr report Windows paths; translate them when running inside Docker (/app)."""
    path = os.path.normpath(path or "")
    if sys.platform != "win32":
        for prefix in ("C:\\telegrambot", "C:\\telegram bot"):
            if path.lower().startswith(prefix.lower()):
                path = "/app" + path[len(prefix):]
        path = path.replace("\\", "/")
    return path


# =====================================================================
#  HUB API
# =====================================================================

async def hub(method: str, path: str, payload: dict | None = None, retries: int = 3):
    url = f"{HUB_URL}{path}"
    params = {"secret": SYNC_SECRET}
    for attempt in range(retries):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(method, url, json=payload, params=params,
                                           timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status == 200:
                        return await resp.json(content_type=None)
                    if resp.status in (401, 403):
                        print(f"[HUB] {path}: unauthorized — check SYNC_SECRET matches the hub")
                        return None
                    print(f"[HUB] {method} {path} → {resp.status}")
        except Exception as e:
            # Render's free tier sleeps; the first call can take ~50 s to wake it
            print(f"[HUB] {method} {path} attempt {attempt + 1}/{retries}: {e}")
        await asyncio.sleep(3 * (attempt + 1))
    return None


async def hub_title(media_type: str, tmdb_id: int) -> dict:
    """Title details via the hub (TMDB itself is blocked on some Indian ISPs)."""
    if not tmdb_id:
        return {}
    data = await hub("GET", f"/api/movies/{tmdb_id}?type={'tv' if media_type != 'movie' else 'movie'}", retries=2)
    return data if isinstance(data, dict) and "error" not in data else {}


# =====================================================================
#  REQUEST LOOP — hub requests → Radarr / Sonarr
# =====================================================================

async def request_sync_loop():
    print(f"[SYNC] Checking {HUB_URL} for requests every 60 s")
    while True:
        try:
            data = await hub("GET", "/api/sync/requests")
            for req in (data or {}).get("requests", []):
                rid = req.get("id")
                if not rid or db.hub_request_seen(rid) or req.get("status") != "pending":
                    continue
                await handle_hub_request(req)
        except Exception as e:
            print(f"[SYNC] Error: {e}")
        await asyncio.sleep(60)


async def handle_hub_request(req: dict):
    rid, tmdb_id = req["id"], req.get("tmdb_id")
    season, episode = int(req.get("season") or 0), int(req.get("episode") or 0)
    is_movie = req.get("media_type") == "movie"
    label = (req.get("title") or "?") + (f" S{season:02d}" + (f"E{episode:02d}" if episode else "") if season else "")
    print(f"\n[REQUEST] #{rid} {label} (tmdb={tmdb_id})")

    if not tmdb_id:
        status, note = "failed", "missing TMDB id"
    else:
        # Already uploaded earlier? Re-send it through the hub instead of downloading again.
        kind = "movie" if is_movie else "episode"
        rows = db.find_uploaded(tmdb_id, kind, season, episode)
        if rows and (is_movie or episode):
            for title, message_id, link, quality, size, year, s, e in rows:
                await hub("POST", "/api/sync/media", {
                    "title": title, "year": year, "media_type": kind, "tmdb_id": tmdb_id, "season": s,
                    "episode": e, "message_id": message_id, "message_link": link, "quality": quality,
                    "size_bytes": size, "notify": True})
            status, note = "downloading", "already in library"
        elif is_movie:
            status, note = await request_movie(tmdb_id)
        else:
            status, note = await request_series(tmdb_id, season, episode)

    print(f"[REQUEST] #{rid} → {status}" + (f" ({note})" if note else ""))
    db.save_hub_request(rid, tmdb_id, req.get("media_type"), season, episode, status, note)
    await hub("POST", f"/api/sync/requests/{rid}", {"status": status, "note": note})


async def request_movie(tmdb_id: int) -> tuple[str, str]:
    existing = await radarr.get_movie_by_tmdb(tmdb_id)
    if existing:
        await radarr.set_monitored([existing["id"]], True)
        await radarr.trigger_search(existing["id"])
        return "downloading", "searching again"
    movie = await radarr.lookup_by_tmdb(tmdb_id)
    if not movie:
        return "failed", "not found in Radarr"
    ok, result = await radarr.add_movie(movie, quality_profile_id=await radarr.quality_profile_id(RADARR_PROFILE))
    if ok or "already" in str(result).lower():
        return "downloading", ""
    return "failed", f"Radarr refused it: {str(result)[:120]}"


async def request_series(tmdb_id: int, season: int, episode: int) -> tuple[str, str]:
    series = await sonarr.get_series_by_tmdb(tmdb_id)
    if not series:
        found = await sonarr.lookup_by_tmdb(tmdb_id)
        if not found:
            return "failed", "not found in Sonarr"
        # Add unmonitored, then monitor only what was asked for
        ok, result = await sonarr.add_series(found, await sonarr.quality_profile_id(SONARR_PROFILE),
                                             monitor_all=not season)
        if not ok and "already" not in str(result).lower():
            return "failed", f"Sonarr refused it: {str(result)[:120]}"
        if not season:
            return "downloading", "whole series"
        for _ in range(20):  # wait for Sonarr to load the episode list
            await asyncio.sleep(3)
            series = await sonarr.get_series_by_tmdb(tmdb_id)
            if series and await sonarr.get_episodes(series["id"]):
                break
    if not series:
        return "failed", "Sonarr didn't finish adding the series"

    episodes = await sonarr.get_episodes(series["id"])
    wanted = [e for e in episodes if (not season or e["seasonNumber"] == season)
              and (not episode or e["episodeNumber"] == episode) and e["seasonNumber"] > 0]
    if not wanted:
        return "failed", "that season/episode doesn't exist"
    await sonarr.set_episodes_monitored([e["id"] for e in wanted], True)
    if episode:
        await sonarr.command("EpisodeSearch", episodeIds=[e["id"] for e in wanted])
    elif season:
        await sonarr.command("SeasonSearch", seriesId=series["id"], seasonNumber=season)
    else:
        await sonarr.command("SeriesSearch", seriesId=series["id"])
    return "downloading", f"{len(wanted)} episode(s)"


# =====================================================================
#  WEBHOOKS — Radarr/Sonarr "On Import"
# =====================================================================

async def handle_webhook(request):
    try:
        data = await request.json()
    except Exception:
        return web.Response(text="OK")

    event = data.get("eventType", "")
    if event == "Test":
        print("[WEBHOOK] Test event received - OK!")
    elif "movie" in data and event in ("Download", "Upgrade"):
        asyncio.create_task(_radarr_import(data))
    elif "series" in data and event in ("Download", "Upgrade"):
        asyncio.create_task(_sonarr_import(data))
    else:
        print(f"[WEBHOOK] Ignored event: {event}")
    return web.Response(text="OK")


async def _radarr_import(data):
    movie, movie_file = data.get("movie", {}), data.get("movieFile", {})
    path = movie_file.get("path") or os.path.join(movie.get("folderPath", ""), movie_file.get("relativePath", ""))
    print(f"\n[WEBHOOK] RADARR: {movie.get('title')} ({movie.get('year')}) → {path}")
    await upload(to_local(path), media_type="movie", tmdb_id=movie.get("tmdbId"),
                 title=movie.get("title", "Unknown"), year=movie.get("year", ""),
                 quality=(movie_file.get("quality") or "Unknown"), radarr_id=movie.get("id"))


async def _sonarr_import(data):
    series, ep_file = data.get("series", {}), data.get("episodeFile", {})
    episodes = data.get("episodes", [])
    path = ep_file.get("path") or os.path.join(series.get("path", ""), ep_file.get("relativePath", ""))
    if not episodes:
        return
    first = episodes[0]
    print(f"\n[WEBHOOK] SONARR: {series.get('title')} S{first.get('seasonNumber', 0):02d}E{first.get('episodeNumber', 0):02d} → {path}")
    await upload(to_local(path), media_type="episode", tmdb_id=series.get("tmdbId"),
                 title=series.get("title", "Unknown"), year=(first.get("airDate") or "")[:4],
                 quality=(ep_file.get("quality") or "Unknown"),
                 episodes=[(e.get("seasonNumber", 0), e.get("episodeNumber", 0), e.get("id")) for e in episodes])


# =====================================================================
#  UPLOAD → HUB → CLEAN UP
# =====================================================================

async def upload(file_path, media_type, tmdb_id, title, year, quality,
                 radarr_id=None, episodes=None):
    """Upload one imported file to the channel and register it with the hub."""
    episodes = episodes or [(0, 0, None)]
    season, episode = episodes[0][0], episodes[0][1]
    full_title = title + (f" - S{season:02d}E{episode:02d}" if media_type == "episode" else "")

    if not file_path or not os.path.isfile(file_path):
        print(f"[UPLOAD] File not found: {file_path}")
        return
    if db.is_file_processed(file_path):
        print(f"[UPLOAD] Already processed: {full_title}")
        return
    if media_type == "movie" and db.find_uploaded(tmdb_id, "movie"):
        print(f"[UPLOAD] Already in library: {full_title}")
        db.mark_file_processed(file_path, full_title)
        return

    file_size = os.path.getsize(file_path)
    if file_size > MAX_FILE_SIZE:
        print(f"[UPLOAD] {full_title} is {format_size(file_size)} — over Telegram's 2 GB limit")
        db.mark_file_processed(file_path, full_title)
        await hub("POST", "/api/sync/oversize", {"tmdb_id": tmdb_id, "media_type": media_type,
                                                  "season": season, "episode": episode, "title": title})
        return

    async with _upload_lock:
        meta = await hub_title(media_type, tmdb_id)
        rating, genres = meta.get("rating"), meta.get("genres") or []
        if media_type == "movie":
            title = meta.get("title") or title
            year = meta.get("year") or year
            full_title = title
        poster_path = await _download_poster(meta.get("poster_url"))

        caption = format_caption(full_title, year or "—", quality, file_size, rating=rating, genres=genres)
        client = movie_client if media_type == "movie" else (series_client or movie_client)
        print(f"[UPLOAD] Uploading: {full_title} ({format_size(file_size)})")
        active_uploads[file_path] = {"title": full_title, "current": 0, "total": file_size, "speed": 0,
                                     "start_time": time.time(), "last_update": time.time()}
        try:
            msg = await client.send_file(
                CHANNEL_ID, file_path, caption=caption, parse_mode="md",
                thumb=poster_path, supports_streaming=file_path.lower().endswith(".mp4"),
                force_document=not file_path.lower().endswith(".mp4"),
                progress_callback=lambda cur, tot: _progress(cur, tot, file_path),
            )
        except Exception as e:
            print(f"[UPLOAD] FAILED: {e}")
            return
        finally:
            active_uploads.pop(file_path, None)
            if poster_path and os.path.isfile(poster_path):
                os.remove(poster_path)

    link = f"https://t.me/c/{str(CHANNEL_ID).replace('-100', '')}/{msg.id}"
    file_id = str(msg.document.id) if msg.document else ""
    db.mark_file_processed(file_path, full_title)

    for s, e, _ in episodes:
        ep_title = title + (f" - S{s:02d}E{e:02d}" if media_type == "episode" else "")
        db.add_media(title=ep_title, year=year, media_type=media_type, file_id=file_id, message_link=link,
                     quality=quality, size_bytes=file_size, tmdb_id=tmdb_id, message_id=msg.id,
                     season=s, episode=e)
        res = await hub("POST", "/api/sync/media", {
            "title": ep_title, "year": year, "media_type": media_type, "tmdb_id": tmdb_id,
            "season": s, "episode": e, "quality": quality, "size_bytes": file_size,
            "message_link": link, "message_id": msg.id, "file_id": file_id, "notify": True})
        print(f"[HUB] Synced {ep_title}" + (f" — delivered to {res.get('delivered', 0)} user(s)" if res else " — hub unreachable (will retry in re-sync)"))

    # Stop Radarr/Sonarr from re-downloading once the local copy is gone
    if media_type == "movie" and radarr_id:
        await radarr.set_monitored([radarr_id], False)
    ep_ids = [eid for _, _, eid in episodes if eid]
    if ep_ids:
        await sonarr.set_episodes_monitored(ep_ids, False)

    if DELETE_AFTER_UPLOAD:
        try:
            os.remove(file_path)
            base = os.path.splitext(file_path)[0]
            folder = os.path.dirname(file_path)
            for f in os.listdir(folder):
                if f.startswith(os.path.basename(base)) and f.lower().endswith((".srt", ".sub", ".nfo")):
                    os.remove(os.path.join(folder, f))
            print(f"[DELETE] Removed local copy of {full_title}")
        except OSError as e:
            print(f"[DELETE] Could not delete: {e}")


async def _download_poster(url: str | None) -> str | None:
    if not url:
        return None
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"poster_{int(time.time() * 1000)}.jpg")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    with open(path, "wb") as f:
                        f.write(await resp.read())
                    return path
    except Exception as e:
        print(f"[POSTER] {e}")
    return None


_last_pct = {}


def _progress(current, total, file_path):
    now = time.time()
    info = active_uploads.get(file_path)
    if info and now - info["last_update"] > 1.0:
        info["speed"] = (current - info["current"]) / (now - info["last_update"])
        info["current"], info["last_update"] = current, now
    pct = int(current * 100 / total) if total else 0
    if pct >= _last_pct.get(file_path, -25) + 25:
        _last_pct[file_path] = pct
        print(f"[UPLOAD] {pct}% - {info['title'] if info else ''}")


# =====================================================================
#  FOLDER SCAN — imports whose webhook was missed (worker was offline)
# =====================================================================

_EP_RE = re.compile(r"[Ss](\d{1,2})[Ee](\d{1,3})")


async def folder_scan_loop():
    while True:
        try:
            await scan_once()
        except Exception as e:
            print(f"[SCAN] Error: {e}")
        await asyncio.sleep(300)


async def scan_once():
    movies = await radarr.get_all_movies()
    all_series = await sonarr.get_all_series()
    for scan_dir, kind in ((MOVIE_DIR, "movie"), (SERIES_DIR, "episode")):
        scan_dir = to_local(scan_dir)
        if not os.path.isdir(scan_dir):
            continue
        for root, dirs, files in os.walk(scan_dir):
            dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS]
            for name in files:
                if os.path.splitext(name)[1].lower() not in VIDEO_EXTS:
                    continue
                path = os.path.normpath(os.path.join(root, name))
                if db.is_file_processed(path):
                    continue
                size = os.path.getsize(path)
                if size < 50_000_000:
                    continue  # sample
                await asyncio.sleep(3)
                if os.path.getsize(path) != size:
                    continue  # still being written

                if kind == "movie":
                    owner = next((m for m in movies if m.get("path") and path.lower().startswith(to_local(m["path"]).lower())), None)
                    if not owner:
                        print(f"[SCAN] Not a Radarr movie, skipping: {name}")
                        db.mark_file_processed(path, name)
                        continue
                    print(f"[SCAN] Found {owner['title']} ({format_size(size)})")
                    await upload(path, "movie", owner.get("tmdbId"), owner["title"], owner.get("year", ""),
                                 _quality_from_name(name), radarr_id=owner["id"])
                else:
                    owner = next((s for s in all_series if s.get("path") and path.lower().startswith(to_local(s["path"]).lower())), None)
                    m = _EP_RE.search(name)
                    if not owner or not m:
                        print(f"[SCAN] Can't match episode, skipping: {name}")
                        db.mark_file_processed(path, name)
                        continue
                    s, e = int(m.group(1)), int(m.group(2))
                    ep = next((x for x in await sonarr.get_episodes(owner["id"])
                               if x["seasonNumber"] == s and x["episodeNumber"] == e), None)
                    print(f"[SCAN] Found {owner['title']} S{s:02d}E{e:02d}")
                    await upload(path, "episode", owner.get("tmdbId"), owner["title"], "",
                                 _quality_from_name(name), episodes=[(s, e, ep["id"] if ep else None)])


def _quality_from_name(name: str) -> str:
    m = re.search(r"\b(2160p|1080p|720p|480p)\b", name, re.I)
    return m.group(1) if m else "Unknown"


# =====================================================================
#  LIBRARY RE-SYNC — the hub's disk is wiped on every Render redeploy
# =====================================================================

async def library_resync_loop():
    await asyncio.sleep(30)
    while True:
        rows = db.all_media()
        synced = 0
        for row in rows:
            if row["tmdb_id"] and row["message_id"]:
                if await hub("POST", "/api/sync/media", {**row, "notify": False}, retries=1):
                    synced += 1
        if rows:
            print(f"[RESYNC] Library pushed to hub: {synced}/{len(rows)}")
        await asyncio.sleep(1800)


# =====================================================================
#  DASHBOARD
# =====================================================================

async def handle_status(request):
    """Return active uploads JSON"""
    return web.json_response({
        "uploads": [
            {
                "title": v["title"],
                "current": v["current"],
                "total": v["total"],
                "speed": v.get("speed", 0),
                "started_at": v["start_time"]
            }
            for v in active_uploads.values()
        ]
    })

async def handle_dashboard(request):
    """Serve a beautiful HTML dashboard dynamically"""
    html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StreamBreaker Uploads</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f8fafc; }
        .glass-panel { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; }
        .progress-bar { transition: width 0.3s ease; }
    </style>
</head>
<body class="min-h-screen p-8">
    <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-8">
            <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                StreamBreaker Live Uploads
            </h1>
            <div class="text-sm px-4 py-2 glass-panel flex items-center gap-2">
                <div id="status-dot" class="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                Live Status
            </div>
        </div>

        <div id="uploads-container" class="space-y-4">
            <!-- Dynamic content injected here -->
        </div>
        
        <div id="empty-state" class="glass-panel p-12 text-center text-gray-400 hidden">
            <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
            <p class="text-xl">No active uploads</p>
            <p class="text-sm mt-2">Waiting for new movies or series to finish downloading...</p>
        </div>
    </div>

    <script>
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        async function fetchUploads() {
            try {
                const res = await fetch('/api/uploads');
                const data = await res.json();
                
                const container = document.getElementById('uploads-container');
                const emptyState = document.getElementById('empty-state');
                
                if (data.uploads.length === 0) {
                    container.innerHTML = '';
                    emptyState.classList.remove('hidden');
                    return;
                }
                
                emptyState.classList.add('hidden');
                
                let html = '';
                data.uploads.forEach(u => {
                    const pct = (u.current / u.total) * 100 || 0;
                    const speed = formatBytes(u.speed) + '/s';
                    const current = formatBytes(u.current);
                    const total = formatBytes(u.total);
                    const etaSeconds = u.speed > 0 ? (u.total - u.current) / u.speed : 0;
                    
                    let etaStr = "Calculating...";
                    if (etaSeconds > 0 && etaSeconds < 86400) {
                        const m = Math.floor(etaSeconds / 60);
                        const s = Math.floor(etaSeconds % 60);
                        etaStr = m > 0 ? `${m}m ${s}s left` : `${s}s left`;
                    }

                    html += `
                        <div class="glass-panel p-6 shadow-xl relative overflow-hidden">
                            <!-- Background pulse based on progress -->
                            <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent" style="width: ${pct}%"></div>
                            
                            <div class="relative z-10">
                                <div class="flex justify-between items-start mb-2">
                                    <h3 class="text-lg font-bold truncate pr-4">${u.title}</h3>
                                    <span class="text-xs font-mono bg-blue-500/20 text-blue-300 px-2 py-1 rounded border border-blue-500/30 whitespace-nowrap">
                                        ${speed}
                                    </span>
                                </div>
                                
                                <div class="w-full bg-gray-800 rounded-full h-3 mb-2 border border-gray-700">
                                    <div class="bg-gradient-to-r from-blue-500 to-indigo-400 h-3 rounded-full progress-bar shadow-[0_0_10px_rgba(59,130,246,0.5)]" style="width: ${pct}%"></div>
                                </div>
                                
                                <div class="flex justify-between text-xs text-gray-400 font-mono">
                                    <span>${current} / ${total} (${pct.toFixed(1)}%)</span>
                                    <span>${etaStr}</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                container.innerHTML = html;
            } catch (err) {
                console.error("Failed to fetch uploads", err);
            }
        }

        setInterval(fetchUploads, 1000);
        fetchUploads();
    </script>
</body>
</html>'''
    return web.Response(text=html, content_type="text/html")


# =====================================================================
#  MAIN
# =====================================================================

async def main():
    global movie_client, series_client

    print("=" * 60)
    print("  StreamBreaker Local Worker")
    print("=" * 60)

    missing = [k for k, v in (("BOT2_TOKEN", BOT2_TOKEN), ("CHANNEL_ID", CHANNEL_ID), ("API_ID", API_ID),
                              ("API_HASH", API_HASH), ("SYNC_SECRET", SYNC_SECRET)) if not v]
    if missing:
        print(f"Missing env vars: {', '.join(missing)} — check your .env file")
        sys.exit(1)

    print("[BOT] Connecting Telethon clients...")
    movie_client = TelegramClient("bot2_session", API_ID, API_HASH)
    await movie_client.start(bot_token=BOT2_TOKEN)
    try:
        await movie_client.get_entity(CHANNEL_ID)
        print("[BOT] Upload bot connected + channel resolved")
    except Exception as e:
        print(f"[BOT] Channel resolve failed ({e}) — make sure the upload bot is an admin of the channel")
    if SERIES_TOKEN:
        series_client = TelegramClient("bot3_session", API_ID, API_HASH)
        await series_client.start(bot_token=SERIES_TOKEN)
    else:
        series_client = movie_client

    app = web.Application()
    app.router.add_post("/webhook", handle_webhook)
    app.router.add_get("/api/uploads", handle_status)
    app.router.add_get("/dashboard", handle_dashboard)
    app.router.add_get("/", lambda r: web.Response(text="StreamBreaker worker OK"))
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", WEBHOOK_PORT).start()
    print(f"[WEBHOOK] http://localhost:{WEBHOOK_PORT}/webhook   dashboard: http://localhost:{WEBHOOK_PORT}/dashboard")
    print(f"[HUB] {HUB_URL}")
    print("=" * 60)

    try:
        await asyncio.gather(request_sync_loop(), folder_scan_loop(), library_resync_loop())
    finally:
        await movie_client.disconnect()
        if series_client is not movie_client:
            await series_client.disconnect()
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
