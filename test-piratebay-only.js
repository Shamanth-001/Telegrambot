import { http } from './src/http.js';
import { searchPirateBay } from './src/piratebay.js';

const MOVIES = [
  'The Avengers',
  'Inception',
  'Interstellar',
  'The Dark Knight',
  'Avatar',
  'Joker',
  'Dune',
  'Oppenheimer',
  'John Wick',
  'Spider-Man'
];

async function checkPirateBayAccess() {
  const urls = [
    'https://piratebayproxy.net'
  ];
  for (const url of urls) {
    try {
      const res = await http.get(url, { timeout: 5000 });
      console.log(`[ACCESS] ${url} -> HTTP ${res.status}`);
      if (res.status >= 200 && res.status < 500) return { ok: true, url };
    } catch (e) {
      console.log(`[ACCESS] ${url} -> ERROR ${e?.message}`);
    }
  }
  return { ok: false };
}

function isValidTorrentUrl(u) {
  if (!u) return false;
  return String(u).toLowerCase().includes('.torrent');
}

async function run() {
  console.log('--- PirateBay Only Test ---');
  const access = await checkPirateBayAccess();
  if (!access.ok) {
    console.log('PirateBay appears inaccessible. Please enable VPN and re-run.');
    process.exit(2);
  } else {
    console.log(`Using accessible domain: ${access.url}`);
  }

  let pass = 0;
  let fail = 0;
  for (const title of MOVIES) {
    try {
      const results = await searchPirateBay(title);
      const onlyTorrent = results.filter(r => isValidTorrentUrl(r.torrent_url));
      const magnetPresent = results.some(r => !!r.magnet_link);

      const ok = onlyTorrent.length >= 1 && !magnetPresent;
      if (ok) pass++; else fail++;

      console.log(JSON.stringify({
        movie: title,
        total: results.length,
        withTorrentUrl: onlyTorrent.length,
        sample: onlyTorrent.slice(0, 3).map(r => ({ title: r.title, quality: r.quality, torrent_url: r.torrent_url })),
        magnetPresent
      }, null, 2));
    } catch (e) {
      fail++;
      console.log(`[TEST-ERR] ${title}: ${e?.message}`);
    }
  }

  console.log(`RESULT: pass=${pass} fail=${fail} of ${MOVIES.length}`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
