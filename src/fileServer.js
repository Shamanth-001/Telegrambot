import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const PORT = Number(process.env.FILE_SERVER_PORT || 8080);
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'downloads');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function parseRange(range, fileSize) {
  if (!range) return null;
  
  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  
  return { start, end };
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.torrent': 'application/x-bittorrent',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed'
  };
  
  return types[ext] || 'application/octet-stream';
}

function serveFile(req, res, filePath) {
  const filename = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  console.log(`[FileServer] Serving: ${filename} (${fileSize} bytes)`);
  
  if (range) {
    const parsedRange = parseRange(range, fileSize);
    
    if (!parsedRange) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }
    
    const { start, end } = parsedRange;
    const chunkSize = (end - start) + 1;
    
    console.log(`[FileServer] Range request: ${start}-${end} (${chunkSize} bytes)`);
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': getContentType(filename)
    });
    
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error(`[FileServer] Stream error: ${err.message}`);
      res.end();
    });
    
  } else {
    // Full file download
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': getContentType(filename),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error(`[FileServer] Stream error: ${err.message}`);
      res.end();
    });
  }
}

function listFiles() {
  try {
    const files = fs.readdirSync(DOWNLOAD_DIR)
      .filter(file => {
        const filePath = path.join(DOWNLOAD_DIR, file);
        return fs.statSync(filePath).isFile();
      })
      .map(file => {
        const filePath = path.join(DOWNLOAD_DIR, file);
        const stat = fs.statSync(filePath);
        return {
          name: file,
          size: stat.size,
          modified: stat.mtime,
          url: `http://localhost:${PORT}/download/${encodeURIComponent(file)}`
        };
      })
      .sort((a, b) => b.modified - a.modified);
    
    return files;
  } catch (error) {
    console.error(`[FileServer] Error listing files: ${error.message}`);
    return [];
  }
}

function createServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (pathname === '/') {
      // List available files
      const files = listFiles();
      
      const html = `
<!DOCTYPE html>
<html>
<head>
    <title>File Server - Downloads</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .file-list { margin-top: 20px; }
        .file-item { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 15px; 
            margin: 10px 0; 
            background: #f8f9fa; 
            border-radius: 5px; 
            border-left: 4px solid #007bff;
        }
        .file-info { flex: 1; }
        .file-name { font-weight: bold; color: #333; margin-bottom: 5px; }
        .file-meta { font-size: 0.9em; color: #666; }
        .download-btn { 
            background: #007bff; 
            color: white; 
            padding: 8px 16px; 
            text-decoration: none; 
            border-radius: 4px; 
            font-size: 0.9em;
        }
        .download-btn:hover { background: #0056b3; }
        .empty { text-align: center; color: #666; font-style: italic; }
        .stats { text-align: center; margin-bottom: 20px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📁 File Server</h1>
        <div class="stats">
            <p>📊 ${files.length} files available | 🚀 Range resume supported</p>
        </div>
        <div class="file-list">
            ${files.length === 0 ? 
              '<div class="empty">No files available. Download some content first!</div>' :
              files.map(file => `
                <div class="file-item">
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-meta">
                            📏 ${(file.size / 1024 / 1024).toFixed(1)} MB | 
                            📅 ${file.modified.toLocaleString()}
                        </div>
                    </div>
                    <a href="${file.url}" class="download-btn">📥 Download</a>
                </div>
              `).join('')
            }
        </div>
    </div>
</body>
</html>`;
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      
    } else if (pathname.startsWith('/download/')) {
      // Download specific file
      const filename = decodeURIComponent(pathname.slice('/download/'.length));
      const filePath = path.join(DOWNLOAD_DIR, filename);
      
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
      }
      
      serveFile(req, res, filePath);
      
    } else if (pathname === '/api/files') {
      // API endpoint for file list
      const files = listFiles();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files, null, 2));
      
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  
  // If desired port is busy, fall back to a random available port
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`[FileServer] Port ${PORT} in use, trying a random available port...`);
      server.listen(0);
    } else {
      throw err;
    }
  });

  server.listen(PORT, () => {
    const actualPort = server.address().port;
    console.log(`[FileServer] 🚀 Server running on http://localhost:${actualPort}`);
    console.log(`[FileServer] 📁 Download directory: ${DOWNLOAD_DIR}`);
    console.log(`[FileServer] 🔄 Range resume: Enabled`);
  });
  
  return server;
}

export { createServer, DOWNLOAD_DIR };
export default createServer;

