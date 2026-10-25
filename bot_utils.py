"""
bot_utils.py — Shared utilities for StreamBreaker bots.
"""
import os
import re


def format_size(size_bytes):
    """Formats bytes into human-readable string (e.g. 1.50 GB)."""
    if size_bytes is None:
        return "Unknown"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


# Tags stripped when cleaning filenames
_JUNK_TAGS = [
    "YIFY", "RARBG", "YTS", "GalaxyRG", "PSA", "x265", "HEVC", "10bit",
    "1080p", "720p", "2160p", "4K", "BluRay", "WEB-DL", "WEBRip", "HDRip",
    "BrRip", "BDRip", "DVDRip", "AAC", "5 1", "x264", "H264", "H265",
    "AC3", "DTS", "AMZN", "NF", "DSNP", "Six6", "Joy", "EXTENDED",
    "REMASTERED", "UNCUT", "PROPER", "IMAX",
]


def clean_filename(filename: str) -> str:
    """Remove release-group junk from a filename, return cleaned name (with extension)."""
    base, ext = os.path.splitext(filename)
    clean = base.replace(".", " ").replace("_", " ").replace("-", " ")
    for tag in _JUNK_TAGS:
        clean = re.sub(rf"\b{re.escape(tag)}\b", "", clean, flags=re.IGNORECASE)
    # Remove anything inside square brackets  [YTS.MX]  etc.
    clean = re.sub(r"\[.*?\]", "", clean)
    clean = re.sub(r"\(.*?\)", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean + ext


def parse_title_year(filename: str):
    """
    Extract (title, year) from a filename like 'Inception.2010.1080p.BluRay.mp4'.
    Returns (title_str, year_int_or_None).
    """
    base, _ = os.path.splitext(filename)
    name = base.replace(".", " ").replace("_", " ").replace("-", " ")

    # Try to find a 4-digit year (1900-2099)
    match = re.search(r"\b((?:19|20)\d{2})\b", name)
    if match:
        year = int(match.group(1))
        title = name[: match.start()].strip()
    else:
        year = None
        title = name

    # Strip remaining junk after the year
    for tag in _JUNK_TAGS:
        title = re.sub(rf"\b{re.escape(tag)}\b", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\[.*?\]", "", title)
    title = re.sub(r"\(.*?\)", "", title)
    title = re.sub(r"\s+", " ", title).strip()
    return title, year


def detect_quality(filename: str) -> str:
    """Detect quality from filename (e.g. '1080p', '720p', '4K')."""
    name = filename.upper()
    if "2160P" in name or "4K" in name or "UHD" in name:
        return "2160p"
    if "1080P" in name:
        return "1080p"
    if "720P" in name:
        return "720p"
    if "480P" in name:
        return "480p"
    return "Unknown"


def format_caption(title, year, quality, size_bytes, rating=None, overview=None, genres=None):
    """Create a professional Telegram caption — NO plot, NO private info."""
    caption = f"🎬 **{title}** ({year})\n"

    if genres:
        genre_str = " | ".join(genres[:4])
        caption += f"🎭 **Genre:** {genre_str}\n"

    if rating:
        try:
            stars = "⭐" * int(round(float(rating) / 2))
            caption += f"{stars} **Rating:** {rating}/10\n"
        except (ValueError, TypeError):
            pass

    caption += f"💿 **Quality:** {quality}\n"
    caption += f"📦 **Size:** {format_size(size_bytes)}\n"

    return caption

