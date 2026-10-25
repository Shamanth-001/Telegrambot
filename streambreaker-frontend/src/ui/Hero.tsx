import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Download, Info, Star } from 'lucide-react';
import { titlePath, type TitleCard } from '../lib/api';
import { useWatchlist } from '../lib/watchlist';

const INTERVAL = 8000;

export default function Hero({ items }: { items: TitleCard[] | null }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { has, toggle } = useWatchlist();
  const slides = (items ?? []).filter((i) => i.backdrop_url).slice(0, 6);
  const count = slides.length;
  const current = count ? index % count : 0;

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL);
    return () => clearTimeout(t);
  }, [index, count, paused]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!items) {
    return <div className="skeleton h-[72vh] min-h-[460px] w-full" />;
  }
  if (!count) return <div className="h-24" />;

  const item = slides[current];
  const go = (i: number) => setIndex((i + count) % count);
  const saved = has(item);

  return (
    <section
      className="relative h-[72vh] min-h-[460px] max-h-[820px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      {slides.map((s, i) => (
        <img
          key={`${s.media_type}-${s.id}`}
          src={s.backdrop_url}
          alt=""
          aria-hidden={i !== current}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            i === current ? 'opacity-100' : 'opacity-0'
          }`}
          fetchPriority={i === 0 ? 'high' : 'low'}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/40" />

      <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-16 sm:px-8 sm:pb-20">
        <div key={`${item.media_type}-${item.id}`} className="fade-up max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
            <span className="rounded bg-accent px-1.5 py-0.5 text-accent-ink">Trending</span>
            <span>{item.media_type === 'tv' ? 'Series' : 'Movie'}</span>
            {item.year && <span>· {item.year}</span>}
            {item.rating > 0 && (
              <span className="flex items-center gap-1 normal-case tracking-normal">
                · <Star className="h-3.5 w-3.5 fill-star text-star" /> {item.rating.toFixed(1)}
              </span>
            )}
          </div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {item.title}
          </h1>
          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{item.overview}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to={`${titlePath(item)}#download`}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-ink hover:bg-accent-hover"
            >
              <Download className="h-4 w-4" strokeWidth={2.5} />
              Get it
            </Link>
            <Link
              to={titlePath(item)}
              className="inline-flex items-center gap-2 rounded-full bg-ink/10 px-5 py-3 text-sm font-semibold backdrop-blur hover:bg-ink/20"
            >
              <Info className="h-4 w-4" />
              Details
            </Link>
            <button
              type="button"
              onClick={() => toggle(item)}
              aria-pressed={saved}
              aria-label={saved ? 'Remove from My List' : 'Add to My List'}
              className="grid h-11 w-11 place-items-center rounded-full border border-ink/30 hover:border-ink"
            >
              {saved ? <BookmarkCheck className="h-5 w-5 text-accent" /> : <Bookmark className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {count > 1 && (
        <div className="absolute bottom-6 right-4 flex items-center gap-3 sm:right-8">
          <button
            type="button"
            onClick={() => go(current - 1)}
            aria-label="Previous"
            className="hidden rounded-full border border-ink/30 p-2 hover:border-ink sm:block"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show ${s.title}`}
                aria-current={i === current}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-accent' : 'w-1.5 bg-ink/40 hover:bg-ink/70'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(current + 1)}
            aria-label="Next"
            className="hidden rounded-full border border-ink/30 p-2 hover:border-ink sm:block"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
