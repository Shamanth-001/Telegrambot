import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, Clapperboard, Film, Home, Loader2, Search, Tv, X } from 'lucide-react';
import { api, titlePath, type TitleCard } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { episodeTag, parseQuery } from '../lib/query';
import { useWatchlist } from '../lib/watchlist';

const LINKS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/movies', label: 'Movies', icon: Film, end: false },
  { to: '/series', label: 'Series', icon: Tv, end: false },
  { to: '/watchlist', label: 'My List', icon: Bookmark, end: false },
];

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="StreamBreaker home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
        <Clapperboard className="h-[18px] w-[18px]" strokeWidth={2.5} />
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight">StreamBreaker</span>
    </Link>
  );
}

function SearchBox({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<TitleCard[]>([]);
  const [loadedFor, setLoadedFor] = useState('');
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(q.trim(), 250);
  const boxRef = useRef<HTMLDivElement>(null);

  // "game of thrones s1e1" -> search series for the title, then jump to that episode
  const parsed = parseQuery(debounced);
  const tag = episodeTag(parsed.season, parsed.episode);
  const hrefFor = (r: TitleCard) =>
    tag && r.media_type === 'tv' ? `${titlePath(r)}?s=${parsed.season}&e=${parsed.episode}#download` : titlePath(r);

  useEffect(() => {
    if (debounced.length < 2) return;
    const controller = new AbortController();
    const p = parseQuery(debounced);
    api
      .list(p.season ? { search: p.title, type: 'tv', limit: 6 } : { search: debounced, limit: 6 }, controller.signal)
      .then((r) => {
        setResults(r.data);
        setActive(-1);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoadedFor(debounced);
      });
    return () => controller.abort();
  }, [debounced]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const shown = debounced.length >= 2 ? results : [];
  const loading = debounced.length >= 2 && loadedFor !== debounced;

  const go = (path: string) => {
    setOpen(false);
    setQ('');
    onDone?.();
    navigate(path);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && shown[active]) return go(hrefFor(shown[active]));
    // Enter on "game of thrones s1e1": open the top series match at that episode
    if (tag && shown[0]) return go(hrefFor(shown[0]));
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === 'Escape') {
              setOpen(false);
              onDone?.();
            }
          }}
          autoFocus={autoFocus}
          placeholder="Search movies & series"
          aria-label="Search movies and series"
          className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-dim focus:border-accent/60 focus:outline-none"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-dim" />
        ) : (
          q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-dim hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </form>

      {open && shown.length > 0 && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          {shown.map((r, i) => (
            <button
              key={`${r.media_type}-${r.id}`}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(hrefFor(r))}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? 'bg-surface-2' : ''}`}
            >
              <img src={r.poster_url} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{r.title}</span>
                <span className="text-xs text-dim">
                  {r.year ?? '—'} · {r.media_type === 'tv' ? 'Series' : 'Movie'}
                  {tag && r.media_type === 'tv' && <span className="ml-1.5 font-bold text-accent">{tag}</span>}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
            className="w-full border-t border-line px-3 py-2.5 text-left text-sm font-semibold text-accent hover:bg-surface-2"
          >
            See all results for “{q.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const { items } = useWatchlist();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile search when navigating
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMobileSearch(false);
  }

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
          scrolled || mobileSearch ? 'border-b border-line bg-bg/90 backdrop-blur-lg' : 'bg-gradient-to-b from-bg/90 to-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {LINKS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                    isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
                  }`
                }
              >
                {label}
                {to === '/watchlist' && items.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">
                    {items.length}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden w-80 lg:block">
            <SearchBox />
          </div>
          <button
            type="button"
            onClick={() => setMobileSearch((v) => !v)}
            aria-label={mobileSearch ? 'Close search' : 'Search'}
            aria-expanded={mobileSearch}
            className="ml-auto rounded-full p-2 text-ink hover:bg-surface-2 lg:hidden"
          >
            {mobileSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
        </div>
        {mobileSearch && (
          <div className="px-4 pb-3 sm:px-8 lg:hidden">
            <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
          </div>
        )}
      </header>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
      >
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                isActive ? 'text-accent' : 'text-dim'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
            {to === '/watchlist' && items.length > 0 && (
              <span className="absolute right-[calc(50%-20px)] top-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
