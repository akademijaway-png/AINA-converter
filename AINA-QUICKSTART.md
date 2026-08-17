# 🚀 Quick Start Guide

## Option A: Deploy to Render (recommended for phone use)

### 1. Create GitHub repo
```bash
# On GitHub.com, create a new empty repo called "pdf-converter-app"
# Then locally:
cd pdf-converter-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pdf-converter-app.git
git push -u origin main
```

### 2. Deploy with one click using Blueprint
1. Go to https://render.com → sign in with GitHub
2. Click **New +** → **Blueprint**
3. Select your `pdf-converter-app` repo
4. Render reads `render.yaml` and creates BOTH services
5. Wait ~3 min for both to deploy

### 3. Set the API URL on the frontend
1. In Render dashboard, open the **pdf-converter-api** service
2. Copy its URL (e.g. `https://pdf-converter-api.onrender.com`)
3. Open the **pdf-converter-app** static site → **Environment**
4. Add: `VITE_API_URL` = that URL
5. Trigger a manual deploy (or push any commit)

### 4. Install on your phone
- Open the frontend URL in Chrome (Android) or Safari (iPhone)
- Tap browser menu → **Add to Home Screen**
- App icon appears — opens fullscreen like a real app ✅

## Option B: Run locally to test
```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev          # → http://localhost:3001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev          # → http://localhost:5173
```

Then open `http://localhost:5173` in any browser.

## Option C: Test the deployed PWA right here

You can also just open the dev server in this sandbox to see it working live:
- The dev server starts and gives you a preview URL
- Mobile-style PWA you can try out

---

## Free tier notes ⚠️
- Render free web services **spin down after 15 min of no requests**
- The first PDF→Word conversion may take 30-60s while the server wakes up
- After that, conversions are fast
- 750 free hours/month per service (plenty for personal use)
