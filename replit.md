# AI-Enhanced Telegram Movie Bot (Python)

## Project Overview
A sophisticated two-tier Telegram bot system that delivers movies instantly through intelligent caching and AI-powered search. Users get movies in <1 second if cached, or automatic download if not available.

## Current State
- **Status**: Ready for setup (requires configuration)
- **Python Version**: 3.11
- **Architecture**: Two-tier bot system (BOT1 + BOT2)
- **Main Entry Point**: `run_both_bots.py`

## Two-Tier Architecture

### BOT1 (User Interface Bot)
- Receives user requests via Telegram
- Checks movie cache database (SQLite)
- Delivers cached movies instantly (<1 second)
- Requests downloads from BOT2 for new movies
- AI-powered natural language understanding (optional)

### BOT2 (Downloader API Bot)
- FastAPI server running on port 8002
- Downloads movies from 5+ streaming sources
- Handles torrent downloads
- Uploads movies to private Telegram channel
- Updates cache database
- Background processing with queue management

### Private Channel (Storage)
- Telegram-hosted unlimited file storage
- All downloaded movies cached here
- Only bots have access as administrators
- Free, reliable, and scalable

## Key Features

### 🤖 AI-Powered Intelligence (Optional)
- Natural language search: "I want a good action movie"
- Smart title matching and typo correction
- Personalized recommendations
- Intent analysis and context awareness
- Requires OpenAI API key (optional feature)

### ⚡ Lightning-Fast Delivery
- <1 second delivery for cached movies
- SQLite database with fuzzy matching
- Telegram channel as unlimited storage
- 24/7 availability without server storage

### 🌐 Multi-Source Downloads
Downloads from 5+ streaming platforms:
1. **fmovies** - International movies & TV shows
2. **cataz** - Multi-language content
3. **einthusan** - South Indian movies
4. **mkvcinemas** - Bollywood & regional cinema
5. **ytstv** - High-quality torrents

Plus YTS torrent API with quality preferences

### 🛡️ Anti-Bot Bypass
- Playwright headless browser automation
- Cloudflare bypass capabilities
- Session management and stealth mode

### 🎥 Video Processing
- FFmpeg integration for format conversion
- Quality selection (1080p, 720p, 480p)
- Automatic metadata extraction

## Required Environment Variables

### Telegram Configuration (Required)
```bash
BOT1_TOKEN=<your_bot1_token>          # From @BotFather
BOT2_TOKEN=<your_bot2_token>          # From @BotFather
CHANNEL_ID=<your_channel_id>          # Private channel ID (starts with -100)
ADMIN_USER_ID=<your_telegram_user_id> # Your Telegram user ID
```

### API Configuration (Optional)
```bash
OPENAI_API_KEY=<your_openai_key>      # For AI features (optional)
BOT2_API_URL=http://localhost:8002     # BOT2 API endpoint (default)
```

### Download Configuration (Optional)
```bash
DOWNLOAD_DIR=./downloads              # Temporary download directory
MAX_CONCURRENT_DOWNLOADS=5            # Parallel downloads
```

## Setup Instructions

### 1. Create Telegram Bots
1. Message @BotFather on Telegram
2. Create BOT1: `/newbot` → Name it "Movie Bot" → Get token
3. Create BOT2: `/newbot` → Name it "Movie Downloader" → Get token
4. Save both tokens

### 2. Create Private Channel
1. Create a private channel in Telegram
2. Add both bots as administrators with these permissions:
   - Post messages
   - Edit messages  
   - Delete messages
   - Manage channel
3. Forward any message from channel to @userinfobot
4. Copy the channel ID (starts with -100)

### 3. Get Your Admin User ID
1. Message @userinfobot on Telegram
2. Copy your user ID

### 4. Configure Secrets
Add to Replit Secrets:
- `BOT1_TOKEN`: Your first bot token
- `BOT2_TOKEN`: Your second bot token
- `CHANNEL_ID`: Your channel ID
- `ADMIN_USER_ID`: Your user ID
- `OPENAI_API_KEY`: (Optional) Your OpenAI API key

### 5. Install Dependencies (Already Done)
```bash
pip install -r requirements.txt
playwright install chromium
```

### 6. Run the Bot System
The workflow is already configured to run:
```bash
python3 run_both_bots.py
```

