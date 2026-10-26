# StreamBreaker Backend (API + Telegram Bot)

The hub of StreamBreaker. One process (`start.py`) runs:

- **FastAPI** (`api_server.py`): TMDB catalogue, torrent search (`torrent_scraper.py`), the
  `/api/magnet/<hash>` page used by Telegram buttons, and the `/api/sync/*` endpoints the
  local download worker talks to.
- **Telegram bot** `@StreamBreakerBot` (`bot1_receptionist.py`): search, magnet links,
  and "Send me the file here" requests.

The frontend (Netlify) proxies `/api/*` here. The local worker (`../request_processor.py`,
runs on the PC with Radarr/Sonarr) pulls requests from here and pushes uploaded files back.

## Deployment on Render (Free Tier)

1. New **Web Service** from this repository, root directory `streambreaker-backend`.
2. **Build command**: `pip install -r requirements.txt`
3. **Start command**: `python start.py`
4. **Environment variables**:

| Variable | Required | What it is |
|---|---|---|
| `TMDB_API_KEY` | yes | TMDB API key |
| `BOT1_TOKEN` | yes | `@StreamBreakerBot` token. Run the bot **only here** — one token can't poll in two places |
| `ADMIN_USER_ID` | yes | Your Telegram user ID (admin commands, request alerts) |
| `CHANNEL_ID` | yes | Private storage channel, e.g. `-100…`. `@StreamBreakerBot` must be an admin of it |
| `SYNC_SECRET` | yes | Shared secret with the local worker (same value in both `.env` files) |
| `SITE_URL` | yes | Frontend URL, e.g. `https://streambreaker.netlify.app` (bot "Open on website" buttons) |
| `DATABASE_URL` | recommended | Supabase Postgres **Session pooler** URI (see below). Without it, data lives in SQLite and is wiped on every Render redeploy |
| `API_PUBLIC_URL` | no | This service's public URL (default `https://telegrambot-p8yg.onrender.com`) |
| `BOT_USERNAME` | no | Bot username for website deep links (default `StreamBreakerBot`) |
| `WATCH_REGION` | no | Country for "Where to watch legally" (default `IN`) |
| `GEMINI_API_KEYS` | no | Comma-separated Gemini keys for `/recommend` |
| `RUN_BOT` | no | `0` runs the API without the bot |

### Database (Supabase, free)

Render's free disk is wiped on every deploy/restart, so keep the data in Supabase:

1. Supabase dashboard → your project → **Connect** → **Session pooler** → copy the URI. It looks like
   `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Use the *pooler* URI: the "direct connection" host is IPv6-only, which Render can't reach.
2. Replace `[YOUR-PASSWORD]` with the database password (Project Settings → Database → reset it if
   you don't know it).
3. Render → Environment → add `DATABASE_URL` with that URI → Save (Render redeploys).
4. `https://<your-render-url>/api/health` should show `"db": "ok"`. Tables are created automatically.

### Keep it awake (free)

Free Render services sleep after 15 minutes without traffic, which also pauses the bot. Create a
free job at [cron-job.org](https://cron-job.org) that opens `/api/health` every 10 minutes. This
also counts as activity for Supabase, which pauses free projects after a week without any.

## Running locally

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
RUN_BOT=0 python start.py       # API only, so you don't steal updates from the live bot
```

If your ISP blocks TMDB (Jio does, by DNS), set `DNS_SERVERS=1.1.1.1,8.8.8.8` and
`pip install aiodns`, or change your PC's DNS.
