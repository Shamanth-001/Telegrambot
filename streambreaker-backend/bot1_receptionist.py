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
from telegram.error import BadRequest
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
            await open_title(context, update.effective_chat.id, media_type, int(tmdb_id))
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
                                              callback_data=f"t|{i['media_type']}|{i['id']}|tr.{tab}")])
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


async def switch_trending_tab(query, context, tab: str):
    if tab not in TRENDING_TITLES:
        await query.answer()
        return
    items = await trending_items(tab)
    if not items:
        await query.answer("Nothing to show right now.", show_alert=True)
        return
    await query.answer()
    caption, image, markup = trending_view(tab, items)
    await show_page(context, query.message.chat_id, image, caption, markup, query.message)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = (update.message.text or "").strip()
    if not query:
        return
    db.track_user(update.effective_user)
    await run_search(update, context, query)


async def run_search(update: Update, context: ContextTypes.DEFAULT_TYPE, query: str):
    await context.bot.send_chat_action(update.effective_chat.id, ChatAction.TYPING)
    chat_id = update.effective_chat.id

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

    key = remember_list(context, query, hits[:10])
    exact = [h for h in hits if is_exact(query, h) and not h.get("_demoted")]
    # One clear match: open it, with a way back to the other results
    if len(exact) == 1 or (exact and len(hits) == 1):
        top = exact[0]
        await open_title(context, chat_id, top["media_type"], top["id"], back=f"q.{key}" if len(hits) > 1 else "")
        return
    caption, image, markup = list_page(context, key)
    await show_page(context, chat_id, image, caption, markup)


# ============ Pages: everything happens inside one message ============
#
# Lists, title pages, season pickers and link lists are "pages" drawn into a single photo
# message; tapping a button edits that message in place. Each page knows where "« Back" goes:
#   back token ""        -> no back button
#   back token "tr.all"  -> /trending tab
#   back token "q.<key>" -> a remembered search result list

FALLBACK_IMAGE = "https://streambreaker.netlify.app/og-image.png"


async def show_page(context, chat_id: int, image: str | None, caption: str, markup, message=None):
    """Draw a page into `message` (a photo message) or send it as a new photo message."""
    image, caption = image or FALLBACK_IMAGE, caption[:1024]
    if message is not None and message.photo:
        try:
            return await message.edit_media(InputMediaPhoto(image, caption=caption, parse_mode=ParseMode.HTML),
                                             reply_markup=markup)
        except BadRequest as e:
            if "not modified" in str(e).lower():
                return message
            logging.warning(f"edit_media failed ({e}); sending a new message")
    elif message is not None:
        try:  # text messages can't become photos: replace them
            await message.delete()
        except Exception:
            pass
    try:
        return await context.bot.send_photo(chat_id, image, caption=caption, parse_mode=ParseMode.HTML,
                                            reply_markup=markup)
    except BadRequest as e:  # e.g. Telegram couldn't fetch the image
        logging.warning(f"send_photo failed ({e}); using the fallback image")
        return await context.bot.send_photo(chat_id, FALLBACK_IMAGE, caption=caption, parse_mode=ParseMode.HTML,
                                            reply_markup=markup)


async def show_loading(message, text: str = "🔎 Searching for links…"):
    """Quick feedback while a slow page loads."""
    if message is not None and message.photo:
        try:
            await message.edit_caption(text, reply_markup=None)
        except Exception:
            pass


def back_button(back: str):
    if back.startswith("tr."):
        return InlineKeyboardButton("« Back to trending", callback_data=f"tr|{back[3:]}")
    if back.startswith("q."):
        return InlineKeyboardButton("« All results", callback_data=f"q|{back[2:]}")
    return None


def tmdb_image(item: dict, wide: bool = False) -> str | None:
    if wide and item.get("backdrop_path"):
        return f"https://image.tmdb.org/t/p/w780{item['backdrop_path']}"
    if item.get("poster_path"):
        return f"https://image.tmdb.org/t/p/w500{item['poster_path']}"
    return None


# ---- search result lists ----

