// yt-dlp HLS Converter - Alternative to Streamlink
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class YtDlpConverter {
    constructor() {
        this.ytdlpPath = 'yt-dlp'; // Assumes yt-dlp is in PATH
        this.ffmpegPath = 'ffmpeg';
        this.timeout = 300000; // 5 minutes
    }

    /**
     * Convert streaming URL to MKV using yt-dlp + FFmpeg
     * @param {string} streamUrl - Streaming URL (movie page or direct stream)
     * @param {string} outputPath - Output MKV file path
     * @returns {Promise<Object>} - Conversion result
     */
    async convertWithYtDlp(streamUrl, outputPath) {
        console.log(`[YtDlpConverter] 🎬 Starting yt-dlp conversion...`);
        console.log(`[YtDlpConverter] 📺 URL: ${streamUrl}`);
        console.log(`[YtDlpConverter] 📁 Output: ${outputPath}`);

        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            // yt-dlp command with HLS native support
            const ytdlpArgs = [
                '--no-playlist',
                '-o', outputPath,
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                '--external-downloader', this.ffmpegPath,
                '--external-downloader-args', 'ffmpeg_i:-t 120',
                streamUrl
            ];

            console.log(`[YtDlpConverter] 🔧 yt-dlp command: yt-dlp ${ytdlpArgs.join(' ')}`);

            const ytdlpProcess = spawn(this.ytdlpPath, ytdlpArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let ytdlpOutput = '';
            let ytdlpError = '';

            ytdlpProcess.stdout.on('data', (data) => {
                ytdlpOutput += data.toString();
            });

            ytdlpProcess.stderr.on('data', (data) => {
                ytdlpError += data.toString();
            });

            ytdlpProcess.on('close', (code) => {
                if (code === 0) {
                    if (fs.existsSync(outputPath)) {
                        const stats = fs.statSync(outputPath);
                        const duration = Date.now() - startTime;
                        console.log(`[YtDlpConverter] 🎉 yt-dlp conversion successful!`);
                        resolve({
                            success: true,
                            outputPath: outputPath,
                            fileSize: stats.size,
                            duration: duration,
                            method: 'yt-dlp'
                        });
                    } else {
                        reject(new Error('Output file not created'));
                    }
                } else {
                    console.log(`[YtDlpConverter] ❌ yt-dlp failed with code: ${code}`);
                    console.log(`[YtDlpConverter] 📝 yt-dlp stderr: ${ytdlpError}`);
                    reject(new Error(`yt-dlp failed with code ${code}: ${ytdlpError}`));
                }
            });

            ytdlpProcess.on('error', (err) => {
                console.log(`[YtDlpConverter] ❌ yt-dlp spawn error: ${err.message}`);
                reject(new Error(`yt-dlp spawn error: ${err.message}`));
            });

            // Set timeout
            setTimeout(() => {
                ytdlpProcess.kill();
                reject(new Error('yt-dlp timeout'));
            }, this.timeout);
        });
    }

    /**
     * Get available formats for a URL
     * @param {string} streamUrl - Streaming URL
     * @returns {Promise<Array>} - Available formats
     */
    async getFormats(streamUrl) {
        return new Promise((resolve, reject) => {
            const ytdlpArgs = [
                '--list-formats',
                '--no-playlist',
                streamUrl
            ];

            const ytdlpProcess = spawn(this.ytdlpPath, ytdlpArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';

            ytdlpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            ytdlpProcess.on('close', (code) => {
                if (code === 0) {
                    // Parse formats from output
                    const formats = this.parseFormats(output);
                    resolve(formats);
                } else {
                    reject(new Error(`Failed to get formats: ${code}`));
                }
            });

            ytdlpProcess.on('error', (err) => {
                reject(new Error(`yt-dlp spawn error: ${err.message}`));
            });
        });
    }

    /**
     * Parse formats from yt-dlp output
     * @param {string} output - yt-dlp output
     * @returns {Array} - Parsed formats
     */
    parseFormats(output) {
        const lines = output.split('\n');
        const formats = [];

        for (const line of lines) {
            if (line.includes('|') && line.includes('mp4') || line.includes('webm')) {
                const parts = line.split('|');
                if (parts.length >= 3) {
                    formats.push({
                        id: parts[0].trim(),
                        ext: parts[1].trim(),
                        resolution: parts[2].trim(),
                        size: parts[3] ? parts[3].trim() : 'unknown'
                    });
                }
            }
        }

        return formats;
    }
}

// Export for testing
export default YtDlpConverter;

// Test function
async function testYtDlpConverter() {
    const converter = new YtDlpConverter();
    
    // Test with a sample URL
    const testUrl = 'https://example.com/stream';
    const outputPath = './test-ytdlp.mkv';
    
    try {
        const result = await converter.convertWithYtDlp(testUrl, outputPath);
        console.log('yt-dlp test result:', result);
    } catch (error) {
        console.error('yt-dlp test failed:', error);
    }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testYtDlpConverter();
}
