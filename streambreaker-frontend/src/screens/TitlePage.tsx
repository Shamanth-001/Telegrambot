import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft, Bookmark, BookmarkCheck, Clapperboard, Download, ExternalLink, Play, Send, Share2, Star, User,
} from 'lucide-react';
import { api, watchPath, type MediaType, type Review, type TitleDetail } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useWatchlist } from '../lib/watchlist';
import Downloads from '../ui/Downloads';
import Row from '../ui/Row';
import TrailerModal from '../ui/TrailerModal';
import { copyText } from '../lib/toast';

function runtimeLabel(t: TitleDetail) {
  if (!t.runtime) return null;
  if (t.media_type === 'tv') return `${t.runtime}m / ep`;
  const h = Math.floor(t.runtime / 60);
  const m = t.runtime % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function Providers({ t }: { t: TitleDetail }) {
  const { stream, rent, buy, link } = t.providers;
  const groups = [
    { label: 'Stream', items: stream },
    { label: 'Rent', items: rent },
    { label: 'Buy', items: buy },
  ].filter((g) => g.items.length);
  if (!groups.length && !t.einthusan_url) return null;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Where to watch legally</h2>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-dim hover:text-ink">
            JustWatch <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-xs font-semibold uppercase tracking-wider text-dim">{g.label}</span>
            {g.items.map((p) => (
              <span key={p.name} className="flex items-center gap-2 rounded-lg bg-surface-2 py-1 pl-1 pr-2.5 text-xs font-semibold">
                <img src={p.logo} alt="" className="h-6 w-6 rounded" loading="lazy" />
                {p.name}
              </span>
            ))}
          </div>
        ))}
        {t.einthusan_url && (
          <a
            href={t.einthusan_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-semibold hover:bg-line"
          >
            <span>
              Einthusan
              <span className="block text-xs font-normal text-dim">Licensed South Asian films, free with ads</span>
            </span>
            <ExternalLink className="h-4 w-4 text-dim" />
          </a>
        )}
      </div>
    </section>
  );
}

