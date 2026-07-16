import { Link, useLocation } from 'react-router-dom';
import { Film, Search, Home, Heart, User, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';
import supabase from '../lib/supabase';

export default function Navbar() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/browse?search=${encodeURIComponent(searchQuery)}`;
      setSearchOpen(false);
    }
  };

  const navLinks = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/browse', label: 'Browse', icon: Search },
    { to: '/watchlist', label: 'Watchlist', icon: Heart },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-[#0a0a0f]/95 to-transparent backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center transform group-hover:scale-110 transition-transform">
              <Film className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white hidden sm:block">
              Stream<span className="text-amber-500">Breaker</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to || 
                (link.to !== '/' && location.pathname.startsWith(link.to));
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white/10 text-amber-400'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* User Menu */}
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/watchlist"
                  className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Heart className="w-5 h-5" />
                </Link>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center cursor-pointer group relative">
                  <User className="w-5 h-5 text-white" />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#16161d] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-2">
                    <div className="px-4 py-2 border-b border-white/10">
                      <p className="text-sm font-medium text-white truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-lg hover:from-amber-600 hover:to-orange-700 transition-all duration-200 transform hover:scale-105"
              >
                Sign In
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div className="absolute top-full left-0 right-0 bg-[#12121a]/95 backdrop-blur-md border-t border-white/5">
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto px-4 py-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movies, actors, genres..."
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
                autoFocus
              />
            </div>
          </form>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[#12121a]/98 backdrop-blur-md border-t border-white/5">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === link.to
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}