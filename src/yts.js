import { http } from './utils/http.js';
import { randomDelay } from './utils/delay.js';

// YTS API endpoint - official domain (use VPN at network level if required)
const YTS_API = 'https://yts.mx/api/v2/list_movies.json';

export async function searchYTS(query, options = {}) {
  try {
    // remove artificial jitter for faster responses
    // Normalize and try multiple query variants to avoid API missing results on punctuation/parentheses
    const base = String(query || '').trim();
    const noParens = base.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    const onlyWords = base.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    const yearMatch = base.match(/(19|20)\d{2}/);
    const year = yearMatch ? yearMatch[0] : '';
    const titleOnly = onlyWords.replace(new RegExp(`\\b${year}\\b`), '').replace(/\s+/g, ' ').trim();
    // Use only the best query variant to reduce API calls
    const bestQuery = onlyWords || noParens || base;
    const normalizedQuery = bestQuery.toLowerCase().replace(/\s+/g, ' ').trim();
    const qTokens = normalizedQuery.split(' ').filter(Boolean);
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const firstWord = normalizedQuery.split(/\s+/).filter(Boolean)[0] || '';

    // Single API call instead of multiple variants
    const params = {
      query_term: bestQuery,
      limit: 20, // lower payload for speed
      sort_by: 'seeds',
      order_by: 'desc',
    };
    console.log('[YTS] Request params:', params);
    const { data } = await http.get(YTS_API, { params });
    
    let movies = [];
    if (data?.status === 'ok' && Array.isArray(data?.data?.movies) && data.data.movies.length) {
      movies = data.data.movies;
    }
    if (!movies.length) {
      console.log('[YTS] No movies returned for any variant');
      return [];
    }
    // Post-filter: require all query words to appear in the title; enforce year if provided
    const queryWords = (onlyWords || '').toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];
    for (const m of movies) {
      const titleLc = String(m.title_long || m.title || '').toLowerCase();
      const titleNorm = titleLc.replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
      const hasAllWords = queryWords.every(w => titleLc.includes(w));
      if (queryWords.length && !hasAllWords) continue;
      if (firstWord && !titleLc.includes(firstWord)) continue;
      // STRICT:
      // - For short queries (1-2 tokens): title must equal query exactly (ignore punctuation)
      // - For longer queries: title must start with the full query phrase
      if (normalizedQuery) {
        if (qTokens.length === 1) {
          const re = new RegExp(`^${escapeRegExp(normalizedQuery)}(\\s*\\(\\d{4}\\))?$`);
          if (!re.test(titleNorm)) continue;
        } else if (qTokens.length === 2) {
          if (titleNorm !== normalizedQuery) continue;
        } else {
          if (!titleNorm.startsWith(normalizedQuery)) continue;
        }
      }
      if (year && String(m.year) !== String(year)) {
        // If the original query contained a year, prefer exact year matches
        // but allow through if no exact matches exist later (handled by earlier variants)
        // Here we enforce when present in this pass
        continue;
      }
      const torrents = m.torrents || [];
      for (const t of torrents) {
        // Construct .torrent URL when API doesn't provide one
        const torrentUrl = t.url || `https://yts.mx/torrent/download/${t.hash}`;
        
        // CRITICAL: ONLY return if we have a valid torrent URL (YTS uses hash-based URLs)
        if (!torrentUrl || !torrentUrl.includes('yts.mx/torrent/download/')) {
          console.log(`[YTS] Skipping result - no valid YTS torrent URL: ${torrentUrl}`);
          continue; // Skip this result
        }
        
        results.push({
          id: `${m.id}_${t.hash}`,
          title: m.title,
          year: m.year || null,
          quality: t.quality,
          size: parseSizeToBytes(t.size || ''),
          seeders: t.seeds || 0,
          leechers: t.peers || 0,
          source: 'YTS',
          magnet_link: null, // NO magnets for YTS - STRICT REQUIREMENT
          torrent_url: torrentUrl,
          imdb_rating: m.rating || null,
          poster_url: m.medium_cover_image || m.large_cover_image || null,
        });
      }
    }
    // Fallback: if strict pass yielded nothing, relax to word-inclusion and optional year
    if (!results.length) {
      // For single-word queries without year, allow titles that CONTAIN the word (not only exact equals)
      // For longer queries, allow all-words-appear fallback
      for (const m of movies) {
        const titleLc = String(m.title_long || m.title || '').toLowerCase();
        const hasAllWords = queryWords.every(w => titleLc.includes(w));
        const titleNorm = titleLc.replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
        if (qTokens.length === 1 && !year) {
          // Accept if the single token appears as a full word anywhere in the normalized title
          const words = new Set(titleNorm.split(/\s+/).filter(Boolean));
          if (!words.has(normalizedQuery)) continue;
        } else {
          if (queryWords.length && !hasAllWords) continue;
          // If year was provided but strict pass failed, allow any year in fallback
        }
        const torrents = m.torrents || [];
        for (const t of torrents) {
          const torrentUrl = t.url || `https://yts.mx/torrent/download/${t.hash}`;
          if (!torrentUrl || !torrentUrl.includes('yts.mx/torrent/download/')) {
            continue;
          }
          results.push({
            id: `${m.id}_${t.hash}`,
            title: m.title,
            year: m.year || null,
            quality: t.quality,
            size: parseSizeToBytes(t.size || ''),
            seeders: t.seeds || 0,
            leechers: t.peers || 0,
            source: 'YTS',
            magnet_link: null,
            torrent_url: torrentUrl,
            imdb_rating: m.rating || null,
            poster_url: m.medium_cover_image || m.large_cover_image || null,
          });
        }
      }
    }
    
    // Year-probe fallback: only if still empty AND single-word query; try currentYear±2 for exact pattern "Word (YYYY)"
    if (!results.length && qTokens.length === 1) {
      const baseWord = normalizedQuery;
      const now = new Date().getFullYear();
      const probeYears = [0, 1, -1, 2, -2].map(d => now + d);
      for (const y of probeYears) {
        try {
          const params = { query_term: `${baseWord} (${y})`, limit: 50, sort_by: 'seeds', order_by: 'desc' };
          console.log('[YTS] Year-probe params:', params);
          const { data } = await http.get(YTS_API, { params });
          const probeMovies = Array.isArray(data?.data?.movies) ? data.data.movies : [];
          if (!probeMovies.length) continue;
          const re = new RegExp(`^${baseWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*\\(${y}\\))$`);
          for (const m of probeMovies) {
            const titleLc = String(m.title_long || m.title || '').toLowerCase();
            const titleNorm = titleLc.replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
            if (!re.test(titleNorm)) continue;
            for (const t of (m.torrents || [])) {
              const torrentUrl = t.url || `https://yts.mx/torrent/download/${t.hash}`;
              if (!torrentUrl || !torrentUrl.includes('yts.mx/torrent/download/')) continue;
              results.push({
                id: `${m.id}_${t.hash}`,
                title: m.title,
                year: m.year || y,
                quality: t.quality,
                size: parseSizeToBytes(t.size || ''),
                seeders: t.seeds || 0,
                leechers: t.peers || 0,
                source: 'YTS',
                magnet_link: null,
                torrent_url: torrentUrl,
                imdb_rating: m.rating || null,
                poster_url: m.medium_cover_image || m.large_cover_image || null,
              });
            }
          }
          if (results.length) break;
        } catch (e) {
          console.log('[YTS] Year-probe error:', e?.message || e);
        }
      }
    }

    // Sort by seeders (highest first) - CRITICAL FOR BEST RESULTS
    results.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
    console.log('[YTS] Parsed results:', results.length);
    return results;
  } catch (e) {
    console.log('[YTS] Error:', e?.message || e);
    return [];
  }
}

function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return null;
  const match = String(sizeStr).trim().match(/([\d.]+)\s*(KB|MB|GB|TB)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const map = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.round(value * (map[unit] || 1));
}


