# 🚀 AINA Converter — GitHub Setup Guide

The code is ready to push. Follow these steps in your terminal on your computer (not in this sandbox).

---

## Step 1 — Create a new GitHub repository

1. Go to **https://github.com/new**
2. **Repository name:** `aina-converter`
3. **Description:** "AINA Converter — universal file converter PWA"
4. **Public** (recommended for free Render)
5. **DO NOT** check "Initialize with README/.gitignore/license" — we have them
6. Click **Create repository**

GitHub will show you a URL like:
```
https://github.com/YOUR_USERNAME/aina-converter.git
```

---

## Step 2 — Get the code from this sandbox

I've already:
- ✅ Initialized git
- ✅ Made the first commit
- ✅ Configured `.gitignore` (excludes `node_modules`, `dist`, etc.)

**You need to download the `aina-converter` folder from this sandbox** so you can push it from your computer.

The folder is at: `/home/user/aina-converter/`

---

## Step 3 — Get a Personal Access Token (PAT)

GitHub no longer accepts password authentication. You need a PAT:

1. Go to **https://github.com/settings/tokens**
2. Click **Generate new token** → **Generate new token (classic)**
3. **Note:** `AINA Converter deploy`
4. **Expiration:** 90 days (or your preference)
5. **Scopes:** Check only `repo` (Full control of private repositories)
6. Click **Generate token**
7. **COPY THE TOKEN NOW** — you won't see it again

---

## Step 4 — Push from your computer

Once you have the `aina-converter` folder locally, run these commands in that folder:

```bash
cd aina-converter
git remote add origin https://github.com/YOUR_USERNAME/aina-converter.git
git branch -M main
git push -u origin main
```

When prompted:
- **Username:** your GitHub username
- **Password:** paste the Personal Access Token (NOT your real password)

---

## Step 5 — Verify on GitHub

1. Go to `https://github.com/YOUR_USERNAME/aina-converter`
2. You should see all 23 files: `frontend/`, `backend/`, `render.yaml`, etc.

---

## 🆘 Troubleshooting

### "Support for password authentication was removed"
You're using your GitHub password. Use the **Personal Access Token** instead.

### "Permission denied (publickey)"
You need to set up SSH keys, OR use HTTPS + PAT (recommended above).

### "Repository not found"
- Check the repo URL is correct (case-sensitive)
- Make sure the repo exists on GitHub

### Want to use SSH instead?
1. Generate an SSH key: `ssh-keygen -t ed25519 -C "your@email.com"`
2. Add to GitHub: https://github.com/settings/keys
3. Use SSH URL: `git@github.com:YOUR_USERNAME/aina-converter.git`

---

## ✅ Once it's on GitHub, tell me

Then I'll help you deploy to Render (one-click Blueprint).
