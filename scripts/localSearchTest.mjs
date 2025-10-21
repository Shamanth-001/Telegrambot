// Local search aggregation test (no Telegram IO)
import { searchTorrents } from '../src/services/searchService.js';

function selectTop3(results) {
  const nonMovierulz = results.filter(r => String(r.source || '').toLowerCase() !== 'movierulz');
  const actionable = nonMovierulz.filter(r => r.torrent_url || r.magnet || r.magnet_link);
  actionable.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
  return actionable.slice(0, 3).map(r => ({
    title: r.title,
    year: r.year || null,
    quality: r.quality || null,
    size: r.size || null,
    seeders: r.seeders || 0,
    leechers: r.leechers || 0,
    source: r.source || null,
    poster_url: r.poster_url || null,
    has_torrent: Boolean(r.torrent_url),
    has_magnet: Boolean(r.magnet || r.magnet_link),
  }));
}

async function run() {
  const queries = process.argv.slice(2);
  if (queries.length === 0) {
    console.log('Usage: node scripts/localSearchTest.mjs "The Prestige" "The Avengers"');
    process.exit(0);
  }
  for (const q of queries) {
    console.log(`\n=== Query: ${q}`);
    const res = await searchTorrents(q, {});
    console.log(`Total results: ${res.length}`);
    const top3 = selectTop3(res);
    console.log('Top 3 aggregated (non-Movierulz):');
    console.log(JSON.stringify(top3, null, 2));
  }
}

run().catch((e) => { console.error('Test failed:', e); process.exit(1); });



