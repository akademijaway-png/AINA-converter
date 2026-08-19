#!/usr/bin/env node
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const JOBS = path.join(ROOT, "jobs");
const DOWNLOADS = path.join(ROOT, "downloads");
const PUBLIC_DL = path.join(PUBLIC, "downloads");
const BUILD_SH = path.join(ROOT, "builder", "build.sh");
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

fs.mkdirSync(JOBS, { recursive: true });
fs.mkdirSync(DOWNLOADS, { recursive: true });
fs.mkdirSync(PUBLIC_DL, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".apk": "application/octet-stream",
  ".zip": "application/zip",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

const jobs = new Map();
const queue = [];
let busy = false;

function send(res, status, body, headers = {}) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
  res.writeHead(status, {
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(data);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    "Content-Type": "application/json; charset=utf-8",
  });
}

function readBody(req, limit = 3_500_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "app";
}

function packageFromHost(host) {
  const clean = String(host || "app")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.]+/g, "")
    .split(".")
    .filter((p) => p && !/^[0-9]+$/.test(p));
  const parts = clean.length ? clean.reverse() : ["app"];
  const pkg = ["com", "webtoapp", ...parts].join(".");
  const safe = pkg.replace(/[^a-z0-9._]/g, "").replace(/^\.+|\.+$/g, "");
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(safe)) {
    return "com.webtoapp.app";
  }
  return safe.slice(0, 80);
}

function validateConfig(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid json");
  let url = String(raw.url || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are allowed.");
  }
  if (!parsed.hostname || parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) {
    throw new Error("Please use a public website URL.");
  }

  const name = String(raw.name || parsed.hostname.replace(/^www\./, "")).trim().slice(0, 40);
  if (!name) throw new Error("App name is required.");

  let packageName = String(raw.packageName || packageFromHost(parsed.hostname)).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) {
    throw new Error("Package name must look like com.company.app");
  }

  let themeColor = String(raw.themeColor || "#FF7A18").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(themeColor)) themeColor = "#FF7A18";

  const versionName = String(raw.versionName || "1.0").replace(/[^\d.]/g, "").slice(0, 12) || "1.0";
  const versionCode = Math.max(1, Math.min(999999, Number(raw.versionCode) || 1));

  return {
    url: parsed.toString(),
    name,
    packageName: packageName.toLowerCase(),
    themeColor,
    javascript: raw.javascript !== false,
    zoom: !!raw.zoom,
    fullscreen: !!raw.fullscreen,
    externalBrowser: raw.externalBrowser !== false,
    versionName,
    versionCode,
  };
}

function decodeIcon(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) throw new Error("Icon must be an image file.");
  const buf = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (buf.length > 2_200_000) throw new Error("Icon is too large (max 2 MB).");
  if (buf.length < 32) throw new Error("Icon file looks empty.");
  return buf;
}

function fetchUrl(target, { maxBytes = 400_000, timeout = 9000, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let hops = 0;
    const go = (u) => {
      let parsed;
      try {
        parsed = new URL(u);
      } catch {
        reject(new Error("bad url"));
        return;
      }
      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname + parsed.search,
          method: "GET",
          timeout,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 WebToApp/1.0",
            Accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        },
        (res) => {
          const loc = res.headers.location;
          if (res.statusCode >= 300 && res.statusCode < 400 && loc && hops < maxRedirects) {
            hops += 1;
            res.resume();
            go(new URL(loc, u).toString());
            return;
          }
          const chunks = [];
          let n = 0;
          res.on("data", (c) => {
            n += c.length;
            if (n <= maxBytes) chunks.push(c);
          });
          res.on("end", () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
              url: u,
            });
          });
        }
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    };
    go(target);
  });
}

