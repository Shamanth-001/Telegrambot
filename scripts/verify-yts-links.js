#!/usr/bin/env node
import { searchTorrents } from '../src/searchService.js';

const queries = [
  'Avengers Endgame',
  'The Dark Knight',
  'Inception',
  'Interstellar',
  'Avatar',
];

const MB = 1024 * 1024;
const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function run() {
  for (const q of queries) {
    const res = await searchTorrents(q, {});
    const sorted = [...res].sort((a,b) => (b.seeders||0) - (a.seeders||0));
    const top = sorted.slice(0,3);
    console.log(`\n== ${q} ==`);
    for (const r of top) {
      const ql = r.quality || 'N/A';
      let link = '';
      if (r.source === 'Movierulz') {
        if (r.magnet_link) link = `<a href="${esc(r.magnet_link)}">🧲 Magnet ${esc(ql)}</a>`;
        else if (r.torrent_url) {
          const u = String(r.torrent_url);
          if (u.includes('.torrent') || u.includes('yts.mx/torrent/download/')) link = `<a href="${esc(u)}">📁 Download ${esc(ql)}</a>`;
        }
      } else {
        if (r.torrent_url) {
          const u = String(r.torrent_url);
          if (u.includes('.torrent') || u.includes('yts.mx/torrent/download/')) link = `<a href="${esc(u)}">📁 Download ${esc(ql)}</a>`;
        }
      }
      const sizeText = typeof r.size === 'number' ? (()=>{const mb=r.size/MB; return mb>=1024?`${(mb/1024).toFixed(1)}GB`:`${Math.round(mb)}MB`;})() : '';
      console.log('-', r.title, '| linkAnchorStartsWithA:', link.startsWith('<a '), '| anchor:', link, '| size:', sizeText);
    }
  }
}

run().catch((e)=>{ console.error(e); process.exit(1); });


