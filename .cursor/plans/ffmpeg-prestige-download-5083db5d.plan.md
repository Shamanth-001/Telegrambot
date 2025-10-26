<!-- 5083db5d-12d6-42f6-a9c3-1e0493a5e017 a9f6cc1f-f1eb-427a-adaf-0904dce65135 -->
# Improved Streaming Downloader with Cataz Lessons

## Phase 1: Improve Automated Streaming Downloader

### Key Lessons from 63 Cataz Attempts

**What Failed on Cataz:**

1. Simple request interception - streams were encrypted/protected
2. Direct iframe navigation - anti-bot detection blocked it
3. Single play button approach - buttons were hidden/dynamic
4. Basic stream capture - only captured blob URLs, not real streams

**What Might Work on Other Sites:**

1. **Multiple iframe strategies** (from `cataz-iframe-bypass.js`)
2. **JW Player detection** (from `cataz-iframe-bypass.js` line 187-224)
3. **Video element extraction** (from `cataz-final-success.js`)
4. **Extended wait times** (10-15 seconds for dynamic loading)
5. **Multiple play button selectors** (10+ different patterns)

### Improvements to `src/services/automatedStreamDownloader.js`

**Add from Cataz Scripts:**

1. **Enhanced iframe handling** (from `cataz-iframe-bypass.js` lines 136-230):
```javascript
// After clicking play, look for iframes
const iframes = await page.$$('iframe');
for (const iframe of iframes) {
  const src = await page.evaluate(el => el.src, iframe);
  if (src && (src.includes('embed') || src.includes('player'))) {
    // Navigate to iframe directly
    await page.goto(src, { waitUntil: 'networkidle2' });
    // Extract streams from iframe page
  }
}
```

2. **JW Player detection** (from `cataz-iframe-bypass.js` lines 187-224):
```javascript
// Check for JW Player instances
if (window.jwplayer) {
  const player = window.jwplayer();
  if (player.getPlaylist) {
    const playlist = player.getPlaylist();
    playlist.forEach(item => {
      if (item.sources) {
        item.sources.forEach(source => {
          if (source.file) streams.push(source.file);
        });
      }
    });
  }
}
```

3. **Extended play button selectors** (from `cataz-final-success.js` lines 73-84):
```javascript
const playButtonSelectors = [
  'a[href*="watch"]',
  'button[class*="play"]',
  'button[class*="watch"]',
  '.play-button',
  '.watch-button',
  '[data-action="play"]',
  'a[class*="play"]',
  'a[class*="watch"]',
  'button[class*="btn"]',
  'a[class*="btn"]',
  '.vjs-big-play-button',
  '.jw-play'
];
```

4. **Video element extraction** (from `cataz-iframe-bypass.js` lines 159-184):
```javascript
const videos = document.querySelectorAll('video');
videos.forEach(video => {
  if (video.src && video.src !== 'blob:') {
    streams.push(video.src);
  }
  if (video.currentSrc && video.currentSrc !== 'blob:') {
    streams.push(video.currentSrc);
  }
});

const sources = document.querySelectorAll('source');
sources.forEach(source => {
  if (source.src) streams.push(source.src);
});
```

5. **Blob URL filtering** (exclude blob: and data: URLs):
```javascript
const isValidStream = (url) => {
  return url && 
         url !== 'blob:' && 
         !url.includes('data:') &&
         !url.includes('.css') &&
         !url.includes('.js') &&
         !url.includes('favicon') &&
         !url.includes('analytics');
};
```


### New File Structure for `automatedStreamDownloader.js`

