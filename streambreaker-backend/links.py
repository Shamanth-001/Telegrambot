"""links.py — Outbound links shared by the API and the bot."""
from urllib.parse import quote_plus

EINTHUSAN_LANGS = {"kn": "kannada", "ta": "tamil", "te": "telugu", "ml": "malayalam", "hi": "hindi",
                   "bn": "bengali", "mr": "marathi", "pa": "punjabi"}


def einthusan_url(media_type: str, data: dict) -> str:
    """Search link on Einthusan (licensed South Asian streaming) for Indian-language films."""
    lang = EINTHUSAN_LANGS.get(data.get("original_language", ""))
    title = data.get("title") or data.get("original_title") or ""
    if media_type != "movie" or not lang or not title:
        return ""
    return f"https://einthusan.tv/movie/results/?lang={lang}&query={quote_plus(title)}"
