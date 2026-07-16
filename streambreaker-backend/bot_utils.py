import os
import re

def format_size(size_bytes):
    if size_bytes is None:
        return "Unknown"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"

def clean_filename(filename):
    base, ext = os.path.splitext(filename)
    junk = [
        "YIFY", "RARBG", "YTS", "GalaxyRG", "PSA", "x265", "HEVC", "10bit",
        "1080p", "720p", "2160p", "4K", "BluRay", "WEB-DL", "WEBRip",
        "BrRip", "AAC", "5.1", "x264", "H264", "AC3"
    ]
    clean = base.replace('.', ' ').replace('_', ' ')
    for j in junk:
        clean = re.sub(fr'\b{j}\b', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def format_caption(title, year, quality, size_bytes, rating=None, overview=None):
    caption = f"🎬 **{title}** ({year})\n"
    if rating:
        stars = "⭐" * int(round(float(rating) / 2))
        caption += f"{stars} **{rating}/10** (IMDb)\n"
    caption += f"💿 **Quality:** {quality}\n"
    caption += f"📦 **Size:** {format_size(size_bytes)}\n"
    if overview:
        if len(overview) > 800:
            overview = overview[:797] + "..."
        caption += f"\n📝 {overview}"
    return caption
