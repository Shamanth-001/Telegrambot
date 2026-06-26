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
// Using a simple placeholder service for now.
export async function fetchPosterForTitle(title) {
  try {
    const cleanTitle = sanitizeTitle(title);
    const year = extractYear(title);
    
    // Simple placeholder - in production, you'd use TMDB or similar
    const searchQuery = encodeURIComponent(cleanTitle + (year ? ` ${year}` : ''));
    const placeholderUrl = `https://placehold.co/300x450?text=${encodeURIComponent(searchQuery)}&font=roboto`;
    
    return placeholderUrl;
  } catch (error) {
    console.error('[Poster] Error fetching poster:', error);
    return null;
  }
}
