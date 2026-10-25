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
| `API_PUBLIC_URL` | no | This service's public URL (default `https://telegrambot-p8yg.onrender.com`) |
| `BOT_USERNAME` | no | Bot username for website deep links (default `StreamBreakerBot`) |
| `WATCH_REGION` | no | Country for "Where to watch legally" (default `IN`) |
| `GEMINI_API_KEYS` | no | Comma-separated Gemini keys for `/recommend` |
| `NVIDIA_API_KEY`, `NVIDIA_MODEL` | no | Optional NVIDIA model for `/recommend` |
| `RUN_BOT` | no | `0` runs the API without the bot |

Render's free disk is wiped on every deploy/restart. The worker re-uploads the library index
every 30 minutes, so library lookups recover on their own; requests that were still waiting
when the disk was wiped have to be sent again.

## Running locally

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
RUN_BOT=0 python start.py       # API only, so you don't steal updates from the live bot
```

If your ISP blocks TMDB (Jio does, by DNS), set `DNS_SERVERS=1.1.1.1,8.8.8.8` and
`pip install aiodns`, or change your PC's DNS.
