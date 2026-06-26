import { searchYTS } from '../yts.js';
import { searchPirateBay } from '../piratebay.js';
import { searchMovierulz } from '../movierulz.js';
import { searchYTSTV } from '../ytstv.js';
import { searchEinthusan } from '../einthusan.js';
import { searchEinthusan as searchEinthusanEnhanced } from '../einthusan-enhanced.js';
import { searchCataz } from '../cataz.js';
import { searchFmovies } from '../fmovies.js';
import { searchFlixer } from '../flixer.js';
import { searchMkvCinemas } from '../mkvcinemas.js';
import { searchCineby } from '../cineby.js';
import { getCurrentSourceConfig, logSourceConfig } from '../config/sources.js';
import { logger } from '../utils/logger.js';

export async function searchTorrents(query, options = {}) {
  logger.info(`[searchService] Starting search for: "${query}"`);

  // Config
  const sourceConfig = getCurrentSourceConfig();
  logSourceConfig();

  const maxSizeBytes = typeof options.maxSizeBytes === 'number' ? options.maxSizeBytes : (3.5 * 1024 * 1024 * 1024);
  // Relax seeder filter globally; top-3 selection will sort by seeders and pad with low/zero-seed items if needed
  const minSeeders = typeof options.minSeeders === 'number' ? options.minSeeders : 0;

  // Build search promises
  const searchPromises = [];

  if (sourceConfig.yts) searchPromises.push(searchYTS(query, options).catch(err => { logger.error('[searchService] YTS error:', err?.message || err); return []; }));
  if (sourceConfig.piratebay) searchPromises.push(searchPirateBay(query, options).catch(err => { logger.error('[searchService] PirateBay error:', err?.message || err); return []; }));
  if (sourceConfig.movierulz) searchPromises.push(searchMovierulz(query, options).catch(err => { logger.error('[searchService] Movierulz error:', err?.message || err); return []; }));
  if (sourceConfig.ytstv) searchPromises.push(searchYTSTV(query, options).catch(err => { logger.error('[searchService] YTSTV error:', err?.message || err); return []; }));
  if (sourceConfig.einthusan) searchPromises.push(searchEinthusan(query, options).catch(err => { logger.error('[searchService] Einthusan error:', err?.message || err); return []; }));
  if (sourceConfig.einthusan_enhanced) searchPromises.push(searchEinthusanEnhanced(query, options).catch(err => { logger.error('[searchService] Einthusan Enhanced error:', err?.message || err); return []; }));
  if (sourceConfig.cataz) searchPromises.push(searchCataz(query, options).catch(err => { logger.error('[searchService] Cataz error:', err?.message || err); return []; }));
  if (sourceConfig.fmovies) searchPromises.push(searchFmovies(query, options).catch(err => { logger.error('[searchService] Fmovies error:', err?.message || err); return []; }));
  if (sourceConfig.flixer) searchPromises.push(searchFlixer(query, options).catch(err => { logger.error('[searchService] Flixer error:', err?.message || err); return []; }));
  if (sourceConfig.mkvcinemas) searchPromises.push(searchMkvCinemas(query, options).catch(err => { logger.error('[searchService] MkvCinemas error:', err?.message || err); return []; }));
  if (sourceConfig.cineby) searchPromises.push(searchCineby(query, options).catch(err => { logger.error('[searchService] Cineby error:', err?.message || err); return []; }));

  logger.info(`[searchService] Running ${searchPromises.length} enabled source(s)...`);
  const sourceResults = await Promise.all(searchPromises);

  const results = [];
  sourceResults.forEach((sourceResult, index) => {
    if (Array.isArray(sourceResult) && sourceResult.length > 0) {
      logger.info(`[searchService] Source ${index + 1} returned ${sourceResult.length} results`);
      results.push(...sourceResult);
    }
  });

  if (!results.length) {
    logger.info('[searchService] No results from any source');
    return [];
  }

  // Deduplicate by title/year/quality
  const normalizeTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const seen = new Map();

  for (const r of results) {
    const key = `${normalizeTitle(r.title)}|${r.year || ''}|${(r.quality || '').toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, r);
      continue;
    }

    // Decide which to keep: .torrent preferred, then higher seeders
    const preferTorrent = r.torrent_url && r.torrent_url.endsWith('.torrent');
    const prevTorrent = prev.torrent_url && prev.torrent_url.endsWith('.torrent');

    const keepCurrent = preferTorrent && !prevTorrent
      ? true
      : (!preferTorrent && prevTorrent)
      ? false
      : ((r.seeders ?? -1) > (prev.seeders ?? -1));

    if (keepCurrent) seen.set(key, r);
  }

  const merged = Array.from(seen.values());

  // Filter by max size and optional min seeders (relaxed by default)
  const filtered = merged.filter(t => {
    if (t.torrent_url && (t.seeders ?? 0) < minSeeders) return false;
    if (typeof t.size === 'number' && !Number.isNaN(t.size) && t.size > maxSizeBytes) return false;
    return true;
  });

  // Sort: torrents first (by seeders), then streaming sources
  filtered.sort((a, b) => {
    const aTorrent = Boolean(a.torrent_url);
    const bTorrent = Boolean(b.torrent_url);

    if (aTorrent && !bTorrent) return -1;
    if (!aTorrent && bTorrent) return 1;
    if (aTorrent && bTorrent) return (b.seeders ?? 0) - (a.seeders ?? 0);
    return 0;
  });

  logger.info(`[searchService] Returning ${filtered.length} results after filtering`);
  return filtered;
}

export default { searchTorrents };