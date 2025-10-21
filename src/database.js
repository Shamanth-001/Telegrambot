// src/database.js
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

class MovieDatabase {
  constructor() {
    const dbPath = path.join(process.cwd(), 'movies.db');
    this.db = new Database(dbPath);
    this.init();
    console.log(`[Database] 📁 Database initialized: ${dbPath}`);
  }
  
  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_size INTEGER,
        source TEXT,
        quality TEXT,
        language TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        downloads INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_title ON movies(title);
      CREATE INDEX IF NOT EXISTS idx_file_id ON movies(file_id);
      
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_downloads INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS download_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        movie_id INTEGER,
        downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(user_id),
        FOREIGN KEY(movie_id) REFERENCES movies(id)
      );
    `);
  }
  
  // Find movie in cache
  findMovie(title) {
    const stmt = this.db.prepare(`
      SELECT * FROM movies 
      WHERE LOWER(title) LIKE LOWER(?) 
      ORDER BY downloads DESC, created_at DESC 
      LIMIT 1
    `);
    return stmt.get(`%${title}%`);
  }
  
  // Save movie to cache
  saveMovie(data) {
    const stmt = this.db.prepare(`
      INSERT INTO movies (title, file_id, file_size, source, quality, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      data.title,
      data.fileId,
      data.fileSize || null,
      data.source || null,
      data.quality || null,
      data.language || null
    );
  }
  
  // Update download count
  incrementDownloads(movieId) {
    const stmt = this.db.prepare(`
      UPDATE movies SET downloads = downloads + 1 WHERE id = ?
    `);
    stmt.run(movieId);
  }
  
  // Track user
  trackUser(user) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO users (user_id, username, first_name)
      VALUES (?, ?, ?)
    `);
    stmt.run(user.id, user.username || null, user.first_name || null);
  }
  
  // Log download
  logDownload(userId, movieId) {
    const stmt = this.db.prepare(`
      INSERT INTO download_history (user_id, movie_id)
      VALUES (?, ?)
    `);
    stmt.run(userId, movieId);
    
    // Increment user's total downloads
    const updateStmt = this.db.prepare(`
      UPDATE users SET total_downloads = total_downloads + 1
      WHERE user_id = ?
    `);
    updateStmt.run(userId);
  }
  
  // Get stats
  getStats() {
    const totalMovies = this.db.prepare('SELECT COUNT(*) as count FROM movies').get().count;
    const totalUsers = this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalDownloads = this.db.prepare('SELECT SUM(downloads) as total FROM movies').get().total || 0;
    
    const popularMovies = this.db.prepare(`
      SELECT title, downloads FROM movies 
      ORDER BY downloads DESC LIMIT 5
    `).all();
    
    return {
      totalMovies,
      totalUsers,
      totalDownloads,
      popularMovies
    };
  }
  
  // Close database
  close() {
    this.db.close();
  }
}

export default new MovieDatabase();


