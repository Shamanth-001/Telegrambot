import { healthcheckSources } from '../config/sources.js';
import { logger } from '../utils/logger.js';

/**
 * Check the health status of all configured sources
 * @returns {Promise<Object>} Health status of all sources
 */
export async function checkSourcesHealth() {
  const results = {};
  const startTime = Date.now();
  
  // Create promises for all health checks
  const healthPromises = Object.entries(healthcheckSources).map(async ([sourceName, url]) => {
    try {
      const result = await checkSingleSource(sourceName, url);
      return { sourceName, ...result };
    } catch (error) {
      logger.error(`[HealthCheck] Error checking ${sourceName}:`, error.message);
      return {
        sourceName,
        status: 'error',
        url,
        responseTime: null,
        error: error.message
      };
    }
  });
  
  // Wait for all checks to complete
  const healthResults = await Promise.allSettled(healthPromises);
  
  // Process results
  healthResults.forEach((result, index) => {
    const sourceName = Object.keys(healthcheckSources)[index];
    if (result.status === 'fulfilled') {
      results[sourceName] = result.value;
    } else {
      results[sourceName] = {
        sourceName,
        status: 'error',
        url: healthcheckSources[sourceName],
        responseTime: null,
        error: result.reason?.message || 'Unknown error'
      };
    }
  });
  
  const totalTime = Date.now() - startTime;
  
  return {
    results,
    totalTime,
    timestamp: new Date().toISOString(),
    checkedAt: new Date().toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  };
}

/**
 * Check a single source health
 * @param {string} sourceName - Name of the source
 * @param {string} url - URL to check
 * @returns {Promise<Object>} Health status of the source
 */
async function checkSingleSource(sourceName, url) {
  const startTime = Date.now();
  
  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    // Make HEAD request to check if site is accessible
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    clearTimeout(timeoutId);
    
    const responseTime = Date.now() - startTime;
    const statusCode = response.status;
    
    // Consider 200-399 as healthy
    const isHealthy = statusCode >= 200 && statusCode < 400;
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      url,
      statusCode,
      responseTime,
      error: null
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      return {
        status: 'timeout',
        url,
        statusCode: null,
        responseTime,
        error: 'Request timeout (5s)'
      };
    }
    
    return {
      status: 'error',
      url,
      statusCode: null,
      responseTime,
      error: error.message
    };
  }
}

/**
 * Format health check results for Telegram message
 * @param {Object} healthData - Health check results
 * @returns {string} Formatted message
 */
export function formatHealthMessage(healthData) {
  const { results, totalTime, checkedAt } = healthData;
  
  let message = '🌐 *Source Health Status*\n\n';
  
  // Sort sources by status (healthy first, then unhealthy)
  const sortedResults = Object.entries(results).sort(([, a], [, b]) => {
    const statusOrder = { 'healthy': 0, 'unhealthy': 1, 'timeout': 2, 'error': 3 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
  
  sortedResults.forEach(([sourceName, result]) => {
    const { status, url, statusCode, responseTime, error } = result;
    
    let emoji = '❌';
    let statusText = '';
    
    switch (status) {
      case 'healthy':
        emoji = '✅';
        statusText = `${statusCode} (${responseTime}ms)`;
        break;
      case 'unhealthy':
        emoji = '⚠️';
        statusText = `${statusCode} (${responseTime}ms)`;
        break;
      case 'timeout':
        emoji = '⏱️';
        statusText = 'Timeout';
        break;
      case 'error':
        emoji = '❌';
        statusText = error || 'Error';
        break;
    }
    
    const displayName = sourceName.charAt(0).toUpperCase() + sourceName.slice(1);
    message += `${emoji} *${displayName}* (${url})\n`;
    message += `   ${statusText}\n\n`;
  });
  
  message += `⏱️ *Total Check Time:* ${totalTime}ms\n`;
  message += `🕐 *Last Checked:* ${checkedAt} IST`;
  
  return message;
}

/**
 * Get summary statistics
 * @param {Object} healthData - Health check results
 * @returns {Object} Summary statistics
 */
export function getHealthSummary(healthData) {
  const { results } = healthData;
  const stats = {
    total: Object.keys(results).length,
    healthy: 0,
    unhealthy: 0,
    timeout: 0,
    error: 0
  };
  
  Object.values(results).forEach(result => {
    stats[result.status] = (stats[result.status] || 0) + 1;
  });
  
  return stats;
}
