# INTERGALACTIC

A space-themed unblocked site with browser proxy, games, YouTube, movies, and music.

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Select the repo — Railway auto-detects Node.js
4. Click Generate Domain → done

## How the proxy works

Uses a simple server-side `/fetch?url=` endpoint built with Node.js fetch.
No third-party proxy frameworks. Just Express + Node 18 built-in fetch.

## When blocked

Railway dashboard → Settings → Generate new domain. 10 seconds.
