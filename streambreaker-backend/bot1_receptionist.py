import os
import logging
import aiohttp
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ContextTypes, CommandHandler,
    MessageHandler, filters, CallbackQueryHandler
)
from dotenv import load_dotenv
from db_manager import DBManager
from bot_utils import format_size
from scraper import find_yts_links

load_dotenv()

BOT_TOKEN = os.getenv("BOT1_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_USER_ID"))
CHANNEL_ID = int(os.getenv("CHANNEL_ID"))
TMDB_KEY = os.getenv("TMDB_API_KEY")

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

db = DBManager()

# ============ TMDB LOOKUP ============

async def lookup_tmdb(media_type, tmdb_id):
    """Fetch movie/tv details from TMDB"""
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params={"api_key": TMDB_KEY}) as resp:
            if resp.status == 200:
                return await resp.json()
    return None

# ============ COMMANDS ============

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    db.track_user(user)

    # Deep link from StreamBreaker
    if context.args and len(context.args) > 0:
        payload = context.args[0]

        # Format: movie_12345 or tv_67890
        if '_' in payload:
            parts = payload.split('_', 1)
            media_type = parts[0]  # movie or tv
            tmdb_id = parts[1]

            await update.message.reply_text(
                "🔍 Looking up your selection..."
            )

            # 1. Check local DB by TMDB ID
            results = db.search_by_tmdb_id(int(tmdb_id))

            if results:
                await send_results(update, context, results)
                return

            # 2. Lookup on TMDB to get title
            tmdb_data = await lookup_tmdb(media_type, tmdb_id)

            if tmdb_data:
                title = tmdb_data.get('title') or tmdb_data.get('name', 'Unknown')
                year = (tmdb_data.get('release_date') or tmdb_data.get('first_air_date', ''))[:4]
                overview = tmdb_data.get('overview', '')
                rating = tmdb_data.get('vote_average', 0)
                poster = tmdb_data.get('poster_path', '')

                # 3. Search local DB by title
                results = db.search_media(title)
                if results:
                    await send_results(update, context, results)
                    return

                # 4. Not in library → try YTS for direct download links (movies only)
                yts_links = []
                if media_type == 'movie':
                    await update.message.reply_text("🔍 Searching for direct download links...")
                    yts_links = await find_yts_links(title, year)

                poster_url = f"https://image.tmdb.org/t/p/w500{poster}" if poster else None
                rating_stars = "⭐" * int(round(rating / 2)) if rating else ""
                req_type = 'movie' if media_type == 'movie' else 'series'

                if yts_links:
                    # Build quality buttons — each button opens the magnet link directly
                    keyboard = []
                    for link in yts_links:
                        seeds_label = f" 🌱{link['seeds']}" if link['seeds'] else ""
                        keyboard.append([
                            InlineKeyboardButton(
                                f"⬇️ {link['quality']}  •  {link['size']}{seeds_label}",
                                url=link['magnet']
                            )
                        ])
                    # Keep the "add to library" option underneath
                    keyboard.append([
                        InlineKeyboardButton(
                            "📥 Request to Library",
                            callback_data=f"request|{req_type}|{tmdb_id}|{title}|{year}"
                        )
                    ])

                    caption = (
                        f"🎬 **{title}** ({year})\n"
                        f"{rating_stars} {rating:.1f}/10\n\n"
                        f"{overview[:250]}{'...' if len(overview) > 250 else ''}\n\n"
                        f"📦 **Direct download links found!**\n"
                        f"Pick your quality below 👇"
                    )
                else:
                    # No YTS results — fallback to request-only
                    keyboard = [[
                        InlineKeyboardButton(
                            f"📥 Request {req_type.title()}",
                            callback_data=f"request|{req_type}|{tmdb_id}|{title}|{year}"
                        )
                    ]]
                    caption = (
                        f"🎬 **{title}** ({year})\n"
                        f"{rating_stars} {rating}/10\n\n"
                        f"{overview[:300]}{'...' if len(overview) > 300 else ''}\n\n"
                        f"❌ **Not in our library yet!**\n"
                        f"Click below to request it."
                    )

                if poster_url:
                    await update.message.reply_photo(
                        photo=poster_url,
                        caption=caption,
                        parse_mode='Markdown',
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )
                else:
                    await update.message.reply_text(
                        caption,
                        parse_mode='Markdown',
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )
                return
            else:
                await update.message.reply_text(
                    "❌ Could not find that content. Try searching by name!"
                )
                return

        # Legacy format: movie name with underscores
        else:
            query = payload.replace('_', ' ')
            await update.message.reply_text(f"🔍 Searching for: **{query}**", parse_mode='Markdown')
            update.message.text = query
            await handle_message(update, context)
            return

    # Normal /start - Welcome message
    stats = db.get_stats()
    await update.message.reply_text(
        f"👋 Welcome to **StreamBreaker Bot**, {user.first_name}!\n\n"
        f"📚 Our Library:\n"
        f"  🎬 {stats['movies']} Movies\n"
        f"  📺 {stats['episodes']} Episodes\n"
        f"  👥 {stats['users']} Users\n\n"
        f"Just send me a **movie or series name** to search!\n\n"
        f"🌐 Or discover content at:\n"
        f"{os.getenv('SITE_URL', 'https://streambreaker.netlify.app')}",
        parse_mode='Markdown'
    )

