"""
bot1_receptionist.py — StreamBreaker Telegram bot.

Flow:
  user sends a name  ->  pick the right title (TMDB)  ->  poster + details
  movie              ->  best magnet links (one per quality)
  series             ->  pick season / episode  ->  magnet links

Telegram buttons can't open magnet: URLs, so each link button opens
/api/magnet/<hash> on the API, which hands the magnet to the torrent app.
"Copy magnets" sends the raw links as tap-to-copy text; "Torrent files" sends .torrent files.
"""
import asyncio
import html
import logging
import os
import re
from urllib.parse import quote

import aiohttp
from dotenv import load_dotenv
from telegram import (
    BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, InlineQueryResultArticle, InputFile,
    InputMediaPhoto, InputTextMessageContent, LinkPreviewOptions, Update,
)
from telegram.constants import ChatAction, ParseMode
from telegram.ext import (
    ApplicationBuilder, CallbackQueryHandler, CommandHandler, ContextTypes, InlineQueryHandler,
    MessageHandler, filters,
)

from db_manager import DBManager
from links import einthusan_url
from query_parser import parse_query
from torrent_scraper import fetch_torrent_file, pick_best, search_torrents, short_magnet, torrent_filename

load_dotenv()

BOT_TOKEN = os.getenv("BOT1_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_USER_ID") or 0)
TMDB_KEY = os.getenv("TMDB_API_KEY")
# Public URL of this API (serves /api/magnet/...). Telegram needs https here.
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://telegrambot-p8yg.onrender.com").rstrip("/")
# Public URL of the website; website buttons are hidden when unset.
SITE_URL = os.getenv("SITE_URL", "").rstrip("/")
BOT_USERNAME = os.getenv("BOT_USERNAME", "StreamBreakerBot")

TMDB_BASE = "https://api.themoviedb.org/3"

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)

db = DBManager()

TYPE_ICON = {"movie": "🎬", "tv": "📺"}


# ============ TMDB ============

async def tmdb(path: str, **params) -> dict | None:
    try:
        connector = None
        if os.getenv("DNS_SERVERS"):  # same optional DNS override as api_server
            connector = aiohttp.TCPConnector(resolver=aiohttp.AsyncResolver(
                nameservers=[d.strip() for d in os.getenv("DNS_SERVERS").split(",")]))
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12), connector=connector) as session:
            async with session.get(f"{TMDB_BASE}{path}", params={"api_key": TMDB_KEY, **params}) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        logging.warning(f"TMDB {path}: {e}")
    return None


def year_of(item: dict) -> str:
    return (item.get("release_date") or item.get("first_air_date") or "")[:4]


def esc(text) -> str:
    return html.escape(str(text or ""))


def site_link(path: str) -> str | None:
    return f"{SITE_URL}{path}" if SITE_URL else None


def magnet_page(info_hash: str, name: str) -> str:
    return f"{API_PUBLIC_URL}/api/magnet/{info_hash}?dn={quote(name[:120])}"


# ============ /start and search ============

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    db.track_user(user)

    # Deep link from the website: /start movie_123 or tv_456
    if context.args:
        payload = context.args[0]
        media_type, _, tmdb_id = payload.partition("_")
        if media_type in ("movie", "tv") and tmdb_id.isdigit():
            await show_title(update.effective_chat.id, context, media_type, int(tmdb_id))
            return
        await run_search(update, context, payload.replace("_", " "))
        return

    buttons = [[InlineKeyboardButton("🔥 What's trending", callback_data="tr_new|all")]]
    if SITE_URL:
        buttons.append([InlineKeyboardButton("🌐 Browse the website", url=SITE_URL)])
    await update.message.reply_text(
        f"👋 Hi {esc(user.first_name)}!\n\n"
        "Send me the name of any <b>movie</b> or <b>series</b> and I'll find download links for it.\n\n"
        "<i>Examples:</i> <code>Interstellar</code>, <code>Breaking Bad</code>, <code>Kalki 2898 AD</code>, "
        "<code>game of thrones s1e1</code>\n\n"
        "🔥 /trending — what's popular this week",
        parse_mode=ParseMode.HTML,
        reply_markup=InlineKeyboardMarkup(buttons) if buttons else None,
    )


# ============ Inline mode: @StreamBreakerBot <title> in any chat ============

