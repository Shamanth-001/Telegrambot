import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

// Comprehensive fallback source manager
class FallbackSourceManager {
  constructor() {
    this.sources = [
      {
        name: 'Archive.org',
        searchUrl: (title) => `https://archive.org/search.php?query=${encodeURIComponent(title + ' full movie')}`,
        downloader: 'yt-dlp',
        priority: 1,
        timeout: 30000,
        quality: 'best'
      },
      {
        name: 'YouTube',
        searchUrl: (title) => `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' full movie')}`,
        downloader: 'yt-dlp',
        priority: 2,
        timeout: 45000,
        quality: 'best[height<=720]'
      },
      {
        name: 'Vimeo',
        searchUrl: (title) => `https://vimeo.com/search?q=${encodeURIComponent(title)}`,
        downloader: 'yt-dlp',
        priority: 3,
        timeout: 30000,
        quality: 'best'
      },
      {
        name: 'Dailymotion',
        searchUrl: (title) => `https://www.dailymotion.com/search/${encodeURIComponent(title)}`,
        downloader: 'yt-dlp',
        priority: 4,
        timeout: 30000,
        quality: 'best'
      },
      {
        name: 'Internet Archive Movies',
        searchUrl: (title) => `https://archive.org/details/movies?query=${encodeURIComponent(title)}`,
        downloader: 'yt-dlp',
        priority: 1,
        timeout: 30000,
        quality: 'best'
      }
    ];

    this.downloadStats = new Map();
    this.sourceHealth = new Map();
  }

  // Search for movie across all sources
  async searchMovie(title, maxSources = 3) {
    console.log(`🔍 Searching for "${title}" across ${maxSources} sources...`);
    
    const searchPromises = this.sources
      .slice(0, maxSources)
      .map(source => this.searchSource(source, title));
    
    const results = await Promise.allSettled(searchPromises);
    
    const successfulResults = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value)
      .sort((a, b) => a.source.priority - b.source.priority);
    
