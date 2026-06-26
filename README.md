# 🎬 Advanced Telegram Movie Bot

[![Node.js](https://img.shields.io/badge/Node.js-18.17.0+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-blue.svg)](https://t.me/)

> **Enterprise-level Telegram bot for instant movie delivery with advanced caching, multi-source fallback, and ultra-fast downloads.**

## 🚀 **Key Features**

### **⚡ Instant Delivery**
- **<1 second** delivery for cached movies
- **SQLite caching system** with 24-hour TTL
- **Automatic cleanup** prevents storage bloat
- **Smart cache management** with statistics

### **🎯 Multi-Source Fallback**
- **Torrents** → **Streaming** → **Einthusan** → **Cataz**
- **10+ streaming sources** with automatic failover
- **WebTorrent + FFmpeg** for torrent processing
- **Puppeteer + HLS capture** for streaming

### **🛡️ Anti-Detection Systems**
- **Stealth plugins** for browser automation
- **Proxy support** with rotation
- **Session persistence** across requests
- **Advanced popup handling**

### **⚡ Ultra-Fast Downloads**
- **50 concurrent connections** for maximum speed
- **Timeout protection** prevents stuck downloads
- **Real-time progress tracking**
- **Multiple download methods** with fallback

## 🏗️ **Architecture**

### **Two-Bot System**
```
┌─────────────────┐    ┌─────────────────┐
│   API Bot       │    │ Downloader Bot  │
│ (User Interface)│    │(Background Worker)│
│                 │    │                 │
│ • User commands │    │ • Downloads     │
│ • Cache lookup  │    │ • Processing    │
│ • Instant send  │    │ • Upload to cache│
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌─────────────────┐
         │ Private Channel  │
         │ (File Storage)   │
         │ • 24h TTL       │
         │ • Auto cleanup  │
         └─────────────────┘
```

### **File Structure**
```
src/
├── bot/
│   ├── index.js              # Main bot logic
│   ├── apiBot.js             # User interface bot
│   └── downloaderBot.js      # Background downloader
├── services/
│   ├── cacheManager.js       # SQLite cache management
│   ├── automatedStreamDownloader.js
│   └── queueManager.js       # Download queue
├── extractors/
│   ├── einthusan.js          # Einthusan integration
│   ├── cataz.js               # Cataz integration
│   └── fmovies.js             # Fmovies integration
└── utils/
    ├── logger.js              # Advanced logging
    ├── poster.js              # Movie poster fetching
    └── status.js              # Status monitoring
```

## 🎮 **User Experience**

### **First Request (Cache Miss)**
```
User: /search "KGF 2"
Bot: 🔍 Searching for: KGF 2
     ⏳ Checking sources...
     🔄 Searching torrents...
     ✅ Found torrent for: KGF 2
     📥 Downloading and converting...
     ✅ Downloaded and Cached!
     🎬 KGF 2
     💾 Cached for 24 hours
     ⚡ Future requests will be instant!
```

### **Subsequent Requests (Cache Hit)**
```
User: /search "KGF 2"
Bot: 🎬 KGF 2
     ⚡ Instant Delivery!
     📁 Cached: 2024-01-15 10:30:00
     💾 Source: torrent
```

## 📊 **Performance Metrics**

| Metric | Value |
|--------|-------|
| **Cache Hit Delivery** | <1 second |
| **New Movie Download** | 10-30 minutes |
| **Cache TTL** | 24 hours |
| **Max Concurrent Downloads** | 3 |
| **Cleanup Frequency** | Every 6 hours |
| **Concurrent Connections** | 50 |
| **Download Speed** | Ultra-fast with timeout protection |

## 🛠️ **Installation**

### **Prerequisites**
- Node.js 18.17.0+
- FFmpeg
- Python 3.8+ (for some tools)

### **Quick Start**
```bash
# Clone the repository
git clone https://github.com/Shamanth-001/Telegrambot.git
cd Telegrambot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your bot tokens and settings

# Start the bot
npm start
```

### **Environment Configuration**
```bash
# Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_API_TOKEN=your_api_bot_token
CACHE_CHANNEL_ID=-1001234567890

# Optional Settings
PROXY_URL=http://proxy:port
LOG_LEVEL=info
MAX_CONCURRENT_DOWNLOADS=3
```

## 🎯 **Commands**

### **User Commands**
- `/search <movie>` - Search and download movie
- `/cache <movie>` - Check cache status
- `/status` - Bot status and statistics
- `/help` - Show available commands

### **Admin Commands**
- `/cache-cleanup` - Manual cache cleanup
- `/cache-stats` - Detailed cache statistics
- `/system-status` - System health check

## 🔧 **Advanced Features**

### **Smart Caching**
- **Automatic TTL management** (24 hours)
- **Duplicate prevention** during downloads
- **Local file cleanup** after upload
- **Cache statistics** and monitoring

### **Error Handling**
- **Graceful fallbacks** between sources
- **Retry mechanisms** with exponential backoff
- **Timeout protection** prevents stuck downloads
- **Comprehensive logging** for debugging

### **Security**
- **Rate limiting** to prevent abuse
- **Input validation** for all commands
- **Secure token management**
- **Proxy rotation** for anonymity

## 📈 **Monitoring & Analytics**

### **Built-in Monitoring**
- **Real-time progress tracking**
- **Download queue status**
- **Cache hit/miss ratios**
- **Error rate monitoring**
- **Performance metrics**

### **Logging**
- **Structured logging** with Winston
- **Multiple log levels** (debug, info, warn, error)
- **Log rotation** and cleanup
- **Performance profiling**

## 🎬 **Supported Sources**

### **Torrent Sources**
- **The Pirate Bay**
- **1337x**
- **YTS**
- **RARBG**

### **Streaming Sources**
- **Einthusan** (South Indian movies)
- **Cataz** (Multi-language)
- **Fmovies** (International)
- **SolarMovie**
- **FlixHQ**
- **ZoeChip**

## 🚀 **Performance Optimizations**

### **Download Optimizations**
- **50 concurrent connections** for maximum speed
- **Chunked downloads** with resume support
- **Connection pooling** for efficiency
- **Bandwidth throttling** when needed

### **Cache Optimizations**
- **SQLite indexing** for fast lookups
- **Memory caching** for hot data
- **Automatic cleanup** of expired items
- **Compression** for metadata storage

## 🔒 **Security & Privacy**

### **Data Protection**
- **No permanent storage** of user data
- **Automatic cleanup** of temporary files
- **Secure token handling**
- **Proxy support** for anonymity

### **Rate Limiting**
- **Per-user rate limits** to prevent abuse
- **Global rate limits** for system stability
- **Intelligent throttling** based on load
- **Queue management** for fair access

## 📚 **Documentation**

- **[Setup Guide](docs/SETUP.md)** - Detailed installation instructions
- **[API Reference](docs/API.md)** - Bot API documentation
- **[Configuration](docs/CONFIG.md)** - Advanced configuration options
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🤝 **Contributing**

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### **Development Setup**
```bash
# Install development dependencies
npm install --dev

# Run tests
npm test

# Run linting
npm run lint

# Run in development mode
npm run dev
```

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **Telegram Bot API** for the platform
- **Puppeteer** for browser automation
- **FFmpeg** for video processing
- **WebTorrent** for P2P downloads
- **SQLite** for caching

## 📞 **Support**

- **Issues**: [GitHub Issues](https://github.com/Shamanth-001/Telegrambot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Shamanth-001/Telegrambot/discussions)
- **Documentation**: [Wiki](https://github.com/Shamanth-001/Telegrambot/wiki)

---

**⭐ Star this repository if you find it helpful!**

**🎬 Enjoy instant movie delivery with enterprise-level performance!**
