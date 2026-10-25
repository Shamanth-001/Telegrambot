import { useEffect } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import Navbar from './ui/Navbar';
import Footer from './ui/Footer';
import { Toaster } from './ui/Toast';
import Home from './screens/Home';
import { Catalogue, SearchPage } from './screens/Browse';
import TitlePage from './screens/TitlePage';
import MyList from './screens/MyList';

// Old links: /movie/:id?type=tv  ->  /title/tv/:id
function LegacyTitle() {
  const { id } = useParams();
  const [params] = useSearchParams();
  return <Navigate to={`/title/${params.get('type') === 'tv' ? 'tv' : 'movie'}/${id}`} replace />;
}

function LegacyBrowse() {
  const [params] = useSearchParams();
  const search = params.get('search');
  return <Navigate to={search ? `/search?q=${encodeURIComponent(search)}` : '/movies'} replace />;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function TitleTag() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!pathname.startsWith('/title/')) document.title = 'StreamBreaker';
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 pt-40 text-center">
      <p className="font-display text-7xl font-extrabold text-accent">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold">This page doesn't exist</h1>
      <Link to="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink">
        Go home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <TitleTag />
      <Navbar />
      <main className="min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies" element={<Catalogue key="movie" type="movie" />} />
          <Route path="/series" element={<Catalogue key="tv" type="tv" />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/title/:type/:id" element={<TitlePage />} />
          <Route path="/watchlist" element={<MyList />} />
          <Route path="/movie/:id" element={<LegacyTitle />} />
          <Route path="/browse" element={<LegacyBrowse />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <Toaster />
    </BrowserRouter>
  );
}
