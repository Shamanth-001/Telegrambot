# StreamBreaker download worker

`request_processor.py` runs on the PC that has Radarr, Sonarr, Prowlarr and qBittorrent. It
turns "Send me the file here" requests from the bot into files in the Telegram channel.

```
bot / website ──► hub (Render) ──► worker ──► Radarr / Sonarr ──► Prowlarr ──► qBittorrent
                       ▲                                                          │
                       └──── library + delivery ◄── upload to channel ◄── import ┘
```

## Setup

1. `.env` in this folder needs:
   `BOT2_TOKEN` (upload bot, admin of the channel), `CHANNEL_ID`, `API_ID`, `API_HASH`,
   `SYNC_SECRET` (same as on Render), `HUB_URL=https://telegrambot-p8yg.onrender.com`,
   `RADARR_URL`, `RADARR_API_KEY`, `SONARR_URL`, `SONARR_API_KEY`, `MOVIE_ROOT`, `SERIES_ROOT`.
   Optional: `RADARR_PROFILE` / `SONARR_PROFILE` (quality profile name, default
   `HD - 720p/1080p`), `DELETE_AFTER_UPLOAD=0` to keep local copies.
2. Radarr and Sonarr → Settings → Connect → Webhook `http://localhost:8585/webhook`,
   triggers **On Import** and **On Upgrade** (already configured on this PC).
3. Start it with **`start_worker.bat`** (recommended: runs natively, so the paths Radarr and
   Sonarr report match). Docker also works: `docker compose up -d` publishes port 8585.
4. Live uploads: <http://localhost:8585/dashboard>

## What it does

- Every 60 s: fetches new requests from the hub. A movie goes to Radarr. A series is added to
  Sonarr **unmonitored**, then only the requested episode or season is monitored and searched.
- On import: uploads the file to the channel (`.mp4` as a streamable video), tells the hub
  (which forwards it to everyone who asked), unmonitors it in Radarr/Sonarr so it isn't
  downloaded again, and deletes the local copy.
- Files over 2 GB (Telegram's bot limit): the requester gets download links instead.
- Every 5 min: scans `MOVIE_ROOT` / `SERIES_ROOT` for imports whose webhook was missed.
- Every 30 min: re-sends the library index to the hub (Render's disk is wiped on redeploys).

## Jio users

Jio blocks TMDB, EZTV, 1337x, LimeTorrents and some players by DNS. Set Windows DNS to
`1.1.1.1` / `1.0.0.1` (Settings → Network → your adapter → DNS server assignment → Manual).