def remember_list(context, query: str, hits: list[dict]) -> str:
    """Keep a search result list so "« All results" can redraw it. Returns its short key."""
    lists = context.chat_data.setdefault("lists", {})
    n = context.chat_data.get("list_seq", 0) + 1
    context.chat_data["list_seq"] = n
    key = format(n, "x")
    lists[key] = {"q": query, "hits": [
        {k: h.get(k) for k in ("id", "media_type", "title", "name", "release_date", "first_air_date",
                               "vote_average", "poster_path", "backdrop_path")} for h in hits]}
    while len(lists) > 15:  # keep memory small
        lists.pop(next(iter(lists)))
    return key


def list_page(context, key: str):
    saved = context.chat_data.get("lists", {}).get(key)
    if not saved:
        return None
    hits = saved["hits"]
    lines = [f"🔎 <b>Results for “{esc(saved['q'])}”</b>\n"]
    keyboard = []
    for n, h in enumerate(hits, 1):
        rating = h.get("vote_average") or 0
        lines.append(f"{n}. {hit_label(h)}" + (f" · ⭐ {rating:.1f}" if rating else ""))
        keyboard.append([InlineKeyboardButton(f"{n}. {hit_label(h)}"[:60],
                                              callback_data=f"t|{h['media_type']}|{h['id']}|q.{key}")])
    lines.append("\n<i>Tap a title to open it.</i>")
    return "\n".join(lines), tmdb_image(hits[0], wide=True), InlineKeyboardMarkup(keyboard)


async def run_episode_search(update: Update, context: ContextTypes.DEFAULT_TYPE, title: str, season: int, episode: int):
    chat_id = update.effective_chat.id
    data = await tmdb("/search/tv", query=title, include_adult="false") or {}
    hits = [{**h, "media_type": "tv"} for h in data.get("results", [])[:8]]
    tag = f"S{season:02d}" + (f"E{episode:02d}" if episode else "")
    if not hits:
        await update.effective_message.reply_text(
            f"😕 No series called <b>{esc(title)}</b> found. Check the spelling.", parse_mode=ParseMode.HTML)
        return

    # Confident match: straight to the links
    top = hits[0]
    if (top.get("name") or "").lower() == title.lower() or len(hits) == 1:
        await open_links(context, chat_id, "tv", top["id"], season, episode)
        return

    key = remember_list(context, f"{title} {tag}", hits)
    keyboard = [[InlineKeyboardButton(f"{hit_label(h)} · {tag}"[:60],
                                      callback_data=f"l|tv|{h['id']}|{season}|{episode}|q.{key}")] for h in hits]
    await show_page(context, chat_id, tmdb_image(top, wide=True),
                    f"🔎 Which series do you want <b>{tag}</b> of?", InlineKeyboardMarkup(keyboard))


# ---- title page ----

async def open_title(context, chat_id: int, media_type: str, tmdb_id: int, back: str = "", message=None):
    data = await tmdb(f"/{media_type}/{tmdb_id}")
    if not data:
        await context.bot.send_message(chat_id, "❌ Couldn't load that title. Try searching by name.")
        return

    title = data.get("title") or data.get("name") or "Untitled"
    year = year_of(data)
    rating = data.get("vote_average") or 0
    genres = ", ".join(g["name"] for g in data.get("genres", [])[:3])
    overview = data.get("overview") or ""
    if len(overview) > 450:
        overview = overview[:450].rsplit(" ", 1)[0] + "…"
    meta = [f"⭐ {rating:.1f}" if rating else "", genres]
    if media_type == "movie" and data.get("runtime"):
        meta.append(f"{data['runtime'] // 60}h {data['runtime'] % 60}m")
    if media_type == "tv":
        meta.append(f"{data.get('number_of_seasons', 0)} seasons")
    caption = (f"{TYPE_ICON[media_type]} <b>{esc(title)}</b>" + (f" ({year})" if year else "") + "\n"
               + esc(" · ".join(m for m in meta if m)) + "\n\n" + esc(overview))

    keyboard = []
    if media_type == "movie":
        keyboard.append([InlineKeyboardButton("⬇️ Download links", callback_data=f"l|movie|{tmdb_id}|0|0|{back}")])
    else:
        seasons = [s for s in data.get("seasons", []) if s.get("season_number", 0) > 0 and s.get("episode_count")]
        buttons = [InlineKeyboardButton(f"S{s['season_number']:02d}",
                                        callback_data=f"s|{tmdb_id}|{s['season_number']}|{back}") for s in seasons]
        keyboard += [buttons[i:i + 5] for i in range(0, len(buttons), 5)]
        caption += "\n\n<i>Choose a season:</i>" if seasons else "\n\n<i>No seasons listed yet.</i>"
    extra = []
    page = site_link(f"/title/{media_type}/{tmdb_id}")
    if page:
        extra.append(InlineKeyboardButton("🌐 Website", url=page))
    einthusan = einthusan_url(media_type, data)
    if einthusan:
        extra.append(InlineKeyboardButton("▶️ Einthusan", url=einthusan))
    if extra:
        keyboard.append(extra)
    b = back_button(back)
    if b:
        keyboard.append([b])

    await show_page(context, chat_id, tmdb_image(data), caption, InlineKeyboardMarkup(keyboard), message)