function attr(tag, name) {
  const re = new RegExp(name + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i");
  const m = tag.match(re);
  return m ? m[2] : "";
}

function parseMeta(html, baseUrl) {
  const text = html.toString("utf8");
  const titleM = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleM ? titleM[1].replace(/\s+/g, " ").trim() : "";
  title = title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  let themeColor = "";
  const metas = text.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metas) {
    const name = (attr(tag, "name") || attr(tag, "property")).toLowerCase();
    if (name === "theme-color" || name === "msapplication-navbutton-color") {
      const c = attr(tag, "content").trim();
      const hex = c.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
      if (hex) {
        themeColor = hex[0];
        if (themeColor.length === 4) {
          themeColor =
            "#" +
            themeColor
              .slice(1)
              .split("")
              .map((ch) => ch + ch)
              .join("");
        }
      }
    }
    if (!title && (name === "og:title" || name === "twitter:title")) {
      title = attr(tag, "content").trim();
    }
  }

  const icons = [];
  const links = text.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    const rel = attr(tag, "rel").toLowerCase();
    if (!rel) continue;
    if (/\b(apple-touch-icon|icon|shortcut icon|fluid-icon)\b/.test(rel)) {
      const href = attr(tag, "href");
      if (!href) continue;
      const sizes = attr(tag, "sizes");
      const px = sizes ? parseInt(sizes, 10) || 0 : rel.includes("apple") ? 180 : 32;
      try {
        icons.push({ href: new URL(href, baseUrl).toString(), px });
      } catch {
        /* ignore */
      }
    }
  }
  icons.sort((a, b) => b.px - a.px);
  return { title: title.slice(0, 80), themeColor, icons };
}

