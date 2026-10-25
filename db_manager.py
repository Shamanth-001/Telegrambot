"""
db_manager.py — Local SQLite database for tracking uploaded media and processed files.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "media.db")


class DBManager:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._migrate()

    # ------------------------------------------------------------------
    # Schema / migration
    # ------------------------------------------------------------------
    def _migrate(self):
        cur = self.conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS media (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                title        TEXT NOT NULL,
                year         INTEGER,
                type         TEXT NOT NULL,        -- 'movie' or 'episode'
                tmdb_id      INTEGER,              -- TMDB ID for dedup
                file_id      TEXT,                  -- Telegram file reference
                message_link TEXT,                  -- https://t.me/c/…/…
                message_id   INTEGER,               -- Telegram message ID
                quality      TEXT,
                size_bytes   INTEGER,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS requests (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                title      TEXT NOT NULL,
                year       INTEGER,
                type       TEXT NOT NULL,           -- 'movie' or 'series'
                tmdb_id    INTEGER,
                tvdb_id    INTEGER,
                status     TEXT DEFAULT 'pending',  -- pending / downloading / uploaded / failed
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Track processed file paths so we never re-upload the same file
        cur.execute("""
            CREATE TABLE IF NOT EXISTS processed_files (
                file_path  TEXT PRIMARY KEY,
                title      TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Ensure tmdb_id column exists (migration for old DBs)
        try:
            cur.execute("ALTER TABLE media ADD COLUMN tmdb_id INTEGER")
        except sqlite3.OperationalError:
            pass  # column already exists
        try:
            cur.execute("ALTER TABLE media ADD COLUMN message_id INTEGER")
        except sqlite3.OperationalError:
            pass
        for column in ("season", "episode"):
            try:
                cur.execute(f"ALTER TABLE media ADD COLUMN {column} INTEGER DEFAULT 0")
            except sqlite3.OperationalError:
                pass

        # Requests fetched from the hub, so each one is handled once — even across restarts
        cur.execute("""
            CREATE TABLE IF NOT EXISTS hub_requests (
                remote_id  INTEGER PRIMARY KEY,
                tmdb_id    INTEGER,
                media_type TEXT,
                season     INTEGER DEFAULT 0,
                episode    INTEGER DEFAULT 0,
                status     TEXT,
                note       TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        self.conn.commit()

    # ------------------------------------------------------------------
    # Media
    # ------------------------------------------------------------------
    def add_media(self, title, year, media_type, file_id, message_link,
                  quality, size_bytes, tmdb_id=None, message_id=None, season=0, episode=0):
        cur = self.conn.cursor()
        cur.execute("""
            INSERT INTO media (title, year, type, tmdb_id, file_id,
                               message_link, message_id, quality, size_bytes, season, episode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (title, year, media_type, tmdb_id, file_id,
              message_link, message_id, quality, size_bytes, season or 0, episode or 0))
        self.conn.commit()
        print(f"  ✅ DB: Added {title} ({year})")

    def all_media(self):
        """Every uploaded file, as dicts (used to re-sync the hub's library)."""
        cur = self.conn.cursor()
        cur.execute("""SELECT title, year, type, tmdb_id, message_link, message_id, quality,
                              size_bytes, season, episode FROM media""")
        cols = ["title", "year", "media_type", "tmdb_id", "message_link", "message_id", "quality",
                "size_bytes", "season", "episode"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def find_uploaded(self, tmdb_id, media_type, season=0, episode=0):
        """Rows already in the channel for a movie / episode / season."""
        if not tmdb_id:
            return []
        sql = "SELECT title, message_id, message_link, quality, size_bytes, year, season, episode FROM media WHERE tmdb_id = ? AND type = ?"
        args = [tmdb_id, media_type]
        if media_type == "episode" and season:
            sql += " AND season = ?"
            args.append(season)
            if episode:
                sql += " AND episode = ?"
                args.append(episode)
        cur = self.conn.cursor()
        cur.execute(sql, args)
        return cur.fetchall()

    # ------------------------------------------------------------------
    # Hub requests
    # ------------------------------------------------------------------
    def hub_request_seen(self, remote_id) -> bool:
        cur = self.conn.cursor()
        cur.execute("SELECT 1 FROM hub_requests WHERE remote_id = ?", (remote_id,))
        return cur.fetchone() is not None

    def save_hub_request(self, remote_id, tmdb_id, media_type, season, episode, status, note=None):
        cur = self.conn.cursor()
        cur.execute("""
            INSERT OR REPLACE INTO hub_requests (remote_id, tmdb_id, media_type, season, episode, status, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (remote_id, tmdb_id, media_type, season or 0, episode or 0, status, note))
        self.conn.commit()

    def search_media(self, query):
        cur = self.conn.cursor()
        cur.execute("""
            SELECT title, year, type, message_link, quality, size_bytes
            FROM media WHERE title LIKE ?
        """, (f"%{query}%",))
        return cur.fetchall()

    def is_uploaded(self, tmdb_id: int, media_type: str = "movie") -> bool:
        """Check if a movie/series with this TMDB ID is already uploaded."""
        if not tmdb_id:
            return False
        cur = self.conn.cursor()
        cur.execute("SELECT 1 FROM media WHERE tmdb_id = ? AND type = ? LIMIT 1",
                    (tmdb_id, media_type))
        return cur.fetchone() is not None

    def is_episode_uploaded(self, series_title: str, season: int, episode: int) -> bool:
        """Check if a specific episode is already uploaded."""
        full_title = f"{series_title} - S{season:02d}E{episode:02d}"
        cur = self.conn.cursor()
        cur.execute("SELECT 1 FROM media WHERE title = ? LIMIT 1", (full_title,))
        return cur.fetchone() is not None

    # ------------------------------------------------------------------
    # Processed files (avoid re-uploading the same file)
    # ------------------------------------------------------------------
    def is_file_processed(self, file_path: str) -> bool:
        cur = self.conn.cursor()
        cur.execute("SELECT 1 FROM processed_files WHERE file_path = ?",
                    (os.path.normpath(file_path),))
        return cur.fetchone() is not None

    def mark_file_processed(self, file_path: str, title: str = ""):
        cur = self.conn.cursor()
        cur.execute("INSERT OR IGNORE INTO processed_files (file_path, title) VALUES (?, ?)",
                    (os.path.normpath(file_path), title))
        self.conn.commit()

    # ------------------------------------------------------------------
    # Requests
    # ------------------------------------------------------------------
    def add_request(self, user_id, title, year, media_type, tmdb_id=None, tvdb_id=None):
        cur = self.conn.cursor()
        cur.execute("""
            INSERT INTO requests (user_id, title, year, type, tmdb_id, tvdb_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, title, year, media_type, tmdb_id, tvdb_id))
        self.conn.commit()

    def get_pending_requests(self, media_type=None):
        cur = self.conn.cursor()
        if media_type:
            cur.execute('SELECT * FROM requests WHERE status = "pending" AND type = ?',
                        (media_type,))
        else:
            cur.execute('SELECT * FROM requests WHERE status = "pending"')
        return cur.fetchall()

    def update_request_status(self, request_id, status):
        cur = self.conn.cursor()
        cur.execute("UPDATE requests SET status = ? WHERE id = ?", (status, request_id))
        self.conn.commit()

    def find_request_by_tmdb(self, tmdb_id: int):
        """Find the user who requested this movie by tmdb_id."""
        cur = self.conn.cursor()
        cur.execute("SELECT user_id FROM requests WHERE tmdb_id = ? ORDER BY id DESC LIMIT 1",
                    (tmdb_id,))
        row = cur.fetchone()
        return row[0] if row else None

    def find_request_by_title(self, title: str):
        """Find the user who requested this title (fuzzy)."""
        cur = self.conn.cursor()
        cur.execute("SELECT user_id FROM requests WHERE title LIKE ? ORDER BY id DESC LIMIT 1",
                    (f"%{title}%",))
        row = cur.fetchone()
        return row[0] if row else None


if __name__ == "__main__":
    db = DBManager()
    print("Database initialized at:", DB_PATH)
