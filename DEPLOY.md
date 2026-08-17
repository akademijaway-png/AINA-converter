# 🚀 AINA Converter — Deploy Guide

Everything you need to push AINA Converter to GitHub and deploy to Render.

---

## Step 1 — Create a GitHub repository

1. Go to https://github.com/new
2. **Repository name:** `aina-converter` (or your choice)
3. **Public/Private:** Public is fine (free for Render)
4. **DO NOT** initialize with README, .gitignore, or license (we have them)
5. Click **Create repository**

---

## Step 2 — Push to GitHub

In the project folder, run these commands. **Replace `YOUR_USERNAME` with your actual GitHub username.**

```bash
cd aina-converter
git init
git add .
git commit -m "Initial commit: AINA Converter"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/aina-converter.git
git push -u origin main
```

You'll be prompted for your GitHub username + password (or a Personal Access Token).

> 💡 **Tip:** If you get an authentication error, GitHub no longer accepts passwords. Create a Personal Access Token at https://github.com/settings/tokens and use that as the password.

---

## Step 3 — Deploy to Render

### Option A: One-click Blueprint (easiest)

1. Go to https://render.com → sign in with GitHub
2. Click **New +** → **Blueprint**
3. Select your `aina-converter` repo
4. Render reads `render.yaml` and creates both services
5. Wait ~3 min for both to deploy

### Option B: Manual setup

#### Backend
1. **New +** → **Web Service**
2. Connect your repo
3. Settings:
   - **Name:** `aina-converter-api`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Click **Create Web Service**
5. Wait for deploy, then **copy the URL** (e.g. `https://aina-converter-api.onrender.com`)

#### Frontend
1. **New +** → **Static Site**
2. Same repo
3. Settings:
   - **Name:** `aina-converter`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. **Add Environment Variable:**
   - Key: `VITE_API_URL`
   - Value: the backend URL from above
5. Click **Create Static Site**

---

## Step 4 — Install AINA on your phone

### Android (Chrome)
1. Open your frontend URL in Chrome (e.g. `https://aina-converter.onrender.com`)
2. Tap the **⋮ menu** → **Add to Home screen** or **Install app**
3. The AINA icon appears on your home screen
4. Tap it — opens fullscreen like a native app

### iPhone (Safari)
1. Open your frontend URL in Safari
2. Tap the **Share button** (↑)
3. Scroll down → **Add to Home Screen**
4. The AINA icon appears on your home screen
5. Tap it — opens fullscreen like a native app

---

## ✅ You're done!

- 🌍 AINA Converter is live on the web
- 📱 Installed as an app on your phone
- 🔒 All file conversions happen on your device by default
- 🚀 Server-side PDF→Word is available when you need it

### Free tier notes
- Render free web services **spin down after 15 min idle**
- First PDF→Word conversion may take 30-60s while the server wakes up
- After that, conversions are fast
- **750 free hours/month** per service (plenty for personal use)

### Updating the app later
```bash
# Make changes, then:
git add .
git commit -m "Your message"
git push
# Render auto-deploys! 🚀
```