async function handleMeta(req, res, search) {
  const q = new URLSearchParams(search);
  let raw = (q.get("url") || "").trim();
  if (!raw) return sendJson(res, 400, { error: "url required" });
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return sendJson(res, 400, { error: "invalid url" });
  }
  try {
    const page = await fetchUrl(parsed.toString());
    const meta = parseMeta(page.body, page.url);
    let favicon = meta.icons[0]?.href || new URL("/favicon.ico", page.url).toString();
    const host = new URL(page.url).hostname;
    sendJson(res, 200, {
      url: page.url,
      title: meta.title || host.replace(/^www\./, ""),
      themeColor: meta.themeColor || "",
      favicon,
      packageName: packageFromHost(host),
    });
  } catch (e) {
    sendJson(res, 200, {
      url: parsed.toString(),
      title: parsed.hostname.replace(/^www\./, ""),
      themeColor: "",
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`,
      packageName: packageFromHost(parsed.hostname),
      warning: "Could not read the page, but you can still forge an APK.",
    });
  }
}

async function handleFavicon(req, res, search) {
  const src = new URLSearchParams(search).get("src") || "";
  if (!/^https?:\/\//i.test(src)) return send(res, 400, "bad src");
  try {
    const got = await fetchUrl(src, { maxBytes: 800_000, timeout: 8000 });
    const type = (got.headers["content-type"] || "image/x-icon").split(";")[0];
    send(res, 200, got.body, {
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600",
    });
  } catch {
    send(res, 404, "not found");
  }
}

function jobPublic(job) {
  return {
    id: job.id,
    status: job.status,
    step: job.step,
    log: job.log.slice(-80),
    error: job.error,
    apk: job.apk,
    downloadUrl: job.apk ? "/api/download/" + job.id : null,
    fileUrl: job.apk ? "/downloads/" + encodeURIComponent(job.apk) : null,
    zipUrl: job.zip ? "/downloads/" + encodeURIComponent(job.zip) : (job.apk ? "/downloads/" + encodeURIComponent(String(job.apk).replace(/\.apk$/i, ".zip")) : null),
    name: job.config.name,
    url: job.config.url,
    createdAt: job.createdAt,
    size: job.size || null,
  };
}

function publishApk(job, apkPath) {
  const { execFileSync } = require("child_process");
  const safe = String(job.apk || "app.apk").replace(/[^\w.\-]+/g, "_");
  const zipName = safe.replace(/\.apk$/i, "") + ".zip";
  try {
    fs.copyFileSync(apkPath, path.join(DOWNLOADS, safe));
    fs.copyFileSync(apkPath, path.join(PUBLIC_DL, safe));
    const zipPath = path.join(PUBLIC_DL, zipName);
    execFileSync("zip", ["-j", "-q", zipPath, apkPath]);
    fs.copyFileSync(zipPath, path.join(DOWNLOADS, zipName));
    job.zip = zipName;
    try {
      fs.copyFileSync(zipPath, path.join("/home/user", "latest-app.zip"));
      fs.copyFileSync(apkPath, path.join("/home/user", "latest-app.apk"));
      fs.copyFileSync(zipPath, path.join("/home/user", zipName));
    } catch (e2) {
      console.error("home copy failed", e2.message);
    }
  } catch (e) {
    console.error("copy apk failed", e.message);
  }
}

function listPublishedApks() {
  try {
    return fs
      .readdirSync(PUBLIC_DL)
      .filter((f) => f.endsWith(".apk"))
      .map((f) => {
        const st = fs.statSync(path.join(PUBLIC_DL, f));
        return { name: f, size: st.size, url: "/downloads/" + encodeURIComponent(f), mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

function restoreJobs() {
  let n = 0;
  try {
    for (const id of fs.readdirSync(JOBS)) {
      const dir = path.join(JOBS, id);
      if (!fs.statSync(dir).isDirectory()) continue;
      let status = {};
      let config = {};
      try {
        status = JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8"));
      } catch {
        /* ignore */
      }
      try {
        config = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
      } catch {
        config = { name: "App", url: "" };
      }
      let apk = status.apk || "";
      try {
        apk = fs.readFileSync(path.join(dir, "apk-name.txt"), "utf8").trim() || apk;
      } catch {
        /* ignore */
      }
      const apkPath = apk ? path.join(dir, apk) : "";
      const ready = apkPath && fs.existsSync(apkPath);
      const job = {
        id,
        dir,
        config,
        status: ready ? "ready" : status.status === "error" ? "error" : "error",
        step: ready ? "done" : "sign",
        log: ready ? ["Restored previous APK."] : ["Previous job was incomplete."],
        error: ready ? null : "This build is no longer running.",
        apk: ready ? apk : null,
        size: ready ? fs.statSync(apkPath).size : null,
        createdAt: Date.now(),
        child: null,
      };
      jobs.set(id, job);
      if (ready) publishApk(job, apkPath);
      n += 1;
    }
  } catch {
    /* ignore */
  }
  return n;
}

function appendLog(job, line) {
  const text = String(line).replace(/\r/g, "").trimEnd();
  if (!text) return;
  for (const row of text.split("\n")) {
    job.log.push(row);
    if (job.log.length > 200) job.log.shift();
  }
}

function pumpQueue() {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  runBuild(next).finally(() => {
    busy = false;
    pumpQueue();
  });
}

function runBuild(job) {
  return new Promise((resolve) => {
    job.status = "building";
    job.step = "preparing";
    appendLog(job, "Forge started.");
    fs.writeFileSync(path.join(job.dir, "status.json"), JSON.stringify({ status: "building" }));

    const child = spawn("bash", [BUILD_SH, job.dir], {
      cwd: ROOT,
      env: { ...process.env },
    });
    job.child = child;

    const onData = (buf) => {
      const s = buf.toString();
      appendLog(job, s);
      if (s.includes("Preparing project")) job.step = "project";
      else if (s.includes("Minting launcher")) job.step = "icons";
      else if (s.includes("Compiling resources")) job.step = "resources";
      else if (s.includes("Linking APK")) job.step = "link";
      else if (s.includes("Compiling Java")) job.step = "javac";
      else if (s.includes("Dexing")) job.step = "dex";
      else if (s.includes("Packaging")) job.step = "package";
      else if (s.includes("Aligning")) job.step = "align";
      else if (s.includes("Signing")) job.step = "sign";
      else if (s.includes("APK ready")) job.step = "done";
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const killer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 180_000);

    child.on("close", (code) => {
      clearTimeout(killer);
      job.child = null;
      if (code === 0) {
        let apkName = "";
        try {
          apkName = fs.readFileSync(path.join(job.dir, "apk-name.txt"), "utf8").trim();
        } catch {
          apkName = "";
        }
        const apkPath = apkName ? path.join(job.dir, apkName) : "";
        if (apkPath && fs.existsSync(apkPath)) {
          job.status = "ready";
          job.step = "done";
          job.apk = apkName;
          job.size = fs.statSync(apkPath).size;
          publishApk(job, apkPath);
          appendLog(job, "Ready for download.");
        } else {
          job.status = "error";
          job.error = "Build finished but the APK was not found.";
          appendLog(job, job.error);
        }
      } else {
        job.status = "error";
        job.error = "Build failed. Check the forge log.";
        appendLog(job, "Build exited with code " + code);
      }
      try {
        fs.writeFileSync(
          path.join(job.dir, "status.json"),
          JSON.stringify({ status: job.status, apk: job.apk, error: job.error })
        );
      } catch {
        /* ignore */
      }
      resolve();
    });
  });
}

async function handleBuild(req, res) {
  let raw;
  try {
    raw = JSON.parse((await readBody(req)).toString("utf8") || "{}");
  } catch {
    return sendJson(res, 400, { error: "Could not read request." });
  }
  let config;
  try {
    config = validateConfig(raw);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
  let iconBuf = null;
  try {
    iconBuf = decodeIcon(raw.icon);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }

  const id = crypto.randomBytes(8).toString("hex");
  const dir = path.join(JOBS, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2));
  if (iconBuf) fs.writeFileSync(path.join(dir, "icon.png"), iconBuf);

  const job = {
    id,
    dir,
    config,
    status: "queued",
    step: "queued",
    log: ["Queued. Waiting for the forge…"],
    error: null,
    apk: null,
    size: null,
    createdAt: Date.now(),
    child: null,
  };
  jobs.set(id, job);
  queue.push(job);
  pumpQueue();
  sendJson(res, 202, jobPublic(job));
}

function handleStatus(res, id) {
  const job = jobs.get(id);
  if (!job) return sendJson(res, 404, { error: "Unknown job." });
  sendJson(res, 200, jobPublic(job));
}

function handleDownload(res, id) {
  const job = jobs.get(id);
  if (!job || job.status !== "ready" || !job.apk) {
    return sendJson(res, 404, { error: "APK is not ready." });
  }
  const zipName = (job.zip || String(job.apk).replace(/\.apk$/i, ".zip")).replace(/[^\w.\-]+/g, "_");
  const zipPublic = path.join(PUBLIC_DL, zipName);
  if (fs.existsSync(zipPublic)) {
    res.writeHead(302, { Location: "/downloads/" + encodeURIComponent(zipName) });
    res.end();
    return;
  }
  const file = path.join(job.dir, job.apk);
  if (!fs.existsSync(file)) return sendJson(res, 404, { error: "File missing." });
  const data = fs.readFileSync(file);
  const filename = job.apk.replace(/[^\w.\-]+/g, "_");
  send(res, 200, data, {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
}

function safePublic(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p === "/") p = "/index.html";
  const resolved = path.normalize(path.join(PUBLIC, p));
  if (!resolved.startsWith(PUBLIC)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;

    if (req.method === "GET" && p === "/api/health") {
      return sendJson(res, 200, { ok: true, name: "Web to App", busy, queued: queue.length });
    }
    if (req.method === "GET" && p === "/api/apks") {
      return sendJson(res, 200, { apks: listPublishedApks() });
    }
    if (req.method === "GET" && p === "/api/meta") return handleMeta(req, res, u.search);
    if (req.method === "GET" && p === "/api/favicon") return handleFavicon(req, res, u.search);
    if (req.method === "POST" && p === "/api/build") return handleBuild(req, res);
    if (req.method === "GET" && p.startsWith("/api/build/")) {
      return handleStatus(res, p.slice("/api/build/".length));
    }
    if (req.method === "GET" && p.startsWith("/api/download/")) {
      return handleDownload(res, p.slice("/api/download/".length).split("/")[0]);
    }
    if (req.method === "GET" && p.startsWith("/got/")) {
      const name = path.basename(decodeURIComponent(p.slice("/got/".length)));
      if (!/^[a-zA-Z0-9._-]+\.(zip|apk)$/.test(name)) return send(res, 400, "bad file");
      const href = "/downloads/" + encodeURIComponent(name);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Save ${name}</title>
<style>body{font-family:sans-serif;background:#0b0907;color:#f3ead8;min-height:100vh;display:grid;place-items:center;margin:0}a{display:block;background:#ff7a18;color:#1a0c00;font-weight:800;text-decoration:none;padding:22px 28px;border-radius:999px;font-size:1.2rem}</style></head>
<body><div style="text-align:center"><p>Your app is ready.</p><a href="${href}" download="${name}">Save ${name}</a></div>
<script>setTimeout(function(){location.replace(${JSON.stringify(href)});},400);</script></body></html>`;
      return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, "method not allowed");
    }

    const file = safePublic(p);
    if (!file) return send(res, 403, "forbidden");
    let target = file;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      target = path.join(file, "index.html");
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return send(res, 404, "not found");
    }
    const ext = path.extname(target).toLowerCase();
    const data = fs.readFileSync(target);
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=86400",
    };
    if (ext === ".apk" || ext === ".zip") {
      headers["Content-Disposition"] = `attachment; filename="${path.basename(target)}"`;
    }
    send(res, 200, data, headers);
  } catch (e) {
    sendJson(res, 500, { error: e.message || "server error" });
  }
});

const restored = restoreJobs();
server.listen(PORT, HOST, () => {
  console.log(`Web to App listening on http://${HOST}:${PORT} (restored ${restored} jobs)`);
});
