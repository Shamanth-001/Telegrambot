# Changelog - Telegram Movie Bot

## October 27, 2025 - Major Update: Torrent-First Priority System

### 🎯 New Features

#### 1. **Torrent-First Download Priority**
- **Changed:** Bot now checks torrents FIRST before streaming sites
- **Seed Threshold:** Increased from 5 → 15 seeders for better quality
- **Priority Logic:**
  - ✅ If ANY torrent has >15 seeders → Download .torrent files
  - ❌ If NO torrents with >15 seeders → Fallback to streaming sites
  
#### 2. **.torrent File Upload**
- Added `upload_torrent_to_channel()` method in BOT2
- .torrent files are uploaded to cache channel with metadata (quality, seeds, size)
- Users receive lightweight .torrent files for high-quality downloads

#### 3. **Smart Fallback System**
- If torrents don't have valid `torrent_url` field → Skip gracefully
- If no valid .torrent files downloaded → Automatically fallback to streaming
- No crashes, smooth error handling

### 🐛 Bug Fixes

#### 1. **Fixed Critical Torrent Download Bug**
- **Issue:** Bot would crash if torrent had `detail_url` but no `torrent_url`
- **Fix:** Added validation to check for valid `torrent_url` before downloading
- **Impact:** Prevents crashes from PirateBay/RARBG sources

#### 2. **Fixed Database Initialization Error**
- **Issue:** `table movies already exists` error on restart
- **Fix:** Changed to `CREATE TABLE IF NOT EXISTS` for safe initialization
- **Impact:** Bot can restart without database errors

#### 3. **Created Missing movie_scraper.py**
- **Issue:** BOT2 couldn't start due to missing `MovieScraper` module
- **Fix:** Created complete `movie_scraper.py` with streaming site support
- **Impact:** BOT2 now starts successfully

### 📚 Documentation Updates

#### 1. **README.md**
- Added new "Download Priority System" section
- Documented torrent-first approach (>15 seeders)
- Added troubleshooting for account changes
- Updated current status to "Fully Configured & Running"
- Clarified that secrets don't transfer between accounts

#### 2. **replit.md**
- Added "Recent Changes" section with all updates
- Updated cache miss flow diagram to show torrent-first logic
- Added "Important Notes for Account Changes" section
- Documented user preferences (torrent priority, seed threshold)

### 🔧 Technical Changes

#### Files Modified:
1. **bot2_ai_enhanced.py**
   - Implemented torrent-first download logic
   - Added torrent validation (check for valid `torrent_url`)
   - Added smart fallback to streaming if torrents fail
   - Added `upload_torrent_to_channel()` method

2. **final_working_torrent_downloader.py**
   - Changed `seed_threshold` from 5 → 15

3. **bot1_ai_enhanced.py**
   - Fixed database initialization with `CREATE TABLE IF NOT EXISTS`

4. **movie_scraper.py**
   - Created new file for streaming site scraping
   - Supports multiple sources (YTS, fmovies, einthusan, cataz, mkvcinemas)

### 📦 Dependencies
- All dependencies already installed (no changes needed)
- Python 3.11, FastAPI, Playwright, FFmpeg all configured

### ⚠️ Important for Account Changes

**If you transfer this project to a new Replit account:**
1. Secrets DO NOT transfer (security feature)
2. You must re-add these 4 secrets:
   - `BOT1_TOKEN`
   - `BOT2_TOKEN`
   - `CHANNEL_ID`
   - `ADMIN_USER_ID`
3. Bot will show clear error message if secrets are missing
4. Once secrets are added, workflow restarts automatically

### ✅ Current Status
- ✅ BOT1 running successfully
- ✅ BOT2 running on port 8002
- ✅ Database initialized
- ✅ All 4 secrets configured
- ✅ Torrent-first priority active
- ⚠️ AI features disabled (optional - add OPENAI_API_KEY to enable)

---

## How the Bot Works Now

### First Request (Cache Miss):
```
User: "Inception"
  ↓
BOT1 checks database → ❌ Not found
  ↓
BOT1 requests download from BOT2
  ↓
BOT2 searches torrents FIRST
  ↓
Found >15 seeders?
  ✅ YES → Download .torrent files → Upload to channel
  ❌ NO  → Search streaming sites → Download mp4 → Upload to channel
  ↓
BOT2 updates cache database
  ↓
User receives movie
```

### Next Request (Cache Hit):
```
User: "Inception"
  ↓
BOT1 checks database → ✅ Found!
  ↓
BOT1 forwards from cache channel (<1 second)
  ↓
User receives movie instantly
```

---

## Testing Checklist

- [x] BOT1 starts without errors
- [x] BOT2 starts without errors
- [x] Database initializes properly
- [x] Secrets loaded correctly
- [x] Torrent search works (>15 seeders threshold)
- [x] Fallback to streaming works
- [x] Error handling for missing torrent_url
- [x] Clear error messages for missing secrets
- [ ] Test actual movie request on Telegram (ready for user testing)

---

**Next Steps for User:**
1. Test the bot on Telegram with a movie request
2. Verify torrent-first priority is working
3. Check cache functionality with second request
4. (Optional) Add OPENAI_API_KEY for AI features
