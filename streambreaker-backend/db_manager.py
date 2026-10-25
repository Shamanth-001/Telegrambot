"""
db_manager.py — SQLite store for the hub (Render): users, requests, and the Telegram library.

The local download worker keeps the library in sync (see request_processor.py), so this
database can be rebuilt after a redeploy wipes the disk.
"""
import os
import sqlite3

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

        # Migrations: per-episode media and requests
        for table, column, kind in (
            ('media', 'season', 'INTEGER DEFAULT 0'),
            ('media', 'episode', 'INTEGER DEFAULT 0'),
            ('media', 'message_id', 'INTEGER'),
            ('requests', 'season', 'INTEGER DEFAULT 0'),
            ('requests', 'episode', 'INTEGER DEFAULT 0'),
            ('requests', 'note', 'TEXT'),
        ):
            try:
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN {column} {kind}')
            except sqlite3.OperationalError:
                pass  # already exists

        self.conn.commit()

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Library
    # ------------------------------------------------------------------
    def search_media(self, query):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT title, year, media_type, message_link, quality, size_bytes
            FROM media
            WHERE title LIKE ?
            ORDER BY uploaded_at DESC
        ''', (f'%{query}%',))
        return cursor.fetchall()

    def search_by_tmdb_id(self, tmdb_id, season=None, episode=None):
        """Library rows for a title. For series pass season (and episode) to narrow it down;
        season=None returns everything for that tmdb_id."""
        sql = '''SELECT title, year, media_type, message_link, quality, size_bytes
                 FROM media WHERE tmdb_id = ?'''
        args = [tmdb_id]
        if season is not None:
            sql += ' AND season = ?'
            args.append(season)
            if episode:
                sql += ' AND episode = ?'
                args.append(episode)
        cursor = self.conn.cursor()
        cursor.execute(sql + ' ORDER BY season, episode, uploaded_at DESC', args)
        return cursor.fetchall()

    def library_ids(self, tmdb_ids):
        """Which of these tmdb ids have at least one file in the library."""
        ids = [i for i in tmdb_ids if i]
        if not ids:
            return set()
        cursor = self.conn.cursor()
        cursor.execute(f'SELECT DISTINCT tmdb_id FROM media WHERE tmdb_id IN ({",".join("?" * len(ids))})', ids)
        return {row[0] for row in cursor.fetchall()}

    def add_media(self, title, year, media_type, file_id, message_link, quality, size_bytes,
                  tmdb_id=None, season=0, episode=0, message_id=None):
        cursor = self.conn.cursor()
        try:
            cursor.execute('''
                INSERT OR REPLACE INTO media
                (title, year, media_type, file_id, message_link, quality, size_bytes, tmdb_id,
                 season, episode, message_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (title, year, media_type, file_id, message_link, quality, size_bytes, tmdb_id,
                  season or 0, episode or 0, message_id))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"DB Error: {e}")
            return False

    # ------------------------------------------------------------------
    # Requests
    # ------------------------------------------------------------------
    def add_request(self, user_id, title, year, media_type, tmdb_id=None, tvdb_id=None, username=None,
                    season=0, episode=0):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT id FROM requests
            WHERE user_id = ? AND tmdb_id IS ? AND title = ? AND season = ? AND episode = ?
              AND status IN ('pending', 'downloading')
        ''', (user_id, tmdb_id, title, season or 0, episode or 0))
        if cursor.fetchone():
            return False  # Already requested

        cursor.execute('''
            INSERT INTO requests (user_id, username, title, year, media_type, tmdb_id, tvdb_id, season, episode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, username, title, year, media_type, tmdb_id, tvdb_id, season or 0, episode or 0))
        self.conn.commit()
        return True

    def get_pending_requests(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT id, user_id, username, title, year, media_type, tmdb_id, requested_at, season, episode, status
            FROM requests
            WHERE status IN ('pending', 'downloading')
            ORDER BY requested_at DESC
        ''')
        return cursor.fetchall()

    def update_request(self, request_id, status, note=None):
        cursor = self.conn.cursor()
        cursor.execute('''
            UPDATE requests SET status = ?, note = COALESCE(?, note),
                   fulfilled_at = CASE WHEN ? IN ('uploaded', 'failed') THEN CURRENT_TIMESTAMP ELSE fulfilled_at END
            WHERE id = ?
        ''', (status, note, status, request_id))
        self.conn.commit()
        return cursor.rowcount > 0

    def open_requests_for(self, tmdb_id, season=0, episode=0):
        """Open requests that a newly uploaded file satisfies: the exact episode, the whole
        season (episode 0), or the whole title (movie / series request without season)."""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT id, user_id, season, episode FROM requests
            WHERE tmdb_id = ? AND status IN ('pending', 'downloading')
              AND (season = 0 OR (season = ? AND (episode = 0 OR episode = ?)))
        ''', (tmdb_id, season or 0, episode or 0))
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
        cursor.execute('SELECT COUNT(*) FROM requests WHERE status IN ("pending", "downloading")')
        pending = cursor.fetchone()[0]
        return {
            'total_media': total_media,
            'movies': movies,
            'episodes': episodes,
            'users': users,
            'pending_requests': pending
        }
