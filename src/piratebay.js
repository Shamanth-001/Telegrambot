import { http } from './http.js';

function parseQualityFromTitle(title) {
  if (!title) return null;
  const s = String(title);
  // Detect common forms: 2160p/1080p/720p/480p, 2160/1080/720 without p, 4K/UHD, HD
  const m1 = s.match(/(2160p|1440p|1080p|720p|480p|360p)/i);
  if (m1) return m1[1];
  const m2 = s.match(/\b(2160|1440|1080|720|480|360)\b/i);
  if (m2) return `${m2[1]}p`;
  if (/\b(uhd|4k)\b/i.test(s)) return '2160p';
  if (/\b(1080)\b/i.test(s)) return '1080p';
  if (/\b(720)\b/i.test(s)) return '720p';
  if (/\bhd\b/i.test(s)) return 'HD';
  return null;
}

function toNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function looksLikeTorrent(headers, data) {
  const ct = String(headers?.['content-type'] || headers?.['Content-Type'] || '').toLowerCase();
  if (ct.includes('bittorrent')) return true;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  if (buf.length < 2048) return false; // too small; many caches return HTML ~1-2KB
  const first = String.fromCharCode(buf[0] || 0);
  if (first === 'd') return true; // bencoded dictionary
  const s = buf.slice(0, 2048).toString('utf8');
  if (/^<!doctype html/i.test(s) || /<html/i.test(s)) return false;
  return s.includes('announce') && s.includes('info');
}

async function tryGet(url, timeoutMs) {
  try {
    const resp = await http.get(url, { timeout: timeoutMs, responseType: 'arraybuffer', maxContentLength: 512 * 1024 });
    return looksLikeTorrent(resp.headers, resp.data);
  } catch (_) {
    return false;
  }
}

async function resolveTorrentUrlFromHash(infoHash) {
  if (!infoHash) return null;
  const upper = String(infoHash).toUpperCase();
  const candidates = [
    `https://itorrents.org/torrent/${upper}.torrent`,
    `https://torrage.info/torrent/${upper}.torrent`,
    `https://btcache.me/torrent/${upper}.torrent`
  ];
  // Race candidates with short timeouts in sequence; bail as soon as one works
  for (const url of candidates) {
    const ok = await tryGet(url, 6000);
    if (ok) return url;
  }
  return null;
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const current = idx++;
      if (current >= items.length) break;
      try {
        results[current] = await worker(items[current], current);
      } catch (e) {
        results[current] = null;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export async function searchPirateBay(query, _options = {}) {
  console.log(`[PirateBay] Searching (API) for: ${query}`);
  try {
    const q = String(query || '').trim();
    if (!q) return [];

    // apibay.org JSON search
    const { data } = await http.get('https://apibay.org/q.php', {
      params: { q, cat: 0 },
      timeout: 8000
    });

    if (!Array.isArray(data) || !data.length) {
      console.log('[PirateBay] API returned no items');
      return [];
    }

    // Map raw items; then pick best-by-seeders per quality FIRST, resolve torrents only for those
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
    const qNorm = norm(q);
    const rawWords = qNorm.split(' ').filter(Boolean);
    // Build stable tokens: ignore 1-char junk; collapse sequences like "k g f" -> "kgf"
    let tokens = rawWords.filter(w => w.length >= 2);
    if (!tokens.length && rawWords.length >= 2 && rawWords.every(w => w.length === 1)) {
      tokens = [rawWords.join('')];
    }
    // Always keep a numeric token like "1" if present
    if (rawWords.some(w => /^(\d{1,4})$/.test(w))) {
      const nums = rawWords.filter(w => /^(\d{1,4})$/.test(w));
      nums.forEach(n => { if (!tokens.includes(n)) tokens.push(n); });
    }
    const isTvPattern = (t) => /\bS\d{1,2}E\d{1,2}\b/i.test(t);

    const mapped = data
      .map((item) => ({
        title: item.name || null,
        infoHash: item.info_hash || item.infoHash || null,
        seeders: toNumber(item.seeders),
        leechers: toNumber(item.leechers),
        size: toNumber(item.size),
        quality: parseQualityFromTitle(item.name || '')
      }))
      .filter((r) => r.title && r.infoHash)
      // tighten: require all query words to appear in title, and drop common TV episode patterns
      .filter((r) => {
        const t = norm(r.title);
        if (isTvPattern(r.title)) return false;
        // require all meaningful tokens to appear in title
        return tokens.every(w => t.includes(w));
      });

    // Group by quality and pick the top-seeded within each quality; limit to desired qualities
    const qualitiesOrder = ['2160p','1440p','1080p','720p','480p','360p'];
    const byQualityRaw = new Map();
    for (const r of mapped) {
      const ql = r.quality || 'unknown';
      const prev = byQualityRaw.get(ql);
      if (!prev || (r.seeders || 0) > (prev.seeders || 0)) byQualityRaw.set(ql, r);
    }
    const selected = [];
    for (const ql of qualitiesOrder) {
      const item = byQualityRaw.get(ql);
      if (item) selected.push(item);
    }
    // If we are missing common lower qualities, fetch fallback pages with explicit quality tokens
    const need720 = !selected.some(r => (r.quality||'').includes('720'));
    const need480 = !selected.some(r => (r.quality||'').includes('480'));
    const fallbackQueries = [];
    if (need720) fallbackQueries.push(`${q} 720p`);
    if (need480) fallbackQueries.push(`${q} 480p`);
    for (const fq of fallbackQueries) {
      try {
        const { data: fd } = await http.get('https://apibay.org/q.php', { params: { q: fq, cat: 0 }, timeout: 6000 });
        if (Array.isArray(fd)) {
          const mm = fd
            .map((item) => ({
              title: item.name || null,
              infoHash: item.info_hash || item.infoHash || null,
              seeders: toNumber(item.seeders),
              leechers: toNumber(item.leechers),
              size: toNumber(item.size),
              quality: parseQualityFromTitle(item.name || '')
            }))
            .filter((r) => r.title && r.infoHash);
          for (const r of mm) {
            const ql = r.quality || 'unknown';
            const prev = byQualityRaw.get(ql);
            if (!prev || (r.seeders || 0) > (prev.seeders || 0)) byQualityRaw.set(ql, r);
          }
        }
      } catch {}
    }

    const finalSelected = [];
    for (const ql of qualitiesOrder) {
      const item = byQualityRaw.get(ql);
      if (item) finalSelected.push(item);
    }
    if (!finalSelected.length) {
      finalSelected.push(...mapped.sort((a,b)=> (b.seeders||0)-(a.seeders||0)).slice(0,3));
    }

    const resolved = await runWithConcurrency(finalSelected, 4, async (r) => {
      const torrentUrl = await resolveTorrentUrlFromHash(r.infoHash);
      if (!torrentUrl) return null;
      return {
        id: r.infoHash,
        title: r.title,
        year: null,
        quality: r.quality || parseQualityFromTitle(r.title),
        size: r.size,
        seeders: r.seeders || 0,
        leechers: r.leechers || 0,
        source: 'PirateBay',
        magnet_link: null,
        torrent_url: torrentUrl,
        imdb_rating: null,
        poster_url: null,
      };
    });

    const valid = resolved.filter(Boolean);
    console.log(`[PirateBay] Parsed results: ${valid.length}`);
    return valid;
  } catch (e) {
    console.error('[PirateBay] Error:', e?.message || e);
    return [];
  }
}


