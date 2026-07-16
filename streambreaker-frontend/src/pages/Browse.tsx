import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Grid3X3, List, X, Film } from 'lucide-react';
import MovieCardSimple from '../components/MovieCardSimple';

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  genre: string;
  release_year: number;
  duration?: string;
  mood_tags?: string[];
}

interface Genre {
  id: number;
  name: string;
  icon?: string;
}

const MOODS = ['exciting', 'romantic', 'thrilling', 'emotional', 'funny', 'dark', 'inspiring', 'mysterious'];
const SORT_OPTIONS = [
  { value: 'trending', label: '🔥 Trending' },
  { value: 'rating', label: '⭐ Top Rated' },
  { value: 'newest', label: '🆕 Newest First' },
];

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Filter states
  const [selectedGenre, setSelectedGenre] = useState(searchParams.get('genre') || 'all');
  const [selectedMood, setSelectedMood] = useState(searchParams.get('mood') || 'all');
  const [selectedSort, setSelectedSort] = useState(searchParams.get('sort') || 'trending');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchGenres();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    
    const fetchMovies = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedGenre !== 'all') params.set('genre', selectedGenre);
        if (selectedMood !== 'all') params.set('mood', selectedMood);
        params.set('sort', selectedSort);
        params.set('limit', '50');
        if (searchQuery) params.set('search', searchQuery);
        
        const res = await fetch(`/api/movies?${params.toString()}`, { signal: controller.signal });
        const data = await res.json();
        setMovies(data.data || []);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error fetching movies:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchMovies();
    updateURL();

    return () => {
      controller.abort();
    };
  }, [selectedGenre, selectedMood, selectedSort, searchQuery]);

  const updateURL = () => {
    const params = new URLSearchParams();
    if (selectedGenre !== 'all') params.set('genre', selectedGenre);
    if (selectedMood !== 'all') params.set('mood', selectedMood);
    if (selectedSort !== 'trending') params.set('sort', selectedSort);
    if (searchQuery) params.set('search', searchQuery);
    setSearchParams(params, { replace: true });
  };

  const fetchGenres = async () => {
    try {
      const res = await fetch('/api/genres');
      const data = await res.json();
      setGenres(data);
    } catch (err) {
      console.error('Error fetching genres:', err);
    }
  };

  const clearFilters = () => {
    setSelectedGenre('all');
    setSelectedMood('all');
    setSelectedSort('trending');
    setSearchQuery('');
  };

  const activeFilterCount = [selectedGenre, selectedMood, searchQuery].filter(
    f => f && f !== 'all'
  ).length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Browse Movies</h1>
          <p className="text-gray-400">Discover your next favorite film</p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, actor, or keyword..."
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all text-lg"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
              showFilters || activeFilterCount > 0
                ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
                : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            {/* Sort Dropdown */}
            <select
              value={selectedSort}
              onChange={(e) => setSelectedSort(e.target.value)}
              className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 focus:outline-none focus:border-amber-500/50 cursor-pointer appearance-none pr-8"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-[#16161d]">{opt.label}</option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Filter Movies</h3>
              {(activeFilterCount > 0) && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Genre Filter */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Genre</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedGenre('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedGenre === 'all'
                      ? 'bg-amber-500 text-white'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  All Genres
                </button>
                {genres.map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => setSelectedGenre(genre.name)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                      selectedGenre === genre.name
                        ? 'bg-amber-500 text-white'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {genre.icon} {genre.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Mood Filter */}
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-3">Mood</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedMood('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                    selectedMood === 'all'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  All Moods
                </button>
                {MOODS.map((mood) => (
                  <button
                    key={mood}
                    onClick={() => setSelectedMood(mood)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                      selectedMood === mood
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    🎭 {mood}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        {!loading && movies.length > 0 && (
          <div className="mb-4 text-sm text-gray-400">
            Showing <span className="text-white font-medium">{movies.length}</span> movies
            {activeFilterCount > 0 && (
              <span> • <button onClick={clearFilters} className="text-amber-400 hover:text-amber-300">Clear filters</button></span>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : movies.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20">
            <Film className="w-20 h-20 text-gray-600 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-3">No movies found</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Try adjusting your filters or search terms to find what you're looking for.
            </p>
            <button
              onClick={clearFilters}
              className="px-6 py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {movies.map((movie, idx) => (
              <MovieCardSimple key={movie.id} movie={movie} index={idx} />
            ))}
          </div>
        ) : (
          /* List View */
          <div className="space-y-3">
            {movies.map((movie, idx) => (
              <a
                key={movie.id}
                href={`/movie/${movie.id}`}
                className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/[0.07] transition-all group"
              >
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  className="w-16 h-24 object-cover rounded-lg flex-shrink-0"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
                    {movie.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                    <span className="capitalize">{movie.genre}</span>
                    <span>{movie.release_year}</span>
                    {movie.duration && <span>{movie.duration}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-amber-400 font-semibold flex-shrink-0">
                  ★ {movie.rating.toFixed(1)}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
