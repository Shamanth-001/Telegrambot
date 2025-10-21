// Debug Sources Script (Enhanced)
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { searchFmovies } from '../src/fmovies.js';
import { searchFlixer } from '../src/flixer.js';
import { searchMkvCinemas } from '../src/mkvcinemas.js';
import { searchCineby } from '../src/cineby.js';
import { searchCataz } from '../src/cataz.js';
import { searchMovierulz } from '../src/movierulz.js';

puppeteer.use(StealthPlugin());

// DEBUG MODE CONFIGURATION
const DEBUG_BROKEN_SOURCES = true;
const BROKEN_SOURCES = ['Fmovies', 'Flixer', 'Cineby', 'Cataz', 'Movierulz'];

const SOURCES = [
    { name: 'Fmovies', fn: searchFmovies },
    { name: 'Flixer', fn: searchFlixer },
    { name: 'MkvCinemas', fn: searchMkvCinemas },
    { name: 'Cineby', fn: searchCineby },
    { name: 'Cataz', fn: searchCataz },
    { name: 'Movierulz', fn: searchMovierulz },
];

function getActiveSources(allSources) {
    if (!DEBUG_BROKEN_SOURCES) return allSources;
    return allSources.filter(s => BROKEN_SOURCES.includes(s.name));
}

function buildSearchUrl(sourceName, query) {
    const enc = encodeURIComponent(query);
    switch (sourceName) {
        case 'Fmovies': return `https://www.fmovies.gd/search?keyword=${enc}`;
        case 'Flixer': return `https://flixer.sh/search?q=${enc}`;
        case 'Cineby': return `https://www.cineby.app/search?q=${enc}`;
        case 'Cataz': return `https://cataz.to/search/${enc}`;
        case 'Movierulz': return `https://www.5movierulz.gripe/?s=${enc}`;
        case 'MkvCinemas': return `https://mkvcinemas.haus/?s=${enc}`;
        default: return '';
    }
}

async function fetchHtmlSnippet(url) {
    if (!url) return '';
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1500));
        const html = await page.content();
        return html.slice(0, 600).replace(/\s+/g, ' ').trim();
    } catch (e) {
        return `Failed to load HTML: ${e.message}`;
    } finally {
        if (browser) await browser.close();
    }
}

function compareTitlesToQuery(results, query) {
    const q = String(query).toLowerCase();
    return results.map(r => ({
        title: r.title,
        matches: r.title && r.title.toLowerCase().includes(q)
    }));
}

async function debugSource(sourceName, searchFunction, query) {
    console.log(`\n🔍 Debugging ${sourceName} with query: "${query}"`);
    console.log('='.repeat(60));

    const searchUrl = buildSearchUrl(sourceName, query);
    if (searchUrl) console.log(`🔗 Search URL: ${searchUrl}`);

    try {
        const results = await searchFunction(query);
        console.log(`✅ ${sourceName} Results: ${results.length}`);

        if (results.length > 0) {
            console.log('📋 Exact parsed titles:');
            results.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.title}`));
            const compare = compareTitlesToQuery(results.slice(0, 5), query);
            console.log('🔎 Title comparisons:');
            compare.forEach((c, i) => console.log(`  ${i + 1}. match=${c.matches} | ${c.title}`));
        } else {
            console.log('❌ No results found - investigating...');
            if (searchUrl) {
                const htmlSnippet = await fetchHtmlSnippet(searchUrl);
                console.log('🧩 HTML snippet:', htmlSnippet);
            }
        }

        return results;
    } catch (error) {
        console.log(`❌ ${sourceName} Error: ${error.message}`);
        console.log('Stack:', error.stack);
        return [];
    }
}

async function debugAllSources() {
    const testQuery = 'The Avengers';

    console.log('🔹 Debug Mode Active 🔹');
    if (DEBUG_BROKEN_SOURCES) {
        console.log(`- Only use broken sources: ${BROKEN_SOURCES.join(', ')}`);
    }
    console.log('🚀 Starting Source Debug Session');
    console.log('='.repeat(60));

    const active = getActiveSources(SOURCES);
    console.log('🔹 Active Sources for Debug:', active.map(s => s.name));

    for (const src of active) {
        await debugSource(src.name, src.fn, testQuery);
    }

    console.log('\n🏁 Debug session completed!');
}

debugAllSources().catch(console.error);
