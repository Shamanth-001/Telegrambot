import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Copy, Download, FileDown, Magnet, Play, RefreshCw, Send } from 'lucide-react';
import { api, watchPath, type Torrent, type TitleDetail } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { copyText } from '../lib/toast';

const QUALITIES = ['4K', '1080p', '720p', '480p', 'Other'] as const;
const qualityOf = (t: Torrent) => (QUALITIES.includes(t.quality as never) ? t.quality : 'Other');

const QUALITY_STYLE: Record<string, string> = {
  '4K': 'bg-fuchsia-400/15 text-fuchsia-300',
  '1080p': 'bg-accent/15 text-accent',
  '720p': 'bg-sky-400/15 text-sky-300',
  '480p': 'bg-surface-2 text-muted',
  Other: 'bg-surface-2 text-muted',
};

function health(seeders: number) {
  if (seeders >= 100) return { label: 'Fast', cls: 'text-good' };
  if (seeders >= 15) return { label: 'Good', cls: 'text-warn' };
  return { label: 'Slow', cls: 'text-bad' };
}

function TorrentRow({ t }: { t: Torrent }) {
  const [copied, setCopied] = useState(false);
  const h = health(t.seeders);
  const q = qualityOf(t);
  const meta = [t.size, t.rip, t.codec, t.source].filter(Boolean).join(' · ');

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={`mt-0.5 w-14 shrink-0 rounded-md py-1 text-center text-xs font-bold ${QUALITY_STYLE[q]}`}>{q}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink" title={t.title}>
            {t.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-dim">
            <span>{meta}</span>
            <span className={`font-semibold ${h.cls}`}>
              ● {t.seeders.toLocaleString()} seeders · {h.label}
            </span>
            {t.languages.map((l) => (
              <span key={l} className="rounded bg-surface-2 px-1.5 font-semibold text-muted">
                {l}
              </span>
            ))}
            {t.is_cam && (
              <span className="rounded bg-bad/15 px-1.5 font-semibold text-bad" title="Recorded in a cinema — poor quality">
                CAM
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <a
          href={t.magnet}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-ink hover:bg-accent-hover sm:flex-none"
        >
          <Magnet className="h-4 w-4" strokeWidth={2.5} />
          Magnet
        </a>
        <a
          href={`/api/torrent/${t.info_hash}.torrent?dn=${encodeURIComponent(t.title)}`}
          title="Download the .torrent file"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-muted hover:border-ink hover:text-ink"
        >
          <FileDown className="h-4 w-4" />
          <span className="hidden sm:inline">.torrent</span>
        </a>
        <button
          type="button"
          onClick={async () => {
            await copyText(t.magnet, 'Magnet link copied');
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          aria-label="Copy magnet link"
          className="inline-flex items-center justify-center rounded-lg border border-line px-3 text-muted hover:border-ink hover:text-ink"
        >
          {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

export default function Downloads({ title }: { title: TitleDetail }) {
  const isTv = title.media_type === 'tv';
  const seasons = title.seasons ?? [];
  // ?s=1&e=1 (from "game of thrones s1e1" searches) preselects an episode
  const [params] = useSearchParams();
  const wantSeason = Number(params.get('s')) || 0;
  const wantEpisode = Number(params.get('e')) || 0;
  const startSeason = seasons.some((s) => s.season_number === wantSeason) ? wantSeason : seasons[0]?.season_number ?? 1;
  const [season, setSeason] = useState(isTv ? startSeason : 0);
  const [episode, setEpisode] = useState(isTv && startSeason === wantSeason ? wantEpisode : 0); // 0 = full season
  const [quality, setQuality] = useState<string>('all');
  const [showCam, setShowCam] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const key = `${title.media_type}-${title.id}-${season}-${episode}`;
  const { data, error, loading, reload } = useAsync(
    (signal) => api.torrents(title.media_type, title.id, season, episode, signal),
    key,
  );

  // Reset filters when the selection changes
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setQuality('all');
    setExpanded(false);
  }

  const all = useMemo(() => data?.results ?? [], [data]);
  const hasNonCam = all.some((t) => !t.is_cam);
  const visible = all.filter((t) => (showCam || !hasNonCam || !t.is_cam) && (quality === 'all' || qualityOf(t) === quality));
  const counts = Object.fromEntries(QUALITIES.map((q) => [q, all.filter((t) => qualityOf(t) === q).length]));
  const camCount = all.filter((t) => t.is_cam).length;
  const shown = expanded ? visible : visible.slice(0, 8);
  const episodes = seasons.find((s) => s.season_number === season)?.episode_count ?? 0;

  return (
    <section id="download" className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <Download className="h-6 w-6 text-accent" />
            Download
          </h2>
          <p className="mt-1 text-sm text-dim">
            {loading ? 'Searching torrent indexes…' : data ? `${all.length} links for ${data.query}` : ' '}
          </p>
        </div>
        {isTv && episode > 0 && (
          <a
            href={watchPath(title, season, episode)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink"
          >
            <Play className="h-4 w-4" /> Watch S{season}·E{episode} online
          </a>
        )}
      </div>

      {isTv && seasons.length > 0 && (
        <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Season</p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {seasons.map((s) => (
              <button
                key={s.season_number}
                type="button"
                onClick={() => {
                  setSeason(s.season_number);
                  setEpisode(0);
                }}
                aria-pressed={season === s.season_number}
                className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  season === s.season_number ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'
                }`}
              >
                S{String(s.season_number).padStart(2, '0')}
              </button>
            ))}
          </div>
          {episodes > 0 && (
            <>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-dim">Episode</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setEpisode(0)}
                  aria-pressed={episode === 0}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    episode === 0 ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted hover:text-ink'
                  }`}
                >
                  Full season
                </button>
                {Array.from({ length: episodes }, (_, i) => i + 1).map((ep) => (
                  <button
                    key={ep}
                    type="button"
                    onClick={() => setEpisode(ep)}
                    aria-pressed={episode === ep}
                    className={`w-11 rounded-lg py-1.5 text-sm font-semibold tabular-nums ${
                      episode === ep ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted hover:text-ink'
                    }`}
                  >
                    {ep}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <ul className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="skeleton h-[72px] rounded-xl" />
          ))}
        </ul>
      ) : error ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-warn" />
          <p className="font-semibold">Couldn't reach the search service</p>
          <p className="mt-1 text-sm text-dim">The server may be waking up — this can take up to a minute.</p>
          <button
            type="button"
            onClick={reload}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-bg"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-semibold">No download links found{isTv ? ' for this selection' : ''}</p>
          <p className="mt-1 text-sm text-dim">
            {isTv && episode === 0 ? 'Try a single episode instead of the full season, or ' : 'You can '}
            request it on Telegram and we'll try to add it.
          </p>
          <a
            href={title.telegram_link}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#2aabee] px-4 py-2 text-sm font-bold text-white"
          >
            <Send className="h-4 w-4" /> Request on Telegram
          </a>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(['all', ...QUALITIES] as string[]).map((q) => {
              const n = q === 'all' ? all.length : counts[q];
              if (q !== 'all' && !n) return null;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  aria-pressed={quality === q}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    quality === q ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'
                  }`}
                >
                  {q === 'all' ? 'All' : q} <span className="opacity-60">{n}</span>
                </button>
              );
            })}
            {hasNonCam && camCount > 0 && (
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-dim">
                <input
                  type="checkbox"
                  checked={showCam}
                  onChange={(e) => setShowCam(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                Show CAM copies ({camCount})
              </label>
            )}
          </div>

          {!hasNonCam && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Only cinema recordings (CAM) exist so far — picture and sound will be poor.
            </p>
          )}

          <ul className="space-y-2">
            {shown.map((t) => (
              <TorrentRow key={t.info_hash} t={t} />
            ))}
          </ul>

          {visible.length > shown.length && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 w-full rounded-xl border border-line py-2.5 text-sm font-semibold text-muted hover:border-ink hover:text-ink"
            >
              Show all {visible.length} links
            </button>
          )}

          <a
            href={title.telegram_link}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm hover:border-[#2aabee]"
          >
            <span>
              <span className="font-semibold">No torrent app?</span>{' '}
              <span className="text-muted">Get the file straight in Telegram — we'll download it for you.</span>
            </span>
            <Send className="h-4 w-4 shrink-0 text-[#2aabee]" />
          </a>

          <p className="mt-4 text-xs leading-relaxed text-dim">
            Magnet links and .torrent files both open in a torrent app — try <span className="text-muted">qBittorrent</span> on desktop or{' '}
            <span className="text-muted">LibreTorrent</span> on Android. More seeders = faster download.
          </p>
        </>
      )}
    </section>
  );
}
