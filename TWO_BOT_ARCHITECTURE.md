# 🎬 Two-Bot Movie Cache Architecture

## 🎯 **Overview**
A sophisticated two-bot system that provides instant movie delivery through intelligent caching. Users get movies instantly if cached, or automatic download if not available.

## 🏗️ **Architecture**

### **Bot A: Downloader Bot** (Background Worker)
- **Purpose**: Downloads and converts movies in the background
- **Responsibilities**:
  - Processes download requests from API Bot
  - Searches torrents and streaming sources
  - Downloads/converts movies to MKV format
  - Uploads to private cache channel
  - Updates movie database
  - Manages download queue

### **Bot B: API Bot** (User Interface)
- **Purpose**: Handles user interactions and instant delivery
- **Responsibilities**:
  - Receives user search requests
  - Checks cache database for instant delivery
  - Sends cached movies instantly
  - Requests downloads for new movies
  - Provides user feedback and status updates

### **Private Channel** (File Storage)
- **Purpose**: Telegram-hosted file cache
- **Features**:
  - Stores all downloaded MKV files
  - 24-hour automatic cleanup
  - High-capacity "free" hosting via Telegram
  - Only Downloader Bot can upload files

## 🚀 **User Experience Flow**

```
1. User: /search KGF 2
   ↓
2. API Bot: Checks cache database
   ↓
3a. Cache Hit: Instant delivery! ⚡
   OR
3b. Cache Miss: Request download
   ↓
4. Downloader Bot: Downloads movie
   ↓
5. Upload to cache channel
   ↓
6. Update database
   ↓
7. Notify user: Movie ready!
   ↓
8. Next request: Instant delivery! ⚡
```

## 📁 **File Structure**

```
src/
├── movieCache.js           # SQLite database for movie index
├── downloaderBot.js        # Bot A - Background downloader
├── apiBot.js              # Bot B - User interface
├── movieCacheSystem.js    # System orchestrator
├── botConfig.js           # Configuration management
└── startMovieCacheSystem.js # Main entry point
```

## ⚙️ **Setup Instructions**

### **1. Create Telegram Bots**
```bash
# Create Downloader Bot (Bot A)
@BotFather -> /newbot -> "Movie Downloader Bot" -> "movie_downloader_bot"

# Create API Bot (Bot B)  
@BotFather -> /newbot -> "Movie Cache Bot" -> "movie_cache_bot"
```

### **2. Create Private Channel**
```bash
# Create private channel
Telegram -> New Channel -> Private -> "Movie Cache Storage"

# Add both bots as admins
# Set "Only admins can post" = true
```

### **3. Get Channel ID**
```bash
# Forward any message from channel to @userinfobot
# Copy the channel ID (starts with -100)
```

### **4. Environment Variables**
```bash
# .env file
DOWNLOADER_BOT_TOKEN=your_downloader_bot_token
API_BOT_TOKEN=your_api_bot_token
CACHE_CHANNEL_ID=-1001234567890
DOWNLOADER_BOT_CHAT_ID=your_chat_id_for_bot_communication
ADMIN_USER_ID=your_telegram_user_id
```

### **5. Install Dependencies**
```bash
npm install better-sqlite3
```

### **6. Start System**
```bash
node src/startMovieCacheSystem.js
```

## 🎮 **Commands**

### **User Commands (API Bot)**
- `/search <movie>` - Search and get movie
- `/status` - Check cache statistics  
- `/help` - Show help

### **Admin Commands**
- `/admin stats` - System statistics
- `/admin cleanup` - Manual cache cleanup

## 💾 **Database Schema**

```sql
CREATE TABLE movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  file_id TEXT NOT NULL,
  message_id INTEGER,
  channel_id TEXT,
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_size INTEGER,
  source_type TEXT, -- 'torrent', 'streaming', 'direct'
  source_url TEXT,
  expires_at DATETIME,
  UNIQUE(title)
);
```

## 🔄 **Cache Management**

### **Automatic Cleanup**
- **Frequency**: Every 6 hours
- **TTL**: 24 hours per movie
- **Action**: Removes expired movies from channel and database

### **Cache Statistics**
- Total movies cached
- Active (not expired) movies
- Expired movies pending cleanup
- Download queue status

## 🎯 **Key Features**

### **Instant Delivery**
- Cached movies delivered in <1 second
- No waiting time for popular movies
- Seamless user experience

### **Automatic Download**
- New movies automatically downloaded
- Queue management for multiple requests
- Background processing

### **Smart Caching**
- 24-hour TTL for optimal storage usage
- Automatic cleanup prevents storage bloat
- Popular movies stay cached longer

### **High Availability**
- Telegram's infrastructure for file hosting
- No server storage requirements
- Scalable to thousands of movies

## 📊 **Performance Metrics**

| Metric | Value |
|--------|-------|
| Cache Hit Delivery | <1 second |
| New Movie Download | 10-30 minutes |
| Cache TTL | 24 hours |
| Max Concurrent Downloads | 3 |
| Cleanup Frequency | Every 6 hours |

## 🔧 **Integration with Existing Code**

The system integrates with your existing modules:
- `searchTorrents()` - For torrent searching
- `searchEinthusan()` - For streaming sources
- `fetchPosterForTitle()` - For movie posters
- Existing conversion logic - For HLS/streaming conversion

## 🚀 **Benefits**

1. **Instant User Experience**: Cached movies delivered immediately
2. **Automatic Scaling**: Popular movies stay cached, new ones downloaded on-demand
3. **Cost Effective**: Uses Telegram's free file hosting
4. **Reliable**: Telegram's infrastructure ensures high availability
5. **Maintainable**: Clean separation of concerns between bots
6. **Scalable**: Can handle thousands of movies and users

## 🎬 **Perfect For**

- **Movie Groups**: Instant sharing of popular movies
- **Personal Use**: Quick access to favorite movies
- **Content Creators**: Reliable movie delivery system
- **Communities**: Shared movie library with instant access

This architecture transforms your movie bot from a "download-on-demand" system to an "instant-delivery" system, dramatically improving user experience while maintaining all existing functionality.

