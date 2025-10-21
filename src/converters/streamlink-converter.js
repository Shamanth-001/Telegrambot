// Streamlink CLI Converter - Battle-tested HLS client
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class StreamlinkConverter {
    constructor() {
        this.streamlinkPath = 'streamlink'; // Assume streamlink is in PATH
        this.timeout = 300000; // 5 minutes
    }

    /**
     * Convert streaming URL to MKV using Streamlink + FFmpeg
     * @param {string} streamUrl - Streaming URL (movie page or direct stream)
     * @param {string} outputPath - Output MKV file path
     * @returns {Promise<Object>} - Conversion result
     */
    async convert(streamUrl, outputPath) {
        console.log(`[StreamlinkConverter] 🎬 Starting Streamlink conversion...`);
        console.log(`[StreamlinkConverter] 📺 URL: ${streamUrl}`);
        console.log(`[StreamlinkConverter] 📁 Output: ${outputPath}`);

        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            // Streamlink command to get best quality stream URL
            // Use proper HTTP header flag; some builds don't support --user-agent
            const streamlinkArgs = [
                '--stream-url',
                '--http-header', 'User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                streamUrl,
                'best'
            ];

            console.log(`[StreamlinkConverter] 🔧 Streamlink command: streamlink ${streamlinkArgs.join(' ')}`);

            const streamlinkProcess = spawn(this.streamlinkPath, streamlinkArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let streamlinkOutput = '';
            let streamlinkError = '';

            streamlinkProcess.stdout.on('data', (data) => {
                streamlinkOutput += data.toString();
            });

            streamlinkProcess.stderr.on('data', (data) => {
                streamlinkError += data.toString();
                console.error(`[StreamlinkConverter] 📝 Streamlink stderr: ${data.toString()}`);
            });

            streamlinkProcess.on('close', (code) => {
                if (code === 0 && streamlinkOutput.trim()) {
                    const actualStreamUrl = streamlinkOutput.trim();
                    
                    if (actualStreamUrl.startsWith('http')) {
                        console.log(`[StreamlinkConverter] ✅ Streamlink successfully extracted URL: ${actualStreamUrl}`);
                        
                        // Now use FFmpeg to convert the stream to MKV
                        this.convertWithFFmpeg(actualStreamUrl, outputPath)
                            .then(result => {
                                const duration = Date.now() - startTime;
                                resolve({
                                    success: true,
                                    outputPath: result.outputPath,
                                    fileSize: result.fileSize,
                                    duration: duration,
                                    method: 'streamlink+ffmpeg'
                                });
                            })
                            .catch(error => {
                                reject(error);
                            });
                    } else {
                        reject(new Error(`Invalid stream URL from Streamlink: ${actualStreamUrl}`));
                    }
                } else {
                    console.log(`[StreamlinkConverter] ❌ Streamlink failed with code: ${code}`);
                    reject(new Error(`Streamlink failed with code ${code}: ${streamlinkError}`));
                }
            });

            streamlinkProcess.on('error', (err) => {
                console.log(`[StreamlinkConverter] ❌ Streamlink spawn error: ${err.message}`);
                reject(new Error(`Streamlink spawn error: ${err.message}`));
            });

            // Set timeout
            setTimeout(() => {
                streamlinkProcess.kill();
                reject(new Error('Streamlink timeout'));
            }, this.timeout);
        });
    }

    /**
     * Convert stream URL to MKV using FFmpeg
     * @param {string} streamUrl - Direct stream URL
     * @param {string} outputPath - Output MKV file path
     * @returns {Promise<Object>} - Conversion result
     */
    async convertWithFFmpeg(streamUrl, outputPath) {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-i', streamUrl,
                '-t', '120',               // Limit duration to first 2 minutes
                '-c', 'copy',              // Copy streams without re-encoding
                '-f', 'matroska',          // Output format: MKV
                '-avoid_negative_ts', 'make_zero',
                outputPath
            ];

            console.log(`[StreamlinkConverter] 🔧 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let ffmpegStderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                ffmpegStderr += data.toString();
            });

            ffmpegProcess.on('close', (ffmpegCode) => {
                if (ffmpegCode === 0) {
                    if (fs.existsSync(outputPath)) {
                        const stats = fs.statSync(outputPath);
                        console.log(`[StreamlinkConverter] 🎉 FFmpeg conversion successful!`);
                        resolve({
                            success: true,
                            outputPath: outputPath,
                            fileSize: stats.size
                        });
                    } else {
                        reject(new Error('Output file not created'));
                    }
                } else {
                    console.log(`[StreamlinkConverter] ❌ FFmpeg failed with code: ${ffmpegCode}`);
                    console.log(`[StreamlinkConverter] 📝 FFmpeg stderr: ${ffmpegStderr}`);
                    reject(new Error(`FFmpeg failed with code ${ffmpegCode}`));
                }
            });

            ffmpegProcess.on('error', (err) => {
                console.log(`[StreamlinkConverter] ❌ FFmpeg spawn error: ${err.message}`);
                reject(new Error(`FFmpeg spawn error: ${err.message}`));
            });
        });
    }
}

// Export for testing
export default StreamlinkConverter;

// Test function
async function testStreamlinkConverter() {
    const converter = new StreamlinkConverter();
    
    // Test with a sample URL
    const testUrl = 'https://example.com/stream';
    const outputPath = './test-streamlink.mkv';
    
    try {
        const result = await converter.convert(testUrl, outputPath);
        console.log('Streamlink test result:', result);
    } catch (error) {
        console.error('Streamlink test failed:', error);
    }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testStreamlinkConverter();
}
