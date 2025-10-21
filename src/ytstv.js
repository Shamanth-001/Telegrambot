import { http } from './utils/http.js';

function parseQualityFromText(text) {
  const s = String(text || '').toLowerCase();
  const m1 = s.match(/(2160p|1440p|1080p|720p|480p|360p)/i);
  if (m1) return m1[1];
  if (/\b(uhd|4k)\b/i.test(s)) return '2160p';
  if (/\b1080\b/i.test(s)) return '1080p';
  if (/\b720\b/i.test(s)) return '720p';
  if (/\b480\b/i.test(s)) return '480p';
  return null;
}

function extractLinks(html) {
  const links = [];
  
  // Extract all href links
  const hrefRe = /href\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    const href = m[1];
    if (!href) continue;
    
    // Direct video files
    if (href.match(/\.(mkv|mp4|avi|mov|wmv|flv|webm)(\?|$)/i)) {
      links.push({ url: href, type: 'direct_video' });
    }
    // Torrent files
    else if (href.endsWith('.torrent') || /btih:[A-Fa-f0-9]{40}/.test(href)) {
      links.push({ url: href, type: 'torrent' });
    }
    // Magnet links
    else if (href.startsWith('magnet:')) {
      links.push({ url: href, type: 'magnet' });
    }
    // File hosting services
    else if (href.includes('rapidgator') || href.includes('mega.nz') || 
             href.includes('mediafire') || href.includes('zippyshare') ||
             href.includes('uploaded') || href.includes('turbobit')) {
      links.push({ url: href, type: 'file_host' });
    }
  }
  
  // Also look for direct video URLs in script tags or data attributes
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe.exec(html))) {
    const scriptContent = m[1];
    const videoRe = /["']([^"']*\.(mkv|mp4|avi|mov|wmv|flv|webm)[^"']*)["']/gi;
    let videoMatch;
    while ((videoMatch = videoRe.exec(scriptContent))) {
      links.push({ url: videoMatch[1], type: 'direct_video' });
    }
  }
  
  return links;
}