# ---- season → episodes ----

async def open_episodes(context, chat_id: int, tmdb_id: int, season: int, back: str = "", message=None):
    show = await tmdb(f"/tv/{tmdb_id}") or {}
    data = await tmdb(f"/tv/{tmdb_id}/season/{season}") or {}
    episodes = [e["episode_number"] for e in data.get("episodes", []) if e.get("episode_number")]
    keyboard = [[InlineKeyboardButton(f"📦 Full season {season}", callback_data=f"l|tv|{tmdb_id}|{season}|0|{back}")]]
    row = []
    for ep in episodes[:60]:
        row.append(InlineKeyboardButton(f"E{ep:02d}", callback_data=f"l|tv|{tmdb_id}|{season}|{ep}|{back}"))
        if len(row) == 6:
            keyboard.append(row)
            row = []
    if row:
        keyboard.append(row)
    keyboard.append([InlineKeyboardButton("« Seasons", callback_data=f"t|tv|{tmdb_id}|{back}")])
    caption = (f"📺 <b>{esc(show.get('name') or 'Series')}</b> — Season {season}\n"
               f"{len(episodes)} episodes. Pick one, or the full season.")
    image = tmdb_image(data) or tmdb_image(show)
    await show_page(context, chat_id, image, caption, InlineKeyboardMarkup(keyboard), message)


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
    return label, results, tmdb_image(data)


def max_size(season: int, episode: int) -> int:
    """Upper size limit for the short list: movie 25 GB, episode 10 GB, season pack 80 GB."""
    gb = 1024 ** 3
    return 10 * gb if episode else 80 * gb if season else 25 * gb


def short_quality(r) -> str:
    return r.quality if r.quality != "Unknown" else (r.rip or "Other")


def describe(r) -> str:
    bits = [r.quality if r.quality != "Unknown" else "", "/".join(r.languages), r.rip, r.codec, r.size]
    return " · ".join(b for b in bits if b and b != "Unknown")


async def open_links(context, chat_id: int, media_type: str, tmdb_id: int, season: int = 0, episode: int = 0,
                     back: str = "", message=None):
    """The links page for a movie / season / episode."""
    await show_loading(message)
    label, results, image = await find_links(media_type, tmdb_id, season, episode)
    best = pick_best(results, 5, max_size(season, episode))
    ref = f"{media_type}|{tmdb_id}|{season}|{episode}"

    # Files already in the Telegram library are sent as files (Option B pipeline)
    if media_type == "movie":
        await send_library_files(chat_id, context, db.search_by_tmdb_id(tmdb_id))
    elif season:
        await send_library_files(chat_id, context, db.search_by_tmdb_id(tmdb_id, season, episode))

    keyboard = []
    if best:
        def build(release_chars: int) -> str:
            lines = [f"⬇️ <b>{esc(label)}</b>\n"]
            for i, r in enumerate(best, 1):
                lines.append(f"<b>{i}.</b> {esc(describe(r))} · 🌱 {r.seeders}"
                             + (f"\n<i>{esc(r.title[:release_chars])}</i>" if release_chars else ""))
            if any(r.is_cam for r in best):
                lines.append("\n⚠️ <i>CAM = recorded in a cinema; poor picture and sound.</i>")
            lines.append("\nTap a link to open it in your torrent app.")
            return "\n".join(lines)
        caption = build(60)
        if len(caption) > 1024:  # photo captions max out at 1024 characters
            caption = build(0)
        for i, r in enumerate(best, 1):
            keyboard.append([InlineKeyboardButton(f"{i}. {short_quality(r)} · {r.size} · 🌱{r.seeders}"[:60],
                                                  url=magnet_page(r.info_hash, r.title))])
        keyboard.append([InlineKeyboardButton("📋 Copy magnets", callback_data=f"m|{ref}"),
                         InlineKeyboardButton("📄 Torrent files", callback_data=f"tf|{ref}")])
        page = site_link(f"/title/{media_type}/{tmdb_id}")
        if page and len(results) > len(best):
            keyboard.append([InlineKeyboardButton(f"➕ All {len(results)} links on the website", url=page)])
    else:
        caption = (f"😕 No download links found for <b>{esc(label)}</b> right now.\n"
                   "Tap <b>Send me the file here</b> and we'll try to get it for you.")
    keyboard.append([InlineKeyboardButton("📥 Send me the file here", callback_data=f"r|{ref}")])

    if media_type == "movie":
        keyboard.append([InlineKeyboardButton("« Back", callback_data=f"t|movie|{tmdb_id}|{back}")])
    else:
        keyboard.append([InlineKeyboardButton("« Episodes", callback_data=f"s|{tmdb_id}|{season}|{back}")])

    await show_page(context, chat_id, image, caption, InlineKeyboardMarkup(keyboard), message)


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


