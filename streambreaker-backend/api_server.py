"""
api_server.py — StreamBreaker API (FastAPI).

Serves the React frontend (proxied from Netlify under /api/*):
  - TMDB-backed catalogue: lists, search, details, genres, reviews
  - Torrent search (magnet links) via torrent_scraper
  - /api/magnet/{hash}: a small page that opens a magnet link (used by Telegram buttons,
    which can't link to magnet: URLs directly)
Plus the AI recommender and the sync endpoints used by the local worker.
"""
import asyncio
import html
import json as _json
import logging
import os
import re
import time
from datetime import date

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from torrent_scraper import search_torrents

load_dotenv()

app = FastAPI(title="StreamBreaker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TMDB_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p"
BOT_USERNAME = os.getenv("BOT_USERNAME", "StreamBreakerBot")
WATCH_REGION = os.getenv("WATCH_REGION", "IN")

# ============================================================
# TMDB helpers
# ============================================================

# One session per event loop: the Telegram bot runs on its own loop in another thread
_sessions: dict[int, aiohttp.ClientSession] = {}
_tmdb_cache: dict[str, tuple[float, dict]] = {}
TMDB_CACHE_TTL = 30 * 60


async def http() -> aiohttp.ClientSession:
    loop_id = id(asyncio.get_running_loop())
    session = _sessions.get(loop_id)
    if session is None or session.closed:
        connector = None
        # Optional custom DNS (e.g. DNS_SERVERS=1.1.1.1,8.8.8.8) for ISPs that block TMDB by DNS
        if os.getenv("DNS_SERVERS"):
            resolver = aiohttp.AsyncResolver(nameservers=[d.strip() for d in os.getenv("DNS_SERVERS").split(",")])
            connector = aiohttp.TCPConnector(resolver=resolver)
        session = _sessions[loop_id] = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=15), connector=connector)
    return session


@app.on_event("shutdown")
async def _close_session():
    session = _sessions.pop(id(asyncio.get_running_loop()), None)
    if session and not session.closed:
        await session.close()


async def tmdb(path: str, **params) -> dict | None:
    """GET a TMDB endpoint with a small in-memory cache. Returns None on error."""
    params = {k: v for k, v in params.items() if v not in (None, "")}
    key = path + "?" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    hit = _tmdb_cache.get(key)
    if hit and time.time() - hit[0] < TMDB_CACHE_TTL:
        return hit[1]
    session = await http()
    try:
        async with session.get(f"{TMDB_BASE}{path}", params={"api_key": TMDB_KEY, **params}) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
    except Exception as e:
        logging.warning(f"TMDB {path} failed: {e}")
        return None
    _tmdb_cache[key] = (time.time(), data)
    if len(_tmdb_cache) > 2000:
        _tmdb_cache.clear()
    return data


def img(path: str | None, size: str = "w500") -> str:
    return f"{IMG}/{size}{path}" if path else ""


def year_of(item: dict) -> int | None:
    d = item.get("release_date") or item.get("first_air_date") or ""
    return int(d[:4]) if d[:4].isdigit() else None


def telegram_link(media_type: str, tmdb_id: int) -> str:
    return f"https://t.me/{BOT_USERNAME}?start={media_type}_{tmdb_id}"


def card(item: dict, media_type: str | None = None) -> dict:
    """Compact shape used by lists and carousels."""
    mt = media_type or item.get("media_type") or "movie"
    return {
        "id": item.get("id"),
        "media_type": mt,
        "title": item.get("title") or item.get("name") or "Untitled",
        "overview": item.get("overview") or "",
        "poster_url": img(item.get("poster_path"), "w342"),
        "backdrop_url": img(item.get("backdrop_path"), "w1280"),
        "rating": round(item.get("vote_average") or 0, 1),
        "year": year_of(item),
        "genre_ids": item.get("genre_ids") or [],
        "original_language": item.get("original_language") or "",
    }


# ============================================================
# Catalogue
# ============================================================