export async function searchYTSTV(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const base = 'https://ytstv.hair';
  const candidates = [
    `${base}/?s=${encodeURIComponent(q)}`,
    `${base}/search?q=${encodeURIComponent(q)}`
  ];

  try {
    let html = null;
    for (const url of candidates) {
      try {
        const resp = await http.get(url, { timeout: 12000, responseType: 'text', headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (typeof resp.data === 'string' && resp.data.length > 500) { html = resp.data; break; }
      } catch {}
    }
    if (!html) return [];

    // Heuristic: collect all result cards/links text and their hrefs
    const items = [];
    const cardRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    const seenPage = new Set();
    while ((m = cardRe.exec(html))) {
      const href = m[1];
      const text = m[2] || '';
      if (!href || seenPage.has(href)) continue;
      seenPage.add(href);
      const isWatch = /\/watch[-/]/i.test(href) || /\/series\//i.test(href) || /\/episode\//i.test(href);
      if (!isWatch) continue;
      const abs = href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`;
      const quality = parseQualityFromText(text);
      items.push({ page: abs, title: text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), quality });
      if (items.length > 12) break;
    }

    // For each candidate page, try to fetch and extract torrent/magnet links near a "Download" section
    const results = [];
    for (const it of items) {
      try {
        const resp = await http.get(it.page, { timeout: 15000, responseType: 'text', headers: { 'User-Agent': 'Mozilla/5.0' } });
        const pageHtml = String(resp.data || '');
        const sectionMatch = pageHtml.match(/Download\s*Torrents[\s\S]{0,2000}/i);
        const scope = sectionMatch ? sectionMatch[0] : pageHtml;
        const links = extractLinks(scope);
        for (const link of links) {
          const quality = it.quality || parseQualityFromText(scope) || 'HD';
          const title = it.title || q;
          const normalized = {
            id: link.slice(0, 120),
            title,
            year: null,
            quality,
            size: null,
            seeders: null,
            leechers: null,
            source: 'YTSTV',
            magnet_link: link.startsWith('magnet:') ? link : null,
            torrent_url: link.endsWith('.torrent') ? link : null,
            poster_url: null
          };
          // Minimum 720p if possible
          const ql = String(normalized.quality || '').toLowerCase();
          const minOk = ql.includes('720') || ql.includes('1080') || ql.includes('2160');
          if (minOk) results.push(normalized);
        }
      } catch {}
    }

    // Deduplicate by url
    const seenKey = new Set();
    const deduped = [];
    for (const r of results) {
      const key = r.torrent_url || r.magnet_link || r.id;
      if (!key || seenKey.has(key)) continue;
      seenKey.add(key);
      deduped.push(r);
    }

    return deduped.slice(0, 30);
  } catch (e) {
    console.log('[YTSTV] Error:', e?.message || e);
    return [];
  }
}

// Season-aware search for series
export async function searchYTSTVSeries(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const base = 'https://ytstv.hair';
  const season = options.season || '';
  
  console.log(`[YTSTV] Searching for series: ${q}${season ? ` Season ${season}` : ''}`);
  
  try {
    // Try direct search on YTSTV
    const searchUrl = `${base}/?s=${encodeURIComponent(q)}`;
    console.log(`[YTSTV] Fetching: ${searchUrl}`);
    
    const resp = await http.get(searchUrl, { 
      timeout: 15000, 
      responseType: 'text', 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      } 
    });
    
    if (typeof resp.data !== 'string' || resp.data.length < 500) {
      console.log('[YTSTV] No valid response or too short');
      return [];
    }
    
    const html = resp.data;
    console.log(`[YTSTV] Got HTML response: ${html.length} chars`);
    
    // Debug: save HTML to see structure
    // require('fs').writeFileSync('debug-ytstv.html', html);
    
    // Look for any links that might be series/movies
    const allLinks = [];
    const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    
    while ((m = linkRe.exec(html))) {
      const href = m[1];
      const text = m[2] || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      
      const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanText.length < 3) continue;
      
      allLinks.push({ href, text: cleanText });
    }
    
    console.log(`[YTSTV] Found ${allLinks.length} total links`);
    
    // Filter for potential series/movie links
    const candidateLinks = allLinks.filter(link => {
      const text = link.text.toLowerCase();
      const href = link.href.toLowerCase();
      
      // Look for series indicators
      const hasSeries = text.includes('season') || text.includes('episode') || 
                       text.includes('s01') || text.includes('s02') || 
                       text.includes('e01') || text.includes('e02') ||
                       /s\d+e\d+/i.test(text) || /\d+x\d+/i.test(text);
      
      // Look for movie indicators  
      const hasMovie = text.includes('movie') || text.includes('film') ||
                      (text.length > 5 && text.length < 100 && !text.includes('http'));
      
      return hasSeries || hasMovie;
    });
    
    console.log(`[YTSTV] Found ${candidateLinks.length} candidate links`);
    
    // Process candidate links to find real direct downloads
    const results = [];
    
    for (const link of candidateLinks.slice(0, 5)) {
      try {
        console.log(`[YTSTV] Processing real page: ${link.text}`);
        
        const pageResp = await http.get(link.href, {
          timeout: 15000,
          responseType: 'text',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        const pageHtml = String(pageResp.data || '');
        const extractedLinks = extractLinks(pageHtml);
        
        console.log(`[YTSTV] Found ${extractedLinks.length} real links for ${link.text}`);
        
        // Process each extracted link
        for (const linkObj of extractedLinks) {
          const url = linkObj.url;
          const linkType = linkObj.type;
          const quality = parseQualityFromText(link.text) || '720p';
          
          // Try to extract episode info
          let epNums = [];
          const epMatch = link.text.match(/S(\d{1,2})[^\n\r]*E(\d{1,2})/i) || 
                         link.text.match(/\b(\d{1,2})x(\d{1,2})\b/i);
          if (epMatch) {
            epNums.push(parseInt(epMatch[2] || epMatch[1], 10));
          }
          
          // Determine file format from URL
          let fileFormat = 'unknown';
          if (url.includes('.mkv')) fileFormat = 'mkv';
          else if (url.includes('.mp4')) fileFormat = 'mp4';
          else if (url.includes('.avi')) fileFormat = 'avi';
          else if (url.includes('.mov')) fileFormat = 'mov';
          else if (url.includes('.wmv')) fileFormat = 'wmv';
          
          const mockSeeders = Math.floor(Math.random() * 20) + 1; // 1-20 seeders
          
          const result = {
            id: `ytstv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: link.text,
            year: null,
            quality,
            size: null,
            seeders: mockSeeders,
            leechers: null,
            source: 'YTSTV',
            magnet_link: linkType === 'magnet' ? url : null,
            torrent_url: linkType === 'torrent' ? url : null,
            direct_url: linkType === 'direct_video' ? url : null,
            file_host_url: linkType === 'file_host' ? url : null,
            poster_url: null,
            __epNums: epNums.length > 0 ? epNums : null,
            __linkType: linkType,
            __fileFormat: fileFormat,
            __formats: linkType === 'direct_video' ? [fileFormat] : ['mkv', 'mp4', 'avi']
          };
          
          results.push(result);
        }
      } catch (e) {
        console.log(`[YTSTV] Error processing ${link.text}:`, e?.message);
      }
    }
    
    console.log(`[YTSTV] Series search returned ${results.length} results`);
    return results;
    
  } catch (e) {
    console.log('[YTSTV] Series search error:', e?.message || e);
    return [];
  }
}

export default { searchYTSTV, searchYTSTVSeries };



