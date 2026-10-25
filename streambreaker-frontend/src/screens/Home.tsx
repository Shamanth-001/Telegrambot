import { Flame, Sparkles, Star, Tv } from 'lucide-react';
import { api, type ListParams } from '../lib/api';
import { useAsync } from '../lib/hooks';
import Hero from '../ui/Hero';
import Row from '../ui/Row';

function ListRow({ title, params, seeAll, icon }: { title: string; params: ListParams; seeAll: string; icon?: React.ReactNode }) {
  const { data, error } = useAsync((signal) => api.list({ limit: 20, ...params }, signal), JSON.stringify(params));
  if (error) return null;
  return <Row title={title} items={data?.data ?? null} seeAll={seeAll} icon={icon} />;
}

export default function Home() {
  const trending = useAsync((signal) => api.list({ sort: 'trending', limit: 20 }, signal), 'home-trending');

  return (
    <div>
      <Hero items={trending.error ? [] : trending.data?.data ?? null} />
      {trending.error && (
        <p className="mx-4 mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted sm:mx-8">
          Couldn't load titles — the server may be waking up. Refresh in a minute.
        </p>
      )}
      <div className="-mt-6 relative">
        <Row
          title="Trending this week"
          icon={<Flame className="h-5 w-5 text-accent" />}
          items={trending.error ? [] : trending.data?.data ?? null}
          seeAll="/movies?sort=trending"
        />
        <ListRow title="Popular movies" params={{ type: 'movie', sort: 'popular' }} seeAll="/movies?sort=popular" />
        <ListRow
          title="Popular in Kannada"
          params={{ type: 'movie', sort: 'popular', lang: 'kn' }}
          seeAll="/movies?lang=kn"
        />
        <ListRow
          title="New Kannada releases"
          params={{ type: 'movie', sort: 'newest', lang: 'kn' }}
          seeAll="/movies?lang=kn&sort=newest"
        />
        <ListRow
          title="Popular series"
          icon={<Tv className="h-5 w-5 text-accent" />}
          params={{ type: 'tv', sort: 'popular' }}
          seeAll="/series?sort=popular"
        />
        <ListRow
          title="New releases"
          icon={<Sparkles className="h-5 w-5 text-accent" />}
          params={{ type: 'movie', sort: 'newest' }}
          seeAll="/movies?sort=newest"
        />
        <ListRow
          title="Top rated movies"
          icon={<Star className="h-5 w-5 text-accent" />}
          params={{ type: 'movie', sort: 'rating' }}
          seeAll="/movies?sort=rating"
        />
        <ListRow title="Top rated series" params={{ type: 'tv', sort: 'rating' }} seeAll="/series?sort=rating" />
      </div>
    </div>
  );
}
