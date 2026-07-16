import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'streambreaker.db')

class DBManager:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.create_tables()

    def create_tables(self):
        cursor = self.conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                year TEXT,
                media_type TEXT,
                file_id TEXT,
                message_link TEXT,
                quality TEXT,
                size_bytes INTEGER,
                tmdb_id INTEGER,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(title, quality)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                username TEXT,
                title TEXT,
                year TEXT,
                media_type TEXT,
                tmdb_id INTEGER,
                tvdb_id INTEGER,
                status TEXT DEFAULT 'pending',
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fulfilled_at TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                search_count INTEGER DEFAULT 0
            )
        ''')

        self.conn.commit()

    def track_user(self, user):
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO users (user_id, username, first_name, search_count)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET
                username = ?,
                first_name = ?,
                last_seen = CURRENT_TIMESTAMP,
                search_count = search_count + 1
        ''', (user.id, user.username, user.first_name,
              user.username, user.first_name))
        self.conn.commit()

    def search_media(self, query):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT title, year, media_type, message_link, quality, size_bytes
            FROM media
            WHERE title LIKE ?
            ORDER BY uploaded_at DESC
        ''', (f'%{query}%',))
        return cursor.fetchall()

    def search_by_tmdb_id(self, tmdb_id):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT title, year, media_type, message_link, quality, size_bytes
            FROM media
            WHERE tmdb_id = ?
            ORDER BY uploaded_at DESC
        ''', (tmdb_id,))
        return cursor.fetchall()

    def add_media(self, title, year, media_type, file_id, message_link, quality, size_bytes, tmdb_id=None):
        cursor = self.conn.cursor()
        try:
            cursor.execute('''
                INSERT OR REPLACE INTO media
                (title, year, media_type, file_id, message_link, quality, size_bytes, tmdb_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (title, year, media_type, file_id, message_link, quality, size_bytes, tmdb_id))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"DB Error: {e}")
            return False

    def add_request(self, user_id, title, year, media_type, tmdb_id=None, tvdb_id=None, username=None):
        cursor = self.conn.cursor()
        # Check if already requested
        cursor.execute('''
            SELECT id FROM requests
            WHERE user_id = ? AND title = ? AND status = 'pending'
        ''', (user_id, title))
        if cursor.fetchone():
            return False  # Already requested

        cursor.execute('''
            INSERT INTO requests (user_id, username, title, year, media_type, tmdb_id, tvdb_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, username, title, year, media_type, tmdb_id, tvdb_id))
        self.conn.commit()
        return True

    def get_pending_requests(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT id, user_id, username, title, year, media_type, tmdb_id, requested_at
            FROM requests
            WHERE status = 'pending'
            ORDER BY requested_at DESC
        ''')
        return cursor.fetchall()

    def get_stats(self):
        cursor = self.conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM media')
        total_media = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(*) FROM media WHERE media_type = "movie"')
        movies = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(*) FROM media WHERE media_type = "episode"')
        episodes = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(*) FROM users')
        users = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(*) FROM requests WHERE status = "pending"')
        pending = cursor.fetchone()[0]
        return {
            'total_media': total_media,
            'movies': movies,
            'episodes': episodes,
            'users': users,
            'pending_requests': pending
        }
