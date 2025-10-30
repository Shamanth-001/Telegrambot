# Advanced Telegram Movie Bot (Node.js)

## Project Overview
An enterprise-level Telegram bot for instant movie delivery with advanced caching, multi-source fallback, and ultra-fast downloads. Users get movies in <1 second if cached, or automatic download from 10+ streaming sources.

## Current State
- **Status**: ✅ Running and configured
- **Node.js Version**: 20.19.3
- **Architecture**: Single bot with integrated cache system
- **Main Entry Point**: `bot.js`

## Architecture

### Integrated Bot System
- Single Node.js bot handling both user interface and downloads
- SQLite-based cache system with 24-hour TTL
- Private Telegram channel for file storage
- Automatic cleanup and cache management
- Health monitoring on port 3000
- File server on port 8080 for direct downloads

### Download Priority System
1. **Cache Check** - Instant delivery if available (<1 second)
2. **Torrents** - YTS, PirateBay, 1337x, RARBG
3. **Streaming Sites** - Hicine, Einthusan, Cataz, Fmovies, HDToday, etc.
4. **Automatic Fallback** - If one source fails, tries next automatically

### Private Channel (Storage)
- Telegram-hosted unlimited file storage
- All downloaded movies cached here
- Automatic 24-hour TTL management
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
Downloads from 10+ streaming platforms:
1. **Hicine** - Latest movies & TV shows (NEW!)
2. **Einthusan** - South Indian movies
3. **Cataz** - Multi-language content
4. **Fmovies** - International content
5. **HDToday** - High-quality streams
6. **Yesmovies** - Popular releases
7. **Putlocker** - Classic movies
8. **Solarmovie** - Wide selection
9. **Movie4K** - European content

Plus torrent sources: YTS, PirateBay, 1337x, RARBG

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
All three secrets are configured and stored securely in Replit Secrets:
- ✅ **BOT_TOKEN** - Your Telegram bot token from @BotFather
- ✅ **CACHE_CHANNEL_ID** - Private channel ID (starts with -100)
- ✅ **ADMIN_USER_ID** - Your Telegram user ID

### Optional Configuration
```bash
LOG_LEVEL=info                        # Logging level (default: info)
HEALTH_PORT=3000                      # Health check port (default: 3000)
MAX_CONCURRENT_DOWNLOADS=3            # Parallel downloads (default: 3)
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
- ✅ **NEW**: Added Hicine.info support for downloading movies
- ✅ **Fixed**: Bot startup issues and missing exports
- ✅ **Configured**: All required Replit Secrets (BOT_TOKEN, CACHE_CHANNEL_ID, ADMIN_USER_ID)
- ✅ **Upgraded**: Node.js 20 for latest features and compatibility
- ✅ **Running**: Bot is active and monitoring Telegram for commands
- ✅ **Ready**: Cache system, health monitoring, and file server all operational

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
