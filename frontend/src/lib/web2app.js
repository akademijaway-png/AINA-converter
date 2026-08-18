// ============================================
// Web-to-App Builder
// Takes a URL, creates an installable PWA wrapper
// ============================================

// Fetch HTML and extract metadata
export async function fetchSiteInfo(url) {
  // Try CORS-friendly fetch first
  try {
    const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)
    if (response.ok) {
      const html = await response.text()
      return parseHtmlMetadata(html, url)
    }
  } catch (e) {
    // Fall through
  }

  // Fallback: minimal info from URL
  return parseHtmlMetadata('', url)
}

function parseHtmlMetadata(html, url) {
  const urlObj = new URL(url)
  const domain = urlObj.hostname.replace('www.', '')

  // Extract from HTML if available
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  const iconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i)

  const title = (ogTitle?.[1] || titleMatch?.[1] || domain).slice(0, 50)
  const description = (ogDesc?.[1] || descMatch?.[1] || '').slice(0, 200)

  let icon = null
  if (ogImage?.[1]) {
    try { icon = new URL(ogImage[1], url).toString() } catch {}
  }
  if (!icon && iconMatch?.[1]) {
    try { icon = new URL(iconMatch[1], url).toString() } catch {}
  }
  if (!icon) icon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`

  return {
    url,
    domain,
    title: title.trim(),
    description: description.trim(),
    icon
  }
}

// Generate PWA manifest from site info
export function buildManifest(siteInfo, options = {}) {
  const {
    name = siteInfo.title,
    shortName = siteInfo.title.slice(0, 12),
    themeColor = '#7c3aed',
    bgColor = '#0a0a0f',
    startUrl = '/?url=' + encodeURIComponent(siteInfo.url)
  } = options

  return {
    name,
    short_name: shortName,
    description: siteInfo.description || `${name} as a mobile app`,
    theme_color: themeColor,
    background_color: bgColor,
    display: 'standalone',
    orientation: 'portrait',
    start_url: startUrl,
    scope: '/',
    icons: [
      { src: siteInfo.icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: siteInfo.icon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  }
}

// Build a standalone HTML file that wraps the URL in a PWA
export function buildWebAppHtml(siteInfo, options = {}) {
  const {
    name = siteInfo.title,
    themeColor = '#7c3aed',
    bgColor = '#0a0a0f'
  } = options

  // Manifest as data URL
  const manifest = buildManifest(siteInfo, options)
  const manifestJson = JSON.stringify(manifest)
  const manifestDataUrl = 'data:application/json;base64,' + btoa(manifestJson)

  // Service worker as inline JS (data URL)
  const swCode = `
const CACHE = 'webapp-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fetched = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    )
  );
});
`.trim()

  // Generate simple PNG icon as data URL (colored square with first letter)
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="${themeColor}"/>
  <text x="96" y="130" font-size="100" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="900">${(name[0] || 'A').toUpperCase()}</text>
</svg>`
  const iconDataUrl = 'data:image/svg+xml;base64,' + btoa(iconSvg)

  // Full HTML wrapper
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="${themeColor}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${escapeHtml(name)}">
<link rel="manifest" href="${manifestDataUrl}">
<link rel="icon" href="${iconDataUrl}">
<link rel="apple-touch-icon" href="${iconDataUrl}">
<title>${escapeHtml(name)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${bgColor};overflow:hidden;touch-action:none}
iframe{width:100vw;height:100vh;border:0;display:block;position:fixed;top:0;left:0}
.splash{position:fixed;top:0;left:0;right:0;bottom:0;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:9999;transition:opacity 0.3s}
.splash.hide{opacity:0;pointer-events:none}
.splash-icon{width:80px;height:80px;border-radius:20px;background:${themeColor};display:flex;align-items:center;justify-content:center;font-size:40px;color:#fff;font-weight:900;margin-bottom:16px;font-family:sans-serif}
.splash-text{color:#fff;font-size:16px;font-family:sans-serif;opacity:0.8}
.error{position:fixed;top:0;left:0;right:0;bottom:0;background:${bgColor};display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;color:#fff;font-family:sans-serif;z-index:10000}
.error h2{color:#f88;margin-bottom:12px}
.error p{color:#a0a0b0;font-size:14px;max-width:300px;line-height:1.5}
</style>
</head>
<body>
<div class="splash" id="splash">
  <div class="splash-icon">${escapeHtml((name[0] || 'A').toUpperCase())}</div>
  <div class="splash-text">Loading ${escapeHtml(name)}...</div>
</div>
<div class="error" id="error">
  <h2>⚠️ Can't load this site</h2>
  <p>This website blocks being loaded inside other apps. Try a different site.</p>
</div>
<iframe id="app" src="${escapeHtml(siteInfo.url)}" allow="fullscreen; camera; microphone; geolocation; clipboard-read; clipboard-write"></iframe>
<script>
// Hide splash when iframe loads
const iframe = document.getElementById('app');
const splash = document.getElementById('splash');
const error = document.getElementById('error');
let loaded = false;

iframe.addEventListener('load', () => {
  loaded = true;
  setTimeout(() => splash.classList.add('hide'), 500);
});

// Detect if the iframe failed (some sites set X-Frame-Options: deny)
setTimeout(() => {
  if (!loaded) {
    try {
      const cw = iframe.contentWindow;
      if (!cw || cw.length === 0) {
        error.style.display = 'flex';
        splash.style.display = 'none';
      }
    } catch (e) {
      error.style.display = 'flex';
      splash.style.display = 'none';
    }
  }
}, 5000);

// Try to hide address bar in standalone mode
window.addEventListener('load', () => {
  setTimeout(() => window.scrollTo(0, 1), 100);
});

// Prevent right-click (optional)
document.addEventListener('contextmenu', e => e.preventDefault());
</script>
</body>
</html>`
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Generate a downloadable file
export function downloadApp(html, filename) {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// Get shareable URL (creates a data URL — only works for small apps)
export function getShareableUrl(html) {
  // Convert to data URL for small apps (<2MB)
  if (html.length > 1900000) return null
  return 'data:text/html;base64,' + btoa(unescape(encodeURIComponent(html)))
}

// Generate QR code as data URL using a simple API
export function getQRCodeUrl(text, size = 200) {
  // Use qrserver.com API
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`
}
