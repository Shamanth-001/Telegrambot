"""
db_manager.py — Hub storage: users, requests, and the Telegram library.

Uses Postgres when DATABASE_URL is set (Supabase — survives Render redeploys),
otherwise a local SQLite file (development). One connection is shared per process.
"""
import os
import re
import sqlite3
import threading
import time

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'streambreaker.db')
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

_lock = threading.RLock()
_conn = None
_ready = False


def _is_pg() -> bool:
    return bool(DATABASE_URL)


def _connect():
    if _is_pg():
        try:
            import psycopg
        except ImportError:  # e.g. Android/Termux, where psycopg's binary wheel isn't available
            return _connect_pg8000()
        # prepare_threshold=None: Supabase's pooler (pgbouncer) doesn't support prepared statements
        return psycopg.connect(DATABASE_URL, autocommit=True, prepare_threshold=None, connect_timeout=15)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.isolation_level = None  # autocommit, same as Postgres
    return conn


def _connect_pg8000():
    """Pure-Python Postgres driver fallback (same %s paramstyle as psycopg)."""
    import ssl
    from urllib.parse import unquote, urlparse
    import pg8000.dbapi
    u = urlparse(DATABASE_URL)
    local = u.hostname in ("localhost", "127.0.0.1")
    # Encrypted like psycopg's default (sslmode=prefer): TLS without verifying the certificate,
    # since Supabase's pooler may use its own certificate authority
    tls = ssl.create_default_context()
    tls.check_hostname = False
    tls.verify_mode = ssl.CERT_NONE
    conn = pg8000.dbapi.connect(
        user=unquote(u.username or ""), password=unquote(u.password or "") or None,
        host=u.hostname, port=u.port or 5432, database=(u.path or "/postgres").lstrip("/") or "postgres",
        ssl_context=None if local else tls, timeout=15)
    conn.autocommit = True
    return conn