async def inline_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Share a title card into any chat. Empty query = this week's trending titles."""
    q = (update.inline_query.query or "").strip()
    if q:
        data = await tmdb("/search/multi", query=q, include_adult="false") or {}
        hits = rank_hits(q, [h for h in data.get("results", []) if h.get("media_type") in ("movie", "tv")])[:10]
    else:
        hits = await trending_items("all")
    genres = await genre_names()

    results = []
    for h in hits:
        media_type, tmdb_id = h["media_type"], h["id"]
        title = h.get("title") or h.get("name") or "Untitled"
        year = year_of(h)
        rating = h.get("vote_average") or 0
        g = ", ".join(genres[i] for i in (h.get("genre_ids") or [])[:3] if i in genres)
        overview = h.get("overview") or ""
        if len(overview) > 280:
            overview = overview[:280].rsplit(" ", 1)[0] + "…"
        poster = f"https://image.tmdb.org/t/p/w500{h['poster_path']}" if h.get("poster_path") else None
        meta = " · ".join(x for x in ("Series" if media_type == "tv" else "Movie",
                                      f"⭐ {rating:.1f}" if rating else "", g) if x)
        text = (f"{TYPE_ICON[media_type]} <b>{esc(title)}</b>" + (f" ({year})" if year else "")
                + f"\n{esc(meta)}" + (f"\n\n{esc(overview)}" if overview else ""))

        buttons = [[InlineKeyboardButton("⬇️ Get links", url=f"https://t.me/{BOT_USERNAME}?start={media_type}_{tmdb_id}")]]
        page = site_link(f"/title/{media_type}/{tmdb_id}")
        if page:
            buttons[0].append(InlineKeyboardButton("🌐 Website", url=page))

        results.append(InlineQueryResultArticle(
            id=f"{media_type}-{tmdb_id}",
            title=title + (f" ({year})" if year else ""),
            description=meta + (f"\n{overview[:90]}" if overview else ""),
            thumbnail_url=f"https://image.tmdb.org/t/p/w154{h['poster_path']}" if h.get("poster_path") else None,
            input_message_content=InputTextMessageContent(
                text, parse_mode=ParseMode.HTML,
                # The poster shows as a large preview above the card
                link_preview_options=LinkPreviewOptions(url=poster, prefer_large_media=True, show_above_text=True)
                if poster else LinkPreviewOptions(is_disabled=True),
            ),
            reply_markup=InlineKeyboardMarkup(buttons),
        ))

    await update.inline_query.answer(results, cache_time=300, is_personal=False)


# ============ /trending ============

TRENDING_TABS = [("all", "🔥 All"), ("movie", "🎬 Movies"), ("tv", "📺 Series"), ("kn", "Kannada"), ("hi", "Hindi")]
TRENDING_TITLES = {"all": "Trending this week", "movie": "Trending movies", "tv": "Trending series",
                   "kn": "Popular Kannada movies", "hi": "Popular Hindi movies"}


async def trending_items(tab: str) -> list[dict]:
    if tab in ("all", "movie", "tv"):
        data = await tmdb(f"/trending/{tab}/week") or {}
        items = data.get("results", [])
        if tab != "all":
            for i in items:
                i["media_type"] = tab
    else:  # regional: popular recent films in that language
        data = await tmdb("/discover/movie", with_original_language=tab, sort_by="popularity.desc",
                          include_adult="false", **{"vote_count.gte": 3}) or {}
        items = [{**i, "media_type": "movie"} for i in data.get("results", [])]
    return [i for i in items if i.get("media_type") in ("movie", "tv") and i.get("poster_path")][:10]


def trending_view(tab: str, items: list[dict]) -> tuple[str, str | None, InlineKeyboardMarkup]:
    """(caption, image_url, keyboard) for one trending tab."""
    lines = [f"<b>{TRENDING_TITLES[tab]}</b>\n"]
    for n, i in enumerate(items, 1):
        title = i.get("title") or i.get("name") or "Untitled"
        year = year_of(i)
        rating = i.get("vote_average") or 0
        lines.append(f"{n}. {TYPE_ICON[i['media_type']]} {esc(title)}" + (f" ({year})" if year else "")
                     + (f" · ⭐ {rating:.1f}" if rating else ""))
    lines.append("\n<i>Tap a title for details and links.</i>")
    tabs = [InlineKeyboardButton(("• " if key == tab else "") + label, callback_data=f"tr|{key}")
            for key, label in TRENDING_TABS]
    keyboard = [tabs[:3], tabs[3:]]
    for n, i in enumerate(items, 1):
        keyboard.append([InlineKeyboardButton(f"{n}. {hit_label(i)}"[:60],
                                              callback_data=f"t|{i['media_type']}|{i['id']}")])
    top = items[0] if items else {}
    image = (f"https://image.tmdb.org/t/p/w780{top['backdrop_path']}" if top.get("backdrop_path")
             else f"https://image.tmdb.org/t/p/w500{top['poster_path']}" if top.get("poster_path") else None)
    return "\n".join(lines), image, InlineKeyboardMarkup(keyboard)