@app.get("/api/health")
async def health():
    # Touch the database so a free Supabase project counts as active (cron pings hit this)
    import db_manager
    try:
        db_ok = await asyncio.to_thread(db_manager.DBManager().ping)
    except Exception as e:
        logging.warning(f"DB ping failed: {e}")
        db_ok = False
    return {"status": "ok", "service": "StreamBreaker API",
            "db": "ok" if db_ok else "error",
            "db_kind": "postgres" if db_manager.DATABASE_URL else "sqlite",
            **({} if db_ok else {"db_error": db_manager.last_error[:300]})}


@app.get("/api/movies")
async def list_titles(
    type: str = "all",          # all | movie | tv
    sort: str = "trending",     # trending | popular | rating | newest
    genre: str = "",            # TMDB genre id
    lang: str = "",             # original language, ISO 639-1 (e.g. "kn" for Kannada)
    search: str = "",
    page: int = 1,
    limit: int = 20,
):
    page = max(1, min(page, 500))
    types = ["movie", "tv"] if type == "all" else [type if type in ("movie", "tv") else "movie"]
    results: list[dict] = []
    total_pages = 1

    if search.strip():
        if len(types) == 2:
            data = await tmdb("/search/multi", query=search, page=page, include_adult="false") or {}
            results = [card(i) for i in data.get("results", []) if i.get("media_type") in ("movie", "tv")]
        else:
            data = await tmdb(f"/search/{types[0]}", query=search, page=page, include_adult="false") or {}
            results = [card(i, types[0]) for i in data.get("results", [])]
        total_pages = data.get("total_pages", 1)

    elif sort == "trending" and not genre and not lang:
        path = "/trending/all/week" if len(types) == 2 else f"/trending/{types[0]}/week"
        data = await tmdb(path, page=page) or {}
        results = [card(i, None if len(types) == 2 else types[0]) for i in data.get("results", [])
                   if len(types) == 1 or i.get("media_type") in ("movie", "tv")]
        total_pages = data.get("total_pages", 1)

    else:
        today = date.today().isoformat()
        for mt in types:
            date_field = "primary_release_date" if mt == "movie" else "first_air_date"
            params: dict = {"page": page, "include_adult": "false", "with_genres": genre or None,
                            "with_original_language": lang or None}
            # Regional catalogues are much smaller, so relax the vote thresholds
            min_votes = 50 if lang and lang != "en" else 800
            if sort == "rating":
                params.update(sort_by="vote_average.desc", **{"vote_count.gte": min_votes})
            elif sort == "newest":
                params.update(sort_by=f"{date_field}.desc",
                              **{f"{date_field}.lte": today, "vote_count.gte": 3 if lang else 30})
            else:  # popular / trending-with-genre
                params.update(sort_by="popularity.desc")
            data = await tmdb(f"/discover/{mt}", **params) or {}
            results += [card(i, mt) for i in data.get("results", [])]
            total_pages = max(total_pages, data.get("total_pages", 1))
        if len(types) == 2:
            key = {"rating": lambda c: c["rating"], "newest": lambda c: c["year"] or 0}.get(sort)
            if key:
                results.sort(key=key, reverse=True)

    if search.strip() and lang:
        results = [r for r in results if r["original_language"] == lang]
    results = [r for r in results if r["poster_url"]]
    return {"data": results[:max(1, min(limit, 40))], "page": page, "total_pages": min(total_pages, 500)}


@app.get("/api/genres")
async def get_genres(type: str = "movie"):
    mt = "tv" if type == "tv" else "movie"
    data = await tmdb(f"/genre/{mt}/list") or {}
    return {"genres": data.get("genres", [])}


def _pick_trailer(videos: list[dict]) -> str | None:
    yt = [v for v in videos if v.get("site") == "YouTube"]
    for vtype in ("Trailer", "Teaser"):
        for official in (True, False):
            for v in yt:
                if v.get("type") == vtype and bool(v.get("official")) == official:
                    return v["key"]
    return yt[0]["key"] if yt else None


def _providers(data: dict) -> dict:
    region = (data.get("watch/providers") or {}).get("results", {}).get(WATCH_REGION) or {}

    def names(kind):
        return [{"name": p["provider_name"], "logo": img(p.get("logo_path"), "w92")}
                for p in region.get(kind, [])[:6]]

    return {"region": WATCH_REGION, "link": region.get("link", ""),
            "stream": names("flatrate"), "rent": names("rent"), "buy": names("buy")}