SCHEMA = {
    "media": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY"),
        ("title", "TEXT NOT NULL", "TEXT NOT NULL"),
        ("year", "TEXT", "TEXT"),
        ("media_type", "TEXT", "TEXT"),
        ("file_id", "TEXT", "TEXT"),
        ("message_link", "TEXT", "TEXT"),
        ("quality", "TEXT", "TEXT"),
        ("size_bytes", "INTEGER", "BIGINT"),
        ("tmdb_id", "INTEGER", "INTEGER"),
        ("uploaded_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP", "TIMESTAMPTZ DEFAULT now()"),
        ("season", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
        ("episode", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
        ("message_id", "INTEGER", "BIGINT"),
    ],
    "requests": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY"),
        ("user_id", "INTEGER NOT NULL", "BIGINT NOT NULL"),
        ("username", "TEXT", "TEXT"),
        ("title", "TEXT", "TEXT"),
        ("year", "TEXT", "TEXT"),
        ("media_type", "TEXT", "TEXT"),
        ("tmdb_id", "INTEGER", "INTEGER"),
        ("tvdb_id", "INTEGER", "INTEGER"),
        ("status", "TEXT DEFAULT 'pending'", "TEXT DEFAULT 'pending'"),
        ("requested_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP", "TIMESTAMPTZ DEFAULT now()"),
        ("fulfilled_at", "TIMESTAMP", "TIMESTAMPTZ"),
        ("season", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
        ("episode", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
        ("note", "TEXT", "TEXT"),
    ],
    "users": [
        ("user_id", "INTEGER PRIMARY KEY", "BIGINT PRIMARY KEY"),
        ("username", "TEXT", "TEXT"),
        ("first_name", "TEXT", "TEXT"),
        ("first_seen", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP", "TIMESTAMPTZ DEFAULT now()"),
        ("last_seen", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP", "TIMESTAMPTZ DEFAULT now()"),
        ("search_count", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
    ],
}


last_error = ""  # shown on /api/health when the database can't be reached
_next_retry = 0.0  # after a failure, wait before trying to connect again
RETRY_SECONDS = 60


def _redact(url: str) -> str:
    """postgresql://user:secret@host/db -> postgresql://user:***@host/db (safe to log)."""
    return re.sub(r"(://[^:/@]+):[^@]*@", r"\1:***@", url)


class DBManager:
    """Thin wrapper; every instance shares the process-wide connection.

    A database that can't be reached never crashes the app: the error is logged, kept in
    `last_error`, and the connection + migration are retried on the next call."""

    def __init__(self):
        self._ensure_ready()

    def _ensure_ready(self) -> bool:
        global _ready, last_error, _next_retry
        if _ready:
            return True
        if time.monotonic() < _next_retry:
            return False  # failed recently; don't stall every request on a connect timeout
        with _lock:
            if _ready:
                return True
            try:
                self._migrate()
                _ready, last_error = True, ""
                print(f"[DB] Connected: {'Postgres ' + _redact(DATABASE_URL) if _is_pg() else 'SQLite ' + DB_PATH}")
            except Exception as e:
                last_error = f"{type(e).__name__}: {e}"
                _next_retry = time.monotonic() + RETRY_SECONDS
                hint = (" — use Supabase's *Session pooler* URI (the direct host is IPv6-only) and check the password"
                        if _is_pg() else "")
                print(f"[DB] Cannot use database {_redact(DATABASE_URL) or DB_PATH}: {last_error}{hint}")
        return _ready

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------
    def _run(self, sql: str, args=(), fetch: str | None = None):
        """Execute with reconnect-once on a dropped connection. fetch: None | 'one' | 'all'."""
        if not self._ensure_ready():
            raise RuntimeError(f"database unavailable: {last_error}")
        return self._raw(sql, args, fetch)

    def _raw(self, sql: str, args=(), fetch: str | None = None):
        global _conn
        if _is_pg():
            sql = sql.replace("?", "%s")
        with _lock:
            for attempt in (1, 2):
                try:
                    if _conn is None:
                        _conn = _connect()
                    cur = _conn.cursor()
                    cur.execute(sql, args)
                    if fetch == "one":
                        return cur.fetchone()
                    if fetch == "all":
                        return cur.fetchall()
                    return cur.rowcount
                except Exception as e:
                    if attempt == 2 or not _is_connection_error(e):
                        raise
                    try:
                        _conn.close()
                    except Exception:
                        pass
                    _conn = None

    def _migrate(self):
        pg = _is_pg()
        for table, columns in SCHEMA.items():
            cols = ", ".join(f"{name} {pg_type if pg else lite_type}" for name, lite_type, pg_type in columns)
            self._raw(f"CREATE TABLE IF NOT EXISTS {table} ({cols})")
            # Older databases: add any missing columns
            for name, lite_type, pg_type in columns:
                if "PRIMARY KEY" in lite_type:
                    continue
                if pg:
                    self._raw(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {pg_type}")
                else:
                    try:
                        self._raw(f"ALTER TABLE {table} ADD COLUMN {name} {lite_type}")
                    except sqlite3.OperationalError:
                        pass  # already exists
        self._raw("CREATE UNIQUE INDEX IF NOT EXISTS media_title_quality ON media (title, quality)")
        self._raw("CREATE INDEX IF NOT EXISTS media_tmdb ON media (tmdb_id, season, episode)")
        self._raw("CREATE INDEX IF NOT EXISTS requests_open ON requests (status, tmdb_id)")

    def ping(self) -> bool:
        """Cheap query used by /api/health (also keeps a free Supabase project active)."""
        return self._run("SELECT 1", fetch="one") is not None

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------
    def track_user(self, user):
        if not self._ensure_ready():
            return  # analytics only; never block a search
        self._run('''
            INSERT INTO users (user_id, username, first_name, search_count)
            VALUES (?, ?, ?, 1)
            ON CONFLICT (user_id) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name,
                last_seen = CURRENT_TIMESTAMP,
                search_count = users.search_count + 1
        ''', (user.id, user.username, user.first_name))

    # ------------------------------------------------------------------
    # Library
    # ------------------------------------------------------------------
    def search_media(self, query):
        like = "ILIKE" if _is_pg() else "LIKE"
        return self._run(f'''
            SELECT title, year, media_type, message_link, quality, size_bytes
            FROM media WHERE title {like} ? ORDER BY uploaded_at DESC
        ''', (f'%{query}%',), fetch="all")

    def search_by_tmdb_id(self, tmdb_id, season=None, episode=None):
        """Library rows for a title. For series pass season (and episode) to narrow it down;
        season=None returns everything for that tmdb_id."""
        if not self._ensure_ready():
            return []  # library unavailable: callers fall back to magnet links
        sql = '''SELECT title, year, media_type, message_link, quality, size_bytes
                 FROM media WHERE tmdb_id = ?'''
        args = [tmdb_id]
        if season is not None:
            sql += ' AND season = ?'
            args.append(season)
            if episode:
                sql += ' AND episode = ?'
                args.append(episode)
        return self._run(sql + ' ORDER BY season, episode, uploaded_at DESC', args, fetch="all")

    def library_ids(self, tmdb_ids):
        """Which of these tmdb ids have at least one file in the library."""
        ids = [int(i) for i in tmdb_ids if i]
        if not ids or not self._ensure_ready():
            return set()
        rows = self._run(f'SELECT DISTINCT tmdb_id FROM media WHERE tmdb_id IN ({",".join("?" * len(ids))})',
                         ids, fetch="all")
        return {row[0] for row in rows}

    def add_media(self, title, year, media_type, file_id, message_link, quality, size_bytes,
                  tmdb_id=None, season=0, episode=0, message_id=None):
        try:
            self._run('''
                INSERT INTO media (title, year, media_type, file_id, message_link, quality, size_bytes,
                                   tmdb_id, season, episode, message_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (title, quality) DO UPDATE SET
                    year = excluded.year, media_type = excluded.media_type, file_id = excluded.file_id,
                    message_link = excluded.message_link, size_bytes = excluded.size_bytes,
                    tmdb_id = excluded.tmdb_id, season = excluded.season, episode = excluded.episode,
                    message_id = excluded.message_id
            ''', (title, year, media_type, file_id, message_link, quality, size_bytes, tmdb_id,
                  season or 0, episode or 0, message_id))
            return True
        except Exception as e:
            print(f"DB Error: {e}")
            return False

    # ------------------------------------------------------------------
    # Requests
    # ------------------------------------------------------------------
    def add_request(self, user_id, title, year, media_type, tmdb_id=None, tvdb_id=None, username=None,
                    season=0, episode=0):
        existing = self._run('''
            SELECT id FROM requests
            WHERE user_id = ? AND COALESCE(tmdb_id, 0) = COALESCE(?, 0) AND title = ?
              AND season = ? AND episode = ? AND status IN ('pending', 'downloading')
        ''', (user_id, tmdb_id, title, season or 0, episode or 0), fetch="one")
        if existing:
            return False  # Already requested
        self._run('''
            INSERT INTO requests (user_id, username, title, year, media_type, tmdb_id, tvdb_id, season, episode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, username, title, year, media_type, tmdb_id, tvdb_id, season or 0, episode or 0))
        return True

    def get_request(self, request_id):
        """(user_id, title, status) or None."""
        return self._run("SELECT user_id, title, status FROM requests WHERE id = ?", (request_id,), fetch="one")

    def get_pending_requests(self):
        rows = self._run('''
            SELECT id, user_id, username, title, year, media_type, tmdb_id, requested_at, season, episode, status
            FROM requests
            WHERE status IN ('pending', 'downloading')
            ORDER BY requested_at DESC
        ''', fetch="all")
        # Postgres returns datetimes; callers expect strings (e.g. requested_at[:16])
        return [tuple(str(v) if i == 7 and v is not None else v for i, v in enumerate(r)) for r in rows]

    def update_request(self, request_id, status, note=None):
        done = status in ('uploaded', 'failed')
        return self._run(f'''
            UPDATE requests SET status = ?, note = COALESCE(?, note)
                   {", fulfilled_at = CURRENT_TIMESTAMP" if done else ""}
            WHERE id = ?
        ''', (status, note, request_id)) > 0

    def open_requests_for(self, tmdb_id, season=0, episode=0):
        """Open requests that a newly uploaded file satisfies: the exact episode, the whole
        season (episode 0), or the whole title (movie / series request without season)."""
        return self._run('''
            SELECT id, user_id, season, episode FROM requests
            WHERE tmdb_id = ? AND status IN ('pending', 'downloading')
              AND (season = 0 OR (season = ? AND (episode = 0 OR episode = ?)))
        ''', (tmdb_id, season or 0, episode or 0), fetch="all")

    def get_stats(self):
        one = lambda sql: self._run(sql, fetch="one")[0]
        return {
            'total_media': one("SELECT COUNT(*) FROM media"),
            'movies': one("SELECT COUNT(*) FROM media WHERE media_type = 'movie'"),
            'episodes': one("SELECT COUNT(*) FROM media WHERE media_type = 'episode'"),
            'users': one("SELECT COUNT(*) FROM users"),
            'pending_requests': one("SELECT COUNT(*) FROM requests WHERE status IN ('pending', 'downloading')"),
        }


def _is_connection_error(e: Exception) -> bool:
    if _is_pg():
        try:
            import psycopg
            if isinstance(e, (psycopg.OperationalError, psycopg.InterfaceError)):
                return True
        except ImportError:
            pass
        try:
            import pg8000
            return isinstance(e, (pg8000.InterfaceError, ConnectionError, OSError))
        except ImportError:
            return False
    return isinstance(e, sqlite3.ProgrammingError) and "closed" in str(e)
