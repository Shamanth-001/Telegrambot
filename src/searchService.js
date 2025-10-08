import { searchYTS } from './yts.js';
import { searchPirateBay } from './piratebay.js';
import { searchMovierulz } from './movierulz.js';

export async function searchTorrents(query, options = {}) {
  console.log(`[searchService] Starting search for: "${query}"`);
  
  // Run all searches in parallel for much faster results
  const searchPromises = [
    searchYTS(query, options).catch(err => {
      console.error('[searchService] YTS error:', err?.message || err);
      return [];
    }),
    searchMovierulz(query, options).catch(err => {
      console.error('[searchService] Movierulz error:', err?.message || err);
      return [];
    }),
    searchPirateBay(query, options).catch(err => {
      console.error('[searchService] PirateBay error:', err?.message || err);
      return [];
    })
  ];

  console.log(`[searchService] Running all searches in parallel...`);
  const [ytsResults, movierulzResults, pbResults] = await Promise.all(searchPromises);
  
  const results = [];
  
  if (Array.isArray(ytsResults) && ytsResults.length > 0) {
    console.log(`[searchService] YTS returned ${ytsResults.length} results`);
    results.push(...ytsResults);
  }
  
  if (Array.isArray(movierulzResults) && movierulzResults.length > 0) {
    console.log(`[searchService] Movierulz returned ${movierulzResults.length} results`);
    results.push(...movierulzResults);
  }
  if (Array.isArray(pbResults) && pbResults.length > 0) {
    console.log(`[searchService] PirateBay returned ${pbResults.length} results`);
    results.push(...pbResults);
  }

  if (results.length > 0) {
    // Enforce max size (default 3.5GB) when size is known
    const maxSizeBytes = typeof options.maxSizeBytes === 'number' ? options.maxSizeBytes : (3.5 * 1024 * 1024 * 1024);
    // Prefer direct .torrent entries and de-dup by normalized key (title/year/quality/source-agnostic)
    const normalizeTitle = (s) => String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const qualityNorm = (q) => String(q || '').toLowerCase();
    const preferTorrent = (r) => Boolean(r.torrent_url && String(r.torrent_url).includes('.torrent'));
    const seen = new Map();
    for (const r of results) {
      const key = `${normalizeTitle(r.title)}|${r.year || ''}|${qualityNorm(r.quality)}`;
      const prev = seen.get(key);
      if (!prev) {
        seen.set(key, r);
        continue;
      }
      // Decide which to keep: direct .torrent wins; else higher seeders; else keep first
      const keepCurrent = preferTorrent(r) && !preferTorrent(prev)
        ? true
        : (!preferTorrent(r) && preferTorrent(prev))
        ? false
        : ((r.seeders ?? -1) > (prev.seeders ?? -1));
      if (keepCurrent) seen.set(key, r);
    }
    const merged = Array.from(seen.values());

    const sizeFiltered = merged.filter((t) => {
      const sz = t.size;
      if (typeof sz !== 'number' || Number.isNaN(sz)) return true; // keep when unknown
      return sz <= maxSizeBytes;
    });

    // Sort by seeders (highest first)
    const sorted = sizeFiltered
      .filter((t) => (t.seeders ?? 0) >= 0)
      .sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
      
    console.log(`[searchService] Returning ${sorted.length} results from all sources`);
    return sorted;
  }

  console.log('[searchService] No results from any source');
  return [];
}


