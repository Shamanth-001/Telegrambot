"""
sonarr_client.py — Async Sonarr v3 API client using aiohttp.
"""
import os
import aiohttp
from dotenv import load_dotenv

load_dotenv()

SONARR_URL = os.getenv("SONARR_URL", "http://localhost:8989")
# .env may hold the Docker hostname; outside Docker that name doesn't reach the host
if not os.path.exists("/.dockerenv"):
    SONARR_URL = SONARR_URL.replace("host.docker.internal", "localhost")
SONARR_API_KEY = os.getenv("SONARR_API_KEY", "")
ROOT_FOLDER = os.getenv("SERIES_ROOT", r"C:\telegrambot\downloads\series")


class SonarrClient:
    def __init__(self):
        self.base_url = f"{SONARR_URL}/api/v3"
        self.api_key = SONARR_API_KEY
        self.headers = {"X-Api-Key": SONARR_API_KEY}

    # ------------------------------------------------------------------
    # Internal helper
    # ------------------------------------------------------------------
    async def _get(self, path: str, params: dict = None):
        url = f"{self.base_url}{path}"
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    print(f"  [SONARR] GET {path} → {resp.status}")
                    return None
        except Exception as e:
            print(f"  [SONARR] GET {path} error: {e}")
            return None

    async def _post(self, path: str, json_data: dict):
        url = f"{self.base_url}{path}"
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.post(url, json=json_data, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    body = await resp.text()
                    if resp.status in (200, 201):
                        return True, await resp.json(content_type=None)
                    return False, body
        except Exception as e:
            print(f"  [SONARR] POST {path} error: {e}")
            return False, str(e)

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------
    async def lookup(self, term: str) -> list:
        result = await self._get("/series/lookup", {"term": term})
        return result if isinstance(result, list) else []

    async def lookup_by_tvdb(self, tvdb_id: int) -> dict | None:
        results = await self.lookup(f"tvdb:{tvdb_id}")
        return results[0] if results else None

    # ------------------------------------------------------------------
    # Library
    # ------------------------------------------------------------------
    async def get_all_series(self) -> list:
        result = await self._get("/series")
        return result if isinstance(result, list) else []

    async def get_series(self, series_id: int) -> dict | None:
        return await self._get(f"/series/{series_id}")

    async def get_series_by_tvdb(self, tvdb_id: int) -> dict | None:
        """Check if a series already exists in Sonarr."""
        all_series = await self.get_all_series()
        for s in all_series:
            if s.get("tvdbId") == tvdb_id:
                return s
        return None

    # ------------------------------------------------------------------
    # Add & manage
    # ------------------------------------------------------------------
    async def add_series(self, series_data: dict, quality_profile_id: int = 1,
                         monitor_all: bool = True) -> tuple[bool, any]:
        """Add a series to Sonarr. With monitor_all=False nothing is monitored or searched,
        so a single episode/season can be requested afterwards."""
        payload = {
            "title": series_data["title"],
            "qualityProfileId": quality_profile_id,
            "tvdbId": series_data["tvdbId"],
            "titleSlug": series_data.get("titleSlug", series_data["title"].lower().replace(" ", "-")),
            "rootFolderPath": ROOT_FOLDER,
            "monitored": True,
            "seasonFolder": True,
            "addOptions": {"monitor": "all" if monitor_all else "none",
                           "searchForMissingEpisodes": monitor_all},
        }
        if "images" in series_data:
            payload["images"] = series_data["images"]
        if "seasons" in series_data:
            for season in series_data["seasons"]:
                season["monitored"] = monitor_all
            payload["seasons"] = series_data["seasons"]
        return await self._post("/series", payload)

    async def lookup_by_tmdb(self, tmdb_id: int) -> dict | None:
        results = await self.lookup(f"tmdb:{tmdb_id}")
        return results[0] if results else None

    async def get_series_by_tmdb(self, tmdb_id: int) -> dict | None:
        for s in await self.get_all_series():
            if s.get("tmdbId") == tmdb_id:
                return s
        return None

    async def get_episodes(self, series_id: int) -> list:
        result = await self._get("/episode", {"seriesId": series_id})
        return result if isinstance(result, list) else []

    async def set_episodes_monitored(self, episode_ids: list[int], monitored: bool) -> bool:
        url = f"{self.base_url}/episode/monitor"
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.put(url, json={"episodeIds": episode_ids, "monitored": monitored},
                                       timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    return resp.status in (200, 202)
        except Exception as e:
            print(f"  [SONARR] PUT /episode/monitor error: {e}")
            return False

    async def command(self, name: str, **body) -> bool:
        ok, _ = await self._post("/command", {"name": name, **body})
        return ok

    async def quality_profile_id(self, preferred: str = "") -> int:
        profiles = await self.get_quality_profiles()
        for p in profiles:
            if preferred and p.get("name", "").lower() == preferred.lower():
                return p["id"]
        return profiles[0]["id"] if profiles else 1

    async def trigger_search(self, series_id: int) -> bool:
        """Trigger a series search for missing episodes."""
        ok, _ = await self._post("/command", {
            "name": "SeriesSearch",
            "seriesId": series_id,
        })
        return ok

    # ------------------------------------------------------------------
    # History & episodes
    # ------------------------------------------------------------------
    async def get_history(self, page_size: int = 50) -> list:
        result = await self._get("/history", {
            "page": 1, "pageSize": page_size,
            "sortKey": "date", "sortDirection": "descending",
        })
        if isinstance(result, dict):
            return result.get("records", [])
        return []

    async def get_episode(self, episode_id: int) -> dict | None:
        return await self._get(f"/episode/{episode_id}")

    async def get_episode_file(self, episode_file_id: int) -> dict | None:
        return await self._get(f"/episodefile/{episode_file_id}")

    # ------------------------------------------------------------------
    # Quality profiles & root folders
    # ------------------------------------------------------------------
    async def get_quality_profiles(self) -> list:
        result = await self._get("/qualityprofile")
        return result if isinstance(result, list) else []

    async def get_root_folders(self) -> list:
        result = await self._get("/rootfolder")
        return result if isinstance(result, list) else []
