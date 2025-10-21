// Website Inspector Script
import puppeteer from 'puppeteer';
import { http } from '../src/utils/http.js';
import * as cheerio from 'cheerio';

async function inspectWebsite(name, url, searchQuery) {
    console.log(`\n🔍 Inspecting ${name}: ${url}`);
    console.log('='.repeat(60));
    
    try {
        // Try HTTP first
        const response = await http.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        if (response.data) {
            const $ = cheerio.load(response.data);
            
            console.log(`✅ HTTP Success - Page loaded`);
            console.log(`📄 Page title: ${$('title').text()}`);
            
            // Look for common movie selectors
            const selectors = [
                '.movie-item', '.film-item', '.result-item', '.search-result',
                '.post', '.movie-card', '.film-card', '.item', '.card',
                '[class*="movie"]', '[class*="film"]', '[class*="result"]'
            ];
            
            console.log(`🔍 Checking selectors:`);
            selectors.forEach(selector => {
                const elements = $(selector);
                if (elements.length > 0) {
                    console.log(`  ✅ ${selector}: ${elements.length} elements`);
                    if (elements.length <= 5) {
                        elements.each((i, el) => {
                            const text = $(el).text().trim().substring(0, 100);
                            console.log(`    ${i + 1}. ${text}...`);
                        });
                    }
                }
            });
            
            // Check for search forms
            const searchForms = $('form[action*="search"], input[name*="search"], input[name*="query"]');
            if (searchForms.length > 0) {
                console.log(`🔍 Found ${searchForms.length} search forms/inputs`);
            }
            
        } else {
            console.log(`❌ HTTP failed - trying browser`);
            await inspectWithBrowser(name, url);
        }
        
    } catch (error) {
        console.log(`❌ HTTP Error: ${error.message}`);
        console.log(`🔄 Trying browser inspection...`);
        await inspectWithBrowser(name, url);
    }
}

async function inspectWithBrowser(name, url) {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
        
        const title = await page.title();
        console.log(`✅ Browser Success - Page loaded`);
        console.log(`📄 Page title: ${title}`);
        
        // Get page content
        const content = await page.content();
        const $ = cheerio.load(content);
        
        // Look for common movie selectors
        const selectors = [
            '.movie-item', '.film-item', '.result-item', '.search-result',
            '.post', '.movie-card', '.film-card', '.item', '.card',
            '[class*="movie"]', '[class*="film"]', '[class*="result"]'
        ];
        
        console.log(`🔍 Checking selectors:`);
        selectors.forEach(selector => {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`  ✅ ${selector}: ${elements.length} elements`);
                if (elements.length <= 5) {
                    elements.each((i, el) => {
                        const text = $(el).text().trim().substring(0, 100);
                        console.log(`    ${i + 1}. ${text}...`);
                    });
                }
            }
        });
        
    } catch (error) {
        console.log(`❌ Browser Error: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function inspectAllWebsites() {
    const websites = [
        { name: 'Fmovies', url: 'https://www.fmovies.gd/search?keyword=The%20Avengers' },
        { name: 'Flixer', url: 'https://flixer.sh/search?q=The%20Avengers' },
        { name: 'MkvCinemas', url: 'https://mkvcinemas.haus/?s=The%20Avengers' },
        { name: 'Cineby', url: 'https://www.cineby.app/search?q=The%20Avengers' },
        { name: 'Cataz', url: 'https://cataz.to/search/The%20Avengers' }
    ];
    
    console.log('🚀 Starting Website Inspection');
    console.log('='.repeat(60));
    
    for (const site of websites) {
        await inspectWebsite(site.name, site.url, 'The Avengers');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between requests
    }
    
    console.log('\n🏁 Website inspection completed!');
}

inspectAllWebsites().catch(console.error);
