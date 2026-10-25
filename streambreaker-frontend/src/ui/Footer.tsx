import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Logo } from './Navbar';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line pb-24 pt-10 md:pb-10">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-dim">
            Find movies and series, watch trailers, see where they stream legally, and get download links. StreamBreaker
            doesn't host any files.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold text-muted">
          <Link to="/movies" className="hover:text-ink">Movies</Link>
          <Link to="/series" className="hover:text-ink">Series</Link>
          <Link to="/watchlist" className="hover:text-ink">My List</Link>
          <a href="https://t.me/StreamBreakerBot" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
            <Send className="h-4 w-4" /> Telegram bot
          </a>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-[1600px] px-4 text-xs text-dim sm:px-8">
        Movie and TV data from{' '}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="underline hover:text-muted">
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  );
}
