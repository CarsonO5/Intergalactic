# INTERGALACTIC — Deployment Guide

## Deploy to Railway (Free, ~3 minutes)

### Step 1: Create a GitHub repo
1. Go to github.com → New repository → name it `intergalactic`
2. Upload ALL files keeping this structure:
```
intergalactic/
├── server.js
├── package.json
└── public/
    ├── index.html
    └── scramjet/
        └── scramjet.config.js
```

### Step 2: Deploy on Railway
1. Go to **railway.app**
2. "Start a New Project" → "Deploy from GitHub repo"
3. Select your `intergalactic` repo
4. Railway auto-installs and starts the server
5. Click **"Generate Domain"** → done

Your URL: `https://intergalactic-production.up.railway.app`

## Why Scramjet over Ultraviolet
- Newer, faster, actively maintained
- Better support for modern JS-heavy sites  
- Same Mercury Workshop team, built as UV's successor
- GoGuardian only sees your Railway URL — everything proxies through it

## When blocked
Railway dashboard → Settings → Generate new domain. 10 seconds.
