# 🚀 AINA Converter — Manual Deploy Guide (5 minutes)

Skip the Blueprint. Just create two services manually. Easier and more reliable.

---

## Service 1: Backend API

1. In **Render dashboard**, click **"+ New"** → **"Web Service"**
2. Click **"Connect GitHub"** if not already
3. Find and select: **`akademijaway-png/AINA-converter`**
4. Fill in:
   - **Name:** `aina-converter-api`
   - **Region:** Oregon (or closest to you)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Click **"Create Web Service"**
6. ⏱️ Wait ~2-3 min for it to deploy
7. Once **Live**, **copy the URL** (looks like: `https://aina-converter-api-xxxx.onrender.com`)

---

## Service 2: Frontend (PWA)

1. In **Render dashboard**, click **"+ New"** → **"Static Site"**
2. Same repo: **`akademijaway-png/AINA-converter`**
3. Fill in:
   - **Name:** `aina-converter`
   - **Branch:** `main`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Click **"Create Static Site"**
5. ⏱️ Wait ~2-3 min for it to build & deploy

---

## Service 2 (cont): Set the API URL

After the static site is created:

1. Click on **`aina-converter`** in your dashboard
2. Click **"Environment"** in the left menu
3. Click **"Add Environment Variable"**:
   - **Key:** `VITE_API_URL`
   - **Value:** paste the backend URL you copied in step 7 of Service 1
4. Click **"Save"** → it auto-rebuilds (~1 min)

---

## 🎉 Done! Use your app

Open the frontend URL on your phone:
**`https://aina-converter-xxxx.onrender.com`**

Then:
- **Android:** Menu (⋮) → "Add to Home screen"
- **iPhone:** Share (↑) → "Add to Home Screen"

The AINA icon appears on your home screen and opens like a real app! 📱

---

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| "Build failed" on backend | Click service → "Logs" → look for errors |
| Frontend says "API error" | You forgot to set `VITE_API_URL` env var (step above) |
| Backend URL is slow first time | Free tier sleeps after 15min idle; first request wakes it |
| "No open ports" | The backend on Render needs `startCommand` to bind to `0.0.0.0` (it does) |

---

**Go to https://dashboard.render.com and start with Service 1!** 🚀
