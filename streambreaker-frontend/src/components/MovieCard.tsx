import { Link } from 'react-router-dom';
import { Star, Play, Heart, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
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

interface MovieCardProps {
  movie: Movie;
  index?: number;
}

export default function MovieCard({ movie, index = 0 }: MovieCardProps) {
  const { user } = useAuth();
  const [inWatchlist, setInWatchlist] = useState(false);
  const [showAdded, setShowAdded] = useState(false);

  useEffect(() => {
    checkWatchlist();
  }, [movie.id, user]);

  const checkWatchlist = async () => {
    if (!user) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      
      const res = await fetch('/api/watchlist', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setInWatchlist(data.some((m: Movie) => m.id === movie.id));
    } catch {}
  };

  const toggleWatchlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      
      if (inWatchlist) {
        await fetch('/api/watchlist', {
          method: 'DELETE',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ movie_id: movie.id }),
        });
        setInWatchlist(false);
      } else {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ movie_id: movie.id }),
        });
        setInWatchlist(true);
        setShowAdded(true);
        setTimeout(() => setShowAdded(false), 1500);
      }
    } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Link to={`/movie/${movie.id}${movie.genre?.toLowerCase() === 'series' ? '?type=tv' : ''}`} className="group block">
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#1a1a24] shadow-lg group-hover:shadow-2xl group-hover:shadow-amber-500/10 transition-all duration-300 transform group-hover:-translate-y-2">
          {/* Poster Image */}
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
          
          {/* Rating Badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="text-xs font-semibold text-white">{movie.rating.toFixed(1)}</span>
          </div>
          
          {/* Year Badge */}
          <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg">
            <span className="text-xs font-medium text-gray-300">{movie.release_year}</span>
          </div>
          
          {/* Play Button - Hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-14 h-14 rounded-full bg-amber-500/90 backdrop-blur-sm flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
              <Play className="w-7 h-7 text-white ml-1" fill="white" />
            </div>
          </div>
          
          {/* Watchlist Button */}
          <button
            onClick={toggleWatchlist}
            className={`absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
              showAdded
                ? 'bg-green-500 text-white'
                : inWatchlist
                ? 'bg-red-500/80 text-white'
                : 'bg-black/60 backdrop-blur-sm text-white hover:bg-amber-500'
            }`}
          >
            {showAdded ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            ) : inWatchlist ? (
              <Heart className="w-5 h-5" fill="white" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
          </button>
          
          {/* Genre Tag */}
          <div className="absolute bottom-3 left-3">
            <span className="px-2 py-1 bg-amber-500/80 backdrop-blur-sm rounded-md text-xs font-medium text-white capitalize">
              {movie.genre}
            </span>
          </div>
        </div>
        
        {/* Title & Info */}
        <div className="mt-3 px-1">
          <h3 className="font-semibold text-white text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">
            {movie.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span>{movie.release_year}</span>
            {movie.duration && <span>•</span>}
            {movie.duration && <span>{movie.duration}</span>}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
