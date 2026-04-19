import express from 'express';
import { createServer } from 'http';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(join(__dirname, 'public')));

// ── PROXY ENDPOINT ──────────────────────────────────────────────
// /fetch?url=https://example.com
// Server-side fetches the URL, rewrites HTML, and returns it.
// Since the request comes from YOUR server IP, school filters
// only see your Railway domain.

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

function rewriteHtml(html, baseUrl) {
  const base = new URL(baseUrl);
  const origin = base.origin;
  const proxyBase = '/fetch?url=';

  // Inject a <base> tag and proxy rewrite script into <head>
  const inject = `
<base href="${baseUrl}">
<script>
(function(){
  var _orig = XMLHttpRequest.prototype.open;
  // Rewrite fetch
  var _fetch = window.fetch;
  window.fetch = function(url, opts) {
    try {
      var abs = new URL(url, '${baseUrl}').href;
      if (!abs.startsWith('${origin}/fetch?url=')) {
        url = '/fetch?url=' + encodeURIComponent(abs);
      }
    } catch(e) {}
    return _fetch.call(this, url, opts);
  };
})();
</script>`;

  // Rewrite absolute and relative URLs in href/src/action attributes
  html = html.replace(/<base[^>]*>/gi, ''); // remove existing base tags
  html = html.replace(/<head([^>]*)>/i, `<head$1>${inject}`);

  // Rewrite href/src pointing to same origin through proxy
  html = html.replace(/(href|src|action)="((?:https?:)?\/\/[^"]+)"/gi, (match, attr, url) => {
    try {
      const abs = new URL(url, baseUrl).href;
      return `${attr}="/fetch?url=${encodeURIComponent(abs)}"`;
    } catch(e) { return match; }
  });

  // Rewrite root-relative paths
  html = html.replace(/(href|src|action)="(\/[^"]+)"/gi, (match, attr, path) => {
    if (path.startsWith('/fetch?url=')) return match;
    const abs = origin + path;
    return `${attr}="/fetch?url=${encodeURIComponent(abs)}"`;
  });

  return html;
}

app.get('/fetch', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch(e) {
    return res.status(400).send('Invalid URL');
  }

  // Block local network access
  if (BLOCKED_HOSTS.includes(parsed.hostname)) {
    return res.status(403).send('Forbidden');
  }

  try {
    const fetchRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer': parsed.origin,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const contentType = fetchRes.headers.get('content-type') || '';

    // Copy safe headers
    const SKIP_HEADERS = ['content-encoding', 'transfer-encoding', 'connection',
      'x-frame-options', 'content-security-policy', 'strict-transport-security'];
    fetchRes.headers.forEach((val, key) => {
      if (!SKIP_HEADERS.includes(key.toLowerCase())) {
        try { res.setHeader(key, val); } catch(e) {}
      }
    });

    res.status(fetchRes.status);

    // Rewrite HTML responses so links stay in proxy
    if (contentType.includes('text/html')) {
      const text = await fetchRes.text();
      const rewritten = rewriteHtml(text, fetchRes.url || targetUrl);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.send(rewritten);
    }

    // Stream everything else (images, JS, CSS, etc.)
    const buf = await fetchRes.arrayBuffer();
    return res.send(Buffer.from(buf));

  } catch(err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).send('Gateway timeout — site took too long to respond');
    }
    return res.status(502).send('Could not reach: ' + targetUrl);
  }
});

// Catch-all: serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`INTERGALACTIC running on http://localhost:${PORT}`);
});
