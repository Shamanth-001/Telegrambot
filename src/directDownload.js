import { http } from './utils/http.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Store for active downloads
const activeDownloads = new Map();

export async function downloadDirectFile(url, filename, options = {}) {
  const downloadId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, filename);
  
  console.log(`[DirectDownload] Starting download: ${url}`);
  console.log(`[DirectDownload] Saving to: ${filePath}`);
  
  try {
    // Check if URL supports range requests
    const headResp = await http.head(url, { timeout: 10000 });
    const supportsRange = headResp.headers['accept-ranges'] === 'bytes';
    const contentLength = parseInt(headResp.headers['content-length'] || '0', 10);
    
    console.log(`[DirectDownload] Supports range: ${supportsRange}, Size: ${contentLength} bytes`);
    
    if (supportsRange && contentLength > 0) {
      return await downloadWithRange(url, filePath, contentLength, downloadId);
    } else {
      return await downloadDirect(url, filePath, downloadId);
    }
  } catch (error) {
    console.log(`[DirectDownload] Error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      downloadId
    };
  }
}

async function downloadWithRange(url, filePath, totalSize, downloadId) {
  const chunkSize = 8 * 1024 * 1024; // 8MB chunks
  let downloaded = 0;
  
  // Check for existing partial file
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    downloaded = stats.size;
    console.log(`[DirectDownload] Resuming from ${downloaded} bytes`);
  }
  
  const fileStream = fs.createWriteStream(filePath, { flags: downloaded > 0 ? 'a' : 'w' });
  
  try {
    while (downloaded < totalSize) {
      const end = Math.min(downloaded + chunkSize - 1, totalSize - 1);
      const range = `bytes=${downloaded}-${end}`;
      
      console.log(`[DirectDownload] Downloading range: ${range}`);
      
      const response = await http.get(url, {
        headers: { 'Range': range },
        responseType: 'stream',
        timeout: 30000
      });
      
      // Write chunk to file
      await new Promise((resolve, reject) => {
        response.data.pipe(fileStream, { end: false });
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });
      
      downloaded = end + 1;
      const progress = ((downloaded / totalSize) * 100).toFixed(1);
      console.log(`[DirectDownload] Progress: ${progress}% (${downloaded}/${totalSize})`);
      
      // Store progress
      activeDownloads.set(downloadId, {
        progress: parseFloat(progress),
        downloaded,
        total: totalSize,
        status: 'downloading'
      });
    }
    
    fileStream.end();
    
    console.log(`[DirectDownload] Download completed: ${filePath}`);
    
    return {
      success: true,
      filePath,
      size: totalSize,
      downloadId
    };
    
  } catch (error) {
    fileStream.end();
    console.log(`[DirectDownload] Range download error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      downloadId
    };
  }
}

async function downloadDirect(url, filePath, downloadId) {
  try {
    console.log(`[DirectDownload] Direct download: ${url}`);
    
    const response = await http.get(url, {
      responseType: 'stream',
      timeout: 300000 // 5 minutes
    });
    
    const fileStream = fs.createWriteStream(filePath);
    
    return new Promise((resolve, reject) => {
      let downloaded = 0;
      
      response.data.on('data', (chunk) => {
        downloaded += chunk.length;
        console.log(`[DirectDownload] Downloaded: ${downloaded} bytes`);
        
        // Store progress
        activeDownloads.set(downloadId, {
          progress: 0, // Can't calculate without total size
          downloaded,
          total: null,
          status: 'downloading'
        });
      });
      
      response.data.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`[DirectDownload] Direct download completed: ${filePath}`);
        
        const stats = fs.statSync(filePath);
        resolve({
          success: true,
          filePath,
          size: stats.size,
          downloadId
        });
      });
      
      fileStream.on('error', (error) => {
        console.log(`[DirectDownload] File stream error: ${error.message}`);
        reject({
          success: false,
          error: error.message,
          downloadId
        });
      });
      
      response.data.on('error', (error) => {
        console.log(`[DirectDownload] Response stream error: ${error.message}`);
        reject({
          success: false,
          error: error.message,
          downloadId
        });
      });
    });
    
  } catch (error) {
    console.log(`[DirectDownload] Direct download error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      downloadId
    };
  }
}

export function getDownloadProgress(downloadId) {
  return activeDownloads.get(downloadId) || null;
}

export function cancelDownload(downloadId) {
  activeDownloads.delete(downloadId);
  console.log(`[DirectDownload] Cancelled download: ${downloadId}`);
}

export function cleanupDownload(downloadId) {
  activeDownloads.delete(downloadId);
}

export default { downloadDirectFile, getDownloadProgress, cancelDownload, cleanupDownload };
