// Split "game of thrones s1e1" into a title plus season/episode (mirrors backend query_parser.py).
const PATTERNS = [
  /(?<![\w'’])s(?:eason)?\s*\.?(\d{1,2})\s*[ ._-]?\s*e(?:p(?:isode)?)?\s*\.?(\d{1,3})\b/i,
  /\bseason\s*(\d{1,2})\s*,?\s*(?:ep(?:isode)?|e)\s*\.?\s*(\d{1,3})\b/i,
  /\b(\d{1,2})x(\d{2,3})\b/i,
];
const SEASON_ONLY = /(?<![\w'’])(?:s|season)\s*\.?(\d{1,2})\b(?!\s*[ ._-]?\s*e\d)/i;

export interface ParsedQuery {
  title: string;
  season: number;
  episode: number;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s\-,:]+|[\s\-,:]+$/g, '');

export function parseQuery(text: string): ParsedQuery {
  const t = text.trim();
  for (const re of PATTERNS) {
    const m = t.match(re);
    if (m && m.index !== undefined) {
      return { title: clean(t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)), season: +m[1], episode: +m[2] };
    }
  }
  const m = t.match(SEASON_ONLY);
  if (m && m.index !== undefined) {
    const title = clean(t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length));
    if (title) return { title, season: +m[1], episode: 0 };
  }
  return { title: t, season: 0, episode: 0 };
}

export function episodeTag(season: number, episode: number) {
  if (!season) return '';
  return `S${String(season).padStart(2, '0')}` + (episode ? `E${String(episode).padStart(2, '0')}` : '');
}
