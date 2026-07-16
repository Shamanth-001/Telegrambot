import { useState, useEffect } from 'react';
import { TrendingUp, Flame, Clock, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import HeroSection from '../components/HeroSection';
import MovieCardSimple from '../components/MovieCardSimple';

interface Movie {
  id: number;
  title: string;
  description: string;
  poster_url: string;
  backdrop_url: string;
  rating: number;
  genre: string;
  release_year: number;
  duration?: string;
  cast?: string[];
  telegram_link?: string;
  trailer_url?: string;
  mood_tags?: string[];
  trending_score: number;
  views: number;
}

export default function Home() {
  const [featuredMovies, setFeaturedMovies] = useState<Movie[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<Movie[]>([]);
  const [recentMovies, setRecentMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [featuredRes, trendingRes, ratedRes, recentRes] = await Promise.all([
        fetch('/api/movies?sort=trending&limit=5'),
        fetch('/api/movies?sort=trending&limit=12'),
        fetch('/api/movies?sort=rating&limit=12'),
        fetch('/api/movies?sort=newest&limit=12'),
      ]);

      const [featured, trending, rated, recent] = await Promise.all([
        featuredRes.json(),
        trendingRes.json(),
        ratedRes.json(),
        recentRes.json(),
      ]);

      setFeaturedMovies(featured.data || []);
      setTrendingMovies(trending.data || []);
      setTopRatedMovies(rated.data || []);
      setRecentMovies(recent.data || []);
    } catch (err) {
      console.error('Error fetching movies:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-gray-400 animate-pulse">Loading amazing movies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Hero Section */}
      <HeroSection movies={featuredMovies} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 -mt-20 relative z-10">
        
        {/* Trending Now */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Trending Now</h2>
                <p className="text-sm text-gray-400">What everyone is watching</p>
              </div>
            </div>
            <Link
              to="/browse?sort=trending"
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
            >
              See All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {trendingMovies.slice(0, 12).map((movie, idx) => (
              <MovieCardSimple key={movie.id} movie={movie} index={idx} />
            ))}
          </div>
        </section>

        {/* Top Rated */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Top Rated</h2>
                <p className="text-sm text-gray-400">Highest rated films of all time</p>
              </div>
            </div>
            <Link
              to="/browse?sort=rating"
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
            >
              See All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {topRatedMovies.slice(0, 12).map((movie, idx) => (
              <MovieCardSimple key={movie.id} movie={movie} index={idx} />
            ))}
          </div>
        </section>

        {/* Recently Added */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Recently Added</h2>
                <p className="text-sm text-gray-400">Fresh releases just for you</p>
              </div>
            </div>
            <Link
              to="/browse?sort=newest"
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
            >
              See All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recentMovies.slice(0, 12).map((movie, idx) => (
              <MovieCardSimple key={movie.id} movie={movie} index={idx} />
            ))}
          </div>
        </section>

        {/* CTA Banner */}
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-red-500/20 border border-amber-500/20 p-8 md:p-12">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                  <Sparkles className="w-6 h-6 text-amber-400" />
                  <h3 className="text-2xl font-bold text-white">Join CineVault Today</h3>
                </div>
                <p className="text-gray-300 max-w-lg">
                  Create your watchlist, rate your favorites, and get personalized recommendations. 
                  Download movies instantly via our Telegram bot!
                </p>
              </div>
              <Link
                to="/login"
                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all duration-300 transform hover:scale-105 whitespace-nowrap"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
