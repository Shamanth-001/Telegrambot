// Movie Cache Database - SQLite for movie index management
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

class MovieCache {
  constructor(dbPath = './movie_cache.db') {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  initDatabase() {
    // Create movies table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        file_id TEXT NOT NULL,
        message_id INTEGER,
        channel_id TEXT,
        downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_size INTEGER,
        source_type TEXT, -- 'torrent', 'streaming', 'direct'
        source_url TEXT,
        expires_at DATETIME,
        UNIQUE(title)
      )
    `);

    // Create index for faster lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_title ON movies(title);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON movies(expires_at);
    `);

    console.log('[MovieCache] Database initialized');
  }

  /**
   * Add a movie to cache
   * @param {Object} movieData - Movie information
   * @returns {boolean} Success status
   */
  addMovie(movieData) {
    try {
      const { title, file_id, message_id, channel_id, file_size, source_type, source_url, ttl_hours = 24 } = movieData;
      
      const expires_at = new Date();
      expires_at.setHours(expires_at.getHours() + ttl_hours);

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO movies 
        (title, file_id, message_id, channel_id, file_size, source_type, source_url, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(title, file_id, message_id, channel_id, file_size, source_type, source_url, expires_at.toISOString());
      
      console.log(`[MovieCache] Added movie: ${title} (expires: ${expires_at.toISOString()})`);
      return true;
    } catch (error) {
      console.error('[MovieCache] Error adding movie:', error);
      return false;
    }
  }

  /**
   * Get movie by title
   * @param {string} title - Movie title
   * @returns {Object|null} Movie data or null if not found
   */
  getMovie(title) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM movies 
        WHERE title = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
      `);
      
      const movie = stmt.get(title);
      return movie || null;
    } catch (error) {
      console.error('[MovieCache] Error getting movie:', error);
      return null;
    }
  }

  /**
   * Check if movie exists in cache
   * @param {string} title - Movie title
   * @returns {boolean} True if exists and not expired
   */
  hasMovie(title) {
    return this.getMovie(title) !== null;
  }

  /**
   * Remove movie from cache
   * @param {string} title - Movie title
   * @returns {boolean} Success status
   */
  removeMovie(title) {
    try {
      const stmt = this.db.prepare('DELETE FROM movies WHERE title = ?');
      const result = stmt.run(title);
      
      console.log(`[MovieCache] Removed movie: ${title}`);
      return result.changes > 0;
    } catch (error) {
      console.error('[MovieCache] Error removing movie:', error);
      return false;
    }
  }

  /**
   * Get all expired movies
   * @returns {Array} Array of expired movie records
   */
  getExpiredMovies() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM movies 
        WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
      `);
      
      return stmt.all();
    } catch (error) {
      console.error('[MovieCache] Error getting expired movies:', error);
      return [];
    }
  }

  /**
   * Clean up expired movies
   * @returns {number} Number of movies cleaned up
   */
  cleanupExpired() {
    try {
      const expiredMovies = this.getExpiredMovies();
      
      if (expiredMovies.length === 0) {
        return 0;
      }

      const stmt = this.db.prepare('DELETE FROM movies WHERE expires_at <= datetime("now")');
      const result = stmt.run();
      
      console.log(`[MovieCache] Cleaned up ${result.changes} expired movies`);
      return result.changes;
    } catch (error) {
      console.error('[MovieCache] Error cleaning up expired movies:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    try {
      const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM movies');
      const activeStmt = this.db.prepare(`
        SELECT COUNT(*) as active FROM movies 
        WHERE expires_at IS NULL OR expires_at > datetime('now')
      `);
      const expiredStmt = this.db.prepare(`
        SELECT COUNT(*) as expired FROM movies 
        WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
      `);

      return {
        total: totalStmt.get().total,
        active: activeStmt.get().active,
        expired: expiredStmt.get().expired
      };
    } catch (error) {
      console.error('[MovieCache] Error getting stats:', error);
      return { total: 0, active: 0, expired: 0 };
    }
  }

  /**
   * Search movies by title (partial match)
   * @param {string} query - Search query
   * @returns {Array} Array of matching movies
   */
  searchMovies(query) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM movies 
        WHERE title LIKE ? AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY downloaded_at DESC
        LIMIT 10
      `);
      
      return stmt.all(`%${query}%`);
    } catch (error) {
      console.error('[MovieCache] Error searching movies:', error);
      return [];
    }
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

export const movieCache = new MovieCache();

