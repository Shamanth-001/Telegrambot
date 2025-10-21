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
      'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Roaming\\StreamFab\\StreamFab.exe'
    ];
    
    let streamfabPath = null;
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        streamfabPath = path;
        break;
      }
    }
    
    if (!streamfabPath) {
      throw new Error('StreamFab executable not found. Please check installation.');
    }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`[StreamFab] Attempt ${attempt}/${retries}`);
      
      // Clean up any existing file
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        logger.info(`[StreamFab] Cleaned up existing file: ${outputPath}`);
      }
      
      // StreamFab command line interface with proper parameters
      // Try different parameter formats based on the executable
      let streamfabCmd;
      if (streamfabPath.includes('DRMDownloader.exe')) {
        // DRMDownloader.exe parameters
        streamfabCmd = `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --quality "best"`;
      } else {
        // StreamFab64.exe parameters (GUI-based, might not work)
        streamfabCmd = `"${streamfabPath}" --input "${movieUrl}" --output "${outputPath}" --format "mp4" --quality "best"`;
      }
      
      logger.info(`[StreamFab] Command: ${streamfabCmd}`);
      
      // Execute StreamFab with timeout
      const { stdout, stderr } = await execAsync(streamfabCmd, { 
        timeout: 300000, // 5 minutes timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      // Check if output file was created
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        
        if (fileSize > 0) {
          logger.info(`[StreamFab] Download successful: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
          
          return {
            success: true,
            filePath: outputPath,
            fileSize: fileSize,
            source: 'StreamFab DRM Bypass',
            method: 'Professional DRM bypass tool',
            attempt: attempt,
            stdout: stdout,
            stderr: stderr
          };
        } else {
          throw new Error('StreamFab created empty file');
        }
      }
      
      throw new Error('StreamFab download failed - no output file created');
      
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
 * Universal DRM Bypass - Try all tools in sequence
 * @param {string} movieUrl - Movie URL
 * @param {string} outputPath - Output file path
 * @returns {Object} Download result
 */
export async function downloadWithUniversalDRMBypass(movieUrl, outputPath) {
  logger.info(`[UniversalDRM] Starting universal DRM bypass: ${movieUrl}`);
  
  const drmTools = [
    { name: 'StreamFab', fn: downloadWithStreamFab },
    { name: 'DumpMedia', fn: downloadWithDumpMedia },
    { name: 'RecordFab', fn: downloadWithRecordFab },
    { name: 'DRMPlugin', fn: downloadWithDRMPlugin },
    { name: 'Keeprix', fn: downloadWithKeeprix }
  ];
  
  for (const tool of drmTools) {
    try {
      logger.info(`[UniversalDRM] Trying ${tool.name}...`);
      const result = await tool.fn(movieUrl, outputPath);
      
      if (result.success) {
        logger.info(`[UniversalDRM] ${tool.name} succeeded!`);
        return {
          ...result,
          source: `Universal DRM Bypass (${tool.name})`,
          method: `Multi-tool DRM bypass - ${tool.name} succeeded`
        };
      }
    } catch (error) {
      logger.warn(`[UniversalDRM] ${tool.name} failed: ${error.message}`);
    }
  }
  
  return {
    success: false,
    error: 'All DRM bypass tools failed'
  };
}


