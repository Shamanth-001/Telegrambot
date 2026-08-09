import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, ChevronLeft, ChevronRight, Info, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Movie {
  id: number;
  title: string;
  description: string;
  backdrop_url: string;
  poster_url: string;
  rating: number;
  genre: string;
  release_year: number;
  cast?: string[];
  telegram_link?: string;
}

interface HeroSectionProps {
  movies: Movie[];
}

export default function HeroSection({ movies }: HeroSectionProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % movies.length);
    }, 7000);
    return () => clearTimeout(timer);
  }, [current, movies.length]);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 1000 : -1000, opacity: 0 }),
    center: { zIndex: 1, x: 0, opacity: 1 },
    exit: (dir: number) => ({ zIndex: 0, x: dir > 0 ? -1000 : 1000, opacity: 0 }),
  };

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrent((prev) => {
      const next = prev + newDirection;
      if (next < 0) return movies.length - 1;
      if (next >= movies.length) return 0;
      return next;
    });
  };

  if (!movies.length) return null;

  const movie = movies[current];

  return (
    <section className="relative h-[85vh] min-h-[600px] max-h-[900px] overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={current}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          {/* Background Image */}
          <div className="absolute inset-0">
            <img
              src={movie.backdrop_url || movie.poster_url}
              alt={movie.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-[#0a0a0f]/30" />
          </div>

          {/* Content */}
          <div className="relative h-full flex items-center">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
              <div className="max-w-2xl pt-20">
                {/* Tags */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-xs font-semibold uppercase tracking-wider">
                    Featured
                  </span>
                  <span className="px-3 py-1 bg-white/10 border border-white/20 rounded-full text-gray-300 text-xs font-medium capitalize">
                    {movie.genre}
                  </span>
                  <span className="flex items-center gap-1 text-amber-400 text-sm font-semibold">
                    ★ {movie.rating.toFixed(1)}
                  </span>
                </div>

                {/* Title */}
                <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white mb-4 leading-tight">
                  {movie.title}
                </h1>

                {/* Description */}
                <p className="text-gray-300 text-base sm:text-lg mb-6 line-clamp-3 leading-relaxed">
                  {movie.description}
                </p>

                {/* Meta */}
                <div className="flex items-center gap-4 text-sm text-gray-400 mb-8">
                  <span>{movie.release_year}</span>
                  <span>•</span>
                  <span className="capitalize">{movie.genre}</span>
                  {movie.cast && movie.cast.length > 0 && (
                    <>
                      <span>•</span>
                      <span className="line-clamp-1">{movie.cast.slice(0, 2).join(', ')}</span>
                    </>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    to={`/movie/${movie.id}`}
                    className="group flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-amber-500/25"
                  >
                    <Info className="w-5 h-5" />
                    View Details
                  </Link>
                  
                  {movie.telegram_link && (
                    <a
                      href={movie.telegram_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-6 py-4 bg-[#0088cc]/20 border border-[#0088cc]/40 text-[#0088cc] font-semibold rounded-xl hover:bg-[#0088cc]/30 transition-all duration-300"
                    >
                      <Send className="w-5 h-5" />
                      Download via Telegram
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows */}
      <button
        onClick={() => paginate(-1)}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-all z-10"
        aria-label="Previous movie"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        onClick={() => paginate(1)}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-all z-10"
        aria-label="Next movie"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Dots Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        {movies.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              setDirection(idx > current ? 1 : -1);
              setCurrent(idx);
            }}
            className={`transition-all duration-300 rounded-full ${
              idx === current
                ? 'w-8 h-3 bg-amber-500'
                : 'w-3 h-3 bg-white/30 hover:bg-white/50'
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