def _in_library(tmdb_id: int) -> bool:
    """True when the file is already in the Telegram channel (instant via the bot)."""
    try:
        from db_manager import DBManager
        return tmdb_id in DBManager().library_ids([tmdb_id])
    except Exception:
        return False


EINTHUSAN_LANGS = {"kn": "kannada", "ta": "tamil", "te": "telugu", "ml": "malayalam", "hi": "hindi",
                   "bn": "bengali", "mr": "marathi", "pa": "punjabi"}


def einthusan_url(media_type: str, data: dict) -> str:
    """Search link on Einthusan (licensed South Asian streaming) for Indian-language films."""
    lang = EINTHUSAN_LANGS.get(data.get("original_language", ""))
    title = data.get("title") or data.get("original_title") or ""
    if media_type != "movie" or not lang or not title:
        return ""
    from urllib.parse import quote_plus
    return f"https://einthusan.tv/movie/results/?lang={lang}&query={quote_plus(title)}"


@app.get("/api/movies/{tmdb_id}")
async def get_title(tmdb_id: int, type: str = ""):
    order = ["tv", "movie"] if type == "tv" else ["movie", "tv"]
    data, media_type = None, "movie"
    for mt in order:
        data = await tmdb(f"/{mt}/{tmdb_id}",
                          append_to_response="credits,videos,external_ids,recommendations,watch/providers")
        if data:
            media_type = mt
            break
    if not data:
        return JSONResponse({"error": "Not found"}, status_code=404)

    credits = data.get("credits") or {}
    if media_type == "movie":
        people = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
        runtime = data.get("runtime")
    else:
        people = [c["name"] for c in data.get("created_by", [])]
        runtime = (data.get("episode_run_time") or [None])[0]

    detail = card(data, media_type)
    detail.update({
        "poster_url": img(data.get("poster_path"), "w500"),
        "backdrop_url": img(data.get("backdrop_path"), "original"),
        "tagline": data.get("tagline") or "",
        "vote_count": data.get("vote_count", 0),
        "release_date": data.get("release_date") or data.get("first_air_date") or "",
        "runtime": runtime,
        "genres": [g["name"] for g in data.get("genres", [])],
        "language": (data.get("spoken_languages") or [{}])[0].get("english_name", "")
                    or data.get("original_language", "").upper(),
        "directors": people[:3],
        "cast": [{"name": c["name"], "character": c.get("character", ""),
                  "profile_url": img(c.get("profile_path"), "w185")}
                 for c in credits.get("cast", [])[:12]],
        "trailer_key": _pick_trailer((data.get("videos") or {}).get("results", [])),
        "imdb_id": (data.get("external_ids") or {}).get("imdb_id") or data.get("imdb_id"),
        "recommendations": [card(r, r.get("media_type") or media_type)
                            for r in (data.get("recommendations") or {}).get("results", [])[:12]
                            if r.get("poster_path")],
        "providers": _providers(data),
        "telegram_link": telegram_link(media_type, tmdb_id),
        "einthusan_url": einthusan_url(media_type, data),
        "in_library": _in_library(tmdb_id),
    })
    if media_type == "tv":
        detail["seasons"] = [
            {"season_number": s["season_number"], "name": s.get("name") or f"Season {s['season_number']}",
             "episode_count": s.get("episode_count", 0), "air_date": s.get("air_date") or ""}
            for s in data.get("seasons", []) if s.get("season_number", 0) > 0 and s.get("episode_count")
        ]
        detail["status"] = data.get("status", "")
    return detail


@app.get("/api/reviews")
async def get_reviews(movie_id: int, type: str = ""):
    order = ["tv", "movie"] if type == "tv" else ["movie", "tv"]
    data = {}
    for mt in order:
        data = await tmdb(f"/{mt}/{movie_id}/reviews") or {}
        if data.get("results"):
            break
    reviews = []
    for r in data.get("results", [])[:10]:
        details = r.get("author_details") or {}
        content = re.sub(r"<[^>]+>", "", r.get("content", ""))
        content = re.sub(r"\*\*|__|#{1,6}\s?|^>\s?", "", content, flags=re.M).strip()
        avatar = details.get("avatar_path") or ""
        reviews.append({
            "id": r.get("id"),
            "author": r.get("author") or "Anonymous",
            "avatar_url": avatar[1:] if avatar.startswith("/http") else img(avatar, "w92"),
            "rating": details.get("rating"),  # 0-10 or None
            "content": content,
            "created_at": r.get("created_at", ""),
            "url": r.get("url", ""),
        })
    return reviews


