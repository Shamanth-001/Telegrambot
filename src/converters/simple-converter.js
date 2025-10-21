// Simple 4-Method Converter - Streamlined Architecture
import { convertWithBrowser } from '../browser-mkv-converter.js';
import { StreamlinkConverter } from './streamlink-converter.js';
import { YtDlpConverter } from './ytdlp-converter.js';
// Removed fast-streamer import - not needed for full MKV movies
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class SimpleConverter {
    constructor() {
        this.methods = [
            {
                name: 'Browser HLS Capture',
                description: 'Puppeteer-based HLS extraction with automatic anti-bot handling',
                fn: this.tryBrowserHLS.bind(this),
                priority: 1
            },
            {
                name: 'Streamlink CLI',
                description: 'Battle-tested HLS client with direct FFmpeg piping',
                fn: this.tryStreamlinkCLI.bind(this),
                priority: 2
            },
            {
                name: 'yt-dlp HLS',
                description: 'yt-dlp with native HLS support and FFmpeg integration',
                fn: this.tryYtDlpHLS.bind(this),
                priority: 3
            },
            {
                name: 'Torrent Streaming',
                description: 'Peer-to-peer delivery with WebTorrent',
                fn: this.tryTorrentStreaming.bind(this),
                priority: 4
            }
        ];
        
        // Initialize converters
        this.streamlinkConverter = new StreamlinkConverter();
        this.ytdlpConverter = new YtDlpConverter();
    }

    /**
     * Main conversion method - tries all methods in priority order
     * @param {string} input - Input URL or magnet link
     * @param {string} outputPath - Output file path
     * @returns {Promise<Object>} - Conversion result
     */
    async convert(input, outputPath) {
        console.log(`[SimpleConverter] 🚀 Starting streamlined conversion...`);
        console.log(`[SimpleConverter] 📥 Input: ${input}`);
        console.log(`[SimpleConverter] 📁 Output: ${outputPath}`);

        // Detect input type
        const inputType = this.detectInputType(input);
        console.log(`[SimpleConverter] 🔍 Detected input type: ${inputType}`);

        // Filter methods based on input type
        const applicableMethods = this.methods.filter(method => {
            if (inputType === 'torrent' && method.name === 'Torrent Streaming') return true;
            if (inputType === 'stream' && method.name !== 'Torrent Streaming') return true;
            return false;
        });

        // Try each method in priority order
        for (const method of applicableMethods) {
            try {
                console.log(`[SimpleConverter] 🔄 Trying: ${method.name}`);
                console.log(`[SimpleConverter] 📝 ${method.description}`);
                
                const result = await method.fn(input, outputPath);
                
                if (result.success) {
                    console.log(`[SimpleConverter] ✅ SUCCESS with ${method.name}!`);
                    return {
                        success: true,
                        method: method.name,
                        outputPath: result.outputPath || outputPath,
                        fileSize: result.fileSize || 0,
                        duration: result.duration || 0
                    };
                }
            } catch (error) {
                console.log(`[SimpleConverter] ❌ ${method.name} failed: ${error.message}`);
                continue;
            }
        }

        // All methods failed
        console.log(`[SimpleConverter] ❌ All conversion methods failed`);
        return {
            success: false,
            error: 'All conversion methods failed',
            methods: applicableMethods.map(m => m.name)
        };
    }

    /**
     * Detect input type (torrent, stream, etc.)
     * @param {string} input - Input string
     * @returns {string} - Input type
     */
    detectInputType(input) {
        if (input.startsWith('magnet:') || input.includes('.torrent')) {
            return 'torrent';
        }
        return 'stream';
    }

    /**
     * Method 1: Browser HLS Capture
     * @param {string} input - Stream URL
     * @param {string} outputPath - Output path
     * @returns {Promise<Object>} - Result
     */
    async tryBrowserHLS(input, outputPath) {
        console.log(`[SimpleConverter] 🌐 Browser HLS Capture - Navigating to page...`);
        
        try {
            const result = await convertWithBrowser(input, outputPath);
            
            if (result.success) {
                return {
                    success: true,
                    outputPath: result.outputPath,
                    fileSize: result.fileSize,
                    duration: result.duration
                };
            }
            
            throw new Error(result.error || 'Browser HLS capture failed');
        } catch (error) {
            throw new Error(`Browser HLS capture failed: ${error.message}`);
        }
    }

    /**
     * Method 2: Streamlink CLI
     * @param {string} input - Stream URL
     * @param {string} outputPath - Output path
     * @returns {Promise<Object>} - Result
     */
    async tryStreamlinkCLI(input, outputPath) {
        console.log(`[SimpleConverter] 🔧 Streamlink CLI - Using battle-tested HLS client...`);
        
        try {
            const result = await this.streamlinkConverter.convert(input, outputPath);
            
            if (result.success) {
                return {
                    success: true,
                    outputPath: result.outputPath,
                    fileSize: result.fileSize,
                    duration: result.duration
                };
            }
            
            throw new Error(result.error || 'Streamlink conversion failed');
        } catch (error) {
            throw new Error(`Streamlink CLI failed: ${error.message}`);
        }
    }

    /**
     * Method 3: yt-dlp HLS
     * @param {string} input - Stream URL
     * @param {string} outputPath - Output path
     * @returns {Promise<Object>} - Result
     */
    async tryYtDlpHLS(input, outputPath) {
        console.log(`[SimpleConverter] 🎬 yt-dlp HLS - Native HLS support with FFmpeg...`);
        
        try {
            const result = await this.ytdlpConverter.convertWithYtDlp(input, outputPath);
            
            if (result.success) {
                return {
                    success: true,
                    outputPath: result.outputPath,
                    fileSize: result.fileSize,
                    duration: result.duration
                };
            }
            
            throw new Error(result.error || 'yt-dlp conversion failed');
        } catch (error) {
            throw new Error(`yt-dlp HLS failed: ${error.message}`);
        }
    }

    /**
     * Method 4: Torrent Streaming
     * @param {string} input - Magnet link or torrent URL
     * @param {string} outputPath - Output path
     * @returns {Promise<Object>} - Result
     */
    async tryTorrentStreaming(input, outputPath) {
        console.log(`[SimpleConverter] 🧲 Torrent Streaming - Peer-to-peer delivery...`);
        
        try {
            // Import WebTorrent dynamically to avoid issues if not installed
            const WebTorrent = await import('webtorrent');
            
            return new Promise((resolve, reject) => {
                console.log(`[SimpleConverter] 🎬 Starting torrent download: ${input.substring(0, 50)}...`);
                
                const client = new WebTorrent.default();
                
                client.add(input, { path: path.dirname(outputPath) }, (torrent) => {
                    console.log(`[SimpleConverter] 🎬 Torrent ready, finding video file...`);
                    console.log(`[SimpleConverter] 📊 Torrent info: ${torrent.files.length} files`);
                    
                    // Find the largest video file
                    const videoFiles = torrent.files.filter(file => 
                        /\.(mp4|mkv|avi|mov|wmv|flv|webm)$/i.test(file.name)
                    );
                    
                    if (videoFiles.length === 0) {
                        reject(new Error('No video files found in torrent'));
                        return;
                    }
                    
                    const videoFile = videoFiles.reduce((largest, current) => 
                        current.length > largest.length ? current : largest
                    );
                    
                    console.log(`[SimpleConverter] 📹 Found video file: ${videoFile.name} (${Math.round(videoFile.length / 1024 / 1024)}MB)`);
                    
                    // Create a readable stream from the torrent file
                    const stream = videoFile.createReadStream();
                    const writeStream = fs.createWriteStream(outputPath);
                    
                    stream.pipe(writeStream);
                    
                    writeStream.on('finish', () => {
                        console.log(`[SimpleConverter] ✅ Torrent streaming successful!`);
                        client.destroy();
                        resolve({
                            success: true,
                            outputPath: outputPath,
                            fileSize: videoFile.length,
                            duration: 0 // Duration not available from torrent
                        });
                    });
                    
                    writeStream.on('error', (err) => {
                        console.log(`[SimpleConverter] ❌ Torrent streaming failed: ${err.message}`);
                        client.destroy();
                        reject(err);
                    });
                });
                
                client.on('error', (error) => {
                    console.log(`[SimpleConverter] ❌ Torrent error: ${error.message}`);
                    client.destroy();
                    reject(error);
                });
            });
        } catch (error) {
            throw new Error(`Torrent streaming failed: ${error.message}`);
        }
    }
}

// Export for testing
export default SimpleConverter;

// Test function
async function testConverter() {
    const converter = new SimpleConverter();
    
    // Test with a sample URL
    const testUrl = 'https://example.com/stream';
    const outputPath = './test-output.mkv';
    
    try {
        const result = await converter.convert(testUrl, outputPath);
        console.log('Test result:', result);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testConverter();
}
