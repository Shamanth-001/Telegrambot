// Per-title link previews. The site renders in the browser, but link-preview crawlers
// (WhatsApp, Telegram, X, Discord…) only read the raw HTML. For those crawlers, fill the
// Open Graph tags of /title/<type>/<id> with that title's backdrop, name and plot.
// Regular visitors are passed straight through.

const API = "https://telegrambot-p8yg.onrender.com/api";
const CRAWLER =
  /bot|crawler|spider|preview|facebookexternalhit|WhatsApp|TelegramBot|Twitterbot|Slackbot|Discordbot|LinkedInBot|SkypeUriPreview|redditbot|Embedly|Pinterest|vkShare/i;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function setMeta(html: string, attr: "property" | "name", key: string, value: string): string {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  const re = new RegExp(`<meta ${attr}="${key}"[^>]*>`);
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  if (!CRAWLER.test(request.headers.get("user-agent") || "")) return context.next();
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/title\/(movie|tv)\/(\d+)/);
  if (!m) return context.next();

  const page = await context.next();
  let html = await page.text();
  try {
    // Render's free tier may be asleep; don't make the crawler wait too long
    const res = await fetch(`${API}/movies/${m[2]}?type=${m[1]}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const t = await res.json();
      const name = `${t.title}${t.year ? ` (${t.year})` : ""}`;
      const meta = [m[1] === "tv" ? "Series" : "Movie", t.rating ? `⭐ ${t.rating}` : "", (t.genres || []).slice(0, 3).join(", ")]
        .filter(Boolean)
        .join(" · ");
      const description = `${meta}. ${(t.overview || "").slice(0, 220)}`.trim();
      const image = t.backdrop_url || t.poster_url;
      html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(name)} · StreamBreaker</title>`);
      html = setMeta(html, "property", "og:type", m[1] === "tv" ? "video.tv_show" : "video.movie");
      html = setMeta(html, "property", "og:title", name);
      html = setMeta(html, "property", "og:description", description);
      html = setMeta(html, "property", "og:url", url.origin + url.pathname);
      html = setMeta(html, "name", "description", description);
      if (image) {
        html = setMeta(html, "property", "og:image", image.replace("/original/", "/w1280/"));
        html = html.replace(/<meta property="og:image:(width|height)"[^>]*>\s*/g, "");
      }
    }
  } catch {
    // keep the site-wide preview card
  }
  const headers = new Headers(page.headers);
  headers.delete("content-length");
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { status: page.status, headers });
};

export const config = { path: "/title/*" };
