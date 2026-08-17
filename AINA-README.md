# ✨ AINA Converter — Mobile File Converter PWA

A beautiful, privacy-first mobile Progressive Web App for converting **PDF, Word, Excel, PowerPoint, images, JSON, CSV, HTML, RTF, and TXT** — in any direction. Runs entirely on your device.

> "AINA" — universal file conversion, in your pocket.

## 🎯 Supported Conversions

| From → To | PDF | Word | Excel | Images | TXT | HTML | RTF | CSV | JSON |
|-----------|:---:|:----:|:-----:|:------:|:---:|:----:|:---:|:---:|:----:|
| **PDF**         | —   | ✓   | —     | ✓ JPG/PNG/WebP/BMP/GIF | ✓ | — | — | — | — |
| **Word**        | ✓  | —   | —     | —      | —  | —   | —  | —  | —   |
| **Excel**       | ✓  | —   | —     | —      | ✓  | —   | —  | ✓  | —   |
| **PPT**         | ✓  | —   | —     | —      | ✓  | —   | —  | —  | —   |
| **Images**      | ✓  | —   | —     | ✓ any → any | — | — | — | — | — |
| **TXT / MD**    | ✓  | ✓   | —     | —      | —  | ✓   | ✓  | ✓  | —   |
| **JSON**        | ✓  | —   | ✓     | —      | ✓  | —   | —  | ✓  | —   |
| **CSV**         | ✓  | —   | ✓     | —      | ✓  | —   | —  | —  | ✓   |
| **HTML**        | ✓  | —   | —     | —      | ✓  | —   | —  | —  | —   |

## ✨ Features

- **13 output formats** — PDF, Word, Excel, images (JPG/PNG/WebP/BMP/GIF), TXT, HTML, RTF, CSV, JSON
- **On-device conversion** — most conversions never leave your phone
- **Installable as a real app** — Add to Home Screen on Android & iPhone
- **Batch conversion** — up to 10 files at once
- **Quality slider** for lossy image outputs
- **Conversion history** stored locally
- **Modern dark glassmorphism design**
- **Works offline** for image-based conversions

## 🏗️ Architecture

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  AINA Converter (PWA)   │         │  Backend (Node.js)      │
│  React + Vite           │  HTTP   │  Express + pdfjs        │
│  Static site on Render  │ ──────► │  Web service on Render  │
│  Installs as app        │         │  Heavy PDF processing   │
└─────────────────────────┘         └─────────────────────────┘
         ▲
         │  Most conversions (images, text, JSON, CSV)
         │  run entirely in the browser using:
         │  • PDF.js (parse PDF)
         │  • jsPDF (build PDF)
         │  • docx (build Word)
         │
    📱 Your Phone — fast, offline, private
```

## 🚀 Deploy to GitHub + Render

### 1. Push to GitHub
```bash
cd aina-converter
git init
git add .
git commit -m "Initial commit: AINA Converter"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/aina-converter.git
git push -u origin main
```

### 2. Deploy backend to Render
1. https://render.com → sign in with GitHub
2. **New +** → **Web Service** → select repo
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Copy the URL (e.g. `https://aina-converter-api.onrender.com`)

### 3. Deploy frontend to Render
1. **New +** → **Static Site** → same repo
2. Settings:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. Add env var: `VITE_API_URL` = backend URL from step 2

### 4. Install on your phone
- Open the frontend URL in Chrome (Android) or Safari (iPhone)
- Menu → "Add to Home Screen"
- App icon appears — opens like a real app

## 🛠️ Local Development
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## 🔒 Privacy
- All image, text, JSON, CSV, and HTML conversions happen **on your device**
- PDF→Word and other heavy operations run on the server, then are immediately deleted
- No accounts, no tracking, no analytics

## 📜 License
MIT
