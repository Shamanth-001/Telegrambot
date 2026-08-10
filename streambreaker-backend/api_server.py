from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import os
import logging
from dotenv import load_dotenv
from torrent_scraper import search_torrents

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

TMDB_KEY = os.getenv("TMDB_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
TMDB_BASE = "https://api.themoviedb.org/3"

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "StreamBreaker API"}

@app.get("/api/trending")
async def trending(page: int = 1):
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{TMDB_BASE}/trending/all/day", params={
            "api_key": TMDB_KEY, "page": page
        }) as resp:
            return await resp.json()

@app.get("/api/search/{media_type}")
async def search(media_type: str, query: str, page: int = 1):
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{TMDB_BASE}/search/{media_type}", params={
            "api_key": TMDB_KEY,
            "query": query,
            "page": page,
            "include_adult": "false"
        }) as resp:
            return await resp.json()

@app.get("/api/discover/{media_type}")
async def discover(
    media_type: str,
    genre: int,
    page: int = 1,
    language: str = "",
    country: str = ""
):
    params = {
        "api_key": TMDB_KEY,
        "with_genres": genre,
        "sort_by": "popularity.desc",
        "include_adult": "false",
        "page": page,
    }

    # Indian content - more flexible params
    if country == "IN":
        params["with_origin_country"] = "IN"
        # Very low threshold for regional Indian content
        params["vote_count.gte"] = 1
        if language and language != "all" and language != "":
            params["with_original_language"] = language
    else:
        # Global/English content
        if language and language != "all" and language != "":
            params["with_original_language"] = language
        params["vote_count.gte"] = 10

    async with aiohttp.ClientSession() as session:
        async with session.get(f"{TMDB_BASE}/discover/{media_type}", params=params) as resp:
            data = await resp.json()

            # If no results with strict params, try relaxed
            if not data.get("results") and country == "IN":
                params.pop("vote_count.gte", None)
                if "with_original_language" in params:
                    params.pop("with_original_language")
                async with session.get(f"{TMDB_BASE}/discover/{media_type}", params=params) as resp2:
                    return await resp2.json()

            return data

# ============ STREAMING AVAILABILITY (TMDB built-in) ============

