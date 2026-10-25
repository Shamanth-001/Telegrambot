import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Search as SearchIcon, X } from 'lucide-react';
import { api, LANGUAGES, type Genre, type ListParams, type MediaType, type TitleCard } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { episodeTag, parseQuery } from '../lib/query';
import PosterCard, { PosterSkeleton } from '../ui/PosterCard';

const SORTS = [
  { value: 'popular', label: 'Popular' },
  { value: 'trending', label: 'Trending' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
] as const;

type Sort = (typeof SORTS)[number]['value'];

const GRID = 'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7';

function Results({ params, linkSuffix }: { params: ListParams; linkSuffix?: string }) {
  const key = JSON.stringify(params);
  const first = useAsync((signal) => api.list({ ...params, page: 1, limit: 40 }, signal), key);
  const [more, setMore] = useState<{ key: string; items: TitleCard[]; page: number }>({ key, items: [], page: 1 });
  const [loadingMore, setLoadingMore] = useState(false);

  if (more.key !== key) setMore({ key, items: [], page: 1 });

  const items = first.data ? dedupe([...first.data.data, ...more.items]) : [];
  const totalPages = first.data?.total_pages ?? 1;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = more.page + 1;
      const r = await api.list({ ...params, page: next, limit: 40 });
      setMore((m) => (m.key === key ? { key, items: [...m.items, ...r.data], page: next } : m));
    } finally {
      setLoadingMore(false);
    }
  };

  if (first.loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 18 }, (_, i) => <PosterSkeleton key={i} />)}
      </div>
    );
  }
  if (first.error) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">Couldn't load titles</p>
        <button type="button" onClick={first.reload} className="mt-3 text-sm font-semibold text-accent">
          Try again
        </button>
      </div>
    );
  }
  if (!items.length) {
    return <p className="py-16 text-center text-muted">Nothing found. Try another search or filter.</p>;
  }
  return (
    <>
      <div className={GRID}>
        {items.map((item) => (
          <PosterCard
            key={`${item.media_type}-${item.id}`}
            item={item}
            linkSuffix={item.media_type === 'tv' ? linkSuffix : undefined}
          />
        ))}
      </div>
      {more.page < totalPages && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-2.5 text-sm font-semibold hover:border-ink disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </>
  );
}

function dedupe(items: TitleCard[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = `${i.media_type}-${i.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** /movies and /series */
export function Catalogue({ type }: { type: MediaType }) {
  const [params, setParams] = useSearchParams();
  const sort = (SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : 'popular') as Sort;
  const genre = params.get('genre') ?? '';
  const lang = LANGUAGES.some((l) => l.code === params.get('lang')) ? params.get('lang')! : '';
  const [genres, setGenres] = useState<Genre[]>([]);

  useEffect(() => {
    let alive = true;
    api.genres(type).then((g) => alive && setGenres(g)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [type]);

  const update = (next: { sort?: string; genre?: string; lang?: string }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const genreName = genres.find((g) => String(g.id) === genre)?.name;
  const langName = LANGUAGES.find((l) => l.code === lang)?.name;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-24 sm:px-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        {[langName, genreName, type === 'movie' ? 'Movies' : 'Series'].filter(Boolean).join(' ')}
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => update({ sort: s.value })}
            aria-pressed={sort === s.value}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              sort === s.value ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button
          type="button"
          onClick={() => update({ lang: '' })}
          aria-pressed={!lang}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
            !lang ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:text-ink'
          }`}
        >
          All languages
        </button>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => update({ lang: l.code })}
            aria-pressed={lang === l.code}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              lang === l.code ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button
          type="button"
          onClick={() => update({ genre: '' })}
          aria-pressed={!genre}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
            !genre ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'
          }`}
        >
          All genres
        </button>
        {genres.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => update({ genre: String(g.id) })}
            aria-pressed={genre === String(g.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              genre === String(g.id) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      <div className="mt-8">
        <Results params={{ type, sort, genre, lang }} />
      </div>
    </div>
  );
}

/** /search?q= */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  // "game of thrones s1e1" -> search series for the title, link straight to that episode
  const episodeQuery = parseQuery(q);
  const type = (['movie', 'tv'].includes(params.get('type') ?? '') ? params.get('type') : 'all') as 'all' | MediaType;
  const [input, setInput] = useState(q);
  const debounced = useDebounced(input.trim(), 350);

  // Keep the box in sync when the navbar search changes ?q=
  const [lastQ, setLastQ] = useState(q);
  if (lastQ !== q) {
    setLastQ(q);
    setInput(q);
  }

  useEffect(() => {
    if (debounced === q) return;
    const p = new URLSearchParams(params);
    if (debounced) p.set('q', debounced);
    else p.delete('q');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const setType = (t: string) => {
    const p = new URLSearchParams(params);
    if (t === 'all') p.delete('type');
    else p.set('type', t);
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-24 sm:px-8">
      <div className="relative max-w-2xl">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dim" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus={!q}
          placeholder="Search for a movie or series…"
          aria-label="Search"
          className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-12 text-lg placeholder:text-dim focus:border-accent/60 focus:outline-none"
        />
        {input && (
          <button
            type="button"
            onClick={() => setInput('')}
            aria-label="Clear"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-dim hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {[
          { v: 'all', l: 'All' },
          { v: 'movie', l: 'Movies' },
          { v: 'tv', l: 'Series' },
        ].map(({ v, l }) => (
          <button
            key={v}
            type="button"
            onClick={() => setType(v)}
            aria-pressed={type === v}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              type === v ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {episodeQuery.season > 0 && (
        <p className="mt-6 text-sm text-muted">
          Showing series named “<span className="text-ink">{episodeQuery.title}</span>” — pick one to get{' '}
          <span className="font-bold text-accent">{episodeTag(episodeQuery.season, episodeQuery.episode)}</span>.
        </p>
      )}

      <div className="mt-8">
        {q ? (
          <Results
            params={episodeQuery.season ? { search: episodeQuery.title, type: 'tv' } : { search: q, type }}
            linkSuffix={
              episodeQuery.season ? `?s=${episodeQuery.season}&e=${episodeQuery.episode}#download` : undefined
            }
          />
        ) : (
          <p className="py-16 text-center text-muted">Type a title to start searching.</p>
        )}
      </div>
    </div>
  );
}
