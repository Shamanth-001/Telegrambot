import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Star, Play, Heart, Share2, Calendar, Clock, Film, Users, 
  ArrowLeft, Send, Download, MessageSquare, ThumbsUp,
  ExternalLink, X, Magnet, HardDrive, Loader2, AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import StarRating from '../components/StarRating';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';

interface Review {
  id: number | string;
  movie_id?: number;
  user_id?: string;
  author?: string;
  rating: number;
  comment: string;
  created_at: string;
  users?: {
    email: string;
    display_name?: string;
  };
}

interface TorrentResult {
  title: string;
  quality: string;
  size: string;
  seeders: number;
  leechers: number;
  magnet: string;
  source: string;
}

interface Movie {
  id: number;
  title: string;
  description: string;
  poster_url: string;
  backdrop_url: string;
  rating: number;
  genre: string;
  release_year: number;
  duration: string;
  cast: string[];
  director: string;
  telegram_link: string;
  trailer_url: string;
  mood_tags: string[];
  language: string;
  views: number;
}

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  
  // Review form state
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Torrent state
  const [torrents, setTorrents] = useState<TorrentResult[]>([]);
  const [torrentsLoading, setTorrentsLoading] = useState(false);
  const [torrentsError, setTorrentsError] = useState('');
  const [torrentsLoaded, setTorrentsLoaded] = useState(false);

  useEffect(() => {
    if (id) {
      fetchMovie();
      fetchReviews();
      checkWatchlist();
      // Reset torrent state on new movie
      setTorrents([]);
      setTorrentsLoaded(false);
      setTorrentsError('');
    }
  }, [id, user]);

  const fetchMovie = async () => {
    try {
      const res = await fetch(`/api/movies/${id}`);
      const data = await res.json();
      setMovie(data);
    } catch (err) {
      console.error('Error fetching movie:', err);
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await fetch(`/api/reviews?movie_id=${id}`);
      const data = await res.json();
      setReviews(data);
      
      // Check if current user has a review
      if (user) {
        const myReview = data.find((r: Review) => r.user_id === user.id);
        if (myReview) {
          setUserReview(myReview);
          setReviewRating(myReview.rating);
          setReviewComment(myReview.comment);
        }
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkWatchlist = async () => {
    if (!user || !id) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      
      const res = await fetch('/api/watchlist', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setInWatchlist(data.some((m: Movie) => m.id === Number(id)));
    } catch {}
  };

  const toggleWatchlist = async () => {
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
          body: JSON.stringify({ movie_id: Number(id) }),
        });
        setInWatchlist(false);
      } else {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ movie_id: Number(id) }),
        });
        setInWatchlist(true);
      }
    } catch {}
  };

  const submitReview = async () => {
    if (!user || reviewRating === 0) return;
    
    setSubmittingReview(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          movie_id: Number(id),
          user_id: user.id,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      
      if (res.ok) {
        fetchReviews();
        fetchMovie(); // Refresh to get new average rating
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const shareMovie = async () => {
    if (navigator.share && movie) {
      try {
        await navigator.share({
          title: movie.title,
          text: `Check out ${movie.title} on StreamBreaker!`,
          url: window.location.href,
        });
      } catch {}
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  const fetchTorrents = async () => {
    if (!movie || torrentsLoading) return;
    setTorrentsLoading(true);
    setTorrentsError('');
    try {
      const mt = movie.genre.toLowerCase() === 'series' ? 'tv' : 'movie';
      const res = await fetch(`/api/torrents/search?tmdb_id=${movie.id}&media_type=${mt}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setTorrents(data.results);
      } else {
        setTorrentsError('No torrents found for this title.');
      }
    } catch (err) {
      console.error('Error fetching torrents:', err);
      setTorrentsError('Failed to search torrents. Backend may be sleeping.');
    } finally {
      setTorrentsLoading(false);
      setTorrentsLoaded(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center pt-20">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center pt-20">
        <div className="text-center">
          <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Movie Not Found</h2>
          <Link to="/" className="text-amber-400 hover:text-amber-300">Go back home</Link>
        </div>
      </div>
    );
  }

  // Extract YouTube video ID from URL
  const getYoutubeId = (url: string) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:embed\/|v\/)|youtu\.be\/)([^?&]+)/);
    return match ? match[1] : null;
  };
  
  const youtubeId = getYoutubeId(movie.trailer_url);

  const SERVERS = [
    { name: 'VidSrc Pro', url: (type: string, id: number) => `https://vidsrc.pro/embed/${type}/${id}` },
    { name: 'VidSrc.to', url: (type: string, id: number) => `https://vidsrc.to/embed/${type}/${id}` },
    { name: 'AutoEmbed', url: (type: string, id: number) => `https://autoembed.co/${type}/tmdb/${id}` },
    { name: 'SuperEmbed', url: (type: string, id: number) => `https://multiembed.mov/?video_id=${id}&tmdb=1` }
  ];
  
  const mediaType = movie.genre.toLowerCase() === 'series' ? 'tv' : 'movie';

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Backdrop */}
      <div className="relative h-[60vh] min-h-[400px] overflow-hidden">
        <img
          src={movie.backdrop_url || movie.poster_url}
          alt={movie.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f]/50 via-[#0a0a0f]/70 to-[#0a0a0f]" />
        
        {/* Back Button */}
        <div className="absolute top-20 left-4 sm:left-8">
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm rounded-lg text-white hover:bg-black/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-48 relative z-10 pb-16">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Poster */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-shrink-0"
          >
            <div className="w-64 mx-auto lg:mx-0 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <img
                src={movie.poster_url}
                alt={movie.title}
                className="w-full aspect-[2/3] object-cover"
              />
            </div>
          </motion.div>

          {/* Details */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex-1 min-w-0"
          >
            {/* Title & Rating */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-xs font-semibold uppercase tracking-wider capitalize">
                  {movie.genre}
                </span>
                <span className="px-3 py-1 bg-white/10 border border-white/20 rounded-full text-gray-300 text-xs font-medium">
                  {movie.language}
                </span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                {movie.title}
              </h1>
              
              <div className="flex items-center gap-4 flex-wrap">
                <StarRating rating={movie.rating} size="lg" showValue={false} />
                <span className="text-xl font-bold text-amber-400">{movie.rating.toFixed(1)}</span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-400">{reviews.length} reviews</span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-400">{movie.views.toLocaleString()} views</span>
              </div>
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <Calendar className="w-5 h-5 text-amber-400 mb-2" />
                <p className="text-xs text-gray-400">Release Year</p>
                <p className="text-white font-semibold">{movie.release_year}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <Clock className="w-5 h-5 text-amber-400 mb-2" />
                <p className="text-xs text-gray-400">Duration</p>
                <p className="text-white font-semibold">{movie.duration}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <Film className="w-5 h-5 text-amber-400 mb-2" />
                <p className="text-xs text-gray-400">Director</p>
                <p className="text-white font-semibold">{movie.director}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <Users className="w-5 h-5 text-amber-400 mb-2" />
                <p className="text-xs text-gray-400">Cast</p>
                <p className="text-white font-semibold line-clamp-1">{movie.cast?.slice(0, 2).join(', ')}</p>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-2">Synopsis</h3>
              <p className="text-gray-300 leading-relaxed">{movie.description}</p>
            </div>

            {/* Cast */}
            {movie.cast && movie.cast.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Cast</h3>
                <div className="flex flex-wrap gap-2">
                  {movie.cast.map((actor) => (
                    <span
                      key={actor}
                      className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300"
                    >
                      {actor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mood Tags */}
            {movie.mood_tags && movie.mood_tags.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Moods</h3>
                <div className="flex flex-wrap gap-2">
                  {movie.mood_tags.map((mood) => (
                    <span
                      key={mood}
                      className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-sm text-purple-300 capitalize"
                    >
                      🎭 {mood}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mb-8">
              <a
                href={`/watch.html?id=${movie.id}&type=${mediaType}&title=${encodeURIComponent(movie.title)}`}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white font-bold rounded-xl hover:from-red-700 hover:to-orange-700 transition-all duration-300 transform hover:scale-105"
              >
                <Play className="w-5 h-5" fill="white" />
                Watch Now
              </a>

              {movie.trailer_url && (
                <button
                  onClick={() => setShowTrailer(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white font-semibold rounded-xl hover:bg-white/10 transition-all duration-300 transform hover:scale-105"
                >
                  <Film className="w-5 h-5" />
                  Watch Trailer
                </button>
              )}
              
              <button
                onClick={toggleWatchlist}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  inWatchlist
                    ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
                    : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                }`}
              >
                <Heart className={`w-5 h-5 ${inWatchlist ? 'fill-current' : ''}`} />
                {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
              
              <button
                onClick={shareMovie}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-colors"
              >
                <Share2 className="w-5 h-5" />
                Share
              </button>
              
              {movie.telegram_link && (
                <button
                  onClick={() => setShowTelegramModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-[#0088cc]/20 border border-[#0088cc]/40 text-[#0088cc] font-semibold rounded-xl hover:bg-[#0088cc]/30 transition-all duration-300"
                >
                  <Download className="w-5 h-5" />
                  Download
                </button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Torrent Downloads Section */}
        <section className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <Download className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold text-white">Download</h2>
            {torrents.length > 0 && (
              <span className="px-2 py-0.5 bg-white/10 rounded-full text-sm text-gray-400">
                {torrents.length} sources
              </span>
            )}
          </div>

          {!torrentsLoaded && !torrentsLoading ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <HardDrive className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-300 mb-2">Search for download links</p>
              <p className="text-gray-500 text-sm mb-5">
                Searches multiple sources for the best quality torrent links
              </p>
              <button
                onClick={fetchTorrents}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all duration-300 transform hover:scale-105"
              >
                <Download className="w-5 h-5" />
                Search Torrents
              </button>
            </div>
          ) : torrentsLoading ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <Loader2 className="w-10 h-10 text-amber-400 mx-auto mb-3 animate-spin" />
              <p className="text-gray-300 font-medium">Searching torrent sites...</p>
              <p className="text-gray-500 text-sm mt-1">Checking 1337x, YTS, TorrentGalaxy</p>
            </div>
          ) : torrentsError ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <AlertCircle className="w-10 h-10 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-4">{torrentsError}</p>
              <button
                onClick={fetchTorrents}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/15 transition-colors text-sm"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {torrents.map((t, idx) => {
                const seedColor =
                  t.seeders >= 100 ? 'text-green-400' :
                  t.seeders >= 20 ? 'text-yellow-400' : 'text-red-400';
                const qualityColor =
                  t.quality === '4K' ? 'bg-purple-500/15 text-purple-400 border-purple-500/20' :
                  t.quality === '1080p' ? 'bg-green-500/15 text-green-400 border-green-500/20' :
                  t.quality === '720p' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' :
                  'bg-white/10 text-gray-400 border-white/10';

                return (
                  <div
                    key={idx}
                    className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition-all group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Title & Quality */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md border ${qualityColor}`}>
                            {t.quality}
                          </span>
                          <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-white/5 text-gray-400 border border-white/10">
                            {t.source}
                          </span>
                        </div>
                        <p className="text-white text-sm font-medium truncate" title={t.title}>
                          {t.title}
                        </p>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-xs shrink-0">
                        <span className="text-gray-400">{t.size}</span>
                        <span className={`font-semibold ${seedColor}`}>▲ {t.seeders}</span>
                        <span className="text-gray-500">▼ {t.leechers}</span>
                      </div>

                      {/* Magnet Button */}
                      <a
                        href={t.magnet}
                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/15 border border-amber-500/25 text-amber-400 font-semibold rounded-lg hover:bg-amber-500/25 transition-all text-sm shrink-0"
                        title="Open in torrent client"
                      >
                        <Magnet className="w-4 h-4" />
                        Magnet
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Reviews Section */}
        <section className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold text-white">Reviews</h2>
            <span className="px-2 py-0.5 bg-white/10 rounded-full text-sm text-gray-400">{reviews.length}</span>
          </div>

          {/* Write Review Form */}
          {user ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
              <h3 className="text-lg font-semibold text-white mb-4">
                {userReview ? 'Update Your Review' : 'Write a Review'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Your Rating</label>
                  <StarRating
                    rating={reviewRating}
                    onRate={setReviewRating}
                    size="lg"
                    interactive
                    showValue
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Your Review</label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="What did you think about this movie?"
                    rows={4}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 resize-none transition-all"
                  />
                </div>
                <button
                  onClick={submitReview}
                  disabled={reviewRating === 0 || submittingReview}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                >
                  {submittingReview ? 'Submitting...' : (userReview ? 'Update Review' : 'Submit Review')}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-300 mb-4">Sign in to write a review</p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors"
              >
                Sign In to Review
              </Link>
            </div>
          )}

          {/* Reviews List */}
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No reviews yet. Be the first to review!
              </div>
            ) : (
              reviews.map((review) => {
                const authorName = review.author || review.users?.display_name || review.users?.email?.split('@')[0] || 'Anonymous';
                const initial = authorName[0]?.toUpperCase() || 'U';
                const commentText = review.comment || '';
                const isLong = commentText.length > 300;
                
                return (
                  <div
                    key={review.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                          {initial}
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            {authorName}
                          </p>
                          <StarRating rating={review.rating} size="sm" showValue={false} />
                        </div>
                      </div>
                      {review.created_at && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(review.created_at).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    {commentText && (
                      <p className="mt-3 text-gray-300 text-sm leading-relaxed">
                        {isLong ? commentText.slice(0, 300) + '...' : commentText}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Trailer Modal */}
      {showTrailer && youtubeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={() => setShowTrailer(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-4xl aspect-video"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowTrailer(false)}
              className="absolute -top-12 right-0 text-white hover:text-amber-400 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
              title={movie.title}
              className="w-full h-full rounded-xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </motion.div>
        </div>
      )}

      {/* Telegram Modal */}
      {showTelegramModal && movie.telegram_link && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={() => setShowTelegramModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-[#16161d] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowTelegramModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="w-16 h-16 rounded-full bg-[#0088cc]/20 flex items-center justify-center mx-auto mb-4">
              <Send className="w-8 h-8 text-[#0088cc]" />
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-2">Download on Telegram</h3>
            <p className="text-gray-400 mb-6">
              Get instant access to download "{movie.title}" through our official Telegram channel.
            </p>
            
            <div className="space-y-3">
              <a
                href={movie.telegram_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-[#0088cc] text-white font-bold rounded-xl hover:bg-[#0077b3] transition-colors"
              >
                <Send className="w-5 h-5" />
                Open in Telegram
              </a>
              
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(movie.telegram_link)}&text=${encodeURIComponent(`Check out ${movie.title} on StreamBreaker!`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors"
              >
                <Share2 className="w-5 h-5" />
                Share to Friends
              </a>
            </div>
            
            <p className="mt-6 text-xs text-gray-500">
              💡 Join our Telegram bot @StreamBreakerBot for instant notifications about new releases!
            </p>
          </motion.div>
        </div>
      )}


    </div>
  );
}


