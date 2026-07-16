import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Trash2, Film, ArrowLeft, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import supabase from '../lib/supabase';

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  genre: string;
  release_year: number;
  duration?: string;
}

export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      fetchWatchlist();
    }
  }, [user]);

  const fetchWatchlist = async () => {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      
      const res = await fetch('/api/watchlist', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMovies(data);
    } catch (err) {
      console.error('Error fetching watchlist:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeFromWatchlist = async (movieId: number) => {
    setRemovingId(movieId);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      
      await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ movie_id: movieId }),
      });
      
      setMovies(prev => prev.filter(m => m.id !== movieId));
    } catch (err) {
      console.error('Error removing from watchlist:', err);
    } finally {
      setRemovingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <ProtectedRoute>
        <div />
      </ProtectedRoute>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-red-600 flex items-center justify-center">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">My Watchlist</h1>
              <p className="text-gray-400">Your saved movies for later</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mt-2">
            <span>{movies.length} {movies.length === 1 ? 'movie' : 'movies'}</span>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : movies.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
              <Heart className="w-12 h-12 text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Your watchlist is empty</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Start exploring and add movies you want to watch later. Click the heart icon on any movie card!
            </p>
            <Link
              to="/browse"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all duration-300"
            >
              <Film className="w-5 h-5" />
              Explore Movies
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <AnimatePresence>
              {movies.map((movie, idx) => (
                <motion.div
                  key={movie.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: idx * 0.03 }}
                  layout
                >
                  <div className="group relative">
                    <Link to={`/movie/${movie.id}`} className="block">
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#1a1a24] shadow-lg group-hover:shadow-2xl group-hover:shadow-pink-500/10 transition-all duration-300 transform group-hover:-translate-y-2">
                        <img
                          src={movie.poster_url}
                          alt={movie.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
                        
                        <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg">
                          <span className="text-xs font-semibold text-amber-400">★ {movie.rating.toFixed(1)}</span>
                        </div>
                        
                        <div className="absolute bottom-3 left-3">
                          <span className="px-2 py-1 bg-amber-500/80 backdrop-blur-sm rounded-md text-xs font-medium text-white capitalize">
                            {movie.genre}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 px-1">
                        <h3 className="font-semibold text-white text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">
                          {movie.title}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">{movie.release_year}</p>
                      </div>
                    </Link>
                    
                    {/* Remove Button */}
                    <button
                      onClick={() => removeFromWatchlist(movie.id)}
                      disabled={removingId === movie.id}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-red-500 disabled:opacity-50"
                    >
                      {removingId === movie.id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
