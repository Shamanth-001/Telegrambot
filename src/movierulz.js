import { http } from './http.js';
import { load as loadHTML } from 'cheerio';

// Infer quality and size from a URL/filename and nearby text
function inferFromUrlAndText(url, text) {
  const ctx = `${url || ''} ${text || ''}`.toLowerCase();
  const qMatch = ctx.match(/(2160p|1440p|1080p|720p|480p|360p|320p|240p|web[- ]?dl|webrip|hdrip|bluray|brrip|dvdrip|bdrip|cam|ts|tc|hd)/i);
  let quality = qMatch ? qMatch[1] : null;
  const sMatch = ctx.match(/(\d+\.?\d*)\s*(gb|mb|tb)/i);
  let size = sMatch ? `${sMatch[1]} ${sMatch[2].toUpperCase()}` : null;
  if (!quality && sMatch) {
    const val = parseFloat(sMatch[1]);
    const unit = (sMatch[2] || '').toLowerCase();
    const gb = unit === 'tb' ? val * 1024 : unit === 'mb' ? val / 1024 : val;
    if (gb >= 1.8) quality = '1080p';
    else if (gb >= 0.8) quality = '720p';
    else if (gb >= 0.45) quality = '480p';
    else quality = '360p';
  }
  return { quality, size };
}

// Function to parse size text to GB
function parseSizeToGB(sizeText) {
  if (!sizeText) return null;

  const size = sizeText.toLowerCase().trim();
  const match = size.match(/(\d+\.?\d*)\s*(gb|mb|tb)/);

  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'tb':
      return value * 1024; // Convert TB to GB
    case 'gb':
      return value;
    case 'mb':
      return value / 1024; // Convert MB to GB
    default:
      return null;
  }
}

function parseQualityFromTitle(title) {
  if (!title) return null;
  const match = String(title).match(/(2160p|1440p|1080p|720p|480p|360p|WEB[- ]?DL|WEBRip|HDRip|BluRay|BRRip|DVDRip|BDRip|CAM|TS|TC|HD)/i);
  return match ? match[1] : null;
}

function rankQuality(quality) {
  if (!quality) return 999;
  const q = quality.toLowerCase();
  const order = [
    '2160p','1440p','1080p','720p','480p','360p',
    'we b-dl','web-dl','webdl','web dl','webrip','hdrip','bluray','brrip','bdrip','dvdrip',
    'hd','tc','ts','cam'
  ];
  const idx = order.findIndex(k => q.includes(k.replace(/\s/g, '')) || q.includes(k));
  return idx === -1 ? 500 : idx;
}

function isDubbedTitle(title) {
  const t = (title || '').toLowerCase();
  return t.includes('dubbed') || /\b(hindi|telugu|tamil|malayalam|kannada)\s*dubbed\b/i.test(title || '');
}

function detectLanguageFromTitle(title) {
  const t = (title || '').toLowerCase();
  if (/\b(kannada)\b/i.test(t)) return 'Kannada';
  if (/\b(telugu)\b/i.test(t)) return 'Telugu';
  if (/\b(tamil)\b/i.test(t)) return 'Tamil';
  if (/\b(hindi)\b/i.test(t)) return 'Hindi';
  if (/\b(malayalam)\b/i.test(t)) return 'Malayalam';
  if (/\b(bengali)\b/i.test(t)) return 'Bengali';
  if (/\b(punjabi)\b/i.test(t)) return 'Punjabi';
  if (/\b(gujarati)\b/i.test(t)) return 'Gujarati';
  if (/\b(marathi)\b/i.test(t)) return 'Marathi';
  if (/\b(english)\b/i.test(t)) return 'English';
  return null;
}

function enrichMagnetWithTrackers(magnetUri) {
  if (!magnetUri || !magnetUri.startsWith('magnet:')) return magnetUri;
  // Add comprehensive tracker list to improve peer discovery
  const trackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://208.83.20.20:6969/announce',
    'udp://tracker1.bt.moack.co.kr:80/announce',
    'udp://tracker-udp.gbitt.info:80/announce',
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://tracker.leechers-paradise.org:6969/announce',
    'udp://tracker.zer0day.to:1337/announce',
    'udp://tracker.leechers-paradise.org:6969/announce'
  ];
  const encoded = trackers.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return magnetUri.includes('tr=') ? `${magnetUri}&${encoded}` : `${magnetUri}${magnetUri.includes('&') ? '&' : ''}${encoded}`;
}

