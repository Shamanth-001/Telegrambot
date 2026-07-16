// /sw.js
const BLOCKLIST = [
  'doubleclick.net', 'googlesyndication.com', 'googletagservices.com',
  'popads.net', 'popcash.net', 'propellerads.com', 'adsterra.com',
  'onclickads.net', 'hilltopads.com', 'exoclick.com', 'juicyads.com',
  'trafficjunky.com', 'trafficfactory.biz', 'bidgear.com',
  'revcontent.com', 'taboola.com', 'outbrain.com', 'mgid.com',
  'zedo.com', 'adskeeper.com', 'clickadu.com', 'adcash.com',
  'go.onclasrv.com', 'a.realsrv.com', 'syndication.realsrv.com'
];

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const host = url.hostname.toLowerCase();
  const blocked = BLOCKLIST.some(b => host === b || host.endsWith('.' + b));
  if (blocked) {
    event.respondWith(new Response('', { status: 503, statusText: 'Blocked' }));
    console.warn('[SW] Blocked', host);
    return;
  }
  // Let everything else through normally
});
