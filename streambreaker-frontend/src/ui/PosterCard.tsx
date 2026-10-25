import { Link } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Film, Star } from 'lucide-react';
import { titlePath, type TitleCard } from '../lib/api';
import { useWatchlist } from '../lib/watchlist';

interface Props {
  item: TitleCard;
  className?: string;
  /** Appended to the title link, e.g. "?s=1&e=1#download" */
  linkSuffix?: string;
}

export default function PosterCard({ item, className = '', linkSuffix = '' }: Props) {
  const { has, toggle } = useWatchlist();
  const saved = has(item);

  return (
    <Link to={titlePath(item) + linkSuffix} className={`group block ${className}`} aria-label={`${item.title}${item.year ? ` (${item.year})` : ''}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface ring-1 ring-line transition duration-300 group-hover:ring-accent/60">
        {item.poster_url ? (
          <img
            src={item.poster_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-dim">
            <Film className="h-8 w-8" />
          </div>
        )}

        {item.rating > 0 && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-bg/80 px-1.5 py-0.5 text-xs font-semibold backdrop-blur">
            <Star className="h-3 w-3 fill-star text-star" />
            {item.rating.toFixed(1)}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(item);
          }}
          aria-label={saved ? 'Remove from My List' : 'Add to My List'}
          aria-pressed={saved}
          className={`absolute right-2 top-2 rounded-full p-1.5 backdrop-blur transition ${
            saved
              ? 'bg-accent text-accent-ink'
              : 'bg-bg/70 text-ink opacity-100 hover:bg-bg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'
          }`}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-2 px-0.5">
        <p className="truncate text-sm font-semibold text-ink group-hover:text-accent">{item.title}</p>
        <p className="text-xs text-dim">
          {item.year ?? '—'} · {item.media_type === 'tv' ? 'Series' : 'Movie'}
        </p>
      </div>
    </Link>
  );
}

export function PosterSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <div className="skeleton aspect-[2/3] rounded-xl" />
      <div className="skeleton mt-2 h-3.5 w-3/4 rounded" />
      <div className="skeleton mt-1.5 h-3 w-1/3 rounded" />
    </div>
  );
}
