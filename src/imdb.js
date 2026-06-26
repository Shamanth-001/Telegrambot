// Lightweight IMDb helper: resolve tconst and fetch season episode counts (no cache)
import { http } from './utils/http.js';
import { load as loadHtml } from 'cheerio';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

export async function resolveImdbTconst(query) {
  const q = (query || '').trim();
  if (!q) return null;
  const first = encodeURIComponent(q[0].toLowerCase());
  const encoded = encodeURIComponent(q);
  const url = `https://v2.sg.media-imdb.com/suggestion/${first}/${encoded}.json`;
  try {
    const { data } = await http.get(url, { headers: DEFAULT_HEADERS, timeout: 10000 });
    if (!data || !Array.isArray(data.d)) return null;
    // Prefer tvSeries / tvMiniSeries matching title tokens best
    const lower = q.toLowerCase();
    const candidates = data.d.filter(x => x && (x.qid === 'tvSeries' || x.qid === 'tvMiniSeries'));
    if (!candidates.length) return null;
    // Simple score: title startsWith or includes
    let best = null; let bestScore = -1;
    for (const c of candidates) {
      const title = (c.l || '').toLowerCase();
      let score = 0;
      if (title === lower) score = 100;
      else if (title.startsWith(lower)) score = 80;
      else if (title.includes(lower)) score = 60;
      // prefer exact year ranges if available
      if (typeof c.y === 'number') score += 1;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const id = best?.id || null;
    return id || null;
  } catch {
    return null;
  }
}

export async function fetchImdbSeasonCounts(tconst, { maxSeasons = 30 } = {}) {
  if (!tconst) return null;
  const counts = new Map();
  for (let season = 1; season <= maxSeasons; season++) {
    const ajaxUrl = `https://www.imdb.com/title/${tconst}/episodes/_ajax?season=${season}`;
    try {
      const { data: ajaxHtml } = await http.get(ajaxUrl, { headers: { ...DEFAULT_HEADERS, 'Accept': 'text/html' }, timeout: 12000, responseType: 'text' });
      let html = typeof ajaxHtml === 'string' ? ajaxHtml : '';
      // Fallback to full page if ajax returned nothing
      if (!html || html.length < 1000) {
        const pageUrl = `https://www.imdb.com/title/${tconst}/episodes?season=${season}`;
        const { data: pageHtml } = await http.get(pageUrl, { headers: { ...DEFAULT_HEADERS, 'Accept': 'text/html' }, timeout: 15000, responseType: 'text' });
        html = typeof pageHtml === 'string' ? pageHtml : '';
      }
      if (!html) break;
      const $ = loadHtml(html);
      // Try multiple selectors across layouts
      let items = $('[data-testid="episodes-list-item"]').length;
      if (!items) items = $('li.sc-57b28573-0').length; // newer li cards
      if (!items) items = $('.list_item').length;
      if (!items) items = $('.episode-item').length;
      if (!items) items = $('.eplist .list_item').length;
      if (!items) {
        // No episodes for this season -> stop
        break;
      }
      counts.set(String(season).padStart(2, '0'), items);
      // small polite delay
      await new Promise(r => setTimeout(r, 300));
    } catch {
      // transient error: stop to avoid hammering
      break;
    }
  }
  if (counts.size === 0) return null;
  return counts; // Map of '01' -> count
}

// Fallback using TVMaze (no API key) when IMDb counts are unavailable
export async function fetchTvMazeSeasonCounts(query) {
  const q = (query || '').trim();
  if (!q) return null;
  try {
    const { data } = await http.get('https://api.tvmaze.com/singlesearch/shows', {
      params: { q, embed: 'episodes' }, headers: DEFAULT_HEADERS, timeout: 12000
    });
    const episodes = data?._embedded?.episodes;
    if (!Array.isArray(episodes) || !episodes.length) return null;
    const map = new Map();
    for (const ep of episodes) {
      const season = String(ep.season || 0).padStart(2, '0');
      map.set(season, (map.get(season) || 0) + 1);
    }
    if (map.size === 0) return null;
    return map;
  } catch {
    return null;
  }
}