@app.get("/api/watch/{media_type}/{tmdb_id}")
async def watch_providers(media_type: str, tmdb_id: int):
    """Get streaming availability for a movie/TV show using TMDB's built-in watch providers."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{TMDB_BASE}/{media_type}/{tmdb_id}/watch/providers",
            params={"api_key": TMDB_KEY}
        ) as resp:
            data = await resp.json()
            results = data.get("results", {})

            # Get India (IN) and US providers
            providers = {}
            for region in ["IN", "US"]:
                region_data = results.get(region, {})
                flatrate = region_data.get("flatrate", [])  # Streaming
                rent = region_data.get("rent", [])
                buy = region_data.get("buy", [])
                providers[region] = {
                    "stream": [{"name": p["provider_name"], "logo": f"https://image.tmdb.org/t/p/w92{p['logo_path']}"} for p in flatrate[:6]],
                    "rent": [{"name": p["provider_name"], "logo": f"https://image.tmdb.org/t/p/w92{p['logo_path']}"} for p in rent[:4]],
                    "buy": [{"name": p["provider_name"], "logo": f"https://image.tmdb.org/t/p/w92{p['logo_path']}"} for p in buy[:4]],
                    "link": region_data.get("link", "")
                }

            return {"providers": providers}

# ============ TRAILERS ============

@app.get("/api/trailers/{media_type}/{tmdb_id}")
async def get_trailers(media_type: str, tmdb_id: int):
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}/videos"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params={"api_key": TMDB_KEY}) as resp:
            data = await resp.json()

    results = data.get("results", [])
    # Filter YouTube videos only
    yt = [v for v in results if v.get("site") == "YouTube"]
    # Prioritize: Official Trailer > Trailer > Teaser > any
    for vtype in ["Trailer", "Teaser", "Clip"]:
        for v in yt:
            if v.get("type") == vtype and v.get("official", False):
                return {"key": v["key"], "name": v.get("name", "Trailer")}
    for vtype in ["Trailer", "Teaser"]:
        for v in yt:
            if v.get("type") == vtype:
                return {"key": v["key"], "name": v.get("name", "Trailer")}
    if yt:
        return {"key": yt[0]["key"], "name": yt[0].get("name", "Video")}
    return {"key": None, "name": None}

# ============ GEMINI AI ============

import json as _json

# Multiple API keys for rotation (avoids quota limits)
GEMINI_KEYS = [k.strip() for k in [
    os.getenv("GEMINI_API_KEY", ""),
    "AIzaSyDzhFnG_7lVLmOkWJ1Ojv-q3UMMhzi3NnE",
    "AIzaSyBj0gO-d_Qrck9hvHPTNm_hE5vxlHEs0O8",
    "AIzaSyCQlYwuGJPwxTOi5PLxSFKWuPH2S_XGrUI",
] if k.strip()]

_key_index = 0  # Round-robin counter

@app.post("/api/ai")
async def ask_ai(request: Request):
    global _key_index
    try:
        data = await request.json()
    except Exception:
        return {"response": "Invalid request format."}
    prompt = data.get("prompt", "")

    if prompt:
        # Enforce English response
        prompt = f"{prompt}\n\nIMPORTANT: You must write the response strictly in English language."

    # 1. Primary: NVIDIA Nemotron 3 Ultra 550B
    nvidia_key = os.getenv("NVIDIA_API_KEY", "").strip()
    nvidia_model = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-ultra-550b-a55b").strip()
    if nvidia_key:
        nv_url = "https://integrate.api.nvidia.com/v1/chat/completions"
        nv_payload = {
            "model": nvidia_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 1,
            "top_p": 0.95,
            "max_tokens": 4096,
        }
        nv_headers = {
            "Authorization": f"Bearer {nvidia_key}",
            "Content-Type": "application/json"
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(nv_url, json=nv_payload, headers=nv_headers, timeout=aiohttp.ClientTimeout(total=60)) as nv_resp:
                    if nv_resp.status == 200:
                        nv_data = await nv_resp.json()
                        text = nv_data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                        if text:
                            return {"response": text}
                    else:
                        print(f"[NVIDIA] Status {nv_resp.status}: {await nv_resp.text()}")
        except Exception as e:
            print(f"[NVIDIA] Error: {e}")

    # 2. Rotated Gemini Pool
    if not GEMINI_KEYS:
        return {"response": "No Gemini API keys configured."}

    # Upgraded models list
    models = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest"]
    last_error = ""

    for model in models:
        for attempt in range(len(GEMINI_KEYS)):
            key = GEMINI_KEYS[_key_index % len(GEMINI_KEYS)]
            _key_index += 1

            url = (
                f"https://generativelanguage.googleapis.com/v1beta/"
                f"models/{model}:generateContent"
                f"?key={key}"
            )
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "maxOutputTokens": 500,
                    "temperature": 0.9
                }
            }
            # For thinking models, disable internal thinking to keep responses within budget
            if any(term in model for term in ["2.5", "3.1", "3.5"]):
                payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}

            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        raw = await resp.text()
                        try:
                            result = _json.loads(raw)
                        except (ValueError, _json.JSONDecodeError):
                            last_error = "Invalid API response"
                            continue

                        if "error" in result:
                            code = result["error"].get("code", 0)
                            if code == 429:
                                last_error = "quota"
                                continue  # Try next key
                            elif code == 404:
                                last_error = "model"
                                break  # Skip this model entirely
                            else:
                                last_error = result["error"].get("message", "")[:100]
                                continue

                        text = (result.get("candidates", [{}])[0]
                                    .get("content", {})
                                    .get("parts", [{}])[0]
                                    .get("text", ""))
                        if text:
                            return {"response": text}
                        else:
                            last_error = "Empty response"
            except Exception as e:
                last_error = str(e)[:100]
                continue

        # If model was 404, skip to next model
        if last_error == "model":
            continue

    if last_error == "quota":
        return {"response": "⏳ AI is resting. All keys hit their daily limit. Try again tomorrow!"}
    return {"response": "AI is temporarily unavailable. Try again later!"}

# ============ SYNC FROM LOCAL PC ============

@app.post("/api/sync/media")
async def sync_media(request: Request, secret: str = ""):
    """Called by Bot2/Bot3 on your PC after uploading to channel"""
    if secret != os.getenv("SYNC_SECRET"):
        return {"error": "unauthorized"}

    data = await request.json()
    from db_manager import DBManager
    db = DBManager()

    success = db.add_media(
        title=data.get("title", "Unknown"),
        year=data.get("year", ""),
        media_type=data.get("media_type", "movie"),
        file_id=data.get("file_id", ""),
        message_link=data.get("message_link", ""),
        quality=data.get("quality", "Unknown"),
        size_bytes=data.get("size_bytes", 0),
        tmdb_id=data.get("tmdb_id")
    )

    return {"status": "ok" if success else "error"}

@app.get("/api/sync/requests")
async def get_requests(secret: str = ""):
    """Your PC can pull pending requests"""
    if secret != os.getenv("SYNC_SECRET"):
        return {"error": "unauthorized"}

    from db_manager import DBManager
    db = DBManager()
    pending = db.get_pending_requests()

    return {
        "requests": [
            {
                "id": r[0],
                "user_id": r[1],
                "username": r[2],
                "title": r[3],
                "year": r[4],
                "media_type": r[5],
                "tmdb_id": r[6],
                "requested_at": r[7]
            }
            for r in pending
        ]
    }

# ============ STREAMBREAKER FRONTEND SUPPORT ENDPOINTS ============

def get_local_media_map(tmdb_ids):
    if not tmdb_ids:
        return {}
    from db_manager import DBManager
    db = DBManager()
    cursor = db.conn.cursor()
    ids = [i for i in tmdb_ids if i is not None]
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    try:
        cursor.execute(f'''
            SELECT tmdb_id, title, year, media_type, message_link, quality, size_bytes
            FROM media
            WHERE tmdb_id IN ({placeholders})
        ''', ids)
        rows = cursor.fetchall()
        return {
            row[0]: {
                "title": row[1],
                "year": row[2],
                "media_type": row[3],
                "message_link": row[4],
                "quality": row[5],
                "size_bytes": row[6]
            }
            for row in rows if row[0] is not None
        }
    except Exception as e:
        print(f"Error querying local DB: {e}")
        return {}

def map_tmdb_to_react(item, local_map={}):
    tmdb_id = item.get("id")
    title = item.get("title") or item.get("name") or "Unknown Title"
    description = item.get("overview") or ""
    
    poster_path = item.get("poster_path")
    backdrop_path = item.get("backdrop_path")
    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else ""
    backdrop_url = f"https://image.tmdb.org/t/p/original{backdrop_path}" if backdrop_path else ""
    
    rating = round(item.get("vote_average", 0.0), 1)
    
    release_date = item.get("release_date") or item.get("first_air_date") or ""
    release_year = 2024
    if release_date:
        try:
            release_year = int(release_date.split("-")[0])
        except Exception:
            pass
            
    media_type = item.get("media_type", "movie")
    if media_type not in ["movie", "tv"]:
        media_type = "movie"
        
    local_item = local_map.get(tmdb_id)
    if local_item:
        telegram_link = local_item["message_link"]
    else:
        telegram_link = f"https://t.me/StreamBreakerBot?start={media_type}_{tmdb_id}"
        
    return {
        "id": tmdb_id,
        "title": title,
        "description": description,
        "poster_url": poster_url,
        "backdrop_url": backdrop_url,
        "rating": rating,
        "genre": "Movie" if media_type == "movie" else "Series",
        "release_year": release_year,
        "telegram_link": telegram_link,
        "trending_score": item.get("popularity", 0.0),
        "views": int(item.get("popularity", 0.0) * 10)
    }

@app.get("/api/movies")
async def get_movies(
    sort: str = "trending",
    limit: int = 12,
    genre: str = "all",
    mood: str = "all",
    search: str = "",
    page: int = 1
):
    results = []
    async with aiohttp.ClientSession() as session:
        if search:
            async with session.get(f"{TMDB_BASE}/search/multi", params={
                "api_key": TMDB_KEY,
                "query": search,
                "page": page,
                "include_adult": "false"
            }) as resp:
                data = await resp.json()
                results = [i for i in data.get("results", []) if i.get("media_type") in ["movie", "tv"]]
        else:
            if sort == "trending":
                async with session.get(f"{TMDB_BASE}/trending/all/day", params={
                    "api_key": TMDB_KEY,
                    "page": page
                }) as resp:
                    data = await resp.json()
                    results = data.get("results", [])
            else:
                url = f"{TMDB_BASE}/discover/movie"
                params = {
                    "api_key": TMDB_KEY,
                    "sort_by": "vote_average.desc" if sort == "rating" else "primary_release_date.desc",
                    "page": page,
                    "include_adult": "false"
                }
                if genre != "all" and genre != "":
                    params["with_genres"] = genre
                async with session.get(url, params=params) as resp:
                    data = await resp.json()
                    results = data.get("results", [])
                    for item in results:
                        item["media_type"] = "movie"

    tmdb_ids = [item.get("id") for item in results if item.get("id")]
    local_map = get_local_media_map(tmdb_ids)
    
    movies = [map_tmdb_to_react(item, local_map) for item in results[:limit]]
    return {"data": movies}

@app.get("/api/movies/{tmdb_id}")
async def get_movie_detail(tmdb_id: int):
    data = None
    media_type = "movie"
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{TMDB_BASE}/movie/{tmdb_id}", params={"api_key": TMDB_KEY, "append_to_response": "credits"}) as resp:
            if resp.status == 200:
                data = await resp.json()
                media_type = "movie"
            else:
                async with session.get(f"{TMDB_BASE}/tv/{tmdb_id}", params={"api_key": TMDB_KEY, "append_to_response": "credits"}) as resp2:
                    if resp2.status == 200:
                        data = await resp2.json()
                        media_type = "tv"
                        
    if not data:
        return {"error": "Movie not found."}
        
    data["media_type"] = media_type
    local_map = get_local_media_map([tmdb_id])
    movie = map_tmdb_to_react(data, local_map)
    
    credits = data.get("credits", {})
    cast = [member.get("name") for member in credits.get("cast", [])[:5]]
    movie["cast"] = cast
    
    if data.get("runtime"):
        movie["duration"] = f"{data.get('runtime')} min"
    elif data.get("episode_run_time") and len(data.get("episode_run_time")) > 0:
        movie["duration"] = f"{data.get('episode_run_time')[0]} min"

    # For TV shows, include season/episode info for torrent search
    if media_type == "tv":
        movie["number_of_seasons"] = data.get("number_of_seasons", 0)
        seasons_raw = data.get("seasons", [])
        movie["seasons"] = [
            {
                "season_number": s.get("season_number", 0),
                "name": s.get("name", f"Season {s.get('season_number', 0)}"),
                "episode_count": s.get("episode_count", 0),
            }
            for s in seasons_raw
            if s.get("season_number", 0) > 0  # Skip "Specials" (season 0)
        ]
        
    return movie

@app.get("/api/genres")
async def get_genres():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{TMDB_BASE}/genre/movie/list", params={"api_key": TMDB_KEY}) as resp:
            return await resp.json()

@app.get("/api/watchlist")
async def get_watchlist():
    return []

@app.post("/api/watchlist")
async def add_to_watchlist():
    return {"status": "ok"}

@app.delete("/api/watchlist")
async def remove_from_watchlist():
    return {"status": "ok"}

@app.get("/api/reviews")
async def get_reviews(movie_id: int):
    data = {"results": []}
    async with aiohttp.ClientSession() as session:
        # Try movie reviews first, then TV
        for endpoint in [f"movie/{movie_id}", f"tv/{movie_id}"]:
            async with session.get(
                f"{TMDB_BASE}/{endpoint}/reviews",
                params={"api_key": TMDB_KEY, "page": 1}
            ) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    if result.get("results"):
                        data = result
                        break

    reviews = []
    for r in data.get("results", [])[:10]:
        author_details = r.get("author_details", {})
        rating_10 = author_details.get("rating")
        # Convert 10-scale to 5-scale for StarRating component
        rating_5 = round(rating_10 / 2, 1) if rating_10 is not None else 4.0

        # Clean content: strip markdown/HTML artifacts
        content = r.get("content", "")
        import re as _re
        content = _re.sub(r'<[^>]+>', '', content)  # Strip HTML tags
        content = _re.sub(r'\*\*|__|\#{1,6}\s?|>\s?', '', content)  # Strip markdown
        content = content.strip()

        reviews.append({
            "id": r.get("id"),
            "author": r.get("author", "Anonymous"),
            "rating": rating_5,
            "comment": content,
            "created_at": r.get("created_at", "")
        })
    return reviews

@app.post("/api/reviews")
async def add_review():
    return {"status": "ok"}


# ============================================================
# Torrent Search Endpoint
# ============================================================

@app.get("/api/torrents/search")
async def torrent_search(
    query: str = "",
    tmdb_id: int = 0,
    media_type: str = "movie",
    season: int = 0,
    episode: int = 0,
):
    """
    Search for torrent links for a movie or TV show.
    Can search by query string or tmdb_id (which resolves to a title via TMDB).
    For series, optionally pass season and episode numbers.
    Appends the release year for accurate torrent matching.
    """
    poster_url = ""
    search_query = query
    year = ""

    # If tmdb_id provided, resolve title, year, and poster from TMDB
    if tmdb_id and not query:
        endpoint = "movie" if media_type == "movie" else "tv"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{TMDB_BASE}/{endpoint}/{tmdb_id}",
                    params={"api_key": TMDB_KEY},
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        search_query = data.get("title") or data.get("name") or ""
                        poster_path = data.get("poster_path", "")
                        if poster_path:
                            poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}"

                        # Extract release year for accurate torrent matching
                        release_date = data.get("release_date") or data.get("first_air_date") or ""
                        if release_date and len(release_date) >= 4:
                            year = release_date[:4]

                        # For series, append season/episode info to query
                        if media_type == "tv" and season:
                            search_query += f" S{season:02d}"
                            if episode:
                                search_query += f"E{episode:02d}"
        except Exception as e:
            logging.warning(f"TMDB lookup failed for {tmdb_id}: {e}")

    if not search_query:
        return {"query": "", "results": [], "error": "No query or tmdb_id provided"}

    # Build the final search string: "Title Year" for movies only
    # For TV shows, the S01/S01E01 suffix is enough — year hurts accuracy
    if year and media_type == "movie":
        torrent_query = f"{search_query} {year}"
    else:
        torrent_query = search_query

    try:
        results = await search_torrents(torrent_query, media_type)
    except Exception as e:
        logging.error(f"Torrent search failed: {e}")
        results = []

    return {
        "query": torrent_query,
        "tmdb_id": tmdb_id if tmdb_id else None,
        "poster_url": poster_url,
        "results": [r.to_dict() for r in results[:20]],  # Cap at 20 results
    }

