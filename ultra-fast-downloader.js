import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

puppeteer.use(StealthPlugin());

console.log('🚀 ULTRA FAST DOWNLOADER - NO STUCK GUARANTEE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚡ Multiple download methods with timeout protection');
console.log('');

async function ultraFastDownload() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    try {
        const page = await browser.newPage();
        
        // Set aggressive timeouts to prevent stuck
        page.setDefaultTimeout(30000); // 30 seconds max
        page.setDefaultNavigationTimeout(30000);
        
        // Test with Pushpa
        const movieTitle = 'Pushpa';
        const searchUrl = `https://einthusan.tv/movie/results/?lang=kannada&query=${encodeURIComponent(movieTitle)}`;
        
        console.log(`🎯 Testing: ${movieTitle}`);
        console.log(`📁 Output: ${path.join(process.cwd(), 'downloads')}`);
        console.log('');
        
        console.log(`🔍 Step 1: Searching with timeout protection...`);
        
        // Navigation with timeout protection
        await Promise.race([
            page.goto(searchUrl, { waitUntil: 'networkidle2' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), 30000))
        ]);
        
        console.log('✅ Search page loaded');
        
        // Wait for movie links with multiple selectors and timeout
        let movieLinks = [];
        try {
            await Promise.race([
                page.waitForSelector('a[href*="/movie/watch/"], .movie-item a, .result-item a, [class*="movie"] a', { visible: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('No movie links found')), 15000))
            ]);
            
            // Try multiple selectors for movie links
            const selectors = [
                'a[href*="/movie/watch/"]',
                '.movie-item a',
                '.result-item a',
                '[class*="movie"] a',
                'a[href*="watch"]',
                '.card a',
                '.item a'
            ];
            
            for (const selector of selectors) {
                try {
                    const links = await page.$$eval(selector, links => 
                        links.slice(0, 3).map(link => link.href).filter(href => href.includes('watch'))
                    );
                    if (links.length > 0) {
                        movieLinks = links;
                        console.log(`✅ Found ${movieLinks.length} links with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
        } catch (e) {
            console.log('⚠️ No movie links found with standard selectors, trying alternative approach...');
            
            // Alternative approach - look for any links that might be movies
            movieLinks = await page.$$eval('a', links => 
                links.slice(0, 10).map(link => link.href).filter(href => 
                    href.includes('watch') || href.includes('movie') || href.includes('einthusan')
                )
            );
        }
        console.log(`🔍 Found ${movieLinks.length} movie links`);
        
        if (movieLinks.length === 0) {
            throw new Error('No movie links found');
        }
        
        console.log('✅ Clicking first movie link with timeout protection...');
        
        // Navigation with timeout protection
        await Promise.race([
            page.goto(movieLinks[0], { waitUntil: 'networkidle2' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Movie page timeout')), 30000))
        ]);
        
        console.log('✅ Movie page loaded');
        console.log('');
        
        // Ultra-fast popup handling with timeout
        console.log('🛡️ ULTRA-FAST POPUP HANDLING');
        console.log('⚡ Using aggressive timeout protection...');
        
        try {
            const popupSelectors = [
                '.popup', '.modal', '[id*="cookie"]', '[class*="consent"]',
                'button:contains("AGREE")', 'button:contains("Agree")', 'button:contains("Accept")',
                '.qc-cmp2-summary-buttons button:last-child', 'button[class*="primary"]',
                'button[class*="agree"]', '[data-testid*="agree"]', '.consent-button', '.accept-button'
            ];
            
            let popupHandled = false;
            for (const selector of popupSelectors) {
                try {
                    console.log(`🎯 Looking for popup: ${selector}`);
                    const element = await Promise.race([
                        page.waitForSelector(selector, { visible: true }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Popup timeout')), 3000))
                    ]);
                    
                    if (element) {
                        console.log(`✅ Found popup: ${selector}`);
                        const clicked = await page.evaluate((sel) => {
                            const btn = document.querySelector(sel);
                            if (btn) {
                                btn.click();
                                return true;
                            }
                            return false;
                        }, selector);
                        
                        if (clicked) {
                            console.log(`✅ Popup clicked: ${selector}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            popupHandled = true;
                            break;
                        }
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (!popupHandled) {
                console.log('⚠️ No popup found - continuing...');
            } else {
                console.log('✅ Popup handled!');
            }
        } catch (e) {
            console.log('⚠️ Popup handling failed - continuing...');
        }
        
        console.log('');
        console.log('⏳ Detecting M3U8 stream with timeout protection...');
        
        // M3U8 detection with aggressive timeout
        let m3u8Url = null;
        const startTime = Date.now();
        const timeout = 60000; // 1 minute max
        
        while (Date.now() - startTime < timeout) {
            try {
                const requests = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('*')).map(el => {
                        const src = el.src || el.href || '';
                        return src.includes('.m3u8') ? src : null;
                    }).filter(Boolean);
                });
                
                if (requests.length > 0) {
                    m3u8Url = requests[0];
                    break;
                }
            } catch (e) {
                // Continue checking
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
            process.stdout.write('.');
        }
        
        console.log('');
        
        if (!m3u8Url) {
            throw new Error('No M3U8 stream found within timeout');
        }
        
        console.log(`🎯 M3U8 DETECTED: ${m3u8Url}`);
        console.log('');
        
        // Ultra-fast download methods with timeout protection
        console.log('🚀 ULTRA-FAST DOWNLOAD METHODS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const outputDir = path.join(process.cwd(), 'downloads');
        const outputFile = path.join(outputDir, `${movieTitle.replace(/\s+/g, '_')}_ultra_fast.mp4`);
        
        // Create downloads directory
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Ultra-fast download methods with timeout protection
        const ultraFastMethods = [
            {
                name: 'yt-dlp ULTRA FAST',
                handler: async (url, output) => {
                    return new Promise((resolve, reject) => {
                        console.log('🚀 Method 1: yt-dlp ULTRA FAST (20 connections + timeout protection)');
                        
                        const proc = spawn('yt-dlp', [
                            '-N', '50', // 50 concurrent fragments - ULTRA FAST
                            '--concurrent-fragments', '50',
                            '--buffer-size', '64K',
                            '--http-chunk-size', '50M',
                            '--retries', '5',
                            '--fragment-retries', '5',
                            '--socket-timeout', '15',
                            '--no-warnings',
                            '--progress',
                            '--external-downloader', 'aria2c',
                            '--external-downloader-args', 'aria2c:-x 16 -s 16 -k 1M',
                            url,
                            '-o', output
                        ]);
                        
                        let lastProgress = 0;
                        let progressTimeout = null;
                        
                        proc.stdout.on('data', (data) => {
                            const output = data.toString();
                            if (output.includes('%')) {
                                const progressMatch = output.match(/(\d+\.?\d*)%/);
                                if (progressMatch) {
                                    const progress = parseFloat(progressMatch[1]);
                                    if (progress > lastProgress) {
                                        console.log(`📊 yt-dlp Progress: ${progress}%`);
                                        lastProgress = progress;
                                        
                                        // Reset timeout on progress
                                        if (progressTimeout) clearTimeout(progressTimeout);
                                        progressTimeout = setTimeout(() => {
                                            console.log('⚠️ Progress timeout - killing process');
                                            proc.kill('SIGTERM');
                                        }, 30000);
                                    }
                                }
                            }
                        });
                        
                        proc.stderr.on('data', (data) => {
                            const output = data.toString();
                            if (output.includes('error') || output.includes('Error')) {
                                console.error(`❌ yt-dlp Error: ${output}`);
                            }
                        });
                        
                        // Overall timeout protection - REDUCED for faster completion
                        const overallTimeout = setTimeout(() => {
                            console.log('⚠️ Overall timeout - killing yt-dlp');
                            proc.kill('SIGTERM');
                            reject(new Error('yt-dlp timeout'));
                        }, 180000); // 3 minutes max
                        
                        proc.on('close', (code) => {
                            clearTimeout(overallTimeout);
                            if (progressTimeout) clearTimeout(progressTimeout);
                            
                            if (code === 0) {
                                resolve({ success: true, file: output, method: 'yt-dlp ULTRA FAST' });
                            } else {
                                reject(new Error(`yt-dlp exited with code ${code}`));
                            }
                        });
                        
                        proc.on('error', (err) => {
                            clearTimeout(overallTimeout);
                            if (progressTimeout) clearTimeout(progressTimeout);
                            reject(new Error(`yt-dlp error: ${err.message}`));
                        });
                    });
                }
            },
            {
                name: 'FFmpeg ULTRA FAST',
                handler: async (url, output) => {
                    return new Promise((resolve, reject) => {
                        console.log('🚀 Method 2: FFmpeg ULTRA FAST (optimized + timeout protection)');
                        
                        const proc = spawn('ffmpeg', [
                            '-reconnect', '1',
                            '-reconnect_streamed', '1',
                            '-reconnect_delay_max', '2',
                            '-timeout', '30000000',
                            '-analyzeduration', '5000000',
                            '-probesize', '5000000',
                            '-threads', '0',
                            '-i', url,
                            '-c', 'copy',
                            '-bsf:a', 'aac_adtstoasc',
                            '-err_detect', 'ignore_err',
                            '-fflags', '+genpts+igndts',
                            '-avoid_negative_ts', 'make_zero',
                            '-map', '0',
                            output,
                            '-y'
                        ]);
                        
                        let lastProgress = 0;
                        let progressTimeout = null;
                        
                        proc.stderr.on('data', (data) => {
                            const output = data.toString();
                            if (output.includes('time=')) {
                                const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
                                if (timeMatch) {
                                    const currentTime = parseInt(timeMatch[1]) * 3600 + 
                                                      parseInt(timeMatch[2]) * 60 + 
                                                      parseInt(timeMatch[3]);
                                    const progress = Math.min((currentTime / 7200) * 100, 100);
                                    if (progress > lastProgress) {
                                        console.log(`📊 FFmpeg Progress: ${progress.toFixed(1)}%`);
                                        lastProgress = progress;
                                        
                                        // Reset timeout on progress
                                        if (progressTimeout) clearTimeout(progressTimeout);
                                        progressTimeout = setTimeout(() => {
                                            console.log('⚠️ Progress timeout - killing FFmpeg');
                                            proc.kill('SIGTERM');
                                        }, 30000);
                                    }
                                }
                            }
                        });
                        
                        // Overall timeout protection - REDUCED for faster completion
                        const overallTimeout = setTimeout(() => {
                            console.log('⚠️ Overall timeout - killing FFmpeg');
                            proc.kill('SIGTERM');
                            reject(new Error('FFmpeg timeout'));
                        }, 180000); // 3 minutes max
                        
                        proc.on('close', (code) => {
                            clearTimeout(overallTimeout);
                            if (progressTimeout) clearTimeout(progressTimeout);
                            
                            if (code === 0) {
                                resolve({ success: true, file: output, method: 'FFmpeg ULTRA FAST' });
                            } else {
                                reject(new Error(`FFmpeg exited with code ${code}`));
                            }
                        });
                        
                        proc.on('error', (err) => {
                            clearTimeout(overallTimeout);
                            if (progressTimeout) clearTimeout(progressTimeout);
                            reject(new Error(`FFmpeg error: ${err.message}`));
                        });
                    });
                }
            }
        ];
        
        // Try each method with timeout protection
        for (const method of ultraFastMethods) {
            try {
                console.log(`\n🔧 Trying ${method.name} with timeout protection...`);
                
                const result = await Promise.race([
                    method.handler(m3u8Url, outputFile),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(`${method.name} timeout`)), 180000)
                    )
                ]);
                
                if (result.success) {
                    console.log(`✅ SUCCESS with ${method.name}!`);
                    console.log(`📁 File saved: ${result.file}`);
                    console.log(`🎬 Movie: ${movieTitle}`);
                    console.log(`⚡ Method: ${result.method}`);
                    console.log('🚀 NO STUCK GUARANTEE: SUCCESS!');
                    break;
                }
            } catch (error) {
                console.error(`❌ ${method.name} failed: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

ultraFastDownload().catch(console.error);
