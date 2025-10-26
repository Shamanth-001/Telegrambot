# Ultimate Cataz Downloader

A comprehensive, production-ready solution for downloading movies from Cataz with advanced bypass techniques, proxy support, retry logic, session persistence, and fallback mechanisms.

## 🚀 Features

### Core Functionality
- **Browser Automation**: Puppeteer-based navigation and interaction
- **Network Interception**: Captures stream URLs from network requests
- **Dynamic Selector Detection**: Automatically finds play buttons
- **New Tab Handling**: Manages streaming page redirects
- **Session Persistence**: Maintains cookies and headers across sessions

### Advanced Bypass Techniques
- **Header Rotation**: Multiple User-Agent and header combinations
- **Cookie Management**: Session cookie capture and application
- **Proxy Support**: HTTP/SOCKS5 proxy rotation
- **Retry Logic**: Exponential backoff with circuit breaker pattern
- **Fallback Sources**: Alternative sources when Cataz fails

### System Components
- **Proxy Manager**: Handles proxy rotation and health checking
- **Retry Manager**: Advanced retry logic with circuit breaker
- **Fallback Manager**: Alternative source management
- **Session Manager**: Persistent session storage and management

## 📁 File Structure

```
src/
├── ultimate-cataz-downloader.js    # Main downloader class
├── proxy-manager.js                # Proxy rotation and management
├── retry-manager.js                # Advanced retry logic
├── fallback-source-manager.js      # Alternative source management
├── session-persistence-manager.js   # Session storage and persistence
└── enhanced-cataz-downloader-v2.js # Enhanced downloader (v2)

scripts/
├── test-ultimate-downloader.js     # Comprehensive test suite
└── test-enhanced-cataz-v2.js       # Enhanced downloader tests
```

## 🛠 Installation

1. **Install Dependencies**:
```bash
npm install puppeteer yt-dlp ffmpeg
```

2. **Install System Dependencies**:
```bash
# Windows
choco install ffmpeg

# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

3. **Create Required Directories**:
```bash
mkdir -p downloads sessions
```

## 🎯 Usage

### Basic Usage

```javascript
const UltimateCatazDownloader = require('./src/ultimate-cataz-downloader');

const downloader = new UltimateCatazDownloader({
  headless: false,
  useProxy: false,
  useRetry: true,
  useFallback: true,
  useSessionPersistence: true
});

// Download a movie
const result = await downloader.downloadMovie(
  'https://cataz.to/movie/watch-avatar-2009-19690',
  'Avatar_2009'
);

console.log(`Downloaded: ${result.filePath}`);
```

### Advanced Configuration

```javascript
const downloader = new UltimateCatazDownloader({
  headless: false,                    // Show browser window
  useProxy: true,                     // Enable proxy rotation
  useRetry: true,                     // Enable retry logic
  useFallback: true,                  // Enable fallback sources
  useSessionPersistence: true,        // Enable session persistence
  maxRetryAttempts: 5,               // Maximum retry attempts
  fallbackSources: 3,                // Number of fallback sources
  sessionDir: './sessions',          // Session storage directory
  proxyConfigPath: './proxy-config.json' // Proxy configuration file
});
```

## 🔧 Configuration

### Proxy Configuration

Create `proxy-config.json`:

```json
{
  "proxies": [
    {
      "name": "Local HTTP Proxy",
      "host": "127.0.0.1",
      "port": 8080,
      "type": "http",
      "username": "",
      "password": "",
      "country": "Local",
      "speed": "fast"
    },
    {
      "name": "SOCKS5 Proxy",
      "host": "127.0.0.1",
      "port": 1080,
      "type": "socks5",
      "username": "",
      "password": "",
      "country": "US",
      "speed": "medium"
    }
  ]
}
```

### Retry Configuration

```javascript
const { createRetryManager } = require('./src/retry-manager');

