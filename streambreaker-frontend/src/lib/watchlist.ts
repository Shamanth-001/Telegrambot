import { useCallback, useSyncExternalStore } from 'react';
import type { TitleCard } from './api';

// The watchlist lives in this browser's localStorage — no account needed.
const KEY = 'sb.watchlist.v1';
const listeners = new Set<() => void>();
let cache: TitleCard[] | null = null;

function read(): TitleCard[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as TitleCard[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: TitleCard[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage unavailable (private mode) — keep the in-memory copy
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const sameTitle = (a: Pick<TitleCard, 'id' | 'media_type'>, b: Pick<TitleCard, 'id' | 'media_type'>) =>
  a.id === b.id && a.media_type === b.media_type;

export function useWatchlist() {
  const items = useSyncExternalStore(subscribe, read, () => []);

  const has = useCallback((t: Pick<TitleCard, 'id' | 'media_type'>) => items.some((i) => sameTitle(i, t)), [items]);

  const toggle = useCallback((t: TitleCard) => {
    const current = read();
    const card: TitleCard = {
      id: t.id,
      media_type: t.media_type,
      title: t.title,
      overview: t.overview,
      poster_url: t.poster_url,
      backdrop_url: t.backdrop_url,
      rating: t.rating,
      year: t.year,
      genre_ids: t.genre_ids ?? [],
    };
    write(current.some((i) => sameTitle(i, t)) ? current.filter((i) => !sameTitle(i, t)) : [card, ...current]);
  }, []);

  const remove = useCallback((t: Pick<TitleCard, 'id' | 'media_type'>) => {
    write(read().filter((i) => !sameTitle(i, t)));
  }, []);

  return { items, has, toggle, remove };
}