function computeMatchScore(query, title) {
  const q = (query || '').toLowerCase().trim();
  const t = (title || '').toLowerCase();
  if (!q || !t) return 10;
  if (t === q) return 0; // exact full string
  // For very short queries (<=3), require whole-word match to avoid false positives (e.g., RRR vs Grrr)
  if (q.length <= 3) {
    const wordRe = new RegExp(`(^|[^a-z0-9])${q}([^a-z0-9]|$)`);
    if (wordRe.test(t)) return 1;
  } else if (t.includes(q)) {
    return 1; // generic substring for longer queries
  }
  const qWords = q.split(/\s+/).filter(Boolean);
  const tWords = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  const wordHit = qWords.some(w => tWords.has(w));
  if (wordHit) return 2; // word-level match
  return 5; // weak match
}

export async function searchMovierulz(query, options = {}) {
  console.log(`[Movierulz] Searching for: ${query}`);
  
  try {
    // Working Movierulz domains
    const domains = [
      'https://www.5movierulz.guide',
      'https://www.5movierulz.lease'
    ];

    // Use only the best query to reduce processing time
    const titleOnly = query.replace(/\s*\(\d{4}\)\s*$/, '').trim();
    const bestQuery = titleOnly || query;

    for (const domain of domains) {
      try {
        console.log(`[Movierulz] Trying domain: ${domain}`);
        
        const results = [];

        // Try only the most effective search URL first
        const searchUrls = [
          `${domain}/search_movies?s=${encodeURIComponent(bestQuery)}`,
          `${domain}/?s=${encodeURIComponent(bestQuery)}`
        ];

        for (const searchUrl of searchUrls) {
          try {
            console.log(`[Movierulz] Trying search URL: ${searchUrl}`);
            
            const response = await http.get(searchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
              },
              timeout: 10000
            });

            const $ = loadHTML(response.data);

            // Try multiple selectors for movie items (broadened)
            const movieSelectors = [
              '.film',
              '.movie-item',
              '.post',
              '.item',
              '.search-result',
              '.movie-list .item',
              '.content .item',
              'article',
              '.movie-card',
              '.entry',
              '.movie',
              '.search-results .item',
              '.results .item',
              '.result-item',
              '.ml-item',
              'div[class*="movie"]',
              'li[class*="movie"]'
            ];

            let movieElements = [];
            for (const selector of movieSelectors) {
              const elements = $(selector);
              if (elements.length > 0) {
                movieElements = elements;
                console.log(`[Movierulz] Found ${elements.length} elements with selector: ${selector}`);
                break;
              }
            }

            if (movieElements.length === 0) {
              console.log(`[Movierulz] No movie elements found for ${searchUrl}`);
              continue;
            }

            // Process each movie element - limit to first 5 for speed
            const maxItems = 5;
            for (let i = 0; i < Math.min(movieElements.length, maxItems); i++) {
              // gather generously; we'll sort and slice later

              try {
                const element = movieElements[i];
                
                // Extract title and link
                let title = null;
                let link = null;
                
                // Try different selectors for title
                const titleSelectors = [
                  'a[title]',
                  'h2 a', 
                  'h3 a', 
                  '.title a',
                  '.movie-title a',
                  '.film-title a',
                  'a',
                  'h2',
                  'h3',
                  '.title',
                  '.movie-title',
                  '.film-title'
                ];
                
                for (const selector of titleSelectors) {
                  const titleEl = $(element).find(selector);
                  if (titleEl.length > 0) {
                    const titleText = titleEl.text().trim();
                    const href = titleEl.attr('href');
                    if (titleText && titleText.length > 0) {
                      title = titleText;
                      if (href) link = href;
                      break;
                    }
                  }
                }
                
                // If still no title, try getting text from the element itself
                if (!title) {
                  const elementText = $(element).text().trim();
                  if (elementText && elementText.length > 0) {
                    title = elementText;
                }
                }
                
                // If no link found yet, try to find any link in the element
                if (!link) {
                  const anyLink = $(element).find('a').first();
                  if (anyLink.length > 0) {
                    link = anyLink.attr('href');
                  }
                }

                if (!title || !link) continue;

                // Clean title
                const cleanTitle = title.trim();
                
                // Check if it's a movie (not TV series)
                const isMovie = !cleanTitle.toLowerCase().includes('season') &&
                               !cleanTitle.toLowerCase().includes('episode') &&
                               !cleanTitle.toLowerCase().includes('s01e');

                if (!isMovie) continue;

                // STRICT matching for Indian movies - must be same movie, different languages
                const titleLower = cleanTitle.toLowerCase();
                const queryLower = titleOnly.toLowerCase();

                // Check if it's a documentary or related content (exclude these)
                const isDocumentary = titleLower.includes('science of') ||
                                   titleLower.includes('behind the') ||
                                   titleLower.includes('making of') ||
                                   titleLower.includes('documentary') ||
                                   titleLower.includes('review') ||
                                   titleLower.includes('companion');

                // Extract core movie title (remove language/year/quality tags)
                const extractCoreTitle = (title) => {
                  return title.toLowerCase()
                    .replace(/\s*\(\d{4}\)\s*/g, '') // remove year
                    .replace(/\s*(hindi|telugu|tamil|kannada|malayalam|english|dubbed)\s*/gi, '') // remove language
                    .replace(/\s*(hdrip|brrip|dvdrip|webrip|bluray|cam|ts|tc)\s*/gi, '') // remove quality
                    .replace(/\s*movie\s*watch\s*online\s*free\s*/gi, '') // remove site text
                      .replace(/\s+/g, ' ')
                      .trim();
                  };

                  const coreQuery = extractCoreTitle(queryLower);
                  const coreTitle = extractCoreTitle(titleLower);

                  // STRICT match: core titles must be very similar (same movie, different languages)
                  const isActualMovie = !isDocumentary && (
                    coreTitle === coreQuery || // Exact core match
                    coreTitle.includes(coreQuery) || // Core title contains query
                    coreQuery.includes(coreTitle) // Query contains core title
                  );

                  console.log(`[Movierulz] Checking movie: "${cleanTitle}"`);
                  console.log(`[Movierulz] Search query: "${query}"`);
                  console.log(`[Movierulz] Core query: "${coreQuery}"`);
                  console.log(`[Movierulz] Core title: "${coreTitle}"`);
                  console.log(`[Movierulz] Is documentary: ${isDocumentary}`);
                  console.log(`[Movierulz] Is actual movie: ${isActualMovie}`);

                  if (isActualMovie) {
                    console.log(`[Movierulz] Adding movie: "${cleanTitle}"`);

                    const fullLink = link.startsWith('http') ? link : domain + link;

                    // Extract additional info
                    const yearElement = $(element).find('.year, .release-year, .date, .meta');
                    const yearText = yearElement.text().trim();
                    const movieYear = parseInt(yearText || 'NaN');

                    const qualityElement = $(element).find('.quality, .resolution, .format, .badge');
                    const quality = qualityElement.text().trim();

                    const posterElement = $(element).find('img');
                    const poster = posterElement.attr('src');

                    // Check size constraint (less than 3.5GB)
                    const sizeElement = $(element).find('.size, .file-size, .download-size');
                    const sizeText = sizeElement.text().trim();
                    const sizeInGB = parseSizeToGB(sizeText);

                    if (sizeInGB && sizeInGB > 3.5) {
                      console.log(`[Movierulz] Movie "${cleanTitle}" rejected: Size ${sizeText} exceeds 3.5GB`);
                      continue;
                    }

                    // Year filtering - if year is specified, filter by exact year match
                    const year = options.year || null;
                    if (year && !Number.isNaN(movieYear) && movieYear !== year) {
                      console.log(`[Movierulz] Movie "${cleanTitle}" rejected: Year ${movieYear} doesn't match ${year}`);
                      continue;
                    }

                    console.log(`[Movierulz] Movie found: "${cleanTitle}" ${sizeText ? `(${sizeText})` : ''}`);

                    // Extract torrent links from the movie page unless in fast mode
                    let torrents = [];
                    if (!options.fast) {
                      console.log(`[Movierulz] Extracting torrent links from: ${fullLink}`);
                      torrents = await getTorrentLinks(fullLink);
                      console.log(`[Movierulz] Found ${torrents.length} torrent links`);
                    }

                    // Find best torrent/magnet link
                    const bestTorrent = torrents.find(t => t.type === 'torrent') || null;
                    const bestMagnet = torrents.find(t => t.type === 'magnet') || null;
                    
                    // Movierulz: Try .torrent first, fallback to magnet if needed
                    const finalTorrentUrl = bestTorrent ? bestTorrent.url : null;
                    let finalMagnetLink = null;
                    if (!finalTorrentUrl && bestMagnet) {
                        finalMagnetLink = enrichMagnetWithTrackers(bestMagnet.url);
                    }

                    results.push({
                      id: `${cleanTitle}_${results.length}`,
                      title: cleanTitle,
                      year: movieYear || year || 'Unknown',
                      quality: parseQualityFromTitle(cleanTitle) || quality || 'HD',
                      size: sizeText || 'Unknown',
                      poster_url: poster ? (poster.startsWith('http') ? poster : domain + poster) : null,
                      link: fullLink,
                      torrents: torrents, // Add the extracted torrent links
                      source: 'Movierulz',
                      type: 'movie',
                      verified: true,
                      seeders: null,
                      leechers: null,
                      torrent_url: finalTorrentUrl,
                      magnet_link: finalMagnetLink,
                      imdb_rating: null,
                      is_dubbed: isDubbedTitle(cleanTitle),
                      language: detectLanguageFromTitle(cleanTitle),
                      match_score: computeMatchScore(queryLower, cleanTitle)
                    });
                  } else {
                    console.log(`[Movierulz] Movie "${cleanTitle}" doesn't match search query`);
                  }
                } catch (elementError) {
                  console.log(`[Movierulz] Error processing element ${i}: ${elementError.message}`);
                  continue;
                }
              }

              // Continue to try other URLs to aggregate more results

            } catch (urlError) {
              console.log(`[Movierulz] Search URL failed: ${urlError.message}`);
              continue;
            }
          }

        // Post-process results: enforce size, include original and dubbed, sort by match then quality
        const maxSizeGB = 3.5;
        const withinSize = (r) => {
          const m = (r.size || '').match(/(\d+\.?\d*)\s*(gb|mb|tb)/i);
          if (!m) return true; // keep unknown sizes
          const val = parseFloat(m[1]);
          const unit = (m[2] || '').toLowerCase();
          const gb = unit === 'tb' ? val * 1024 : unit === 'mb' ? val / 1024 : val;
          return gb <= maxSizeGB;
        };

        const filtered = results.filter(withinSize);

        // For very short queries (<=3), drop weak matches (avoid "Grrr" when searching "RRR")
        const isShortQuery = (query || '').trim().length <= 3;
        const strongEnough = filtered.filter(r => r.match_score <= (isShortQuery ? 1 : 2));
        const baseSet = strongEnough.length ? strongEnough : filtered;

        // Stable sort: preserve input order when scores tie (avoid shuffle)
        const sorted = baseSet
          .map((r, i) => ({ ...r, _qrank: rankQuality(r.quality || ''), _idx: i }))
          .sort((a, b) => (a.match_score - b.match_score) || (a._qrank - b._qrank) || (a._idx - b._idx))
          .slice(0, 15)
          .map(({ _qrank, _idx, ...rest }) => rest);

        if (sorted.length > 0) {
          console.log(`[Movierulz] Returning ${sorted.length} results after filtering/sorting`);
          return sorted;
        }

      } catch (domainError) {
        console.log(`[Movierulz] ${domain} failed: ${domainError.message}`);
        continue;
      }
    }

    // If no results found
    console.log('[Movierulz] No movies found');
    console.log('[Movierulz] This could mean:');
    console.log('[Movierulz] - Movie is not available on this site');
    console.log('[Movierulz] - Movie has a different title on this site');
    console.log('[Movierulz] - Site is showing different results');

    console.log('[Movierulz] Found 0 results');
    return [];

  } catch (error) {
    console.error('[Movierulz] Search failed:', error.message);
    return [];
  }
}