function Cast({ t }: { t: TitleDetail }) {
  if (!t.cast.length) return null;
  return (
    <section>
      <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">Cast</h2>
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {t.cast.map((c) => (
          <div key={c.name + c.character} className="w-24 shrink-0 text-center">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-surface-2">
              {c.profile_url ? (
                <img src={c.profile_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <User className="m-7 h-10 w-10 text-dim" />
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-semibold">{c.name}</p>
            <p className="line-clamp-1 text-xs text-dim">{c.character}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const [open, setOpen] = useState(false);
  const long = r.content.length > 420;
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <header className="mb-3 flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-sm font-bold">
          {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : r.author[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{r.author}</p>
          <p className="text-xs text-dim">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</p>
        </div>
        {r.rating != null && (
          <span className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs font-bold">
            <Star className="h-3 w-3 fill-star text-star" /> {r.rating}/10
          </span>
        )}
      </header>
      <p className={`whitespace-pre-line text-sm leading-relaxed text-muted ${!open && long ? 'line-clamp-6' : ''}`}>{r.content}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-sm font-semibold text-accent">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </article>
  );
}

function Reviews({ type, id }: { type: MediaType; id: number }) {
  const { data } = useAsync(() => api.reviews(type, id), `${type}-${id}`);
  if (!data?.length) return null;
  return (
    <section>
      <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">Reviews</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.slice(0, 6).map((r) => (
          <ReviewCard key={r.id} r={r} />
        ))}
      </div>
    </section>
  );
}

function Detail({ t }: { t: TitleDetail }) {
  const { has, toggle } = useWatchlist();
  const [trailer, setTrailer] = useState(false);
  const saved = has(t);
  const location = useLocation();

  useEffect(() => {
    document.title = `${t.title}${t.year ? ` (${t.year})` : ''} · StreamBreaker`;
    if (location.hash === '#download') {
      setTimeout(() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' }), 300);
    } else {
      window.scrollTo(0, 0);
    }
  }, [t, location.hash]);

  const share = async () => {
    const url = window.location.href.split('#')[0];
    if (navigator.share) {
      try {
        await navigator.share({ title: t.title, url });
        return;
      } catch {
        // cancelled or unsupported — fall back to copying
      }
    }
    copyText(url, 'Link copied');
  };

  const meta = [t.year, runtimeLabel(t), t.media_type === 'tv' && t.seasons ? `${t.seasons.length} seasons` : null, t.language]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <div className="relative h-[52vh] min-h-[340px] w-full overflow-hidden sm:h-[62vh]">
        {t.backdrop_url && <img src={t.backdrop_url} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/80 to-transparent" />
      </div>

      <div className="relative mx-auto -mt-[28vh] max-w-[1600px] px-4 sm:-mt-[34vh] sm:px-8">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = '/'))}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-bg/60 px-3 py-1.5 text-sm font-semibold backdrop-blur hover:bg-bg"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex flex-col gap-8 md:flex-row">
          <img
            src={t.poster_url}
            alt={`${t.title} poster`}
            className="w-40 shrink-0 self-start rounded-2xl shadow-2xl ring-1 ring-line sm:w-56 lg:w-64"
          />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">{t.media_type === 'tv' ? 'Series' : 'Movie'}</p>
            <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t.title}</h1>
            {t.tagline && <p className="mt-2 text-lg italic text-muted">{t.tagline}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              {t.rating > 0 && (
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <Star className="h-4 w-4 fill-star text-star" />
                  {t.rating.toFixed(1)}
                  <span className="font-normal text-dim">({t.vote_count.toLocaleString()})</span>
                </span>
              )}
              <span>{meta}</span>
            </div>

            {t.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {t.genres.map((g) => (
                  <span key={g} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#download"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-ink hover:bg-accent-hover"
              >
                <Download className="h-4 w-4" strokeWidth={2.5} /> Download
              </a>
              <a
                href={watchPath(t)}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-bg hover:bg-ink/85"
              >
                <Play className="h-4 w-4 fill-current" /> Watch online
              </a>
              {t.trailer_key && (
                <button
                  type="button"
                  onClick={() => setTrailer(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold hover:border-ink"
                >
                  <Clapperboard className="h-4 w-4" /> Trailer
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggle(t)}
                aria-pressed={saved}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                  saved ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted hover:text-ink'
                }`}
              >
                {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {saved ? 'In My List' : 'My List'}
              </button>
              <a
                href={t.telegram_link}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                  t.in_library ? 'bg-[#2aabee] text-white hover:bg-[#229ed9]' : 'bg-surface-2 text-muted hover:text-ink'
                }`}
                title={t.in_library ? 'Already in our Telegram library — sent instantly' : 'Get links or request the file in Telegram'}
              >
                <Send className="h-4 w-4" /> {t.in_library ? 'Get the file on Telegram · instant' : 'Get on Telegram'}
              </a>
              <button
                type="button"
                onClick={share}
                className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-muted hover:text-ink"
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>

            <p className="mt-6 max-w-3xl leading-relaxed text-ink/85">{t.overview || 'No overview available.'}</p>
            {t.directors.length > 0 && (
              <p className="mt-3 text-sm text-dim">
                {t.media_type === 'tv' ? 'Created by' : 'Directed by'}{' '}
                <span className="font-semibold text-muted">{t.directors.join(', ')}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-12 grid gap-12 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Downloads key={`${t.media_type}-${t.id}`} title={t} />
          <div className="space-y-6">
            <Providers t={t} />
          </div>
        </div>

        <div className="mt-14 space-y-14">
          <Cast t={t} />
          <Reviews type={t.media_type} id={t.id} />
        </div>
      </div>

      <div className="mt-10">
        <Row title="More like this" items={t.recommendations} />
      </div>

      {trailer && t.trailer_key && <TrailerModal videoKey={t.trailer_key} title={t.title} onClose={() => setTrailer(false)} />}
    </div>
  );
}

export default function TitlePage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const mediaType: MediaType = type === 'tv' ? 'tv' : 'movie';
  const { data, error, loading, reload } = useAsync((signal) => api.title(mediaType, id ?? '', signal), `${mediaType}-${id}`);

  if (loading) {
    return (
      <div>
        <div className="skeleton h-[52vh] min-h-[340px] w-full sm:h-[62vh]" />
        <div className="mx-auto -mt-40 flex max-w-[1600px] gap-8 px-4 sm:px-8">
          <div className="skeleton aspect-[2/3] w-40 shrink-0 rounded-2xl sm:w-56 lg:w-64" />
          <div className="mt-24 flex-1 space-y-3">
            <div className="skeleton h-10 w-2/3 rounded-lg" />
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    const notFound = (error as { status?: number } | null)?.status === 404;
    return (
      <div className="mx-auto max-w-lg px-4 pt-40 text-center">
        <h1 className="font-display text-3xl font-bold">{notFound ? 'Title not found' : "Couldn't load this title"}</h1>
        <p className="mt-2 text-muted">
          {notFound ? 'It may have been removed from TMDB.' : 'The server may be waking up — give it a few seconds.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {!notFound && (
            <button type="button" onClick={reload} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink">
              Try again
            </button>
          )}
          <Link to="/" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return <Detail t={data} />;
}