async def trending(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db.track_user(update.effective_user)
    await context.bot.send_chat_action(update.effective_chat.id, ChatAction.UPLOAD_PHOTO)
    items = await trending_items("all")
    if not items:
        await update.effective_message.reply_text("Couldn't load trending titles right now — try again in a minute.")
        return
    caption, image, markup = trending_view("all", items)
    if image:
        await update.effective_message.reply_photo(image, caption=caption[:1024], parse_mode=ParseMode.HTML,
                                                   reply_markup=markup)
    else:
        await update.effective_message.reply_text(caption, parse_mode=ParseMode.HTML, reply_markup=markup)


async def switch_trending_tab(query, tab: str):
    if tab not in TRENDING_TITLES:
        await query.answer()
        return
    items = await trending_items(tab)
    if not items:
        await query.answer("Nothing to show right now.", show_alert=True)
        return
    await query.answer()
    caption, image, markup = trending_view(tab, items)
    if query.message.photo and image:
        await query.edit_message_media(InputMediaPhoto(image, caption=caption[:1024], parse_mode=ParseMode.HTML),
                                       reply_markup=markup)
    else:
        await query.edit_message_text(caption, parse_mode=ParseMode.HTML, reply_markup=markup)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = (update.message.text or "").strip()
    if not query:
        return
    db.track_user(update.effective_user)
    await run_search(update, context, query)


async def run_search(update: Update, context: ContextTypes.DEFAULT_TYPE, query: str):
    await context.bot.send_chat_action(update.effective_chat.id, ChatAction.TYPING)

    # "game of thrones s1e1" / "dark season 2" -> straight to that episode or season
    title, season, episode = parse_query(query)
    if season and title:
        await run_episode_search(update, context, title, season, episode)
        return

    data = await tmdb("/search/multi", query=query, include_adult="false") or {}
    hits = rank_hits(query, [h for h in data.get("results", []) if h.get("media_type") in ("movie", "tv")])

    if not hits:
        await update.effective_message.reply_text(
            f"😕 Nothing found for <b>{esc(query)}</b>.\nCheck the spelling or try the original title.",
            parse_mode=ParseMode.HTML,
        )
        return

    chat_id = update.effective_chat.id
    exact = [h for h in hits if is_exact(query, h) and not h.get("_demoted")]
    # One clear match: go straight to it
    if len(exact) == 1 or (exact and len(hits) == 1):
        top = exact[0]
        await show_title(chat_id, context, top["media_type"], top["id"])
        others = [h for h in hits if h is not top][:5]
        if others:
            await context.bot.send_message(
                chat_id, "Not the one you meant?", reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton(hit_label(h), callback_data=f"t|{h['media_type']}|{h['id']}")] for h in others]))
        return

    # Several candidates: poster cards for the top few, the rest as buttons
    genres = await genre_names()
    for h in hits[:3]:
        await send_result_card(chat_id, context, h, genres)
    rest = hits[3:8]
    if rest:
        await context.bot.send_message(
            chat_id, "More matches:", reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton(hit_label(h), callback_data=f"t|{h['media_type']}|{h['id']}")] for h in rest]))


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def is_exact(query: str, hit: dict) -> bool:
    q = _norm(query)
    return q in (_norm(hit.get("title") or hit.get("name")), _norm(hit.get("original_title") or hit.get("original_name")))


