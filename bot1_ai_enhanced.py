#!/usr/bin/env python3
"""
AI-Enhanced Telegram Bot 1 - User Interface Bot
Handles user interactions, searches cache, and requests downloads
"""
import os
import asyncio
import logging
import sqlite3
from pathlib import Path
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, CallbackQueryHandler, ContextTypes
from dotenv import load_dotenv
import aiohttp
from fuzzywuzzy import fuzz
import json
from ai_bot_integration import AIBotIntegration

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('bot1.log')
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

BOT1_TOKEN = os.getenv('BOT1_TOKEN')
CHANNEL_ID = os.getenv('CHANNEL_ID')
ADMIN_USER_ID = int(os.getenv('ADMIN_USER_ID', '0'))
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', 'your-openai-api-key-here')

# Database setup
DB_PATH = ROOT_DIR / 'movie_cache.db'
movie_cache = {}
pending_requests = {}

def init_database():
    """Initialize SQLite database for movie cache"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Drop existing table if it has wrong schema
    cursor.execute('DROP TABLE IF EXISTS movies')
    
    cursor.execute('''
        CREATE TABLE movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_name TEXT NOT NULL,
            message_id INTEGER NOT NULL,
            added_date TEXT NOT NULL,
            request_count INTEGER DEFAULT 1
        )
    ''')
    conn.commit()
    conn.close()
    logger.info("Database initialized")

def load_cache_from_db():
    """Load movie cache from database"""
    global movie_cache
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT movie_name, message_id FROM movies')
    rows = cursor.fetchall()
    for row in rows:
        movie_cache[row[0].lower()] = row[1]
    conn.close()
    logger.info(f"Loaded {len(movie_cache)} movies from cache")

def save_to_cache(movie_name: str, message_id: int):
    """Save movie to cache"""
    global movie_cache
    movie_cache[movie_name.lower()] = message_id
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO movies (movie_name, message_id, added_date, request_count)
        VALUES (?, ?, datetime('now'), 
                COALESCE((SELECT request_count FROM movies WHERE movie_name = ?), 0) + 1)
    ''', (movie_name, message_id, movie_name))
    conn.commit()
    conn.close()

# Initialize AI integration
ai_integration = AIBotIntegration(OPENAI_API_KEY)

class AIEnhancedBot1Handler:
    def __init__(self, app):
        self.app = app
        self.bot = app.bot
        
    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command"""
        welcome_text = (
            "🎬 <b>Welcome to AI-Enhanced Movie Bot!</b>\n\n"
            "🤖 <b>AI-Powered Features:</b>\n"
            "• Natural language movie search\n"
            "• Smart recommendations\n"
            "• Intelligent query understanding\n"
            "• Personalized suggestions\n\n"
            "🔍 <b>How to use:</b>\n"
            "• Just type a movie name\n"
            "• Ask for recommendations: 'I want a good action movie'\n"
            "• Find similar movies: 'Something like Inception'\n"
            "• Check trending: 'What's popular right now?'\n\n"
            "⚡ <b>Features:</b>\n"
            "• Instant delivery if available\n"
            "• Auto-download if not in library\n"
            "• Multiple quality options\n"
            "• AI-enhanced search\n\n"
            "📋 <b>Admin Commands:</b>\n"
            "• /stats - View bot statistics\n"
            "• /clear_cache - Clear movie cache\n"
            "• /ai_test <movie> - Test AI enhancement\n\n"
            "Just type your request to get started!"
        )
        await update.message.reply_text(welcome_text, parse_mode='HTML')
    
    async def admin_stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Admin command to show statistics"""
        user_id = update.effective_user.id
        if user_id != ADMIN_USER_ID:
            await update.message.reply_text("❌ Admin only command")
            return
        
        stats_text = (
            f"📊 <b>Bot Statistics</b>\n\n"
            f"📚 Cached Movies: {len(movie_cache)}\n"
            f"⏳ Pending Requests: {len(pending_requests)}\n"
            f"🤖 AI Enabled: {ai_integration.ai_enabled}\n"
            f"🔗 Bot 2 Status: {'🟢 Online' if await self._check_bot2_health() else '🔴 Offline'}\n"
        )
        await update.message.reply_text(stats_text, parse_mode='HTML')
    
    async def admin_clear_cache(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Admin command to clear cache"""
        user_id = update.effective_user.id
        if user_id != ADMIN_USER_ID:
            await update.message.reply_text("❌ Admin only command")
            return
        
        global movie_cache
        movie_cache.clear()
        
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('DELETE FROM movies')
            conn.commit()
            conn.close()
            await update.message.reply_text("✅ Cache cleared successfully")
        except Exception as e:
            await update.message.reply_text(f"❌ Error clearing cache: {e}")
    
    async def admin_ai_test(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Admin command to test AI integration"""
        user_id = update.effective_user.id
        if user_id != ADMIN_USER_ID:
            await update.message.reply_text("❌ Admin only command")
            return
        
        if not context.args:
            await update.message.reply_text("Usage: /ai_test <movie name>")
            return
        
        movie_name = ' '.join(context.args)
        enhancement = await ai_integration.enhance_search_request(
            movie_name, user_id, update.effective_user.username or "test"
        )
        
        result_text = (
            f"🤖 <b>AI Enhancement Test</b>\n\n"
            f"Original: {enhancement['original_query']}\n"
            f"AI Powered: {enhancement['ai_powered']}\n\n"
            f"Enhanced Queries:\n"
        )
        for query in enhancement['enhanced_queries'][:5]:
            result_text += f"• {query}\n"
        
        await update.message.reply_text(result_text, parse_mode='HTML')
    
    async def _check_bot2_health(self) -> bool:
        """Check if Bot 2 is running"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get('http://localhost:8002/health', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    return resp.status == 200
        except:
            return False


    async def admin_ai_test(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Admin command to test AI integration"""
        if update.effective_user.id != ADMIN_USER_ID:
            await update.message.reply_text("❌ Admin only command")
            return
            
        if not context.args:
            await update.message.reply_text("Usage: /ai_test <movie_name>")
            return
            
        movie_name = ' '.join(context.args)
        
        try:
            enhancement = await ai_integration.enhance_search_request(
                movie_name, update.effective_user.id, update.effective_user.username or "admin"
            )
            
            result_text = f"🤖 <b>AI Enhancement Test</b>\n\n"
            result_text += f"📝 Original: {movie_name}\n\n"
            result_text += f"🔍 Enhanced Queries:\n"
            for i, query in enumerate(enhancement['enhanced_queries'][:5], 1):
                result_text += f"{i}. {query}\n"
                
            result_text += f"\n🎯 Intent: {enhancement['intent_analysis']}\n"
            result_text += f"⚡ AI Enabled: {enhancement['ai_enabled']}"
            
            await update.message.reply_text(result_text, parse_mode='HTML')
            
        except Exception as e:
            await update.message.reply_text(f"❌ AI Test Failed: {str(e)}")

    async def torrent_search(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Search for torrent files"""
        if not context.args:
            await update.message.reply_text("Usage: /torrent <movie_name>")
            return
            
        movie_name = ' '.join(context.args)
        user_id = update.effective_user.id
        username = update.effective_user.username or "user"
        
        try:
            # Send initial message
            status_msg = await update.message.reply_text(f"🔍 Searching torrents for: {movie_name}...")
            
            # Request torrent download from Bot 2
            async with aiohttp.ClientSession() as session:
                payload = {
                    "movie_name": movie_name,
                    "user_id": user_id,
                    "username": username,
                    "request_time": asyncio.get_event_loop().time(),
                    "ai_enhanced": True
                }
                
                async with session.post(f"{BOT2_API_URL}/torrents", json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        
                        if result['success']:
                            # Update status message
                            torrent_info = "\n".join([
                                f"• {t['quality']} - {t['seeds']} seeds - {t['size']} - {t['source']}"
                                for t in result['torrents']
                            ])
                            
                            await status_msg.edit_text(
                                f"✅ <b>Found {len(result['torrents'])} torrent files:</b>\n\n"
                                f"{torrent_info}\n\n"
                                f"📁 Files are being uploaded to the channel...",
                                parse_mode='HTML'
                            )
                        else:
                            await status_msg.edit_text(f"❌ {result['message']}")
                    else:
                        await status_msg.edit_text("❌ Error connecting to download service")
                        
        except Exception as e:
            logger.error(f"Torrent search error: {e}")
            await update.message.reply_text(f"❌ Error searching torrents: {str(e)}")

    async def ai_enhanced_search_in_channel(self, movie_name: str, user_id: int, username: str):
        """Search for movie in channel with AI enhancement"""
        movie_name_lower = movie_name.lower().strip()
        
        # Check exact match first
        if movie_name_lower in movie_cache:
            return movie_cache[movie_name_lower]
        
        # Check fuzzy matches
        for cached_movie, message_id in movie_cache.items():
            if fuzz.ratio(movie_name_lower, cached_movie) > 80:
                logger.info(f"Fuzzy match found: {movie_name} -> {cached_movie}")
                return message_id
        
        # Try AI-enhanced search
        try:
            ai_enhancement = await ai_integration.enhance_search_request(movie_name, user_id, username)
            
            # Try each enhanced query
            for enhanced_query in ai_enhancement['enhanced_queries']:
                enhanced_lower = enhanced_query.lower().strip()
                if enhanced_lower in movie_cache:
                    logger.info(f"AI-enhanced match found: {enhanced_query}")
                    return movie_cache[enhanced_lower]
                
                # Try fuzzy match with enhanced query
                for cached_movie, message_id in movie_cache.items():
                    if fuzz.ratio(enhanced_lower, cached_movie) > 80:
                        logger.info(f"AI-enhanced fuzzy match: {enhanced_query} -> {cached_movie}")
                        return message_id
                        
        except Exception as e:
            logger.error(f"Error in AI-enhanced search: {e}")
            
        return None

    async def request_download(self, movie_name: str, user_id: int, username: str):
        """Request download from Bot 2"""
        try:
            ai_enhancement = await ai_integration.enhance_search_request(movie_name, user_id, username)
            
            async with aiohttp.ClientSession() as session:
                payload = {
                    "movie_name": movie_name,
                    "user_id": user_id,
                    "username": username,
                    "request_time": asyncio.get_event_loop().time(),
                    "ai_enhanced": True,
                    "enhanced_queries": ai_enhancement['enhanced_queries'],
                    "intent_analysis": ai_enhancement['intent_analysis']
                }
                
                async with session.post('http://localhost:8002/download', json=payload) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result.get('task_id')
                        
        except Exception as e:
            logger.error(f"Error requesting download: {e}")
            
        return None

    def _is_natural_language_query(self, text: str) -> bool:
        """Check if text is a natural language query"""
        natural_indicators = [
            'i want', 'i need', 'recommend', 'suggest', 'like', 'similar to',
            'good', 'best', 'popular', 'trending', 'new', 'latest'
        ]
        text_lower = text.lower()
        return any(indicator in text_lower for indicator in natural_indicators)

    async def handle_natural_language_query(self, update: Update, movie_name: str, user_id: int, username: str):
        """Handle natural language queries with AI"""
        try:
            ai_enhancement = await ai_integration.enhance_search_request(movie_name, user_id, username)
            
            if ai_enhancement['intent_analysis'] == 'recommendation':
                # Handle recommendation requests
                await update.message.reply_text(
                    f"🤖 <b>AI Recommendation</b>\n\n"
                    f"Based on your request: '{movie_name}'\n\n"
                    f"🎯 Intent: {ai_enhancement['intent_analysis']}\n"
                    f"🔍 I'll search for popular movies in that category...",
                    parse_mode='HTML'
                )
                
                # Try to find popular movies
                popular_movies = ['Inception', 'The Dark Knight', 'Interstellar', 'Avatar', 'Avengers']
                for popular in popular_movies:
                    message_id = await self.ai_enhanced_search_in_channel(popular, user_id, username)
                    if message_id:
                        await self.bot.forward_message(
                            chat_id=update.effective_chat.id,
                            from_chat_id=CHANNEL_ID,
                            message_id=message_id
                        )
                        return
                        
            # Fallback to regular search
            await self.handle_message(update, None)
            
        except Exception as e:
            logger.error(f"Error handling natural language query: {e}")
            await update.message.reply_text("❌ Error processing your request. Please try again.")

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming messages"""
        user_id = update.effective_user.id
        username = update.effective_user.username or update.effective_user.first_name
        movie_name = update.message.text.strip()
        
        if not movie_name:
            await update.message.reply_text("Please send a valid movie name.")
            return
        
        # Check if it's a natural language query
        if self._is_natural_language_query(movie_name):
            await self.handle_natural_language_query(update, movie_name, user_id, username)
            return
        
        # Regular movie search
        search_msg = await update.message.reply_text(
            f"🤖 AI-powered search for <b>{movie_name}</b>...\nPlease wait.",
            parse_mode='HTML'
        )
        
        # Search in cache
        message_id = await self.ai_enhanced_search_in_channel(movie_name, user_id, username)
        
        if message_id:
            try:
                await search_msg.edit_text(
                    f"✅ Found <b>{movie_name}</b>!\nSending...",
                    parse_mode='HTML'
                )
                await self.bot.forward_message(
                    chat_id=update.effective_chat.id,
                    from_chat_id=CHANNEL_ID,
                    message_id=message_id
                )
                await search_msg.delete()
            except Exception as e:
                logger.error(f"Error forwarding message: {e}")
                await search_msg.edit_text("❌ Error sending movie. Please try again.")
        else:
            # Not found in cache, request download
            await search_msg.edit_text(
                f"📥 <b>{movie_name}</b> not found in library.\n"
                f"🤖 AI is analyzing your request...\n"
                f"Requesting download from streaming sites...\n\n"
                f"This may take 10-30 minutes depending on availability.",
                parse_mode='HTML'
            )
            
            task_id = await self.request_download(movie_name, user_id, username)
            
            if task_id:
                pending_requests[task_id] = {
                    'user_id': user_id,
                    'chat_id': update.effective_chat.id,
                    'movie_name': movie_name,
                    'message_id': search_msg.message_id
                }
                logger.info(f"Download requested for {movie_name}, task_id: {task_id}")
            else:
                await search_msg.edit_text(
                    "❌ Download service is currently unavailable. Please try again later."
                )

    async def handle_callback_query(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle callback queries from inline keyboards"""
        query = update.callback_query
        await query.answer()
        
        # Handle any callback queries here
        await query.edit_message_text("✅ Action completed!")

def main():
    """Main function to start Bot 1"""
    if not BOT1_TOKEN:
        logger.error("BOT1_TOKEN not found in environment variables")
        return
        
    # Initialize database and cache
    init_database()
    load_cache_from_db()
    
    # Create application
    app = Application.builder().token(BOT1_TOKEN).build()
    handler = AIEnhancedBot1Handler(app)
    
    # Add handlers
    app.add_handler(CommandHandler("start", handler.start_command))
    app.add_handler(CommandHandler("clear_cache", handler.admin_clear_cache))
    app.add_handler(CommandHandler("stats", handler.admin_stats))
    app.add_handler(CommandHandler("ai_test", handler.admin_ai_test))
    app.add_handler(CommandHandler("torrent", handler.torrent_search))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handler.handle_message))
    app.add_handler(CallbackQueryHandler(handler.handle_callback_query))
    
    logger.info("AI-Enhanced Bot 1 (User Interface) started")
    logger.info(f"Channel ID: {CHANNEL_ID}")
    logger.info(f"Admin User ID: {ADMIN_USER_ID}")
    
    # Start the bot
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
