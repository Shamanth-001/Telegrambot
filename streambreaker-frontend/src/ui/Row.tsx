import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PosterCard, { PosterSkeleton } from './PosterCard';
import type { TitleCard } from '../lib/api';

interface Props {
  title: string;
  items: TitleCard[] | null;
  seeAll?: string;
  icon?: ReactNode;
}

const CARD = 'w-36 shrink-0 snap-start sm:w-40 lg:w-44';

export default function Row({ title, items, seeAll, icon }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  if (items && items.length === 0) return null;

  return (
    <section className="py-5">
      <div className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-8">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight sm:text-2xl">
          {icon}
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {seeAll && (
            <Link to={seeAll} className="mr-2 text-sm font-semibold text-muted hover:text-accent">
              See all
            </Link>
          )}
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={`Scroll ${title} left`}
            className="hidden rounded-full border border-line p-1.5 text-muted hover:border-ink hover:text-ink md:block"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={`Scroll ${title} right`}
            className="hidden rounded-full border border-line p-1.5 text-muted hover:border-ink hover:text-ink md:block"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:scroll-px-8 sm:gap-4 sm:px-8"
      >
        {items
          ? items.map((item) => <PosterCard key={`${item.media_type}-${item.id}`} item={item} className={CARD} />)
          : Array.from({ length: 8 }, (_, i) => <PosterSkeleton key={i} className={CARD} />)}
      </div>
    </section>
  );
}