# ============ SEARCH HANDLER ============

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.message.text
    if not query:
        return

    user = update.effective_user
    db.track_user(user)

    # Search local DB
    results = db.search_media(query)

    if results:
        await send_results(update, context, results)
    else:
        # Not found - offer to request
        # Not in local library — try YTS for direct download links
        await update.message.reply_text(
            f"❌ '**{query}**' not in our library.\n🔍 Searching YTS for direct links...",
            parse_mode='Markdown'
        )

        yts_links = await find_yts_links(query)

        if yts_links:
            keyboard = []
            for link in yts_links:
                seeds_label = f" 🌱{link['seeds']}" if link['seeds'] else ""
                keyboard.append([
                    InlineKeyboardButton(
                        f"⬇️ {link['quality']}  •  {link['size']}{seeds_label}",
                        url=link['magnet']
                    )
                ])
            keyboard.append([
                InlineKeyboardButton("🎬 Request Movie", callback_data=f"search_req|movie|{query[:50]}"),
                InlineKeyboardButton("📺 Request Series", callback_data=f"search_req|series|{query[:50]}")
            ])
            await update.message.reply_text(
                f"📦 **Direct download links for '{query}':**\n"
                f"Pick your quality below 👇",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
        else:
            # YTS also returned nothing — fall back to request buttons
            keyboard = [[
                InlineKeyboardButton(
                    "🎬 Request Movie",
                    callback_data=f"search_req|movie|{query[:50]}"
                ),
                InlineKeyboardButton(
                    "📺 Request Series",
                    callback_data=f"search_req|series|{query[:50]}"
                )
            ]]
            await update.message.reply_text(
                f"❌ No results for '**{query}**' anywhere.\n\n"
                f"Would you like to request it?",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )


# ============ SEND RESULTS ============

async def send_results(update, context, results):
    for res in results:
        title, year, type_, link, quality, size = res
        formatted_size = format_size(size)

        try:
            # Extract channel ID and message ID from link
            parts = link.split('/')
            msg_id = int(parts[-1])
            chat_id_str = parts[-2]
            from_chat_id = int(f"-100{chat_id_str}")

            await context.bot.copy_message(
                chat_id=update.effective_chat.id,
                from_chat_id=from_chat_id,
                message_id=msg_id
            )
        except Exception as e:
            logging.error(f"Copy failed: {e}")
            # Fallback to text
            msg = (
                f"🎬 **{title}** ({year})\n"
                f"💿 Quality: {quality}\n"
                f"📦 Size: {formatted_size}\n\n"
                f"Search for it in the bot to get it!"
            )
            await update.effective_message.reply_text(
                msg, parse_mode='Markdown'
            )

# ============ BUTTON HANDLERS ============

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data.split('|')
    action = data[0]

    # Direct request from StreamBreaker deep link
    if action == "request":
        req_type = data[1]      # movie or series
        tmdb_id = data[2]
        title = data[3]
        year = data[4]
        user = query.from_user

        success = db.add_request(
            user_id=user.id,
            title=title,
            year=year,
            media_type=req_type,
            tmdb_id=int(tmdb_id),
            username=user.username
        )

        if success:
            await query.edit_message_caption(
                caption=(
                    f"✅ **{title}** ({year}) has been requested!\n\n"
                    f"📥 Status: **Queued for download**\n"
                    f"⏳ You'll be notified when it's ready.\n\n"
                    f"_Your request has been sent to the admin._"
                ),
                parse_mode='Markdown'
            )

            # Notify admin
            try:
                await context.bot.send_message(
                    chat_id=ADMIN_ID,
                    text=(
                        f"📥 **New Request!**\n\n"
                        f"👤 User: @{user.username or user.first_name} ({user.id})\n"
                        f"🎬 Title: **{title}** ({year})\n"
                        f"📂 Type: {req_type}\n"
                        f"🔗 TMDB: https://www.themoviedb.org/{req_type}/{tmdb_id}"
                    ),
                    parse_mode='Markdown'
                )
            except Exception as e:
                logging.error(f"Admin notify failed: {e}")
        else:
            await query.edit_message_caption(
                caption=(
                    f"⚠️ **{title}** was already requested!\n\n"
                    f"⏳ It's in the queue. Please wait."
                ),
                parse_mode='Markdown'
            )

    # Search-based request (user typed name, not found)
    elif action == "search_req":
        req_type = data[1]
        search_term = data[2]
        user = query.from_user

        await query.edit_message_text(
            f"🔍 Searching TMDB for '{search_term}'..."
        )

        # Search TMDB
        async with aiohttp.ClientSession() as session:
            endpoint = 'movie' if req_type == 'movie' else 'tv'
            async with session.get(
                f"https://api.themoviedb.org/3/search/{endpoint}",
                params={"api_key": TMDB_KEY, "query": search_term}
            ) as resp:
                tmdb_data = await resp.json()

        results = tmdb_data.get('results', [])
        if not results:
            await query.edit_message_text(
                f"❌ No results found on TMDB for '{search_term}'.\n"
                f"Try a different spelling!"
            )
            return

        # Show top 5 results
        keyboard = []
        for item in results[:5]:
            title = item.get('title') or item.get('name', 'Unknown')
            year = (item.get('release_date') or item.get('first_air_date', ''))[:4]
            tmdb_id = item.get('id')
            display = f"{title} ({year})" if year else title
            keyboard.append([
                InlineKeyboardButton(
                    display,
                    callback_data=f"confirm_req|{req_type}|{tmdb_id}|{title[:30]}|{year}"
                )
            ])

        await query.edit_message_text(
            f"Select the correct {req_type}:",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

    # Confirm request after selection
    elif action == "confirm_req":
        req_type = data[1]
        tmdb_id = data[2]
        title = data[3]
        year = data[4]
        user = query.from_user

        success = db.add_request(
            user_id=user.id,
            title=title,
            year=year,
            media_type=req_type,
            tmdb_id=int(tmdb_id),
            username=user.username
        )

        if success:
            await query.edit_message_text(
                f"✅ **{title}** ({year}) has been requested!\n\n"
                f"📥 Status: Queued for download\n"
                f"⏳ You'll be notified when it's ready.",
                parse_mode='Markdown'
            )

            # Notify admin
            try:
                await context.bot.send_message(
                    chat_id=ADMIN_ID,
                    text=(
                        f"📥 **New Request!**\n\n"
                        f"👤 @{user.username or user.first_name} ({user.id})\n"
                        f"🎬 **{title}** ({year})\n"
                        f"📂 Type: {req_type}\n"
                        f"🔗 TMDB: https://www.themoviedb.org/{req_type}/{tmdb_id}"
                    ),
                    parse_mode='Markdown'
                )
            except Exception as e:
                logging.error(f"Admin notify failed: {e}")
        else:
            await query.edit_message_text(
                f"⚠️ **{title}** was already requested!\n"
                f"⏳ It's in the queue.",
                parse_mode='Markdown'
            )

# ============ ADMIN COMMANDS ============

async def admin_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("❌ Admin only.")
        return

    stats = db.get_stats()
    await update.message.reply_text(
        f"📊 **StreamBreaker Stats**\n\n"
        f"🎬 Movies: {stats['movies']}\n"
        f"📺 Episodes: {stats['episodes']}\n"
        f"📚 Total Media: {stats['total_media']}\n"
        f"👥 Users: {stats['users']}\n"
        f"📥 Pending Requests: {stats['pending_requests']}",
        parse_mode='Markdown'
    )

async def admin_requests(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("❌ Admin only.")
        return

    pending = db.get_pending_requests()
    if not pending:
        await update.message.reply_text("✅ No pending requests!")
        return

    msg = "📥 **Pending Requests:**\n\n"
    for req in pending[:20]:
        req_id, user_id, username, title, year, media_type, tmdb_id, requested_at = req
        msg += (
            f"**{title}** ({year}) - {media_type}\n"
            f"  👤 @{username or user_id}\n"
            f"  📅 {requested_at[:16]}\n\n"
        )

    await update.message.reply_text(msg, parse_mode='Markdown')

async def admin_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        return

    await update.message.reply_text(
        "🔧 **Admin Commands:**\n\n"
        "/stats - Bot statistics\n"
        "/requests - Pending download requests\n"
        "/help - This message",
        parse_mode='Markdown'
    )

async def recommend(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = ' '.join(context.args) if context.args else None

    if not query:
        await update.message.reply_text(
            "🎬 **AI Movie Recommender**\n\n"
            "Tell me what you like!\n\n"
            "Examples:\n"
            "/recommend movies like Inception\n"
            "/recommend feel-good comedy for date night\n"
            "/recommend best Indian thriller series",
            parse_mode='Markdown'
        )
        return

    await update.message.reply_text("🤖 Thinking...")

    prompt = (
        f"The user wants movie/series recommendations: '{query}'\n\n"
        f"Suggest exactly 5 titles. For each, give:\n"
        f"- Title (Year)\n"
        f"- One-line reason why they'd love it\n"
        f"- A mood emoji\n\n"
        f"Be concise and fun."
    )

    gemini_key = os.getenv("GEMINI_API_KEY")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": 500, "temperature": 0.9}
            }) as resp:
                data = await resp.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "No response")

        await update.message.reply_text(
            f"🎬 **AI Recommendations:**\n\n{text}",
            parse_mode='Markdown'
        )
    except Exception as e:
        await update.message.reply_text("❌ Gemini AI is busy. Try again!")

# ============ MAIN ============

application = ApplicationBuilder().token(BOT_TOKEN).build()

application.add_handler(CommandHandler('start', start))
application.add_handler(CommandHandler('recommend', recommend))
application.add_handler(CommandHandler('stats', admin_stats))
application.add_handler(CommandHandler('requests', admin_requests))
application.add_handler(CommandHandler('help', admin_help))

application.add_handler(MessageHandler(
    filters.TEXT & (~filters.COMMAND),
    handle_message
))

application.add_handler(CallbackQueryHandler(button_handler))

if __name__ == '__main__':
    print("✅ StreamBreaker Bot is running!")
    application.run_polling(drop_pending_updates=True)
