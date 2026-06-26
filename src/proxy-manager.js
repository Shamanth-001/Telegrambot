import fs from 'fs';
import path from 'path';

// Enhanced proxy manager with rotation and health checking
class ProxyManager {
  constructor(configPath = './proxy-config.json') {
    this.configPath = configPath;
    this.proxies = [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.proxyStats = new Map();
    this.loadProxies();
  }

  // Load proxy configurations from file or use defaults
  loadProxies() {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.proxies = config.proxies || [];
        console.log(`[ProxyManager] Loaded ${this.proxies.length} proxies from config`);
      } else {
        // Default proxy configurations
        this.proxies = [
          {
            name: 'Local HTTP Proxy',
            host: '127.0.0.1',
            port: 8080,
            type: 'http',
            username: '',
            password: '',
            country: 'Local',
            speed: 'fast'
          },
          {
            name: 'Local SOCKS5 Proxy',
            host: '127.0.0.1',
            port: 1080,
            type: 'socks5',
            username: '',
            password: '',
            country: 'Local',
            speed: 'fast'
          },
          {
            name: 'Free HTTP Proxy 1',
            host: '8.8.8.8',
            port: 8080,
            type: 'http',
            username: '',
            password: '',
            country: 'US',
            speed: 'medium'
          }
        ];
        this.saveProxies();
      }
    } catch (error) {
      console.error('[ProxyManager] Error loading proxies:', error.message);
      this.proxies = [];
    }
  }

  // Save proxy configurations to file
  saveProxies() {
    try {
      const config = {
        proxies: this.proxies,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      console.log('[ProxyManager] Proxy configuration saved');
    } catch (error) {
      console.error('[ProxyManager] Error saving proxies:', error.message);
    }
  }

  // Get next available proxy with rotation
  getNextProxy() {
    const availableProxies = this.proxies.filter(proxy => 
      !this.failedProxies.has(proxy.host + ':' + proxy.port)
    );

    if (availableProxies.length === 0) {
      console.warn('[ProxyManager] No available proxies, resetting failed list');
      this.failedProxies.clear();
      return this.proxies[this.currentIndex % this.proxies.length];
    }

    const proxy = availableProxies[this.currentIndex % availableProxies.length];
    this.currentIndex++;
    
    console.log(`[ProxyManager] Using proxy: ${proxy.name} (${proxy.host}:${proxy.port})`);
    return proxy;
  }

  // Get proxy by country or speed preference
  getProxyByPreference(country = null, speed = null) {
    let filteredProxies = this.proxies.filter(proxy => 
      !this.failedProxies.has(proxy.host + ':' + proxy.port)
    );

    if (country) {
      filteredProxies = filteredProxies.filter(proxy => 
        proxy.country.toLowerCase() === country.toLowerCase()
      );
    }

    if (speed) {
      filteredProxies = filteredProxies.filter(proxy => 
        proxy.speed === speed
      );
    }

    if (filteredProxies.length === 0) {
      console.warn('[ProxyManager] No proxies match criteria, using any available');
      return this.getNextProxy();
    }

    const proxy = filteredProxies[Math.floor(Math.random() * filteredProxies.length)];
    console.log(`[ProxyManager] Selected proxy by preference: ${proxy.name}`);
    return proxy;
  }

  // Mark proxy as failed
  markProxyFailed(proxy) {
    const key = proxy.host + ':' + proxy.port;
    this.failedProxies.add(key);
    
    // Update proxy stats
    if (!this.proxyStats.has(key)) {
      this.proxyStats.set(key, { failures: 0, successes: 0, lastUsed: null });
    }
    
    const stats = this.proxyStats.get(key);
    stats.failures++;
    stats.lastUsed = new Date().toISOString();
    
    console.warn(`[ProxyManager] Marked proxy as failed: ${proxy.name} (${key})`);
  }

  // Mark proxy as successful
  markProxySuccess(proxy) {
    const key = proxy.host + ':' + proxy.port;
    
    if (!this.proxyStats.has(key)) {
      this.proxyStats.set(key, { failures: 0, successes: 0, lastUsed: null });
    }
    
    const stats = this.proxyStats.get(key);
    stats.successes++;
    stats.lastUsed = new Date().toISOString();
    
    console.log(`[ProxyManager] Marked proxy as successful: ${proxy.name} (${key})`);
  }

  // Get proxy statistics
  getProxyStats() {
    const stats = {};
    for (const [key, data] of this.proxyStats.entries()) {
      stats[key] = {
        ...data,
        successRate: data.successes / (data.successes + data.failures) || 0
      };
    }
    return stats;
  }

  // Reset failed proxies (useful for retry scenarios)
  resetFailedProxies() {
    this.failedProxies.clear();
    console.log('[ProxyManager] Reset failed proxies list');
  }

  // Add new proxy
  addProxy(proxyConfig) {
    const newProxy = {
      name: proxyConfig.name || `Proxy ${this.proxies.length + 1}`,
      host: proxyConfig.host,
      port: proxyConfig.port,
      type: proxyConfig.type || 'http',
      username: proxyConfig.username || '',
      password: proxyConfig.password || '',
      country: proxyConfig.country || 'Unknown',
      speed: proxyConfig.speed || 'medium'
    };

    this.proxies.push(newProxy);
    this.saveProxies();
    console.log(`[ProxyManager] Added new proxy: ${newProxy.name}`);
  }

  // Remove proxy
  removeProxy(host, port) {
    const index = this.proxies.findIndex(proxy => 
      proxy.host === host && proxy.port === port
    );
    
    if (index !== -1) {
      const removed = this.proxies.splice(index, 1)[0];
      this.saveProxies();
      console.log(`[ProxyManager] Removed proxy: ${removed.name}`);
      return true;
    }
    
    return false;
  }

  // Test proxy connectivity
  async testProxy(proxy) {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      const testUrl = 'https://httpbin.org/ip';
      const curlCommand = [
        'curl',
        '--connect-timeout', '10',
        '--max-time', '30',
        '--proxy', `${proxy.type}://${proxy.host}:${proxy.port}`,
        testUrl
      ];

      if (proxy.username && proxy.password) {
        curlCommand.push('--proxy-user', `${proxy.username}:${proxy.password}`);
      }

      const process = spawn(curlCommand[0], curlCommand.slice(1));
      
      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0 && output.includes('origin')) {
          console.log(`[ProxyManager] Proxy test successful: ${proxy.name}`);
          resolve(true);
        } else {
          console.warn(`[ProxyManager] Proxy test failed: ${proxy.name} - ${error}`);
          resolve(false);
        }
      });

      process.on('error', (err) => {
        console.warn(`[ProxyManager] Proxy test error: ${proxy.name} - ${err.message}`);
        resolve(false);
      });
    });
  }

  // Test all proxies
  async testAllProxies() {
    console.log('[ProxyManager] Testing all proxies...');
    const results = [];
    
    for (const proxy of this.proxies) {
      const isWorking = await this.testProxy(proxy);
      results.push({ proxy, working: isWorking });
      
      if (isWorking) {
        this.markProxySuccess(proxy);
      } else {
        this.markProxyFailed(proxy);
      }
    }
    
    const workingCount = results.filter(r => r.working).length;
    console.log(`[ProxyManager] Test completed: ${workingCount}/${this.proxies.length} proxies working`);
    
    return results;
  }

  // Get proxy configuration for Puppeteer
  getPuppeteerProxyConfig(proxy) {
    if (!proxy) return {};

    const config = {
      args: [`--proxy-server=${proxy.type}://${proxy.host}:${proxy.port}`]
    };

    if (proxy.username && proxy.password) {
      config.args.push(`--proxy-auth=${proxy.username}:${proxy.password}`);
    }

    return config;
  }

  // Get proxy configuration for FFmpeg
  getFFmpegProxyConfig(proxy) {
    if (!proxy) return {};

    const config = {
      headers: {}
    };

    if (proxy.type === 'http' || proxy.type === 'https') {
      config.headers['Proxy'] = `${proxy.type}://${proxy.host}:${proxy.port}`;
    }

    if (proxy.username && proxy.password) {
      const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
      config.headers['Proxy-Authorization'] = `Basic ${auth}`;
    }

    return config;
  }
}

export default ProxyManager;
