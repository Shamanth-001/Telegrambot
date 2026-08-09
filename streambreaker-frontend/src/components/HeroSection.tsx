import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Send } from 'lucide-react';

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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload images for smooth transitions
  useEffect(() => {
    movies.forEach((m) => {
      const img = new Image();
      img.src = m.backdrop_url || m.poster_url;
    });
  }, [movies]);

  const goTo = useCallback(
    (idx: number) => {
      if (isTransitioning || idx === current) return;
      setIsTransitioning(true);
      setCurrent(idx);
      setTimeout(() => setIsTransitioning(false), 600);
    },
    [isTransitioning, current]
  );

  const next = useCallback(() => {
    goTo((current + 1) % movies.length);
  }, [current, movies.length, goTo]);

  const prev = useCallback(() => {
    goTo((current - 1 + movies.length) % movies.length);
  }, [current, movies.length, goTo]);

  // Auto-advance timer
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(next, 7000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, next]);

  if (!movies.length) return null;

  const movie = movies[current];

  return (
    <section className="relative h-[85vh] min-h-[500px] max-h-[900px] overflow-hidden">
      {/* Background layers — all pre-rendered, only opacity toggles */}
      {movies.map((m, idx) => (
        <div
          key={m.id}
          className="absolute inset-0"
          style={{
            opacity: idx === current ? 1 : 0,
            transition: 'opacity 0.6s ease-in-out',
            zIndex: idx === current ? 1 : 0,
          }}
        >
          <img
            src={m.backdrop_url || m.poster_url}
            alt={m.title}
            className="w-full h-full object-cover"
            loading={idx < 3 ? 'eager' : 'lazy'}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-[#0a0a0f]/30" />
        </div>
      ))}

      {/* Content — also crossfades */}
      <div className="relative h-full flex items-center z-[2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl pt-20">
            {/* Tags */}
            <div
              className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4"
              style={{
                opacity: isTransitioning ? 0 : 1,
                transform: isTransitioning ? 'translateY(10px)' : 'translateY(0)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
              }}
            >
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
            <h1
              className="text-3xl sm:text-5xl lg:text-7xl font-bold text-white mb-4 leading-tight"
              style={{
                opacity: isTransitioning ? 0 : 1,
                transform: isTransitioning ? 'translateY(15px)' : 'translateY(0)',
                transition: 'opacity 0.5s ease 0.05s, transform 0.5s ease 0.05s',
              }}
            >
              {movie.title}
            </h1>

            {/* Description */}
            <p
              className="text-gray-300 text-sm sm:text-base lg:text-lg mb-6 line-clamp-3 leading-relaxed"
              style={{
                opacity: isTransitioning ? 0 : 1,
                transform: isTransitioning ? 'translateY(10px)' : 'translateY(0)',
                transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
              }}
            >
              {movie.description}
            </p>

            {/* Meta */}
            <div
              className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400 mb-6 sm:mb-8"
              style={{
                opacity: isTransitioning ? 0 : 1,
                transition: 'opacity 0.4s ease 0.15s',
              }}
            >
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
            <div
              className="flex flex-wrap items-center gap-3 sm:gap-4"
              style={{
                opacity: isTransitioning ? 0 : 1,
                transform: isTransitioning ? 'translateY(10px)' : 'translateY(0)',
                transition: 'opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s',
              }}
            >
              <Link
                to={`/movie/${movie.id}`}
                className="group flex items-center gap-2 px-5 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-amber-500/25 text-sm sm:text-base"
              >
                <Info className="w-4 h-4 sm:w-5 sm:h-5" />
                View Details
              </Link>

              {movie.telegram_link && (
                <a
                  href={movie.telegram_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-[#0088cc]/20 border border-[#0088cc]/40 text-[#0088cc] font-semibold rounded-xl hover:bg-[#0088cc]/30 transition-all duration-300 text-sm sm:text-base"
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                  Download via Telegram
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prev}
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-all z-10"
        aria-label="Previous movie"
      >
        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
      <button
        onClick={next}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-all z-10"
        aria-label="Next movie"
      >
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Dots Indicator */}
      <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        {movies.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goTo(idx)}
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