// Create retry manager with different configurations
const retryManager = createRetryManager('aggressive'); // or 'conservative', 'network'
```

### Fallback Sources

The system automatically tries these sources when Cataz fails:
- Archive.org
- YouTube
- Vimeo
- Dailymotion
- Internet Archive Movies

## 🎬 Download Process

### 1. Browser Initialization
- Launches Puppeteer with enhanced options
- Sets up proxy if enabled
- Applies saved session cookies
- Configures network interception

### 2. Movie Page Navigation
- Navigates to Cataz movie page
- Waits for page to load completely
- Applies session persistence

### 3. Play Button Detection
- Uses dynamic selector detection
- Tries multiple selectors
- Implements retry logic with exponential backoff

### 4. Stream URL Capture
- Intercepts network requests
- Captures .m3u8, .mp4, .mpd URLs
- Handles new tab redirects
- Saves session data

### 5. Download with Bypass
- Applies multiple bypass techniques
- Uses captured cookies and headers
- Implements header rotation
- Tries different User-Agent strings

### 6. Fallback Mechanism
- Tries alternative sources
- Uses yt-dlp for different platforms
- Implements quality selection

## 🔍 Bypass Techniques

### Header Manipulation
- **User-Agent Rotation**: Multiple browser signatures
- **Referer Spoofing**: Different referer headers
- **Custom Headers**: X-Forwarded-For, X-Real-IP, etc.

### Cookie Management
- **Session Capture**: Browser session cookies
- **Cookie Persistence**: Save and reuse cookies
- **Domain Matching**: Proper cookie scoping

### Proxy Support
- **HTTP Proxies**: Standard HTTP proxy support
- **SOCKS5 Proxies**: SOCKS5 proxy support
- **Proxy Rotation**: Automatic proxy switching
- **Health Checking**: Proxy availability testing

### Retry Logic
- **Exponential Backoff**: Increasing delay between retries
- **Circuit Breaker**: Prevents cascading failures
- **Jitter**: Random delay variation
- **Timeout Handling**: Operation timeout management

## 📊 Monitoring and Statistics

### Session Statistics
```javascript
const stats = downloader.getStats();
console.log('Session Stats:', stats.sessionStats);
console.log('Proxy Stats:', stats.proxyStats);
console.log('Retry Stats:', stats.retryStats);
console.log('Fallback Stats:', stats.fallbackStats);
```

### Health Check
```javascript
const health = await downloader.healthCheck();
console.log('System Health:', health);
```

### Component Status
- **Browser**: Puppeteer instance status
- **Proxy**: Proxy manager health
- **Retry**: Retry manager status
- **Fallback**: Alternative source availability
- **Session**: Session persistence status

## 🚨 Error Handling

### Common Errors and Solutions

1. **403 Forbidden Errors**
   - Solution: Use session persistence and proxy rotation
   - Try different User-Agent strings
   - Apply proper cookie management

2. **No Stream URLs Found**
   - Solution: Check network interception setup
   - Verify new tab handling
   - Try different selectors

3. **Download Failures**
   - Solution: Use fallback sources
   - Check proxy configuration
   - Verify FFmpeg installation

4. **Session Expiration**
   - Solution: Enable session persistence
   - Use retry logic
   - Clear and recreate sessions

## 🧪 Testing

### Run Comprehensive Tests
```bash
node scripts/test-ultimate-downloader.js
```

### Test Individual Components
```bash
# Test enhanced downloader
node scripts/test-enhanced-cataz-v2.js

# Test specific functionality
node scripts/test-ultimate-downloader.js
```

### Test Configuration
```javascript
// Test different configurations
const configs = [
  { name: 'Standard', useProxy: false, useRetry: true },
  { name: 'Proxy', useProxy: true, useRetry: true },
  { name: 'Aggressive', useRetry: true, maxRetryAttempts: 5 }
];
```

## 🔒 Security Considerations

### Proxy Security
- Use trusted proxy providers
- Rotate credentials regularly
- Monitor proxy health

### Session Security
- Encrypt session data if needed
- Clean up expired sessions
- Use secure storage

### Network Security
- Use HTTPS where possible
- Validate SSL certificates
- Monitor network traffic

## 📈 Performance Optimization

### Browser Optimization
- Use headless mode for production
- Limit concurrent downloads
- Optimize memory usage

### Network Optimization
- Use fast proxies
- Implement connection pooling
- Optimize retry intervals

### Storage Optimization
- Clean up old sessions
- Compress session data
- Use efficient storage formats

## 🐛 Troubleshooting

### Debug Mode
```javascript
const downloader = new UltimateCatazDownloader({
  headless: false,  // Show browser for debugging
  useProxy: false,  // Disable proxy for testing
  useRetry: true,   // Enable retry for debugging
  useFallback: true // Enable fallback for testing
});
```

### Common Issues
1. **Browser Launch Failures**: Check Puppeteer installation
2. **Proxy Connection Issues**: Verify proxy configuration
3. **Session Persistence Issues**: Check file permissions
4. **Download Failures**: Verify FFmpeg installation

### Logging
```javascript
// Enable detailed logging
const downloader = new UltimateCatazDownloader({
  debug: true,
  verbose: true
});
```

## 🚀 Production Deployment

### Environment Setup
```bash
# Install production dependencies
npm install --production

# Set up system services
sudo systemctl enable ffmpeg
sudo systemctl start ffmpeg
```

### Configuration Management
```javascript
// Production configuration
const config = {
  headless: true,
  useProxy: true,
  useRetry: true,
  useFallback: true,
  useSessionPersistence: true,
  maxRetryAttempts: 3,
  fallbackSources: 3,
  sessionDir: '/var/lib/cataz-downloader/sessions',
  proxyConfigPath: '/etc/cataz-downloader/proxy-config.json'
};
```

### Monitoring
```javascript
// Set up monitoring
const stats = downloader.getStats();
const health = await downloader.healthCheck();

// Send to monitoring service
monitoringService.sendStats(stats);
monitoringService.sendHealth(health);
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the documentation

## 🔄 Updates

### Version History
- **v1.0**: Basic Cataz downloader
- **v2.0**: Enhanced with retry logic and fallback
- **v3.0**: Ultimate downloader with all features

### Future Enhancements
- Machine learning for better bypass detection
- Advanced proxy management
- Real-time monitoring dashboard
- API integration for external services







