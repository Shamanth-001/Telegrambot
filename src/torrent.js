import { http } from './utils/http.js';

export function extractInfoHashFromMagnet(magnetUrl) {
  try {
    const url = new URL(magnetUrl);
    const xt = (url.searchParams.get('xt') || '').toLowerCase();
    const m = xt.match(/urn:btih:([a-f0-9]{40}|[a-z0-9]{32})/i);
    if (!m) return null;
    let hash = m[1];
    // Base32 variant (32 chars) -> cannot reliably convert without lib; still try caches that accept it
    return hash.toUpperCase();
  } catch {
    return null;
  }
}

export async function resolveTorrentFromMagnet(magnetUrl) {
  const infoHash = extractInfoHashFromMagnet(magnetUrl);
  if (!infoHash) return null;

  const candidates = [
    `https://itorrents.org/torrent/${infoHash}.torrent`,
    `https://torrage.info/torrent/${infoHash}.torrent`,
    `https://btcache.me/torrent/${infoHash}.torrent`,
    `https://magnet2torrent.com/download/${infoHash}.torrent`
  ];

  for (const url of candidates) {
    try {
      const res = await http.head(url, { timeout: 8000, validateStatus: () => true });
      const ct = String(res.headers['content-type'] || '').toLowerCase();
      if (res.status >= 200 && res.status < 400 && (ct.includes('bittorrent') || url.endsWith('.torrent'))) {
        return url;
      }
    } catch {
      // continue
    }
  }
  return null;
}


