(() => {
  const $ = (id) => document.getElementById(id);
  const urlEl = $("url");
  const nameEl = $("name");
  const pkgEl = $("package");
  const colorEl = $("color");
  const splash = $("splash");
  const splashName = $("splash-name");
  const splashUrl = $("splash-url");
  const splashIcon = $("splash-icon");
  const iconPreview = $("icon-preview");
  const iconHint = $("icon-hint");
  const statusBox = $("status");
  const logEl = $("log");
  const stepsEl = $("steps");
  const resultEl = $("result");
  const resultMeta = $("result-meta");
  const errbox = $("errbox");
  const forgeBtn = $("forge-btn");

  const SWATCHES = ["#ff7a18", "#0b0907", "#1d4ed8", "#0f766e", "#be123c", "#6d28d9", "#365314", "#111827"];
  const STEPS = [
    ["queued", "queue"],
    ["project", "project"],
    ["icons", "icons"],
    ["resources", "resources"],
    ["link", "link"],
    ["javac", "java"],
    ["dex", "dex"],
    ["package", "pack"],
    ["align", "align"],
    ["sign", "sign"],
    ["done", "apk"],
  ];

  const flags = {
    javascript: true,
    zoom: false,
    fullscreen: false,
    externalBrowser: true,
  };

  let iconData = null;
  let iconObjectUrl = null;
  let pollTimer = null;
  let metaTimer = null;
  let lastFavicon = "";

  function setIconSurface(src) {
    if (iconObjectUrl) {
      URL.revokeObjectURL(iconObjectUrl);
      iconObjectUrl = null;
    }
    if (src) {
      iconPreview.style.backgroundImage = `url("${src}")`;
      splashIcon.style.backgroundImage = `url("${src}")`;
      splashIcon.style.backgroundSize = "cover";
      splashIcon.textContent = "";
    } else {
      iconPreview.style.backgroundImage = "none";
      splashIcon.style.backgroundImage = "none";
      const letter = (nameEl.value || "W").trim().charAt(0).toUpperCase() || "W";
      splashIcon.textContent = letter;
    }
  }

  function paintPreview() {
    const name = nameEl.value.trim() || "Your app";
    const url = urlEl.value.trim() || "https://";
    splash.style.background = colorEl.value;
    splashName.textContent = name;
    splashUrl.textContent = url.replace(/^https?:\/\//, "");
    if (!iconData && !lastFavicon) {
      splashIcon.textContent = name.charAt(0).toUpperCase();
    }
  }

  function renderSwatches() {
    const box = $("swatches");
    box.innerHTML = "";
    SWATCHES.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (c.toLowerCase() === colorEl.value.toLowerCase() ? " on" : "");
      b.style.background = c;
      b.title = c;
      b.addEventListener("click", () => {
        colorEl.value = c;
        paintPreview();
        renderSwatches();
      });
      box.appendChild(b);
    });
  }

  function renderSteps(active, failed) {
    stepsEl.innerHTML = "";
    let seen = false;
    STEPS.forEach(([id, label]) => {
      const el = document.createElement("span");
      el.className = "step";
      el.textContent = label;
      if (failed && id === active) el.classList.add("err");
      else if (id === active) {
        el.classList.add("on");
        seen = true;
      } else if (!seen || active === "done") el.classList.add("done");
      stepsEl.appendChild(el);
    });
  }

  document.querySelectorAll(".toggle").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.key;
      flags[key] = !flags[key];
      el.classList.toggle("on", flags[key]);
    });
  });

  $("samples").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-url]");
    if (!btn) return;
    urlEl.value = btn.dataset.url;
    document.querySelectorAll("#samples .chip").forEach((c) => c.classList.toggle("on", c === btn));
    scheduleMeta();
    paintPreview();
  });

  urlEl.addEventListener("input", () => {
    paintPreview();
    scheduleMeta();
  });
  nameEl.addEventListener("input", paintPreview);
  colorEl.addEventListener("input", () => {
    paintPreview();
    renderSwatches();
  });

  $("icon-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      iconHint.textContent = "Keep the icon under 2 MB.";
      return;
    }
    const dataUrl = await readFile(file);
    iconData = dataUrl;
    lastFavicon = "";
    setIconSurface(dataUrl);
    iconHint.textContent = file.name;
  });

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function scheduleMeta() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(fetchMeta, 450);
  }

  async function fetchMeta() {
    const raw = urlEl.value.trim();
    if (raw.length < 4) return;
    try {
      const res = await fetch("/api/meta?url=" + encodeURIComponent(raw));
      const data = await res.json();
      if (!nameEl.value.trim() && data.title) nameEl.value = data.title.slice(0, 40);
      if (!pkgEl.value.trim() && data.packageName) pkgEl.value = data.packageName;
      if (data.themeColor) {
        colorEl.value = data.themeColor;
        renderSwatches();
      }
      if (data.favicon && !iconData) {
        lastFavicon = "/api/favicon?src=" + encodeURIComponent(data.favicon);
        setIconSurface(lastFavicon);
        iconHint.textContent = "Using the site’s favicon — upload to override.";
        grabFaviconAsData(data.favicon);
      }
      paintPreview();
    } catch {
      /* silent — user can still forge */
    }
  }

  async function grabFaviconAsData(src) {
    try {
      const res = await fetch("/api/favicon?src=" + encodeURIComponent(src));
      if (!res.ok) return;
      const blob = await res.blob();
      if (!blob || blob.size < 20) return;
      const file = new File([blob], "favicon.png", { type: blob.type || "image/png" });
      iconData = await readFile(file);
    } catch {
      /* ignore */
    }
  }

  function showStatus() {
    statusBox.classList.add("show");
    resultEl.classList.remove("show");
    errbox.classList.remove("show");
    errbox.textContent = "";
  }

  $("forge-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = urlEl.value.trim();
    if (!url) return;
    forgeBtn.disabled = true;
    forgeBtn.textContent = "Forging…";
    showStatus();
    renderSteps("queued", false);
    logEl.textContent = "Sending the job to the forge…\n";

    const payload = {
      url,
      name: nameEl.value.trim(),
      packageName: pkgEl.value.trim(),
      themeColor: colorEl.value,
      versionName: $("versionName").value.trim() || "1.0",
      versionCode: Number($("versionCode").value) || 1,
      javascript: flags.javascript,
      zoom: flags.zoom,
      fullscreen: flags.fullscreen,
      externalBrowser: flags.externalBrowser,
      icon: iconData || null,
    };

    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { /* not json */ }
      if (!res.ok) {
        throw new Error("This Static Site cannot forge APKs. Open /get.html and download the ZIP.");
      }
      poll(data.id);
    } catch (err) {
      fail(err.message);
    }
  });

  function fail(msg) {
    forgeBtn.disabled = false;
    forgeBtn.textContent = "Forge APK";
    errbox.textContent = msg;
    errbox.classList.add("show");
    renderSteps("sign", true);
  }

  function poll(id) {
    clearInterval(pollTimer);
    const tick = async () => {
      try {
        const res = await fetch("/api/build/" + id);
        const job = await res.json();
        if (!res.ok) throw new Error(job.error || "Lost the job.");
        logEl.textContent = (job.log || []).join("\n");
        logEl.scrollTop = logEl.scrollHeight;
        renderSteps(job.step || "queued", job.status === "error");
        if (job.status === "ready") {
          clearInterval(pollTimer);
          forgeBtn.disabled = false;
          forgeBtn.textContent = "Forge another";
          resultEl.classList.add("show");
          const kb = job.size ? Math.max(1, Math.round(job.size / 1024)) + " KB" : "";
          resultMeta.textContent = `${job.apk} · ${kb} · ${job.name}`;
          showReadyLinks(job);
          loadReady();
        } else if (job.status === "error") {
          clearInterval(pollTimer);
          fail(job.error || "Build failed.");
        }
      } catch (err) {
        clearInterval(pollTimer);
        fail(err.message);
      }
    };
    tick();
    pollTimer = setInterval(tick, 700);
  }

  function showReadyLinks(job) {
    const zipName = (job.apk || "app").replace(/\.apk$/i, ".zip");
    const zipHref = "/downloads/" + encodeURIComponent(zipName);
    const form = $("dl-form");
    if (form) form.setAttribute("action", zipHref);
    const zipA = $("download-zip");
    if (zipA && zipA.tagName === "A") {
      zipA.href = zipHref;
    }
    const banner = $("your-apk");
    if (banner) {
      banner.hidden = false;
      const title = $("ready-title");
      if (title) title.textContent = job.name || "Your app";
      const bz = $("banner-zip");
      if (bz) {
        bz.href = zipHref;
        bz.setAttribute("download", zipName);
        bz.target = "_top";
      }
      const code = $("dl-url");
      if (code) code.textContent = location.origin + zipHref;
      const copyBtn = $("copy-dl");
      if (copyBtn) {
        copyBtn.onclick = async () => {
          const link = location.origin + zipHref;
          try { await navigator.clipboard.writeText(link); copyBtn.textContent = "Copied"; }
          catch { window.prompt("Copy this link", link); }
        };
      }
    }
  }

  function saveApk(href) {
    window.location.href = href;
  }

  async function loadReady() {
    const list = $("ready-list");
    if (!list) return;
    try {
      const res = await fetch("/api/apks");
      const data = await res.json();
      const apks = data.apks || [];
      if (!apks.length) {
        list.innerHTML = '<div class="hint">Forge one above — it will land here.</div>';
        return;
      }
      list.innerHTML = "";
      apks.forEach((apk) => {
        const row = document.createElement("div");
        row.className = "ready-item";
        const kb = Math.max(1, Math.round(apk.size / 1024));
        const zipHref = String(apk.url || "").replace(/\.apk$/i, ".zip");
        const zipName = String(apk.name || "app.apk").replace(/\.apk$/i, ".zip");
        row.innerHTML = `<span>${zipName} · ${kb} KB</span>`;
        const btn = document.createElement("a");
        btn.className = "btn btn-amber";
        btn.href = zipHref;
        btn.setAttribute("download", zipName);
        btn.textContent = "Download ZIP";
        row.appendChild(btn);
        list.appendChild(row);
      });
    } catch {
      list.innerHTML = '<div class="hint">Could not list APKs yet.</div>';
    }
  }

  renderSwatches();
  renderSteps("queued", false);
  paintPreview();
  setIconSurface("/assets/default-icon.png");
  loadReady();
})();