def rank_hits(query: str, hits: list[dict]) -> list[dict]:
    """Drop poster-less / near-unknown entries (unless they match exactly), exact matches first, then popularity."""
    with_posters = [h for h in hits if h.get("poster_path")]
    useful = [h for h in with_posters
              if is_exact(query, h) or (h.get("vote_count") or 0) >= 15 or (h.get("popularity") or 0) >= 3]
    ranked = useful or with_posters or hits
    ranked.sort(key=lambda h: (not is_exact(query, h), -(h.get("popularity") or 0)))
    # Among several exact matches (e.g. a 2011 series and a 1990 film), keep only those that matter
    exact = [h for h in ranked if is_exact(query, h)]
    if len(exact) > 1 and (exact[0].get("popularity") or 0) > 8 * (exact[1].get("popularity") or 0.01):
        ranked = [exact[0]] + [h for h in ranked if h is not exact[0] and not is_exact(query, h)] + exact[1:]
        # demote the obscure duplicates so the clear winner counts as the single exact match
        for h in exact[1:]:
            h["_demoted"] = True
    return ranked


def hit_label(h: dict) -> str:
    title = h.get("title") or h.get("name") or "Untitled"
    year = year_of(h)
    return (f"{TYPE_ICON.get(h['media_type'], '')} {title}" + (f" ({year})" if year else ""))[:60]


_genre_cache: dict[int, str] = {}


async def genre_names() -> dict[int, str]:
    if not _genre_cache:
        for kind in ("movie", "tv"):
            data = await tmdb(f"/genre/{kind}/list") or {}
            _genre_cache.update({g["id"]: g["name"] for g in data.get("genres", [])})
    return _genre_cache


async def send_result_card(chat_id, context, h: dict, genres: dict[int, str]):
    title = h.get("title") or h.get("name") or "Untitled"
    year = year_of(h)
    kind = "Series" if h["media_type"] == "tv" else "Movie"
    rating = h.get("vote_average") or 0
    g = ", ".join(genres[i] for i in (h.get("genre_ids") or [])[:3] if i in genres)
    overview = h.get("overview") or ""
    if len(overview) > 180:
        overview = overview[:180].rsplit(" ", 1)[0] + "…"
    meta = " · ".join(x for x in (kind, f"⭐ {rating:.1f}" if rating else "", g) if x)
    caption = (f"{TYPE_ICON[h['media_type']]} <b>{esc(title)}</b>" + (f" ({year})" if year else "")
               + f"\n{esc(meta)}" + (f"\n\n<i>{esc(overview)}</i>" if overview else ""))
    markup = InlineKeyboardMarkup([[InlineKeyboardButton(
        "✅ Get links" if h["media_type"] == "movie" else "✅ Choose episodes",
        callback_data=f"t|{h['media_type']}|{h['id']}")]])
    try:
        await context.bot.send_photo(chat_id, f"https://image.tmdb.org/t/p/w342{h['poster_path']}",
                                     caption=caption[:1024], parse_mode=ParseMode.HTML, reply_markup=markup)
    except Exception as e:  # poster fetch failed on Telegram's side
        logging.warning(f"result card photo failed: {e}")
        await context.bot.send_message(chat_id, caption, parse_mode=ParseMode.HTML, reply_markup=markup)


async def run_episode_search(update: Update, context: ContextTypes.DEFAULT_TYPE, title: str, season: int, episode: int):
    data = await tmdb("/search/tv", query=title, include_adult="false") or {}
    hits = data.get("results", [])[:6]
    tag = f"S{season:02d}" + (f"E{episode:02d}" if episode else "")
    if not hits:
        await update.effective_message.reply_text(
            f"😕 No series called <b>{esc(title)}</b> found. Check the spelling.", parse_mode=ParseMode.HTML)
        return

    # Confident match: skip the picker
    top = hits[0]
    if (top.get("name") or "").lower() == title.lower() or len(hits) == 1:
        await send_links(update.effective_chat.id, context, "tv", top["id"], season, episode)
        return

    keyboard = [[InlineKeyboardButton(
        f"📺 {h.get('name')}" + (f" ({year_of(h)})" if year_of(h) else "") + f" · {tag}",
        callback_data=f"l|tv|{h['id']}|{season}|{episode}")] for h in hits]
    await update.effective_message.reply_text(
        f"🔎 Which series do you want <b>{tag}</b> of?", parse_mode=ParseMode.HTML,
        reply_markup=InlineKeyboardMarkup(keyboard))


# ============ Title page ============