## Project Structure
```
.
├── bot1_ai_enhanced.py          # BOT1: User interface, cache checking
├── bot2_ai_enhanced.py          # BOT2: Downloader API, file processing
├── run_both_bots.py             # Launcher: Runs both bots simultaneously
│
├── ai_bot_integration.py        # AI integration layer
├── ai_movie_enhancer.py         # AI-powered movie search & recommendations
│
├── final_working_torrent_downloader.py  # Torrent download system
├── video_processor.py           # FFmpeg video processing
│
├── requirements.txt             # Python dependencies
├── .env                         # Environment variables (git-ignored)
├── movie_cache.db              # SQLite database (auto-created)
│
├── README.md                    # Comprehensive documentation
├── TWO_BOT_ARCHITECTURE.md      # Architecture details
├── AI_INTEGRATION_README.md     # AI features documentation
└── INTEGRATION_COMPLETE.md      # Torrent integration docs
```

## User Commands

### Basic Commands
- Just type a movie name: "Inception"
- Natural language (with AI): "I want a good sci-fi movie"
- Torrent search: `/torrent <movie_name>`

### Admin Commands
- `/start` - Welcome message & bot introduction
- `/stats` - View cache statistics & bot metrics
- `/clear_cache` - Clear entire movie cache (admin only)
- `/ai_test <movie>` - Test AI enhancement on movie title

## How It Works

### Cache Hit (Instant Delivery)
```
User sends "Inception"
  ↓
BOT1 checks database
  ↓
✅ Match found!
  ↓
BOT1 forwards from cache channel
  ↓
User receives movie (<1 second)
```

### Cache Miss (New Download)
```
User sends "New Movie"
  ↓
BOT1 checks database → ❌ Not found
  ↓
BOT1 sends request to BOT2 API
  ↓
BOT2 searches torrents FIRST
  ↓
✅ >15 seeders? → Download .torrent files → Upload to channel
  ↓
❌ <15 seeders? → Search streaming sites → Download mp4 → Upload to channel
  ↓
BOT2 updates database
  ↓
User receives movie (.torrent or mp4)
  ↓
Next user → Instant delivery!
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Cache Hit Delivery | <1 second |
| New Download (Streaming) | 5-15 minutes |
| New Download (Torrent) | 10-30 minutes |
| Database Lookups | <50ms |
| Concurrent Downloads | Up to 5 |

## Dependencies

All dependencies are installed via pip:
- **Core**: fastapi, uvicorn, pydantic, python-telegram-bot
- **Web Scraping**: playwright, beautifulsoup4, aiohttp, requests
- **Video**: yt-dlp, ffmpeg-python
- **AI**: langchain, langchain-openai, openai
- **Utilities**: fuzzywuzzy, python-Levenshtein, python-dotenv

## Recent Changes
- ✅ **NEW DOWNLOAD PRIORITY**: Torrents checked FIRST (>15 seeders), then streaming fallback
- ✅ Seed threshold increased from 5 to 15 for better quality
- ✅ Added .torrent file upload to cache channel
- ✅ Fixed critical bug: handle torrents without valid torrent_url
- ✅ Cleaned up Node.js implementation (removed bot.js, src/)
- ✅ Project now Python-only with two-tier architecture
- ✅ All dependencies installed and ready

## Next Steps
1. Configure Replit Secrets with bot tokens and channel ID
2. Test the bot system
3. (Optional) Add OpenAI API key for AI features
4. Start using the bot!

## Known Limitations
- Playwright streaming requires system dependencies
- AI features require OpenAI API key (optional)
- Telegram file size limit: 2GB per file

## Monitoring
- BOT1 logs: `bot1.log`
- BOT2 logs: `bot2.log`
- Combined logs: `bots.log`
- Health check: `http://localhost:8002/health`

## User Preferences
- **Download Priority**: Torrent-first system (>15 seeders required)
- **Seed Threshold**: 15 seeders minimum for torrent downloads
- **Fallback Strategy**: Streaming sites if torrents have <15 seeders

## Important Notes for Account Changes
**If you transfer this project to a new Replit account:**
1. Secrets DO NOT transfer automatically (security feature)
2. You must re-add these 4 secrets in the new account:
   - BOT1_TOKEN
   - BOT2_TOKEN
   - CHANNEL_ID
   - ADMIN_USER_ID
3. The bot will automatically detect missing secrets and show clear error messages
4. Once secrets are added, the workflow will restart automatically