```javascript
export async function downloadMovieFromStreaming(title) {
  const sites = [
    { name: 'FlixHQ', searchUrl: '...', selectors: [...] },
    { name: 'SolarMovie', searchUrl: '...', selectors: [...] },
    { name: 'ZoeChip', searchUrl: '...', selectors: [...] }
  ];
  
  for (const site of sites) {
    try {
      // 1. Search and navigate
      await searchAndNavigate(site, title);
      
      // 2. Try multiple stream extraction methods
      const streams = await extractStreamsMultiMethod(page);
      
      // 3. Download and validate
      for (const stream of streams) {
        const result = await downloadAndValidate(stream, title, site.name);
        if (result && result.fileSize > 500 * 1024 * 1024) {
          return result; // SUCCESS
        }
      }
    } catch (error) {
      logger.error(`${site.name} failed: ${error.message}`);
      continue; // Try next site
    }
  }
  
  return null; // All sites failed
}

async function extractStreamsMultiMethod(page) {
  const streams = new Set();
  
  // Method 1: Request interception (already implemented)
  // Method 2: Iframe navigation + extraction
  await extractFromIframes(page, streams);
  
  // Method 3: Video element extraction
  await extractFromVideoElements(page, streams);
  
  // Method 4: JW Player detection
  await extractFromJWPlayer(page, streams);
  
  // Method 5: Direct script parsing
  await extractFromScripts(page, streams);
  
  return Array.from(streams).filter(isValidStream);
}
```

### Specific Improvements

**File: `src/services/automatedStreamDownloader.js`**

**Lines to add after line 115 (after videoStreams capture):**

```javascript
// Method 2: Extract from iframes (Cataz lesson)
async function extractFromIframes(page, streams) {
  const iframes = await page.$$('iframe');
  for (const iframe of iframes) {
    try {
      const src = await page.evaluate(el => el.src, iframe);
      if (src && (src.includes('embed') || src.includes('player'))) {
        const newPage = await page.browser().newPage();
        await newPage.goto(src, { waitUntil: 'networkidle2', timeout: 15000 });
        
        // Extract from iframe page
        const iframeStreams = await newPage.evaluate(() => {
          const s = [];
          document.querySelectorAll('video').forEach(v => {
            if (v.src && v.src !== 'blob:') s.push(v.src);
            if (v.currentSrc && v.currentSrc !== 'blob:') s.push(v.currentSrc);
          });
          document.querySelectorAll('source').forEach(src => {
            if (src.src) s.push(src.src);
          });
          return s;
        });
        
        iframeStreams.forEach(s => streams.add(s));
        await newPage.close();
      }
    } catch (e) {
      // Continue to next iframe
    }
  }
}

// Method 3: JW Player detection (Cataz lesson)
async function extractFromJWPlayer(page, streams) {
  const jwStreams = await page.evaluate(() => {
    const s = [];
    if (window.jwplayer) {
      try {
        const player = window.jwplayer();
        if (player.getPlaylist) {
          const playlist = player.getPlaylist();
          playlist.forEach(item => {
            if (item.sources) {
              item.sources.forEach(source => {
                if (source.file) s.push(source.file);
              });
            }
            if (item.file) s.push(item.file);
          });
        }
        if (player.getConfig && player.getConfig().file) {
          s.push(player.getConfig().file);
        }
      } catch (e) {}
    }
    return s;
  });
  
  jwStreams.forEach(s => streams.add(s));
}

// Method 4: Video element extraction (Cataz lesson)
async function extractFromVideoElements(page, streams) {
  const videoStreams = await page.evaluate(() => {
    const s = [];
    document.querySelectorAll('video').forEach(v => {
      if (v.src && v.src !== 'blob:' && !v.src.includes('data:')) s.push(v.src);
      if (v.currentSrc && v.currentSrc !== 'blob:' && !v.currentSrc.includes('data:')) s.push(v.currentSrc);
    });
    document.querySelectorAll('source').forEach(src => {
      if (src.src && !src.src.includes('blob:') && !src.src.includes('data:')) s.push(src.src);
    });
    return s;
  });
  
  videoStreams.forEach(s => streams.add(s));
}
```

**Update play button click (lines 103-107) with extended selectors:**

```javascript
const playButtonSelectors = [
  '.play-btn', '.btn-play', '[class*="play"]', '.vjs-big-play-button', 
  '.jw-play', '.player-play', 'a[href*="watch"]', 'button[class*="play"]',
  'button[class*="watch"]', '.play-button', '.watch-button', '[data-action="play"]',
  'a[class*="play"]', 'a[class*="watch"]', 'button[class*="btn"]', 'a[class*="btn"]'
];
```