async def send_library_files(chat_id, context, rows, limit: int = 30):
    """Copy already-uploaded files from the storage channel into the chat."""
    for row in rows[:limit]:
        link = row[3] or ""
        try:
            parts = link.rstrip("/").split("/")
            await context.bot.copy_message(chat_id, from_chat_id=int(f"-100{parts[-2]}"), message_id=int(parts[-1]))
        except Exception as e:
            logging.warning(f"copy_message failed for {link}: {e}")



async def send_torrent_files(chat_id, context, media_type, tmdb_id, season, episode):
    """Send the .torrent file for each of the best links (from public caches)."""
    label, results, _ = await find_links(media_type, tmdb_id, season, episode)
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
    label, results, _ = await find_links(media_type, tmdb_id, season, episode)
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
        back = lambda n: parts[n] if len(parts) > n else ""
        if action == "t":                      # open a title page (in place)
            await query.answer()
            await open_title(context, chat_id, parts[1], int(parts[2]), back(3), message=query.message)

        elif action == "q":                    # back to a search result list
            page = list_page(context, parts[1])
            if not page:
                await query.answer("That list has expired — send the name again.", show_alert=True)
                return
            await query.answer()
            await show_page(context, chat_id, page[1], page[0], page[2], query.message)

        elif action == "tr":                   # /trending tab switch (also "back to trending")
            await switch_trending_tab(query, context, parts[1])

        elif action == "tr_new":               # "What's trending" button on the welcome message
            await query.answer()
            await trending(update, context)

        elif action == "s":                    # season -> episode picker (in place)
            await query.answer()
            await open_episodes(context, chat_id, int(parts[1]), int(parts[2]), back(3), message=query.message)

        elif action == "ss":                   # old "« Seasons" buttons
            await query.answer()
            await open_title(context, chat_id, "tv", int(parts[1]), message=query.message)

        elif action == "l":                    # links page for movie / season / episode (in place)
            await query.answer("Searching…")
            await open_links(context, chat_id, parts[1], int(parts[2]), int(parts[3]), int(parts[4]),
                             back(5), message=query.message)

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
    caption = ("🌐 <b>StreamBreaker website</b>\nBrowse movies and series, watch trailers, see where to stream, "
               "and get download links.\n\nYou can also tap the <b>🌐 Website</b> button next to the message box.")
    markup = InlineKeyboardMarkup([[InlineKeyboardButton("🌐 Open the website", url=url)]])
    try:  # the site's banner (same image as its link previews)
        await update.message.reply_photo(f"{url}/og-image.png", caption=caption, parse_mode=ParseMode.HTML,
                                         reply_markup=markup)
    except BadRequest as e:
        logging.warning(f"/website banner failed: {e}")
        await update.message.reply_text(caption, parse_mode=ParseMode.HTML, reply_markup=markup)


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