function extractRedirectFromHtml($, baseUrl) {
  // Try meta refresh
  const meta = $('meta[http-equiv="refresh" i]').attr('content') || '';
  const metaUrl = (meta.match(/url=(.+)$/i) || [])[1];
  if (metaUrl) {
    try {
      const u = decodeURIComponent(metaUrl.trim().replace(/^'|"|;$/g, ''));
      if (u) return new URL(u, baseUrl).toString();
    } catch {}
  }
  // Try common JS redirects inside inline scripts
  let redirectUrl = null;
  $('script').each((_, s) => {
    const code = $(s).html() || '';
    const m = code.match(/(?:location\.href|window\.location(?:\.href)?)\s*=\s*['"]([^'"]+)['"]/i);
    if (m && m[1] && !redirectUrl) redirectUrl = m[1];
  });
  if (redirectUrl) {
    try { return new URL(redirectUrl, baseUrl).toString(); } catch {}
  }
  return null;
}

async function getTorrentLinks(movieUrl, opts = {}) {
  const torrents = [];
  const timeoutMs = opts.timeoutMs || 10000;
  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 3;

  try {
    console.log(`[Movierulz] Fetching torrent links from: ${movieUrl}`);
    
    const response = await http.get(movieUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: timeoutMs
    });

    const $ = loadHTML(response.data);
    const base = new URL(movieUrl);

    // Look for torrent links in various common selectors (including Movierulz lower-quality blocks)
    const linkSelectors = [
      'a[href*=".torrent"]',
      'a[href*="magnet:?"]',
      'a[href^="magnet:"]',
      '.download-link a',
      '.torrent-link a',
      '.download-btn a',
      '.btn-download a',
      '.download-torrent',
      '.entry-content a:contains("GET THIS TORRENT")',
      'a:contains("GET THIS TORRENT")',
      '[data-href*=".torrent"]',
      '[data-href*="magnet:"]',
      '.download a',
      '.btn a',
      'a[href*="download"]'
    ];

    for (const selector of linkSelectors) {
      $(selector).each((index, element) => {
        const $link = $(element);
        const href = $link.attr('href') || $link.attr('data-href');
        const text = $link.text().trim();

        if (href && (href.includes('.torrent') || href.startsWith('magnet:'))) {
          // Decode URL-encoded characters
          let decodedHref = decodeURIComponent(href);
          // Normalize to absolute URL when needed
          if (!decodedHref.startsWith('http') && !decodedHref.startsWith('magnet:')) {
            if (decodedHref.startsWith('/')) decodedHref = `${base.origin}${decodedHref}`;
            else decodedHref = `${base.origin}/${decodedHref}`;
          }

          // Extract quality and size from surrounding text and URL when available
          // Capture lower-quality blocks; if button text lacks it, inspect nearby context and the link itself
          const nearbyTexts = [
            text,
            ($link.next().text() || ''),
            ($link.prev().text() || ''),
            ($link.parent().text() || ''),
          ].join(' ');
          const inferred = inferFromUrlAndText(decodedHref, nearbyTexts);
          const quality = inferred.quality || null;
          const size = inferred.size || 'Unknown';

          torrents.push({
            url: decodedHref,
            magnet: decodedHref.startsWith('magnet:') ? decodedHref : null,
            quality: quality,
            size: size,
            text: text || 'Download',
            type: decodedHref.startsWith('magnet:') ? 'magnet' : 'torrent'
          });
        }
      });
    }

    // If no direct .torrent found, try meta/script redirects first
    if (!torrents.some(t => t.type === 'torrent')) {
      const redirect = extractRedirectFromHtml($, movieUrl);
      if (redirect) {
        try {
          const nested = await getTorrentLinks(redirect, { timeoutMs, maxDepth: maxDepth - 1 });
          nested.forEach(t => torrents.push(t));
        } catch {}
      }
    }

    // If still none, follow probable intermediate download pages and scrape again
    if (!torrents.some(t => t.type === 'torrent') && maxDepth > 0) {
      const candidateHrefs = new Set();
      $('a[href], [data-href]').each((_, el) => {
        const h = $(el).attr('href') || $(el).attr('data-href') || '';
        const t = ($(el).text() || '').toLowerCase();
        if (!h) return;
        const lower = h.toLowerCase();
        const looksLikeDownload = lower.includes('download') || lower.includes('torrent') || t.includes('download') || t.includes('torrent');
        if (looksLikeDownload && !lower.includes('javascript:')) candidateHrefs.add(h);
      });
      // Scan onclick-based redirects
      $('[onclick]').each((_, el) => {
        const oc = ($(el).attr('onclick') || '').toString();
        const m = oc.match(/(?:location\.href|window\.open)\s*\(\s*['"]([^'"\)]+)['"]/i);
        if (m && m[1]) candidateHrefs.add(m[1]);
      });

      const candidates = Array.from(candidateHrefs).slice(0, 12);
      for (const href of candidates) {
        try {
          let next = decodeURIComponent(href);
          if (!next.startsWith('http')) {
            next = next.startsWith('/') ? `${base.origin}${next}` : `${base.origin}/${next}`;
          }
          const subResp = await http.get(next, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache'
            },
            timeout: timeoutMs
          });
          const $$ = loadHTML(subResp.data);
          // Second-level redirect handling
          const subRedirect = extractRedirectFromHtml($$, next);
          if (subRedirect) {
            const nested = await getTorrentLinks(subRedirect, { timeoutMs, maxDepth: maxDepth - 1 });
            nested.forEach(t => torrents.push(t));
          }
          $$('a[href*=".torrent"], [onclick*=\.torrent], a[download]').each((_, a) => {
            let link = $$(a).attr('href') || '';
            if (!link) {
              const oc = ($$(a).attr('onclick') || '').toString();
              const mm = oc.match(/['"]([^'"\)]*\.torrent)['"]/i);
              if (mm && mm[1]) link = mm[1];
            }
            if (!link) return;
            link = decodeURIComponent(link);
            if (!link.startsWith('http')) link = `${new URL(next).origin}${link.startsWith('/') ? '' : '/'}${link}`;
            const context = `${$$(a).text() || ''} ${$$(a).parent().text() || ''}`;
            const inferred = inferFromUrlAndText(link, context);
            torrents.push({ url: link, magnet: null, quality: inferred.quality || null, size: inferred.size || 'Unknown', text: 'Download', type: 'torrent' });
          });
          if (torrents.some(t => t.type === 'torrent')) break;
        } catch {}
      }
    }

    // Decode base64/atob-obfuscated hrefs in inline scripts to find hidden .torrent
    if (!torrents.some(t => t.type === 'torrent')) {
      try {
        const scripts = $('script').map((_, s) => $(s).html() || '').get().join('\n');
        // Detect patterns like atob('aHR0cDovL2V4YW1wbGUudG9ycmVudA==') or window.atob("...")
        const b64s = [];
        const re = /atob\(\s*['\"]([A-Za-z0-9+/=]+)['\"]/g;
        let m;
        while ((m = re.exec(scripts))) { b64s.push(m[1]); }
        for (const b of b64s.slice(0, 10)) {
          try {
            const decoded = Buffer.from(b, 'base64').toString('utf8');
            const match = decoded.match(/https?:[^'"\s>]+\.torrent/);
            if (match && match[0]) {
              torrents.push({ url: match[0], magnet: null, quality: null, size: 'Unknown', text: 'Download', type: 'torrent' });
            }
          } catch {}
        }
      } catch {}
    }

    // Sort torrents: prefer .torrent over magnet, then by quality rank desc
    const qRank = (q) => {
      if (!q) return 999;
      const order = ['2160p','1440p','1080p','720p','480p','360p','web-dl','webrip','hdrip','bluray','brrip','dvdrip','bdrip','tc','ts','cam','hd'];
      const qq = String(q).toLowerCase();
      const idx = order.findIndex(x => qq.includes(x));
      return idx === -1 ? 999 : idx;
    };
    torrents.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'torrent' ? -1 : 1;
      return qRank(a.quality) - qRank(b.quality);
    });

    console.log(`[Movierulz] Found ${torrents.length} torrents for ${movieUrl}`);
  } catch (error) {
    console.error(`[Movierulz] Failed to get torrent links from ${movieUrl}:`, error.message);
  }

  return torrents;
}

// Lightweight exported helper to fetch torrents for a single Movierulz movie page
export async function fetchMovierulzTorrents(movieUrl) {
  return await getTorrentLinks(movieUrl);
}