**Increase wait times (line 114):**

```javascript
// Wait 15 seconds instead of 15000ms for better stream capture
await new Promise(resolve => setTimeout(resolve, 15000));
```

## Phase 2: Clean Up Test and Debug Files

### Files to Delete (80+ files total)

**Test files (16 files):**

- test-automated-download.js
- test-cataz-with-vpn.js
- test-with-vpn.js
- test-popular-movies.js
- test-prestige-search.js
- test-cataz-vs-alternatives.js
- test-ultimate-simple.js
- test-final-fix.js
- test-stream-detection-fix.js
- test-fixed-system.js
- test-enhanced-system.js
- test-real-movie-download.js
- test-enhanced-iframe.js
- test-different-movie.js
- test-cataz-navigation.js
- test-cataz-fixes.js

**Cataz debug files (40+ files):**

- All files in `scripts/cataz-*.js` (63 files total)
- cataz-vpn-solutions.js
- diagnose-cataz-loading.js
- simple-cataz-search.js
- debug-cataz-blocking.js
- debug-cataz-buttons.js
- fix-cataz-buffering.js
- handle-cataz-popup.js
- force-close-popup.js

**Old download attempt files (20+ files):**

- alternative-prestige-download.js
- auto-download-prestige.js
- automated-prestige-download.js
- direct-prestige-download.js
- direct-stream-capture.js
- download-avatar-fixed.js
- download-avatar-multi-server.js
- download-full-movie.js
- download-prestige-cataz.js
- final-manual-solution.js
- final-prestige-download.js
- legit-movie-finder.js
- manual-server-selection.js
- manual-streamfab-guide.js
- nuclear-option.js
- prestige-ffmpeg-download.js
- prestige-server-solution.js
- proper-prestige-download.js
- quick-download-helper.js
- quick-prestige-download.js
- real-movie-downloader.js
- simple-avatar-download.js
- simple-prestige-download.js
- streamfab-direct-download.js
- torrent-download.js
- working-movie-downloader.js
- working-prestige-download.js
- working-prestige-final.js
- fixed-ultimate-cataz.js
- ultimate-cataz-solution.js

**Debug/diagnostic files:**

- debug-all-iframes.js
- debug-iframe-advanced.js
- debug-iframe-content.js
- explain-solutions.js
- find-available-movies.js
- search-working-movies.js

**Keep these files:**

- bot.js (main entry)
- src/** (all source files)
- package.json, package-lock.json
- Dockerfile
- *.md files (documentation)
- *.ps1 files (PowerShell scripts)
- downloads/** (downloaded content)

## Implementation Order

1. **Update** `src/services/automatedStreamDownloader.js` with Cataz lessons
2. **Test** with one movie to verify improvements work
3. **Clean up** all test/debug/old files (80+ files)
4. **Verify** bot still runs after cleanup
5. **Document** final working system

## Expected Results

**After Phase 1 (Improvements):**

- 5 different stream extraction methods (vs 1 currently)
- Better success rate on FlixHQ, SolarMovie, ZoeChip
- Handles iframe-based players (like Cataz attempted)
- Handles JW Player instances
- Handles various video element configurations

**After Phase 2 (Cleanup):**

- Project reduced from 150+ files to ~70 files
- Easier to maintain and understand
- No confusion from old failed attempts
- Clean working directory

### To-dos

- [ ] Update automatedStreamDownloader.js with 5 extraction methods from Cataz lessons
- [ ] Add iframe navigation and extraction method
- [ ] Add JW Player detection and extraction
- [ ] Add direct video element extraction
- [ ] Add 16 play button selectors from Cataz attempts
- [ ] Test improved downloader with real movie
- [ ] Delete 16 test-*.js files
- [ ] Delete 63 cataz-*.js files from scripts/
- [ ] Delete 30+ old download attempt files
- [ ] Delete debug/diagnostic files
- [ ] Verify bot still runs after cleanup