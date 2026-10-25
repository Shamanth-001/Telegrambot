"""
radarr_client.py — Async Radarr v3 API client using aiohttp.
"""
import os
import aiohttp
from dotenv import load_dotenv

load_dotenv()

RADARR_URL = os.getenv("RADARR_URL", "http://localhost:7878")
# .env may hold the Docker hostname; outside Docker that name doesn't reach the host
if not os.path.exists("/.dockerenv"):
    RADARR_URL = RADARR_URL.replace("host.docker.internal", "localhost")
RADARR_API_KEY = os.getenv("RADARR_API_KEY", "")
ROOT_FOLDER = os.getenv("MOVIE_ROOT", r"C:\telegrambot\downloads\movies")


class RadarrClient:
    def __init__(self):
        self.base_url = f"{RADARR_URL}/api/v3"
        self.api_key = RADARR_API_KEY
        self.headers = {"X-Api-Key": RADARR_API_KEY}

    # ------------------------------------------------------------------
    # Internal helper
    # ------------------------------------------------------------------
    async def _get(self, path: str, params: dict = None) -> dict | list | None:
        url = f"{self.base_url}{path}"
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    print(f"  [RADARR] GET {path} → {resp.status}")
                    return None
        except Exception as e:
            print(f"  [RADARR] GET {path} error: {e}")
            return None

    async def _post(self, path: str, json_data: dict) -> tuple[bool, any]:
        url = f"{self.base_url}{path}"
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.post(url, json=json_data, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    body = await resp.text()
                    if resp.status in (200, 201):
                        return True, await resp.json(content_type=None)
                    return False, body
        except Exception as e:
            print(f"  [RADARR] POST {path} error: {e}")
            return False, str(e)

    # ------------------------------------------------------------------
    # Lookup & search
    # ------------------------------------------------------------------
    async def lookup(self, term: str) -> list:
        """Lookup movies by name or tmdb:ID."""
        result = await self._get("/movie/lookup", {"term": term})
        return result if isinstance(result, list) else []

    async def lookup_by_tmdb(self, tmdb_id: int) -> dict | None:
        """Lookup a single movie by TMDB ID."""
        results = await self.lookup(f"tmdb:{tmdb_id}")
        return results[0] if results else None

    # ------------------------------------------------------------------
    # Library
    # ------------------------------------------------------------------
    async def get_all_movies(self) -> list:
        result = await self._get("/movie")
        return result if isinstance(result, list) else []

    async def get_movie(self, movie_id: int) -> dict | None:
        return await self._get(f"/movie/{movie_id}")

    async def get_movie_by_tmdb(self, tmdb_id: int) -> dict | None:
        """Check if a movie with this TMDB ID already exists in Radarr."""
        movies = await self.get_all_movies()
        for m in movies:
            if m.get("tmdbId") == tmdb_id:
                return m
        return None

    # ------------------------------------------------------------------
    # Add & manage
    # ------------------------------------------------------------------
    async def add_movie(self, movie_data: dict, quality_profile_id: int = 1) -> tuple[bool, any]:
        """Add a movie to Radarr with auto-search enabled."""
        payload = {
            "title": movie_data["title"],
            "qualityProfileId": quality_profile_id,
            "tmdbId": movie_data["tmdbId"],
            "year": movie_data.get("year", 0),
            "rootFolderPath": ROOT_FOLDER,
            "monitored": True,
            "minimumAvailability": "released",
            "addOptions": {"searchForMovie": True},
        }
        if "images" in movie_data:
            payload["images"] = movie_data["images"]
        return await self._post("/movie", payload)

    async def _put(self, path: str, json_data) -> tuple[bool, any]:
        url = f"{self.base_url}{path}"
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.put(url, json=json_data, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    body = await resp.text()
                    return resp.status in (200, 202), body
        except Exception as e:
            print(f"  [RADARR] PUT {path} error: {e}")
            return False, str(e)

    async def set_monitored(self, movie_ids: list[int], monitored: bool) -> bool:
        """Stop Radarr re-downloading a movie after its file was uploaded and deleted."""
        ok, _ = await self._put("/movie/editor", {"movieIds": movie_ids, "monitored": monitored})
        return ok

    async def quality_profile_id(self, preferred: str = "") -> int:
        """ID of the profile named `preferred` (case-insensitive), else the first profile."""
        profiles = await self.get_quality_profiles()
        for p in profiles:
            if preferred and p.get("name", "").lower() == preferred.lower():
                return p["id"]
        return profiles[0]["id"] if profiles else 1

    async def trigger_search(self, movie_id: int) -> bool:
        """Trigger a manual search for an existing movie."""
        ok, _ = await self._post("/command", {
            "name": "MoviesSearch",
            "movieIds": [movie_id],
        })
        return ok

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------
    async def get_history(self, page_size: int = 50) -> list:
        """Get recent Radarr history (downloads, imports, etc.)."""
        result = await self._get("/history", {
            "page": 1, "pageSize": page_size,
            "sortKey": "date", "sortDirection": "descending",
        })
        if isinstance(result, dict):
            return result.get("records", [])
        return []

    # ------------------------------------------------------------------
    # Quality profiles & root folders (for setup/debug)
    # ------------------------------------------------------------------
    async def get_quality_profiles(self) -> list:
        result = await self._get("/qualityprofile")
        return result if isinstance(result, list) else []

    async def get_root_folders(self) -> list:
        result = await self._get("/rootfolder")
        return result if isinstance(result, list) else []