# ============================================================
# Torrents
# ============================================================

@app.get("/api/torrents/search")
async def torrent_search(
    tmdb_id: int = 0,
    media_type: str = "movie",
    season: int = 0,
    episode: int = 0,
    query: str = "",
):
    """Magnet links for a title. Pass tmdb_id (preferred) or a free-text query."""
    media_type = "tv" if media_type == "tv" else "movie"
    title, year, imdb_id, language = query.strip(), "", "", ""

    if tmdb_id:
        data = await tmdb(f"/{media_type}/{tmdb_id}", append_to_response="external_ids")
        if data:
            title = data.get("title") or data.get("name") or title
            year = str(year_of(data) or "")
            imdb_id = (data.get("external_ids") or {}).get("imdb_id") or ""
            language = data.get("original_language") or ""

    if not title:
        return {"query": "", "results": [], "error": "No title or tmdb_id provided"}

    try:
        results = await search_torrents(title, media_type, year=year, imdb_id=imdb_id,
                                        season=season, episode=episode, language=language)
    except Exception as e:
        logging.error(f"Torrent search failed: {e}")
        results = []

    label = title
    if media_type == "movie" and year:
        label += f" ({year})"
    elif season:
        label += f" S{season:02d}" + (f"E{episode:02d}" if episode else "")
    return {"query": label, "results": [r.to_dict() for r in results]}


