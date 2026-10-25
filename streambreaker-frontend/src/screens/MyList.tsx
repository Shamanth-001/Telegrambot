import { Link } from 'react-router-dom';
import { Bookmark, X } from 'lucide-react';
import { useWatchlist } from '../lib/watchlist';
import PosterCard from '../ui/PosterCard';

export default function MyList() {
  const { items, remove } = useWatchlist();

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-24 sm:px-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">My List</h1>
      <p className="mt-1 text-sm text-dim">Saved on this device · {items.length} {items.length === 1 ? 'title' : 'titles'}</p>

      {items.length === 0 ? (
        <div className="mx-auto mt-16 max-w-sm text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-surface-2">
            <Bookmark className="h-7 w-7 text-accent" />
          </div>
          <p className="mt-4 text-lg font-semibold">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted">Tap the bookmark on any poster to keep it here.</p>
          <Link to="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink">
            Find something to watch
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {items.map((item) => (
            <div key={`${item.media_type}-${item.id}`} className="relative">
              <PosterCard item={item} />
              <button
                type="button"
                onClick={() => remove(item)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-dim hover:text-bad"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
