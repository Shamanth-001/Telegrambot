import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Get IMDb poster URL for a movie title
 * @param {string} title - Movie title
 * @returns {Promise<string|null>} Direct image URL or null if not found
 */
export async function getImdbPoster(title) {
  try {
    if (!title || typeof title !== 'string') return null;
    const query = encodeURIComponent(title.trim());
    const searchUrl = `https://www.imdb.com/find?q=${query}&s=tt&ttype=ft&ref_=fn_ft`;

    const searchResp = await axios.get(searchUrl, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible)' },
      timeout: 15000,
    });

    const $search = cheerio.load(searchResp.data);
    const firstResult = $search('.findList .findResult').first();
    const movieLink = firstResult.find('td.result_text a').attr('href');
    if (!movieLink) return null;

    const movieUrl = `https://www.imdb.com${movieLink}`;
    const movieResp = await axios.get(movieUrl, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible)' },
      timeout: 15000,
    });

    const $movie = cheerio.load(movieResp.data);
    const raw = $movie('.ipc-media img.ipc-image').attr('src')
      || $movie('.poster a img').attr('src');
    if (!raw) return null;

    // Normalize to a stable JPG URL
    const base = raw.split('_V1_')[0];
    return `${base}_V1_.jpg`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('IMDb poster fetch error:', err?.message || err);
    return null;
  }
}

export default { getImdbPoster };