async def show_title(chat_id: int, context: ContextTypes.DEFAULT_TYPE, media_type: str, tmdb_id: int):
    await context.bot.send_chat_action(chat_id, ChatAction.TYPING)
    data = await tmdb(f"/{media_type}/{tmdb_id}")
    if not data:
        await context.bot.send_message(chat_id, "❌ Couldn't load that title. Try searching by name.")
        return

    title = data.get("title") or data.get("name") or "Untitled"
    year = year_of(data)
    rating = data.get("vote_average") or 0
    genres = ", ".join(g["name"] for g in data.get("genres", [])[:3])
    overview = data.get("overview") or ""
    if len(overview) > 400:
        overview = overview[:400].rsplit(" ", 1)[0] + "…"

    meta = [f"⭐ {rating:.1f}" if rating else "", genres]
    if media_type == "movie" and data.get("runtime"):
        meta.append(f"{data['runtime'] // 60}h {data['runtime'] % 60}m")
    if media_type == "tv":
        meta.append(f"{data.get('number_of_seasons', 0)} seasons")
    caption = (
        f"{TYPE_ICON[media_type]} <b>{esc(title)}</b>" + (f" ({year})" if year else "") + "\n"
        + esc(" · ".join(m for m in meta if m)) + "\n\n"
        + esc(overview)
    )

    buttons = []
    page = site_link(f"/title/{media_type}/{tmdb_id}")
    if page:
        buttons.append([InlineKeyboardButton("🌐 Open on website", url=page)])
    einthusan = einthusan_url(media_type, data)
    if einthusan:
        buttons.append([InlineKeyboardButton("▶️ Stream on Einthusan", url=einthusan)])
    markup = InlineKeyboardMarkup(buttons) if buttons else None

    poster = data.get("poster_path")
    if poster:
        await context.bot.send_photo(chat_id, f"https://image.tmdb.org/t/p/w500{poster}",
                                     caption=caption[:1024], parse_mode=ParseMode.HTML, reply_markup=markup)
    else:
        await context.bot.send_message(chat_id, caption, parse_mode=ParseMode.HTML, reply_markup=markup)

    # Already in the Telegram library? Send the file itself (series: per episode, in send_links)
    if media_type == "movie":
        await send_library_files(chat_id, context, db.search_by_tmdb_id(tmdb_id))

    if media_type == "movie":
        await send_links(chat_id, context, "movie", tmdb_id)
    else:
        await send_season_picker(chat_id, context, tmdb_id, data)


async def send_library_files(chat_id, context, rows, limit: int = 30):
    """Copy already-uploaded files from the storage channel into the chat."""
    for row in rows[:limit]:
        link = row[3] or ""
        try:
            parts = link.rstrip("/").split("/")
            await context.bot.copy_message(chat_id, from_chat_id=int(f"-100{parts[-2]}"), message_id=int(parts[-1]))
        except Exception as e:
            logging.warning(f"copy_message failed for {link}: {e}")


