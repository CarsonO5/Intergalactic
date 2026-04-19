import express from 'express';
import { createServer } from 'http';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, 'public')));

const SKIP_HEADERS = new Set([
  'content-encoding','transfer-encoding','connection','keep-alive',
  'x-frame-options','content-security-policy','strict-transport-security',
  'x-content-type-options','access-control-allow-origin',
  'cross-origin-embedder-policy','cross-origin-opener-policy',
  'cross-origin-resource-policy','permissions-policy',
]);

const BLOCKED_HOSTS = new Set(['localhost','127.0.0.1','0.0.0.0','::1','[::1]']);

// Try multiple Invidious instances as fallbacks
const YT_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.projectsegfau.lt',
];

function rewriteHtml(html, baseUrl, proxyBase) {
  const base = new URL(baseUrl);
  const origin = base.origin;

  // Remove existing base tags and CSP meta tags
  html = html.replace(/<base[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');

  // Inject base + rewrite script
  const inject = `<base href="${baseUrl}">
<script>
(function(){
  var PFX = '${proxyBase}';
  var BASE = '${baseUrl}';
  // Intercept fetch
  var _f = window.fetch;
  window.fetch = function(u, o) {
    try { u = PFX + encodeURIComponent(new URL(u, BASE).href); } catch(e){}
    return _f.call(this, u, o);
  };
  // Intercept XHR
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u) {
    try { u = PFX + encodeURIComponent(new URL(u, BASE).href); } catch(e){}
    return _open.apply(this, arguments);
  };
})();
</script>`;

  html = html.replace(/(<head[^>]*>)/i, '$1' + inject);

  // Rewrite href/src/action/data attributes pointing to external URLs
  html = html.replace(/(href|src|action|data-src)="(https?:\/\/[^"]+)"/gi, (_, attr, url) => {
    try { return `${attr}="${proxyBase}${encodeURIComponent(new URL(url, baseUrl).href)}"`; }
    catch(e) { return _; }
  });
  // Rewrite root-relative paths
  html = html.replace(/(href|src|action|data-src)="(\/(?!\/)[^"]+)"/gi, (_, attr, path) => {
    if (path.startsWith('/fetch?url=')) return _;
    try { return `${attr}="${proxyBase}${encodeURIComponent(origin + path)}"`; }
    catch(e) { return _; }
  });

  return html;
}

app.get('/fetch', async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  // Auto-decode if double-encoded
  try { if (targetUrl.includes('%25')) targetUrl = decodeURIComponent(targetUrl); } catch(e){}

  let parsed;
  try { parsed = new URL(targetUrl); }
  catch(e) { return res.status(400).send('Invalid URL: ' + targetUrl); }

  if (BLOCKED_HOSTS.has(parsed.hostname)) return res.status(403).send('Forbidden');

  // Route youtube.com → best available Invidious instance
  if (parsed.hostname.match(/youtube\.com|youtu\.be/)) {
    // Try each instance
    for (const inst of YT_INSTANCES) {
      try {
        const ytRes = await fetch(inst + '/', { signal: AbortSignal.timeout(4000) });
        if (ytRes.ok || ytRes.status < 500) {
          // Rewrite youtube URL to this Invidious instance
          const path = parsed.pathname + parsed.search;
          targetUrl = inst + path.replace('/watch', '/watch').replace('/results', '/search');
          parsed = new URL(targetUrl);
          break;
        }
      } catch(e) { continue; }
    }
  }

  const proxyBase = '/fetch?url=';

  try {
    const fetchRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Host': parsed.hostname,
        'Referer': parsed.origin + '/',
        'Origin': parsed.origin,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

    const contentType = fetchRes.headers.get('content-type') || '';
    const finalUrl = fetchRes.url || targetUrl;

    // Copy safe response headers
    fetchRes.headers.forEach((val, key) => {
      if (!SKIP_HEADERS.has(key.toLowerCase())) {
        try { res.setHeader(key, val); } catch(e) {}
      }
    });

    // Add permissive CORS so the iframe can load
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.status(fetchRes.status);

    if (contentType.includes('text/html')) {
      const text = await fetchRes.text();
      const rewritten = rewriteHtml(text, finalUrl, proxyBase);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(rewritten);
    }

    // Stream binary (images, JS, CSS, fonts, etc.)
    const buf = await fetchRes.arrayBuffer();
    return res.send(Buffer.from(buf));

  } catch(err) {
    console.error('Proxy error:', err.message, targetUrl);
    if (err.name === 'TimeoutError') return res.status(504).send('Timeout');
    return res.status(502).send('Could not reach: ' + targetUrl + '\n\n' + err.message);
  }
});

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`INTERGALACTIC running on http://localhost:${PORT}`);
});
