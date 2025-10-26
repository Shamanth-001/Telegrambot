import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * DRM Bypass Tools for Direct Video Download
 * Supports: StreamFab, DumpMedia, RecordFab, Media-Downloader-DRM-Plugin, Keeprix
 */

/**
 * StreamFab Video Downloader - Professional DRM bypass
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithStreamFab(movieUrl, outputPath, retries = 3, delay = 5000) {
  logger.info(`[StreamFab] Starting DRM bypass download: ${movieUrl} (Retries: ${retries})`);
  
  // StreamFab executable path - check multiple possible locations
  const possiblePaths = [
    'C:\\Program Files\\DVDFab\\StreamFab\\DRMDownloader.exe',
    'C:\\Program Files\\DVDFab\\StreamFab\\StreamFab64.exe',
    'C:\\Program Files\\StreamFab\\StreamFab.exe',
    'C:\\Program Files (x86)\\StreamFab\\StreamFab.exe',
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\StreamFab\\StreamFab.exe',
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Roaming\\StreamFab\\StreamFab.exe',
    'C:\\Program Files\\DVDFab\\StreamFab\\StreamFab.exe',
    'C:\\Program Files (x86)\\DVDFab\\StreamFab\\StreamFab.exe'
  ];
  
  let streamfabPath = null;
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      streamfabPath = path;
      logger.info(`[StreamFab] Found executable at: ${path}`);
      break;
    }
  }
  
  if (!streamfabPath) {
    logger.warn(`[StreamFab] Executable not found in any of the expected locations`);
    return {
      success: false,
      error: 'StreamFab executable not found. Please check installation.',
      suggestion: 'Install StreamFab or check if it\'s in a different location'
    };
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`[StreamFab] Attempt ${attempt}/${retries}`);
      
      // Clean up any existing file
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        logger.info(`[StreamFab] Cleaned up existing file: ${outputPath}`);
      }
      
      // StreamFab command line interface with enhanced parameters
      const streamfabCommands = [];
      
      if (streamfabPath.includes('DRMDownloader.exe')) {
        // DRMDownloader.exe parameters - try multiple formats
        streamfabCommands.push(
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --quality "best" --no-gui`,
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --quality "1080p" --no-gui`,
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --no-gui`,
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --no-gui`
        );
      } else {
        // StreamFab64.exe parameters - try different approaches
        streamfabCommands.push(
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --quality "best" --no-gui`,
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --quality "1080p" --no-gui`,
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --no-gui`,
          `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --no-gui`,
          `"${streamfabPath}" --url "${movieUrl}" --output "${outputPath}" --format "mp4" --no-gui`,
          `"${streamfabPath}" --url "${movieUrl}" --output "${outputPath}" --no-gui`
        );
      }
      
      let commandSuccess = false;
      let lastError = null;
      
      for (let cmdIndex = 0; cmdIndex < streamfabCommands.length; cmdIndex++) {
        const streamfabCmd = streamfabCommands[cmdIndex];
        logger.info(`[StreamFab] Trying command ${cmdIndex + 1}/${streamfabCommands.length}: ${streamfabCmd}`);
        
        try {
          // Execute StreamFab with enhanced timeout and buffer
          const { stdout, stderr } = await execAsync(streamfabCmd, { 
            timeout: 600000, // 10 minutes timeout
            maxBuffer: 1024 * 1024 * 50, // 50MB buffer
            windowsHide: true
          });
          
          logger.info(`[StreamFab] Command ${cmdIndex + 1} stdout: ${stdout}`);
          if (stderr) logger.info(`[StreamFab] Command ${cmdIndex + 1} stderr: ${stderr}`);
          
          commandSuccess = true;
          break;
          
        } catch (error) {
          logger.warn(`[StreamFab] Command ${cmdIndex + 1} failed: ${error.message}`);
          lastError = error;
          
          if (cmdIndex < streamfabCommands.length - 1) {
            logger.info(`[StreamFab] Trying next command...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      if (!commandSuccess) {
        throw new Error(`All StreamFab commands failed. Last error: ${lastError?.message || 'Unknown error'}`);
      }
      
      // Check if output file was created with multiple possible extensions
      const possiblePaths = [
        outputPath,
        outputPath + '.mp4',
        outputPath + '.mkv',
        outputPath + '.avi',
        outputPath + '.mov',
        outputPath + '.flv'
      ];
      
      let downloadedFile = null;
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          const stats = fs.statSync(path);
          if (stats.size > 1024) { // At least 1KB
            downloadedFile = path;
            break;
          }
        }
      }
      
      if (downloadedFile) {
        const stats = fs.statSync(downloadedFile);
        const fileSize = stats.size;
        
        logger.info(`[StreamFab] Download successful: ${downloadedFile} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
          success: true,
          filePath: downloadedFile,
          fileSize: fileSize,
          source: 'StreamFab DRM Bypass',
          method: 'Professional DRM bypass tool',
          attempt: attempt
        };
      }
      
      throw new Error('StreamFab download failed - no valid output file created');
      
    } catch (error) {
      logger.warn(`[StreamFab] Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < retries) {
        logger.info(`[StreamFab] Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(`[StreamFab] All ${retries} attempts failed`);
        return {
          success: false,
          error: `All ${retries} attempts failed: ${error.message}`,
          attempts: retries
        };
      }
    }
  }
}

/**
 * DumpMedia All-in-One Video Downloader - DRM bypass
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithDumpMedia(movieUrl, outputPath) {
  try {
    logger.info(`[DumpMedia] Starting DRM bypass download: ${movieUrl}`);
    
    // DumpMedia command line interface
    const dumpmediaCmd = `dumpmedia --url "${movieUrl}" --output "${outputPath}" --quality high --drm-bypass --format mp4`;
    
    logger.info(`[DumpMedia] Command: ${dumpmediaCmd}`);
    const { stdout, stderr } = await execAsync(dumpmediaCmd);
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const fileSize = stats.size;
      
      logger.info(`[DumpMedia] Download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      
      return {
        success: true,
        filePath: outputPath,
        fileSize: fileSize,
        source: 'DumpMedia DRM Bypass',
        method: 'All-in-One DRM bypass tool'
      };
    }
    
    throw new Error('DumpMedia download failed - no output file created');
    
  } catch (error) {
    logger.error(`[DumpMedia] Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * RecordFab - DRM bypass recording
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithRecordFab(movieUrl, outputPath) {
  try {
    logger.info(`[RecordFab] Starting DRM bypass recording: ${movieUrl}`);
    
    // RecordFab command line interface
    const recordfabCmd = `recordfab --url "${movieUrl}" --output "${outputPath}" --quality 1080p --drm-bypass --format mp4`;
    
    logger.info(`[RecordFab] Command: ${recordfabCmd}`);
    const { stdout, stderr } = await execAsync(recordfabCmd);
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const fileSize = stats.size;
      
      logger.info(`[RecordFab] Recording successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      
      return {
        success: true,
        filePath: outputPath,
        fileSize: fileSize,
        source: 'RecordFab DRM Bypass',
        method: 'DRM bypass recording tool'
      };
    }
    
    throw new Error('RecordFab recording failed - no output file created');
    
  } catch (error) {
    logger.error(`[RecordFab] Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Media-Downloader-DRM-Plugin - Open source DRM bypass
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithDRMPlugin(movieUrl, outputPath) {
  try {
    logger.info(`[DRMPlugin] Starting open source DRM bypass: ${movieUrl}`);
    
    // Media-Downloader-DRM-Plugin command
    const drmPluginCmd = `media-downloader --url "${movieUrl}" --output "${outputPath}" --drm-bypass --quality 1080p --format mp4`;
    
    logger.info(`[DRMPlugin] Command: ${drmPluginCmd}`);
    const { stdout, stderr } = await execAsync(drmPluginCmd);
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const fileSize = stats.size;
      
      logger.info(`[DRMPlugin] Download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      
      return {
        success: true,
        filePath: outputPath,
        fileSize: fileSize,
        source: 'DRM Plugin Bypass',
        method: 'Open source DRM bypass plugin'
      };
    }
    
    throw new Error('DRM Plugin download failed - no output file created');
    
  } catch (error) {
    logger.error(`[DRMPlugin] Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Keeprix Video Downloader - HD DRM bypass
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithKeeprix(movieUrl, outputPath) {
  try {
    logger.info(`[Keeprix] Starting HD DRM bypass download: ${movieUrl}`);
    
    // Keeprix command line interface
    const keeprixCmd = `keeprix --url "${movieUrl}" --output "${outputPath}" --quality hd --drm-bypass --format mp4`;
    
    logger.info(`[Keeprix] Command: ${keeprixCmd}`);
    const { stdout, stderr } = await execAsync(keeprixCmd);
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const fileSize = stats.size;
      
      logger.info(`[Keeprix] Download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      
      return {
        success: true,
        filePath: outputPath,
        fileSize: fileSize,
        source: 'Keeprix DRM Bypass',
        method: 'HD DRM bypass downloader'
      };
    }
    
    throw new Error('Keeprix download failed - no output file created');
    
  } catch (error) {
    logger.error(`[Keeprix] Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Enhanced Universal DRM Bypass - Try all tools with intelligent fallback
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithUniversalDRMBypass(movieUrl, outputPath) {
  logger.info(`[UniversalDRM] Starting enhanced universal DRM bypass: ${movieUrl}`);
  
  const drmTools = [
    { name: 'StreamFab', fn: downloadWithStreamFab, priority: 1 },
    { name: 'DumpMedia', fn: downloadWithDumpMedia, priority: 2 },
    { name: 'RecordFab', fn: downloadWithRecordFab, priority: 3 },
    { name: 'DRMPlugin', fn: downloadWithDRMPlugin, priority: 4 },
    { name: 'Keeprix', fn: downloadWithKeeprix, priority: 5 }
  ];
  
  // Sort by priority
  drmTools.sort((a, b) => a.priority - b.priority);
  
  const results = [];
  
  for (const tool of drmTools) {
    try {
      logger.info(`[UniversalDRM] Trying ${tool.name} (Priority ${tool.priority})...`);
      const startTime = Date.now();
      
      const result = await tool.fn(movieUrl, outputPath);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        logger.info(`[UniversalDRM] ${tool.name} succeeded in ${duration}ms!`);
        return {
          ...result,
          source: `Universal DRM Bypass (${tool.name})`,
          method: `Multi-tool DRM bypass - ${tool.name} succeeded`,
          duration: duration,
          priority: tool.priority
        };
      } else {
        results.push({
          tool: tool.name,
          success: false,
          error: result.error,
          duration: duration,
          priority: tool.priority
        });
        logger.warn(`[UniversalDRM] ${tool.name} failed: ${result.error}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      results.push({
        tool: tool.name,
        success: false,
        error: error.message,
        duration: duration,
        priority: tool.priority
      });
      logger.warn(`[UniversalDRM] ${tool.name} failed with exception: ${error.message}`);
    }
  }
  
  // Log detailed results for debugging
  logger.error(`[UniversalDRM] All DRM bypass tools failed. Results:`, results);
  
  return {
    success: false,
    error: 'All DRM bypass tools failed',
    results: results,
    suggestion: 'Try installing additional DRM bypass tools or check if the URL is accessible'
  };
}

/**
 * Smart Fallback Download - Try multiple approaches intelligently
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithSmartFallback(movieUrl, outputPath) {
  logger.info(`[SmartFallback] Starting smart fallback download: ${movieUrl}`);
  
  const downloadMethods = [
    {
      name: 'StreamFab DRM Bypass',
      fn: () => downloadWithStreamFab(movieUrl, outputPath),
      priority: 1,
      description: 'Professional DRM bypass tool'
    },
    {
      name: 'Universal DRM Bypass',
      fn: () => downloadWithUniversalDRMBypass(movieUrl, outputPath),
      priority: 2,
      description: 'Multi-tool DRM bypass approach'
    },
    {
      name: 'DumpMedia DRM Bypass',
      fn: () => downloadWithDumpMedia(movieUrl, outputPath),
      priority: 3,
      description: 'All-in-One DRM bypass tool'
    },
    {
      name: 'RecordFab DRM Bypass',
      fn: () => downloadWithRecordFab(movieUrl, outputPath),
      priority: 4,
      description: 'DRM bypass recording tool'
    }
  ];
  
  // Sort by priority
  downloadMethods.sort((a, b) => a.priority - b.priority);
  
  const results = [];
  
  for (const method of downloadMethods) {
    try {
      logger.info(`[SmartFallback] Trying ${method.name} (Priority ${method.priority})...`);
      const startTime = Date.now();
      
      const result = await method.fn();
      const duration = Date.now() - startTime;
      
      if (result.success) {
        logger.info(`[SmartFallback] ${method.name} succeeded in ${duration}ms!`);
        return {
          ...result,
          source: `Smart Fallback (${method.name})`,
          method: method.description,
          duration: duration,
          priority: method.priority
        };
      } else {
        results.push({
          method: method.name,
          success: false,
          error: result.error,
          duration: duration,
          priority: method.priority
        });
        logger.warn(`[SmartFallback] ${method.name} failed: ${result.error}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      results.push({
        method: method.name,
        success: false,
        error: error.message,
        duration: duration,
        priority: method.priority
      });
      logger.warn(`[SmartFallback] ${method.name} failed with exception: ${error.message}`);
    }
  }
  
  // Log detailed results for debugging
  logger.error(`[SmartFallback] All download methods failed. Results:`, results);
  
  return {
    success: false,
    error: 'All download methods failed',
    results: results,
    suggestion: 'Try different URLs or check if DRM bypass tools are properly installed'
  };
}