    console.log(`✅ Found ${successfulResults.length} potential sources`);
    return successfulResults;
  }

  // Search individual source
  async searchSource(source, title) {
    try {
      console.log(`🔍 Searching ${source.name}...`);
      
      const searchUrl = source.searchUrl(title);
      const command = `yt-dlp --get-url --no-playlist "${searchUrl}"`;
      
      const { stdout, stderr } = await execAsync(command, { 
        timeout: source.timeout,
        maxBuffer: 1024 * 1024 * 10 
      });
      
      if (stdout.trim()) {
        const urls = stdout.trim().split('\n').filter(url => url.length > 0);
        
        console.log(`✅ Found ${urls.length} URLs on ${source.name}`);
        
        return {
          source,
          urls,
          searchUrl,
          timestamp: new Date().toISOString()
        };
      }
      
      return null;
      
    } catch (error) {
      console.warn(`❌ ${source.name} search failed: ${error.message}`);
      this.recordSourceFailure(source.name, error.message);
      return null;
    }
  }

  // Download from a specific source
  async downloadFromSource(source, urls, title, outputDir = 'downloads') {
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
    const outputPath = `${outputDir}/${sanitizedTitle}_${source.name.toLowerCase()}.mp4`;
    
    console.log(`📥 Downloading from ${source.name}...`);
    console.log(`📁 Output: ${outputPath}`);
    
    try {
      // Try each URL until one succeeds
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(`🎯 Trying URL ${i + 1}/${urls.length}: ${url}`);
        
        const command = `yt-dlp -o "${outputPath}" --format "${source.quality}" "${url}"`;
        
        const { stdout, stderr } = await execAsync(command, {
          timeout: 300000, // 5 minutes
          maxBuffer: 1024 * 1024 * 10
        });
        
        // Check if file was created and has content
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            console.log(`✅ Download successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            this.recordSourceSuccess(source.name, stats.size);
            return {
              success: true,
              filePath: outputPath,
              fileSize: stats.size,
              source: source.name,
              url: url
            };
          }
        }
        
        console.warn(`❌ URL ${i + 1} failed, trying next...`);
      }
      
      throw new Error('All URLs failed to download');
      
    } catch (error) {
      console.error(`❌ Download from ${source.name} failed: ${error.message}`);
      this.recordSourceFailure(source.name, error.message);
      return {
        success: false,
        error: error.message,
        source: source.name
      };
    }
  }

  // Try downloading from multiple sources
  async downloadWithFallback(title, maxAttempts = 3) {
    console.log(`🎬 Starting fallback download for: ${title}`);
    console.log(`🔄 Will try up to ${maxAttempts} sources`);
    
    const searchResults = await this.searchMovie(title, maxAttempts);
    
    if (searchResults.length === 0) {
      throw new Error('No sources found for the movie');
    }
    
    // Try downloading from each source in priority order
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      console.log(`\n🎯 Attempt ${i + 1}/${searchResults.length}: ${result.source.name}`);
      
      try {
        const downloadResult = await this.downloadFromSource(
          result.source, 
          result.urls, 
          title
        );
        
        if (downloadResult.success) {
          console.log(`🎉 Download completed successfully from ${result.source.name}!`);
          return downloadResult;
        }
        
      } catch (error) {
        console.warn(`❌ ${result.source.name} failed: ${error.message}`);
      }
    }
    
    throw new Error('All fallback sources failed');
  }

  // Record source success
  recordSourceSuccess(sourceName, fileSize) {
    if (!this.downloadStats.has(sourceName)) {
      this.downloadStats.set(sourceName, {
        successes: 0,
        failures: 0,
        totalSize: 0,
        lastSuccess: null
      });
    }
    
    const stats = this.downloadStats.get(sourceName);
    stats.successes++;
    stats.totalSize += fileSize;
    stats.lastSuccess = new Date().toISOString();
    
    // Mark source as healthy
    this.sourceHealth.set(sourceName, {
      status: 'healthy',
      lastCheck: new Date().toISOString()
    });
  }

  // Record source failure
  recordSourceFailure(sourceName, error) {
    if (!this.downloadStats.has(sourceName)) {
      this.downloadStats.set(sourceName, {
        successes: 0,
        failures: 0,
        totalSize: 0,
        lastSuccess: null
      });
    }
    
    const stats = this.downloadStats.get(sourceName);
    stats.failures++;
    
    // Mark source as potentially unhealthy
    this.sourceHealth.set(sourceName, {
      status: 'unhealthy',
      lastError: error,
      lastCheck: new Date().toISOString()
    });
  }

  // Get source statistics
  getSourceStats() {
    const stats = {};
    
    for (const [sourceName, data] of this.downloadStats.entries()) {
      const total = data.successes + data.failures;
      stats[sourceName] = {
        ...data,
        successRate: total > 0 ? (data.successes / total) : 0,
        averageFileSize: data.successes > 0 ? (data.totalSize / data.successes) : 0,
        health: this.sourceHealth.get(sourceName) || { status: 'unknown' }
      };
    }
    
    return stats;
  }

  // Get best performing sources
  getBestSources(limit = 3) {
    const stats = this.getSourceStats();
    
    return Object.entries(stats)
      .filter(([_, data]) => data.successes > 0)
      .sort(([_, a], [__, b]) => b.successRate - a.successRate)
      .slice(0, limit)
      .map(([name, _]) => name);
  }

  // Health check for all sources
  async healthCheck() {
    console.log('🏥 Performing health check on all sources...');
    
    const healthResults = {};
    
    for (const source of this.sources) {
      try {
        const testUrl = source.searchUrl('test movie');
        const command = `yt-dlp --get-url --no-playlist "${testUrl}"`;
        
        const { stdout } = await execAsync(command, { 
          timeout: 10000,
          maxBuffer: 1024 * 1024 
        });
        
        healthResults[source.name] = {
          status: 'healthy',
          responseTime: Date.now(),
          lastCheck: new Date().toISOString()
        };
        
        console.log(`✅ ${source.name}: Healthy`);
        
      } catch (error) {
        healthResults[source.name] = {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date().toISOString()
        };
        
        console.warn(`❌ ${source.name}: Unhealthy - ${error.message}`);
      }
    }
    
    return healthResults;
  }

  // Add custom source
  addSource(sourceConfig) {
    const newSource = {
      name: sourceConfig.name,
      searchUrl: sourceConfig.searchUrl,
      downloader: sourceConfig.downloader || 'yt-dlp',
      priority: sourceConfig.priority || 999,
      timeout: sourceConfig.timeout || 30000,
      quality: sourceConfig.quality || 'best'
    };
    
    this.sources.push(newSource);
    this.sources.sort((a, b) => a.priority - b.priority);
    
    console.log(`✅ Added custom source: ${newSource.name}`);
  }

  // Remove source
  removeSource(sourceName) {
    const index = this.sources.findIndex(source => source.name === sourceName);
    
    if (index !== -1) {
      const removed = this.sources.splice(index, 1)[0];
      console.log(`✅ Removed source: ${removed.name}`);
      return true;
    }
    
    return false;
  }
}

export default FallbackSourceManager;
