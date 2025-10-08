import { http } from './http.js';

function sanitizeTitle(raw) {
  if (!raw) return '';
  let s = String(raw);
  // Normalize separators
  s = s.replace(/[._]+/g, ' ');
  // Remove common tags: resolution, sources, codecs, audio, bit depth, extras
  const patterns = [
    /\b(2160p|1440p|1080p|720p|480p|360p)\b/ig,
    /\b(webrip|web-rip|webdl|web-dl|web|hdrip|brrip|bluray|blu-ray|dvdrip|remux|hdtc|hdcam|cam|ts|tc)\b/ig,
    /\b(x264|x265|h\.?264|h\.?265|hevc|avc)\b/ig,
    /\b(aac|ac3|eac3|dts|ddp?5\.?1|5\.1|7\.1)\b/ig,
    /\b(10bit|8bit)\b/ig,
    /\b(yify|galaxyrg|rarbg|ettv|evo|fgt|amit|yts|psa|tigole|joy|rg)\b/ig,
    /\[[^\]]*\]/g,
    /\([^)]*\b(1080p|720p|2160p|web|rip|blu|brrip|webrip|x265|x264|ddp|dts|5\.1|7\.1)[^)]*\)/ig
  ];
  for (const p of patterns) s = s.replace(p, ' ');
  // Collapse extra spaces
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function extractYear(raw) {
  const m = String(raw || '').match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

// Removed TMDB and OMDb providers to avoid delays and key failures.

async function fetchPosterFromIMDbSuggestion(title, year) {
  try {
    const base = String(title || '').toLowerCase().trim();
    if (!base) return null;
    const q1 = base.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
    const q2 = year ? `${q1}_${year}` : q1;
    const variants = Array.from(new Set([q2, q1].filter(Boolean)));

    for (const q of variants) {
      const firstLetter = q.charAt(0) || 'a';
      const url = `https://v2.sg.media-imdb.com/suggestion/${firstLetter}/${q}.json`;
      const { data } = await http.get(url, { timeout: 5000 });
      const list = Array.isArray(data?.d) ? data.d : [];
      // Score items by token overlap; require a minimum score to avoid wrong posters
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
      const words = norm(title).split(' ').filter(Boolean);
      const scoreOf = (it) => {
        const l = norm(it?.l);
        const y = it?.y;
        const typeOk = !it?.qid || String(it.qid).toLowerCase() === 'movie';
        if (!typeOk) return -1;
        const lw = l.split(' ').filter(Boolean);
        const set = new Set(lw);
        const hits = words.filter(w => set.has(w)).length;
        const overlap = words.length ? hits / words.length : 0;
        const yearBonus = year && Number(y) === Number(year) ? 0.2 : 0;
        return overlap + yearBonus;
      };
      let best = null;
      let bestScore = 0;
      for (const it of list) {
        if (!(it?.i?.imageUrl || it?.i?.image)) continue;
        const s = scoreOf(it);
        if (s > bestScore) { bestScore = s; best = it; }
      }
      // Require reasonable match (>= 0.5 overlap) to accept; else skip
      const item = bestScore >= 0.5 ? best : null;
      const img = item?.i?.imageUrl || item?.i?.image;
      if (img) return img;
    }
    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[IMDb] suggestion error', e?.message || e);
    return null;
  }
}

// Fetch a poster URL from available providers
export async function fetchPosterForTitle(title) {
  if (!title) return null;
  const year = extractYear(title);
  const clean = sanitizeTitle(title);

  // IMDb suggestion API only (fast, no key)
  let poster = null;
  poster = poster || await fetchPosterFromIMDbSuggestion(clean, year || undefined);
  poster = poster || await fetchPosterFromIMDbSuggestion(title, year || undefined);

  return poster;
}


