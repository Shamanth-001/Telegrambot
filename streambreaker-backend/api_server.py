from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import os
from dotenv import load_dotenv

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