_MAGNET_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · StreamBreaker</title>
<style>
:root{{color-scheme:dark;--bg:#0c0c0e;--card:#16161a;--line:#2a2a30;--text:#f4f4f5;--muted:#a1a1aa;--accent:#c8f542}}
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);
color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}}
.card{{width:100%;max-width:460px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}}
h1{{font-size:18px;margin:0 0 4px;word-break:break-word}}p{{color:var(--muted);margin:0 0 20px;font-size:14px}}
a.btn,button{{display:block;width:100%;text-align:center;border-radius:10px;padding:13px;font-weight:600;font-size:15px;
cursor:pointer;text-decoration:none;border:0;margin-bottom:10px;font-family:inherit}}
a.btn{{background:var(--accent);color:#0c0c0e}}button{{background:#24242a;color:var(--text);border:1px solid var(--line)}}
textarea{{width:100%;height:84px;background:#0c0c0e;color:var(--muted);border:1px solid var(--line);border-radius:10px;
padding:10px;font:12px/1.4 ui-monospace,monospace;resize:none;margin-top:6px}}
.hint{{font-size:13px;color:var(--muted);margin-top:14px}}.hint b{{color:var(--text)}}
</style></head><body><div class="card">
<h1>{title}</h1>
<p>Opens in your torrent app.</p>
<a class="btn" href="{magnet}">Open magnet link</a>
<button id="copy" type="button">Copy magnet link</button>
<textarea readonly id="m">{magnet}</textarea>
<div class="hint">No torrent app? Use <b>qBittorrent</b> (Windows/Mac/Linux) or <b>LibreTorrent</b> (Android).
If you're inside Telegram, open this page in your browser first.</div>
</div>
<script>
document.getElementById('copy').onclick=function(){{var t=document.getElementById('m');t.select();
try{{navigator.clipboard.writeText(t.value)}}catch(e){{document.execCommand('copy')}}this.textContent='Copied ✓'}};
</script></body></html>"""


@app.get("/api/magnet/{info_hash}", response_class=HTMLResponse)
async def magnet_page(info_hash: str, dn: str = ""):
    info_hash = info_hash.lower()
    if not re.fullmatch(r"[0-9a-f]{40}|[a-z2-7]{32}", info_hash):
        return HTMLResponse("Invalid link", status_code=400)
    from torrent_scraper import build_magnet
    name = dn[:200] or info_hash
    return _MAGNET_PAGE.format(title=html.escape(name), magnet=html.escape(build_magnet(info_hash, name)))


# ============================================================
# AI recommendations
# ============================================================

# Comma-separated keys, rotated round-robin to spread quota
GEMINI_KEYS = [k.strip() for k in
               (os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY") or "").split(",") if k.strip()]
_key_index = 0


@app.post("/api/ai")
async def ask_ai(request: Request):
    global _key_index
    try:
        data = await request.json()
    except Exception:
        return {"response": "Invalid request format."}
    prompt = data.get("prompt", "")
    if not prompt:
        return {"response": "Empty prompt."}
    prompt = f"{prompt}\n\nIMPORTANT: You must write the response strictly in English language."
    session = await http()

    # 1. NVIDIA (optional)
    nvidia_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if nvidia_key:
        try:
            async with session.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                json={"model": os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-ultra-550b-a55b"),
                      "messages": [{"role": "user", "content": prompt}],
                      "temperature": 1, "top_p": 0.95, "max_tokens": 4096},
                headers={"Authorization": f"Bearer {nvidia_key}"},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status == 200:
                    text = ((await resp.json()).get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
                    if text:
                        return {"response": text}
        except Exception as e:
            logging.warning(f"[NVIDIA] {e}")

    # 2. Gemini key pool
    if not GEMINI_KEYS:
        return {"response": "AI is not configured."}
    last_error = ""
    for model in ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest"]:
        for _ in range(len(GEMINI_KEYS)):
            key = GEMINI_KEYS[_key_index % len(GEMINI_KEYS)]
            _key_index += 1
            payload = {"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"maxOutputTokens": 500, "temperature": 0.9}}
            # Thinking models: disable thinking so the answer fits the token budget
            if any(v in model for v in ("2.5", "3.1", "3.5")):
                payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}
            try:
                async with session.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                    json=payload,
                ) as resp:
                    result = _json.loads(await resp.text())
            except Exception as e:
                last_error = str(e)[:100]
                continue
            if "error" in result:
                code = result["error"].get("code", 0)
                last_error = "quota" if code == 429 else "model" if code == 404 else "error"
                if code == 404:
                    break
                continue
            text = ((result.get("candidates") or [{}])[0].get("content", {}).get("parts") or [{}])[0].get("text", "")
            if text:
                return {"response": text}
    if last_error == "quota":
        return {"response": "⏳ AI is resting. All keys hit their daily limit. Try again tomorrow!"}
    return {"response": "AI is temporarily unavailable. Try again later!"}


# ============================================================
# Sync with the local download worker (Radarr/Sonarr -> Telegram channel)
#
#   GET  /api/sync/requests            open requests for the worker to fetch
#   POST /api/sync/requests/{id}       worker reports progress: downloading / failed
#   POST /api/sync/media               a file was uploaded to the channel -> library + notify
#   POST /api/sync/oversize            file too big for Telegram -> tell requesters
# All require ?secret=SYNC_SECRET.
# ============================================================

CHANNEL_ID = os.getenv("CHANNEL_ID", "")
BOT_TOKEN = os.getenv("BOT1_TOKEN", "")
SITE_URL = os.getenv("SITE_URL", "").rstrip("/")


def _authorized(secret: str) -> bool:
    expected = os.getenv("SYNC_SECRET")
    return bool(expected) and secret == expected


def _unauthorized():
    return JSONResponse({"error": "unauthorized"}, status_code=401)


async def bot_api(method: str, **payload) -> dict:
    """Call the Telegram Bot API directly (works from any thread/loop)."""
    if not BOT_TOKEN:
        return {"ok": False}
    session = await http()
    try:
        async with session.post(f"https://api.telegram.org/bot{BOT_TOKEN}/{method}", json=payload) as resp:
            return await resp.json()
    except Exception as e:
        logging.warning(f"Bot API {method} failed: {e}")
        return {"ok": False}


def _tag(season: int, episode: int) -> str:
    if not season:
        return ""
    return f" S{season:02d}" + (f"E{episode:02d}" if episode else "")


@app.get("/api/sync/requests")
async def sync_get_requests(secret: str = ""):
    if not _authorized(secret):
        return _unauthorized()
    from db_manager import DBManager
    return {"requests": [
        {"id": r[0], "user_id": r[1], "username": r[2], "title": r[3], "year": r[4],
         "media_type": r[5], "tmdb_id": r[6], "requested_at": r[7],
         "season": r[8] or 0, "episode": r[9] or 0, "status": r[10]}
        for r in DBManager().get_pending_requests()
    ]}


@app.post("/api/sync/requests/{request_id}")
async def sync_update_request(request_id: int, request: Request, secret: str = ""):
    if not _authorized(secret):
        return _unauthorized()
    data = await request.json()
    status = data.get("status")
    if status not in ("downloading", "failed", "uploaded"):
        return JSONResponse({"error": "bad status"}, status_code=400)
    from db_manager import DBManager
    db = DBManager()
    row = db.get_request(request_id)
    if not row:
        return JSONResponse({"error": "not found"}, status_code=404)
    db.update_request(request_id, status, data.get("note"))
    user_id, title, previous = row
    if status == "failed" and previous != "failed":
        note = data.get("note") or "it couldn't be found right now"
        await bot_api("sendMessage", chat_id=user_id, parse_mode="HTML",
                      text=f"😕 Sorry, we couldn't add <b>{html.escape(title)}</b> to the library: {html.escape(note)}.\n"
                           "Send the name again to get download links instead.")
    return {"status": "ok"}


@app.post("/api/sync/media")
async def sync_media(request: Request, secret: str = ""):
    if not _authorized(secret):
        return _unauthorized()
    data = await request.json()
    from db_manager import DBManager
    db = DBManager()
    tmdb_id = data.get("tmdb_id")
    season, episode = int(data.get("season") or 0), int(data.get("episode") or 0)
    ok = db.add_media(
        title=data.get("title", "Unknown"),
        year=str(data.get("year") or ""),
        media_type=data.get("media_type") or data.get("type") or "movie",
        file_id=data.get("file_id", ""),
        message_link=data.get("message_link", ""),
        quality=data.get("quality", "Unknown"),
        size_bytes=data.get("size_bytes", 0),
        tmdb_id=tmdb_id,
        season=season,
        episode=episode,
        message_id=data.get("message_id"),
    )

    # Deliver the file to everyone waiting for it (skipped for bulk re-syncs)
    delivered = 0
    message_id = data.get("message_id")
    if ok and data.get("notify", True) and tmdb_id and message_id and CHANNEL_ID:
        for req_id, user_id, req_season, req_episode in db.open_requests_for(tmdb_id, season, episode):
            r = await bot_api("copyMessage", chat_id=user_id, from_chat_id=CHANNEL_ID, message_id=message_id)
            if r.get("ok"):
                delivered += 1
            # A whole-season / whole-series request stays open until the worker says it's done
            if req_episode or not season:
                db.update_request(req_id, "uploaded")
    return {"status": "ok" if ok else "error", "delivered": delivered}


@app.post("/api/sync/oversize")
async def sync_oversize(request: Request, secret: str = ""):
    """The downloaded file is over Telegram's 2 GB limit: send requesters download links instead."""
    if not _authorized(secret):
        return _unauthorized()
    data = await request.json()
    tmdb_id = data.get("tmdb_id")
    if not tmdb_id:
        return {"status": "ignored"}
    season, episode = int(data.get("season") or 0), int(data.get("episode") or 0)
    media_type = "tv" if season or data.get("media_type") in ("tv", "episode", "series") else "movie"
    from db_manager import DBManager
    db = DBManager()
    title = html.escape(str(data.get("title") or "Your request"))
    link = f"{SITE_URL}/title/{media_type}/{tmdb_id}#download" if SITE_URL else telegram_link(media_type, tmdb_id)
    notified = 0
    for req_id, user_id, _s, _e in db.open_requests_for(tmdb_id, season, episode):
        await bot_api("sendMessage", chat_id=user_id, parse_mode="HTML", disable_web_page_preview=True,
                      text=f"📦 <b>{title}</b>{_tag(season, episode)} is bigger than Telegram's 2 GB limit, "
                           f"so we can't send the file here.\nGet it with a download link instead:\n{link}")
        db.update_request(req_id, "failed", "file over 2 GB")
        notified += 1
    return {"status": "ok", "notified": notified}
