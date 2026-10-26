export type MediaType = 'movie' | 'tv';

export interface TitleCard {
  id: number;
  media_type: MediaType;
  title: string;
  overview: string;
  poster_url: string;
  backdrop_url: string;
  rating: number;
  year: number | null;
  genre_ids: number[];
  original_language?: string;
}

export interface CastMember {
  name: string;
  character: string;
  profile_url: string;
}

export interface Provider {
  name: string;
  logo: string;
}

export interface Season {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string;
}

export interface TitleDetail extends TitleCard {
  tagline: string;
  vote_count: number;
  release_date: string;
  runtime: number | null;
  genres: string[];
  language: string;
  directors: string[];
  cast: CastMember[];
  trailer_key: string | null;
  imdb_id: string | null;
  recommendations: TitleCard[];
  providers: { region: string; link: string; stream: Provider[]; rent: Provider[]; buy: Provider[] };
  telegram_link: string;
  einthusan_url: string;
  in_library: boolean;
  seasons?: Season[];
  status?: string;
}

export interface Review {
  id: string;
  author: string;
  avatar_url: string;
  rating: number | null;
  content: string;
  created_at: string;
  url: string;
}

export interface Torrent {
  title: string;
  quality: string;
  rip: string;
  codec: string;
  size: string;
  size_bytes: number;
  seeders: number;
  leechers: number;
  info_hash: string;
  magnet: string;
  source: string;
  is_cam: boolean;
  languages: string[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface ListParams {
  type?: 'all' | MediaType;
  sort?: 'trending' | 'popular' | 'rating' | 'newest';
  genre?: string;
  lang?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListResponse {
  data: TitleCard[];
  page: number;
  total_pages: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 0) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  list: (p: ListParams, signal?: AbortSignal) =>
    get<ListResponse>(`/movies${qs({ ...p })}`, signal),
  genres: (type: MediaType) => get<{ genres: Genre[] }>(`/genres?type=${type}`).then((r) => r.genres),
  title: (type: MediaType, id: number | string, signal?: AbortSignal) =>
    get<TitleDetail>(`/movies/${id}?type=${type}`, signal),
  reviews: (type: MediaType, id: number | string) => get<Review[]>(`/reviews?movie_id=${id}&type=${type}`),
  torrents: (type: MediaType, id: number, season = 0, episode = 0, signal?: AbortSignal) =>
    get<{ query: string; results: Torrent[] }>(
      `/torrents/search${qs({ tmdb_id: id, media_type: type, season, episode })}`,
      signal,
    ),
  feedback: async (body: FeedbackBody) => {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
    }
  },
};

export type FeedbackKind = 'idea' | 'bug' | 'request' | 'other';

export interface FeedbackBody {
  kind: FeedbackKind;
  message: string;
  contact?: string;
  page?: string;
  website?: string; // honeypot
}

/** Languages offered as filters (TMDB original_language codes). */
export const LANGUAGES = [
  { code: 'kn', name: 'Kannada' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'en', name: 'English' },
  { code: 'ko', name: 'Korean' },
];

export function titlePath(t: { media_type: MediaType; id: number }) {
  return `/title/${t.media_type}/${t.id}`;
}

export function watchPath(t: { media_type: MediaType; id: number; title: string }, season = 1, episode = 1) {
  const q = new URLSearchParams({ id: String(t.id), type: t.media_type, title: t.title });
  if (t.media_type === 'tv') {
    q.set('s', String(season));
    q.set('e', String(episode));
  }
  return `/watch.html?${q.toString()}`;
}