async def send_season_picker(chat_id, context, tmdb_id: int, data: dict, message=None):
    seasons = [s for s in data.get("seasons", []) if s.get("season_number", 0) > 0 and s.get("episode_count")]
    if not seasons:
        await context.bot.send_message(chat_id, "No seasons listed for this series yet.")
        return
    buttons = [InlineKeyboardButton(f"S{s['season_number']:02d}", callback_data=f"s|{tmdb_id}|{s['season_number']}")
               for s in seasons]
    keyboard = [buttons[i:i + 5] for i in range(0, len(buttons), 5)]
    text = "📺 <b>Choose a season</b>"
    if message:
        await message.edit_text(text, parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        await context.bot.send_message(chat_id, text, parse_mode=ParseMode.HTML,
                                       reply_markup=InlineKeyboardMarkup(keyboard))


async def show_episode_picker(query, tmdb_id: int, season: int):
    data = await tmdb(f"/tv/{tmdb_id}/season/{season}") or {}
    episodes = [e["episode_number"] for e in data.get("episodes", []) if e.get("episode_number")]
    keyboard = [[InlineKeyboardButton(f"📦 Full season {season}", callback_data=f"l|tv|{tmdb_id}|{season}|0")]]
    row = []
    for ep in episodes[:60]:
        row.append(InlineKeyboardButton(f"E{ep:02d}", callback_data=f"l|tv|{tmdb_id}|{season}|{ep}"))
        if len(row) == 6:
            keyboard.append(row)
            row = []
    if row:
        keyboard.append(row)
    keyboard.append([InlineKeyboardButton("« Seasons", callback_data=f"ss|{tmdb_id}")])
    await query.edit_message_text(
        f"📺 <b>Season {season}</b> — pick an episode or the full season:",
        parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ============ Links ============

async def find_links(media_type: str, tmdb_id: int, season: int = 0, episode: int = 0):
    data = await tmdb(f"/{media_type}/{tmdb_id}", append_to_response="external_ids") or {}
    title = data.get("title") or data.get("name") or ""
    year = year_of(data)
    imdb_id = (data.get("external_ids") or {}).get("imdb_id") or ""
    results = await search_torrents(title, media_type, year=year, imdb_id=imdb_id, season=season,
                                    episode=episode, language=data.get("original_language") or "") if title else []
    label = title + (f" ({year})" if media_type == "movie" and year else "")
    if season:
        label += f" S{season:02d}" + (f"E{episode:02d}" if episode else "")
    return label, results


def max_size(season: int, episode: int) -> int:
    """Upper size limit for the short list: movie 25 GB, episode 10 GB, season pack 80 GB."""
    gb = 1024 ** 3
    return 10 * gb if episode else 80 * gb if season else 25 * gb


def short_quality(r) -> str:
    return r.quality if r.quality != "Unknown" else (r.rip or "Other")


def describe(r) -> str:
    bits = [r.quality if r.quality != "Unknown" else "", "/".join(r.languages), r.rip, r.codec, r.size]
    return " · ".join(b for b in bits if b and b != "Unknown")


async def send_links(chat_id, context, media_type: str, tmdb_id: int, season: int = 0, episode: int = 0,
                     message=None):
    """Send (or edit `message` into) the best links for a title."""
    if message:
        await message.edit_text("🔎 Searching for links…")
    else:
        message = await context.bot.send_message(chat_id, "🔎 Searching for links…")

    label, results = await find_links(media_type, tmdb_id, season, episode)
    best = pick_best(results, 5, max_size(season, episode))
    ref = f"{media_type}|{tmdb_id}|{season}|{episode}"
    back = [InlineKeyboardButton("« Episodes", callback_data=f"s|{tmdb_id}|{season}")] if season else []
    request_btn = InlineKeyboardButton("📥 Send me the file here", callback_data=f"r|{ref}")

    if media_type == "tv" and season:
        await send_library_files(chat_id, context, db.search_by_tmdb_id(tmdb_id, season, episode))

    if not best:
        keyboard = [[request_btn]]
        if back:
            keyboard.append(back)
        await message.edit_text(
            f"😕 No download links found for <b>{esc(label)}</b> right now.\n"
            "Tap <b>Send me the file here</b> and we'll try to get it for you.",
            parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
        )
        return

    lines = [f"⬇️ <b>{esc(label)}</b>\n"]
    keyboard = []
    for i, r in enumerate(best, 1):
        lines.append(f"<b>{i}.</b> {esc(describe(r))} · 🌱 {r.seeders}\n<i>{esc(r.title[:90])}</i>")
        keyboard.append([InlineKeyboardButton(f"{i}. {short_quality(r)} · {r.size} · 🌱{r.seeders}"[:60],
                                              url=magnet_page(r.info_hash, r.title))])
    if any(r.is_cam for r in best):
        lines.append("\n⚠️ <i>CAM = recorded in a cinema; picture and sound are poor.</i>")
    lines.append("\nTap a link to open it in your torrent app.")

    keyboard.append([InlineKeyboardButton("📋 Copy magnets", callback_data=f"m|{ref}"),
                     InlineKeyboardButton("📄 Torrent files", callback_data=f"tf|{ref}")])
    page = site_link(f"/title/{media_type}/{tmdb_id}")
    if page and len(results) > len(best):
        keyboard.append([InlineKeyboardButton(f"➕ All {len(results)} links on the website", url=page)])
    keyboard.append([request_btn])
    if back:
        keyboard.append(back)

    await message.edit_text("\n".join(lines), parse_mode=ParseMode.HTML,
                            reply_markup=InlineKeyboardMarkup(keyboard), disable_web_page_preview=True)


async def send_torrent_files(chat_id, context, media_type, tmdb_id, season, episode):
    """Send the .torrent file for each of the best links (from public caches)."""
    label, results = await find_links(media_type, tmdb_id, season, episode)
    best = pick_best(results, 5, max_size(season, episode))
    if not best:
        await context.bot.send_message(chat_id, "No links to send.")
        return
    await context.bot.send_chat_action(chat_id, ChatAction.UPLOAD_DOCUMENT)
    files = await asyncio.gather(*[fetch_torrent_file(r.info_hash) for r in best])
    missing = []
    for i, (r, data) in enumerate(zip(best, files), 1):
        if not data:
            missing.append(str(i))
            continue
        await context.bot.send_document(
            chat_id, InputFile(data, filename=torrent_filename(r.title)),
            caption=f"{i}. {short_quality(r)} · {r.size} · 🌱 {r.seeders}")
    if missing:
        await context.bot.send_message(
            chat_id, f"ℹ️ No .torrent file is cached for link {', '.join(missing)} — use its magnet button instead "
                     "(works the same way).")


async def send_magnet_text(chat_id, context, media_type, tmdb_id, season, episode):
    label, results = await find_links(media_type, tmdb_id, season, episode)
    best = pick_best(results, 5, max_size(season, episode))
    if not best:
        await context.bot.send_message(chat_id, "No links to copy.")
        return
    parts = [f"📋 <b>{esc(label)}</b> — tap a link to copy it:\n"]
    for i, r in enumerate(best, 1):
        parts.append(f"<b>{i}. {esc(short_quality(r))} · {esc(r.size)}</b>\n<code>{esc(short_magnet(r.info_hash, r.title))}</code>")
    await context.bot.send_message(chat_id, "\n\n".join(parts), parse_mode=ParseMode.HTML)


# ============ Buttons ============

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    chat_id = query.message.chat_id
    parts = (query.data or "").split("|")
    action = parts[0]

    try:
        if action == "t":                      # picked a search result
            await query.answer()
            await show_title(chat_id, context, parts[1], int(parts[2]))

        elif action == "tr":                   # /trending tab switch
            await switch_trending_tab(query, parts[1])

        elif action == "tr_new":               # "What's trending" button on the welcome message
            await query.answer()
            await trending(update, context)

        elif action == "s":                    # picked a season
            await query.answer()
            await show_episode_picker(query, int(parts[1]), int(parts[2]))

        elif action == "ss":                   # back to seasons
            await query.answer()
            data = await tmdb(f"/tv/{parts[1]}") or {}
            await send_season_picker(chat_id, context, int(parts[1]), data, message=query.message)

        elif action == "l":                    # links for movie / season / episode
            await query.answer("Searching…")
            await send_links(chat_id, context, parts[1], int(parts[2]), int(parts[3]), int(parts[4]),
                             message=query.message)

        elif action == "m":                    # copy magnets as text
            await query.answer()
            await send_magnet_text(chat_id, context, parts[1], int(parts[2]), int(parts[3]), int(parts[4]))

        elif action == "tf":                   # send .torrent files
            await query.answer("Fetching .torrent files…")
            await send_torrent_files(chat_id, context, parts[1], int(parts[2]), int(parts[3]), int(parts[4]))

        elif action == "r":                    # request to library
            await handle_request(query, context, parts[1], int(parts[2]), int(parts[3]), int(parts[4]))

        else:
            await query.answer("This button has expired — send the name again.", show_alert=True)
    except Exception as e:
        logging.exception(f"Button {query.data} failed: {e}")
        try:
            await query.answer("Something went wrong, please try again.", show_alert=True)
        except Exception:
            pass


async def handle_request(query, context, media_type, tmdb_id, season, episode):
    user = query.from_user
    data = await tmdb(f"/{media_type}/{tmdb_id}") or {}
    title = data.get("title") or data.get("name") or "Unknown"
    label = title + (f" S{season:02d}" + (f"E{episode:02d}" if episode else "") if season else "")
    year = year_of(data)
    added = db.add_request(user_id=user.id, title=title, year=year,
                           media_type="movie" if media_type == "movie" else "series",
                           tmdb_id=tmdb_id, username=user.username, season=season, episode=episode)
    await query.answer(
        "✅ Requested! We'll send the file in this chat when it's ready (usually 15–60 min)."
        if added else "Already requested — it's in the queue.", show_alert=True)
    title = label
    if added and ADMIN_ID:
        try:
            await context.bot.send_message(
                ADMIN_ID,
                f"📥 <b>New request</b>\n👤 @{esc(user.username or user.first_name)} ({user.id})\n"
                f"{TYPE_ICON.get(media_type, '')} <b>{esc(title)}</b> ({esc(year)})\n"
                f"https://www.themoviedb.org/{media_type}/{tmdb_id}",
                parse_mode=ParseMode.HTML, disable_web_page_preview=True,
            )
        except Exception as e:
            logging.error(f"Admin notify failed: {e}")


# ============ Admin & extras ============

async def admin_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        return
    s = db.get_stats()
    await update.message.reply_text(
        f"📊 <b>StreamBreaker</b>\n👥 Users: {s['users']}\n📥 Pending requests: {s['pending_requests']}\n"
        f"🎬 Library movies: {s['movies']}\n📺 Library episodes: {s['episodes']}",
        parse_mode=ParseMode.HTML,
    )


async def admin_requests(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        return
    pending = db.get_pending_requests()
    if not pending:
        await update.message.reply_text("✅ No pending requests.")
        return
    lines = ["📥 <b>Pending requests</b>\n"]
    for _id, user_id, username, title, year, media_type, tmdb_id, requested_at, season, episode, status in pending[:25]:
        tag = f" S{season:02d}" + (f"E{episode:02d}" if episode else "") if season else ""
        lines.append(f"• <b>{esc(title)}</b>{tag} ({esc(year)}) — {esc(status)} — @{esc(username or user_id)}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


async def website(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = SITE_URL or "https://streambreaker.netlify.app"
    await update.message.reply_text(
        "🌐 <b>StreamBreaker website</b>\nBrowse movies and series, watch trailers, see where to stream, "
        "and get download links.\n\nYou can also tap the <b>🌐 Website</b> button next to the message box.",
        parse_mode=ParseMode.HTML,
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Open the website", url=url)]]),
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = ("Send me a movie or series name to get download links.\n"
            "For one episode: <code>game of thrones s1e1</code>\n\n"
            "/trending — what's popular this week (movies, series, Kannada, Hindi)\n"
            "/website — open the website\n"
            "/recommend &lt;what you like&gt; — AI suggestions")
    if update.effective_user.id == ADMIN_ID:
        text += "\n\n<b>Admin</b>\n/stats — numbers\n/requests — pending requests"
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def recommend(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ask = " ".join(context.args) if context.args else ""
    if not ask:
        await update.message.reply_text(
            "🤖 Tell me what you like, e.g.\n<code>/recommend movies like Inception</code>\n"
            "<code>/recommend feel-good Malayalam comedy</code>",
            parse_mode=ParseMode.HTML,
        )
        return
    await context.bot.send_chat_action(update.effective_chat.id, ChatAction.TYPING)
    prompt = (f"The user wants movie/series recommendations: '{ask}'.\n"
              "Suggest exactly 5 titles. For each: Title (Year) — one short reason. Plain text, no markdown.")
    try:
        import ai
        text = await ai.ask(prompt)
    except Exception as e:
        logging.error(f"recommend failed: {e}")
        text = ""
    await update.message.reply_text(
        (esc(text) or "AI is busy, try again later.") + "\n\n<i>Send any title's name to get links.</i>",
        parse_mode=ParseMode.HTML,
    )


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE):
    logging.error("Unhandled bot error", exc_info=context.error)


# ============ Wiring ============

async def set_command_menu(app):
    """The list Telegram shows when users type "/"."""
    await app.bot.set_my_commands([
        BotCommand("trending", "What's trending this week"),
        BotCommand("website", "Open the StreamBreaker website"),
        BotCommand("recommend", "AI suggestions, e.g. /recommend movies like Inception"),
        BotCommand("help", "How to use the bot"),
    ])


def build_application():
    application = ApplicationBuilder().token(BOT_TOKEN).post_init(set_command_menu).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("trending", trending))
    application.add_handler(CommandHandler("website", website))
    application.add_handler(CommandHandler("help", help_cmd))
    application.add_handler(CommandHandler("recommend", recommend))
    application.add_handler(CommandHandler("stats", admin_stats))
    application.add_handler(CommandHandler("requests", admin_requests))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(InlineQueryHandler(inline_query))
    application.add_error_handler(on_error)
    return application


application = build_application() if BOT_TOKEN else None

if __name__ == "__main__":
    # Python 3.14 no longer creates a default event loop; python-telegram-bot 21 expects one
    asyncio.set_event_loop(asyncio.new_event_loop())
    print("✅ StreamBreaker bot is running")
    application.run_polling(drop_pending_updates=True)
