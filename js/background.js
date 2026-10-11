/* Earth imagery: NASA Blue Marble (public domain), assets/earth.jpg.
   Borders: Natural Earth (public domain) via world-atlas, data/countries-110m.json. */
/* ---------- Background: textured 3D globe and drifting newspaper clippings ---------- */
(function () {
  const cv = document.getElementById("bg");
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext("2d");
  let still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, DPR = 1;
  const TILT = 0.36;

  /* --- Earth texture → monochrome engraving --- */
  const TW = 1024, TH = 512;
  let tex = null;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = TW; c.height = TH;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0, TW, TH);
    let d;
    try { d = x.getImageData(0, 0, TW, TH).data; } catch (_) { return; } // file:// pages can't read image pixels; serve over http instead
    tex = new Uint8ClampedArray(TW * TH);
    for (let i = 0, p = 0; i < tex.length; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      const ocean = b > r + 12 && b > g - 4 && lum < 140;
      if (ocean) tex[i] = 236 + (lum - 40) * 0.12;          // pale sea
      else if (lum > 200) tex[i] = 226;                      // ice and snow
      else tex[i] = 58 + lum * 0.62;                         // land relief in graphite
    }
    buildGlobe();
  };
  img.src = (window.SECOND_LOOK_INLINE && window.SECOND_LOOK_INLINE.earth) || "assets/earth.jpg";

  /* --- Per-pixel sphere lookup (rebuilt on resize) --- */
  let G = null; // {size, L, V, shade, alpha, buf, data, can}
  function buildGlobe() {
    if (!tex || !W) return;
    const R = radius();
    const size = Math.max(160, Math.min(620, Math.round(2 * R * DPR)));
    const r = size / 2;
    const n = size * size;
    const L = new Float32Array(n), V = new Int32Array(n), shade = new Float32Array(n), alpha = new Uint8ClampedArray(n);
    const lx = -0.55, ly = 0.55, lz = 0.63; // light from upper left, toward viewer
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const i = py * size + px;
      const x = (px + 0.5 - r) / r, y = (r - py - 0.5) / r;
      const d2 = x * x + y * y;
      if (d2 > 1) { alpha[i] = 0; continue; }
      const z = Math.sqrt(1 - d2);
      const y0 = y * Math.cos(TILT) + z * Math.sin(TILT);
      const z0 = -y * Math.sin(TILT) + z * Math.cos(TILT);
      L[i] = Math.atan2(x, z0);
      V[i] = Math.min(TH - 1, Math.max(0, Math.floor((0.5 - Math.asin(y0) / Math.PI) * TH))) * TW;
      const lam = Math.max(0, x * lx + y * ly + z * lz);
      const spec = Math.pow(Math.max(0, lam), 28) * 0.18;
      shade[i] = 0.62 + 0.42 * lam + spec;
      alpha[i] = Math.round(255 * Math.min(1, (1 - Math.sqrt(d2)) * r * 1.2));
    }
    const can = document.createElement("canvas"); can.width = can.height = size;
    const gx = can.getContext("2d");
    const imgData = gx.createImageData(size, size);
    G = { size, L, V, shade, alpha, can, gx, imgData };
  }
  function paintGlobe(rot) {
    const { size, L, V, shade, alpha, gx, imgData } = G;
    const data = imgData.data;
    const k = TW / (2 * Math.PI);
    for (let i = 0, p = 0; i < size * size; i++, p += 4) {
      const a = alpha[i];
      if (!a) { data[p + 3] = 0; continue; }
      let u = Math.floor((L[i] - rot) * k + TW * 0.5) % TW; if (u < 0) u += TW;
      const s = shade[i];
      const t = tex[V[i] + u];
      // mix toward white on the lit side so the sea stays luminous
      const v = t * s + (s - 0.62) * 40;
      data[p] = data[p + 1] = data[p + 2] = v;
      data[p + 3] = a;
    }
    gx.putImageData(imgData, 0, 0);
  }

  /* --- Country borders (d3 + topojson, optional) --- */
  let proj = null, path = null, borders = null, coast = null, grat = null;
  function useWorld(world) {
    if (!window.d3 || !window.topojson || !world) return;
    try {
      proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
      path = d3.geoPath(proj, ctx);
      borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
      coast = topojson.feature(world, world.objects.land);
      grat = d3.geoGraticule10();
    } catch (_) { proj = null; }
  }
  if (window.SECOND_LOOK_INLINE && window.SECOND_LOOK_INLINE.world) useWorld(window.SECOND_LOOK_INLINE.world);
  else fetch("data/countries-110m.json").then(r => r.ok ? r.json() : null).then(useWorld).catch(() => {});
  const HUBS = [[-74, 40.7], [-0.1, 51.5], [2.35, 48.86], [139.7, 35.7], [77.2, 28.6], [-46.6, -23.5], [31.2, 30.0], [151.2, -33.9], [37.6, 55.75], [116.4, 39.9], [3.4, 6.5], [-99.1, 19.4], [55.3, 25.2], [-122.4, 37.8], [28.0, -26.2], [103.8, 1.35], [13.4, 52.5], [126.98, 37.57]];
  const pings = [];
  let lastPing = -1;

  function radius() { return Math.min(W, H) * (W < 600 ? 0.48 : 0.38); }

  function drawGlobe(t) {
    const R = radius();
    const cx = W * 0.5, cy = Math.min(H * 0.5, R + 150);
    const rot = t * 0.05;

    // atmosphere and ground shadow
    const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.22);
    halo.addColorStop(0, "rgba(255,255,255,0.9)"); halo.addColorStop(0.35, "rgba(220,224,232,0.35)"); halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.12)"; ctx.shadowBlur = R * 0.25; ctx.shadowOffsetY = R * 0.08;
    ctx.fillStyle = "#f2f2f4"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();

    ctx.save(); ctx.globalAlpha = 0.62;
    if (G) { paintGlobe(rot); ctx.imageSmoothingEnabled = true; ctx.drawImage(G.can, cx - R, cy - R, 2 * R, 2 * R); }
    ctx.restore();

    if (proj) {
      proj.scale(R).translate([cx, cy]).rotate([rot * 180 / Math.PI, -TILT * 180 / Math.PI]);
      ctx.lineJoin = "round";
      ctx.beginPath(); path(grat); ctx.strokeStyle = "rgba(0,0,0,0.05)"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath(); path(coast); ctx.strokeStyle = "rgba(29,29,31,0.28)"; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); path(borders); ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 0.6; ctx.stroke();

      if (!still && t - lastPing > 1.2) {
        lastPing = t;
        const center = [-rot * 180 / Math.PI, TILT * 180 / Math.PI];
        const vis = HUBS.filter(h => d3.geoDistance(h, center) < 1.2);
        if (vis.length) pings.push({ h: vis[Math.floor(Math.random() * vis.length)], born: t });
      }
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i], age = t - p.born;
        if (age > 3.2) { pings.splice(i, 1); continue; }
        const center = [-rot * 180 / Math.PI, TILT * 180 / Math.PI];
        if (d3.geoDistance(p.h, center) > 1.45) continue;
        const [px, py] = proj(p.h), k = age / 3.2;
        ctx.strokeStyle = "rgba(29,29,31," + ((1 - k) * 0.55).toFixed(3) + ")"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py, 3 + k * R * 0.14, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "rgba(29,29,31," + ((1 - k) * 0.85).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    // glass highlight and rim
    const hl = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.48, 0, cx - R * 0.3, cy - R * 0.3, R * 1.05);
    hl.addColorStop(0, "rgba(255,255,255,0.55)"); hl.addColorStop(0.35, "rgba(255,255,255,0.08)"); hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    const rim = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
    rim.addColorStop(0, "rgba(255,255,255,0)"); rim.addColorStop(1, "rgba(255,255,255,0.45)");
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  }

  /* --- Newspaper clippings with invented mastheads --- */
  const PAPERS = [
    { name: "The Daily Ledger", style: "black" },
    { name: "The Evening Courier", style: "black" },
    { name: "THE METROPOLITAN", style: "serif" },
    { name: "Global Dispatch", style: "serif" },
    { name: "World Herald", style: "serif" },
    { name: "GN", style: "box", sub: "GLOBAL NEWS" },
    { name: "WR", style: "box", sub: "WORLD REPORT" }
  ];
  const HEADS = ["Officials deny overnight ban", "Viral photo traced to 2014", "Markets steady as talks resume", "Scientists question new claim", "Storm warnings issued", "Leaders meet for summit", "Fact check: quote never said", "Election results confirmed"];
  const clips = [];
  function chaosFields() {
    const r = Math.random();
    const kind = r < 0.4 ? "paper" : r < 0.58 ? "phone" : r < 0.74 ? "bubble" : r < 0.84 ? "warning" : r < 0.94 ? "tag" : "signal";
    const f = { kind };
    if (kind === "phone") { f.text = pick(POSTS); f.likes = fmtCount(); f.shares = fmtCount(); }
    if (kind === "bubble") { f.text = pick(CHATS); f.dark = Math.random() < 0.4; f.fwd = Math.random() < 0.5; f.h = 60; }
    if (kind === "tag") { f.text = pick(TAGS); f.h = 50; }
    if (kind === "warning" || kind === "signal") f.h = 90;
    return f;
  }
  function makeClip(initial) {
    const w = 84 + Math.random() * 80;
    return {
      x: Math.random() * W, y: initial ? Math.random() * H : H + 140 + Math.random() * 200,
      w, h: w * (1.2 + Math.random() * 0.3),
      rot: (Math.random() - 0.5) * 0.5, vr: (Math.random() - 0.5) * 0.05,
      vy: 7 + Math.random() * 9, sway: Math.random() * Math.PI * 2,
      paper: PAPERS[Math.floor(Math.random() * PAPERS.length)],
      head: HEADS[Math.floor(Math.random() * HEADS.length)],
      photo: Math.random() < 0.65, stamp: Math.random() < 0.3, depth: 0.45 + Math.random() * 0.55,
      ...chaosFields()
    };
  }
  function wrapText(text, x, y, maxW, lh, maxLines) {
    const words = text.split(" "); let line = "", n = 0;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines) return y + n * lh; }
      else line = test;
    }
    ctx.fillText(line, x, y + n * lh); return y + (n + 1) * lh;
  }
  /* --- Chaos objects: viral phones, forwarded chats, warnings, tags, broadcast signals --- */
  const POSTS = ["You won't believe this", "They're hiding the truth", "Doctors hate this", "Is this real?", "BREAKING!!!", "Share before it's deleted"];
  const CHATS = ["FWD: share this!!!", "is this true??", "my cousin sent me this", "Forwarded many times", "100% real I swear", "delete this asap"];
  const TAGS = ["UNVERIFIED", "DEEPFAKE?", "MISLEADING", "NO SOURCE", "OUT OF CONTEXT", "EDITED"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const SANS = "-apple-system, Helvetica, Arial, sans-serif";
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawPhone(c, t) {
    const w = c.w * 0.62, h = w * 2, x = -w / 2, y = -h / 2;
    ctx.fillStyle = "#2c2c2e"; rr(x, y, w, h, w * 0.16); ctx.fill();
    const sx = x + w * 0.06, sy = y + w * 0.06, sw = w * 0.88, sh = h - w * 0.12;
    ctx.fillStyle = "#fdfdfd"; rr(sx, sy, sw, sh, w * 0.11); ctx.fill();
    ctx.save(); rr(sx, sy, sw, sh, w * 0.11); ctx.clip();
    let yy = sy + sw * 0.18;
    ctx.fillStyle = "#c7c7cc"; ctx.beginPath(); ctx.arc(sx + sw * 0.14, yy, sw * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(sx + sw * 0.26, yy - sw * 0.04, sw * 0.4, sw * 0.035);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(sx + sw * 0.26, yy + sw * 0.02, sw * 0.25, sw * 0.03);
    yy += sw * 0.16;
    ctx.fillStyle = "#1d1d1f"; ctx.font = "700 " + Math.round(sw * 0.085) + "px " + SANS; ctx.textAlign = "left"; ctx.textBaseline = "top";
    const words = c.text.split(" "); let line = "", n = 0;
    for (const wd of words) { const tst = line ? line + " " + wd : wd; if (ctx.measureText(tst).width > sw * 0.84 && line) { ctx.fillText(line, sx + sw * 0.08, yy + n * sw * 0.1); line = wd; n++; } else line = tst; }
    ctx.fillText(line, sx + sw * 0.08, yy + n * sw * 0.1); yy += (n + 1) * sw * 0.1 + sw * 0.05;
    ctx.fillStyle = "rgba(0,0,0,0.13)"; ctx.fillRect(sx, yy, sw, sh * 0.34);
    // glitch slices over the photo
    const glitch = (Math.sin(t * 2.3 + c.sway * 5) > 0.93);
    if (glitch) { for (let g = 0; g < 4; g++) { const gy = yy + Math.random() * sh * 0.32; ctx.fillStyle = g % 2 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.8)"; ctx.fillRect(sx + (Math.random() - 0.5) * sw * 0.2, gy, sw, sw * 0.03 + Math.random() * sw * 0.05); } }
    yy += sh * 0.34 + sw * 0.08;
    ctx.fillStyle = "#3a3a3c"; ctx.font = "600 " + Math.round(sw * 0.07) + "px " + SANS;
    ctx.fillText("♥ " + c.likes + "   ↻ " + c.shares, sx + sw * 0.08, yy);
    ctx.restore();
  }
  function drawBubble(c) {
    ctx.font = "500 " + Math.round(c.w * 0.12) + "px " + SANS;
    const tw = Math.min(c.w * 1.6, ctx.measureText(c.text).width), pad = c.w * 0.09, w = tw + pad * 2, h = c.w * 0.12 + pad * 1.6;
    const x = -w / 2, y = -h / 2;
    ctx.fillStyle = c.dark ? "#3a3a3c" : "#ffffff"; ctx.strokeStyle = "rgba(0,0,0,0.12)";
    rr(x, y, w, h, h * 0.45); ctx.fill(); if (!c.dark) ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h - 1); ctx.lineTo(x + w * 0.1, y + h + h * 0.35); ctx.lineTo(x + w * 0.32, y + h - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.dark ? "#ffffff" : "#1d1d1f"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(c.text, 0, 1, tw);
    if (c.fwd) { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.font = "italic 500 " + Math.round(c.w * 0.075) + "px " + SANS; ctx.textAlign = "left"; ctx.fillText("↪ Forwarded many times", x + pad * 0.6, y - c.w * 0.07); }
  }
  function drawWarning(c, t) {
    const s = c.w * 0.75, pulse = 1 + Math.sin(t * 1.6 + c.sway) * 0.04;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#2c2c2e"; ctx.lineWidth = s * 0.07; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.55, s * 0.45); ctx.lineTo(-s * 0.55, s * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2c2c2e"; ctx.font = "800 " + Math.round(s * 0.55) + "px " + SANS; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", 0, s * 0.12);
  }
  function drawTag(c) {
    ctx.font = "800 " + Math.round(c.w * 0.13) + "px " + SANS;
    const tw = ctx.measureText(c.text).width, pad = c.w * 0.08, w = tw + pad * 2, h = c.w * 0.13 + pad * 1.3;
    ctx.strokeStyle = "#2c2c2e"; ctx.lineWidth = Math.max(1.5, c.w * 0.025);
    rr(-w / 2, -h / 2, w, h, 4); ctx.stroke();
    rr(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 2); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = "#2c2c2e"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(c.text, 0, 1);
  }
  function drawSignal(c, t) {
    const s = c.w * 0.5;
    ctx.strokeStyle = "#3a3a3c"; ctx.lineWidth = Math.max(1.2, s * 0.06); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(-s * 0.3, s * 0.8); ctx.moveTo(0, -s * 0.1); ctx.lineTo(s * 0.3, s * 0.8); ctx.moveTo(-s * 0.18, s * 0.45); ctx.lineTo(s * 0.18, s * 0.45); ctx.stroke();
    ctx.fillStyle = "#3a3a3c"; ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 0.6 + i / 3) % 1), r = s * (0.25 + ph * 0.9);
      ctx.globalAlpha *= 1; ctx.strokeStyle = "rgba(58,58,60," + (1 - ph).toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(0, -s * 0.15, r, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
    }
  }
  function drawChaos(c, t) {
    ctx.save();
    ctx.translate(c.x + Math.sin(t * 0.3 + c.sway) * 14, c.y);
    ctx.rotate(c.rot);
    ctx.globalAlpha = 0.5 * c.depth * centerFade(c);
    ctx.shadowColor = "rgba(0,0,0,0.10)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    if (c.kind === "phone") drawPhone(c, t);
    else if (c.kind === "bubble") drawBubble(c);
    else if (c.kind === "warning") { ctx.shadowColor = "transparent"; drawWarning(c, t); }
    else if (c.kind === "tag") { ctx.shadowColor = "transparent"; drawTag(c); }
    else { ctx.shadowColor = "transparent"; drawSignal(c, t); }
    ctx.restore();
  }
  function fmtCount() { const n = Math.floor(Math.random() * 900) + 12; return Math.random() < 0.6 ? n + "K" : (n / 100).toFixed(1) + "M"; }
  function centerFade(c) { const d = Math.abs(c.x - W / 2); const half = Math.min(400, W * 0.42); return d < half ? 0.35 + 0.65 * Math.pow(d / half, 2) : 1; }
  function drawClip(c, t) {
    if (c.kind !== "paper") return drawChaos(c, t);
    ctx.save();
    ctx.translate(c.x + Math.sin(t * 0.3 + c.sway) * 14, c.y);
    ctx.rotate(c.rot);
    ctx.globalAlpha = 0.5 * c.depth * centerFade(c);
    const w = c.w, h = c.h, x = -w / 2, y = -h / 2, p = w * 0.08, iw = w - 2 * p;
    ctx.fillStyle = "#fdfdfb"; ctx.strokeStyle = "rgba(0,0,0,0.10)"; ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(0,0,0,0.10)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.shadowColor = "transparent"; ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#1d1d1f";
    let yy = y + p;
    const P = c.paper;
    if (P.style === "black") {
      ctx.font = Math.round(w * 0.13) + "px 'UnifrakturMaguntia', 'Old English Text MT', serif";
      yy += w * 0.12; ctx.fillText(P.name, 0, yy, iw);
    } else if (P.style === "serif") {
      ctx.font = "900 " + Math.round(w * 0.105) + "px 'Playfair Display', Georgia, serif";
      yy += w * 0.11; ctx.fillText(P.name, 0, yy, iw);
    } else {
      const bs = w * 0.13, gap = w * 0.02, tw = P.name.length * bs + (P.name.length - 1) * gap;
      ctx.font = "700 " + Math.round(bs * 0.72) + "px -apple-system, Helvetica, Arial, sans-serif";
      for (let i = 0; i < P.name.length; i++) {
        const bx = -tw / 2 + i * (bs + gap);
        ctx.fillStyle = "#1d1d1f"; ctx.fillRect(bx, yy, bs, bs);
        ctx.fillStyle = "#fdfdfb"; ctx.fillText(P.name[i], bx + bs / 2, yy + bs * 0.78);
      }
      ctx.fillStyle = "#6e6e73"; ctx.font = "600 " + Math.round(w * 0.045) + "px -apple-system, Helvetica, Arial, sans-serif";
      yy += bs + w * 0.07; ctx.fillText(P.sub, 0, yy, iw);
      ctx.fillStyle = "#1d1d1f";
    }
    yy += w * 0.04;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x + p, yy, iw, 1.2); ctx.fillRect(x + p, yy + 2.5, iw, 0.6);
    yy += w * 0.1;
    ctx.textAlign = "left"; ctx.fillStyle = "#1d1d1f";
    ctx.font = "700 " + Math.round(w * 0.075) + "px 'Playfair Display', Georgia, serif";
    yy = wrapText(c.head, x + p, yy, iw, w * 0.085, 2) + w * 0.02;
    if (c.photo) { ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(x + p, yy, iw, h * 0.26); yy += h * 0.26 + w * 0.05; }
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    const colW = (iw - w * 0.05) / 2;
    for (let col = 0; col < 2; col++) for (let ly = yy; ly < y + h - p; ly += w * 0.05) ctx.fillRect(x + p + col * (colW + w * 0.05), ly, colW * (0.78 + ((Math.round(ly) * 7 + col) % 5) / 22), w * 0.02);
    if (c.stamp) {
      ctx.globalAlpha = 0.75 * c.depth;
      ctx.translate(x + w * 0.7, y + h * 0.62); ctx.rotate(-0.3);
      ctx.strokeStyle = "rgba(29,29,31,0.6)"; ctx.lineWidth = Math.max(1.5, w * 0.022);
      ctx.beginPath(); ctx.arc(0, 0, w * 0.16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(29,29,31,0.65)"; ctx.font = "700 " + Math.round(w * 0.19) + "px -apple-system, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", 0, 1);
    }
    ctx.restore();
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = W < 600 ? 8 : 15;
    while (clips.length < n) clips.push(makeClip(true));
    clips.length = n;
    buildGlobe();
  }
  resize();
  let rz = 0;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(resize, 150); });

  let last = performance.now(), t = 0, raf = 0, acc = 0;
  function step(c, dt) { c.y -= c.vy * dt; c.rot += c.vr * dt; if (c.y < -c.h) Object.assign(c, makeClip(false)); }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    if (!still && acc < 1 / 30) { raf = requestAnimationFrame(frame); return; }
    t += acc; const d = acc; acc = 0;
    ctx.clearRect(0, 0, W, H);
    clips.forEach(c => { if (c.depth < 0.72) { step(c, d); drawClip(c, t); } });
    drawGlobe(t);
    clips.forEach(c => { if (c.depth >= 0.72) { step(c, d); drawClip(c, t); } });
    if (!still) raf = requestAnimationFrame(frame);
  }
  const start = () => { last = performance.now(); raf = requestAnimationFrame(frame); };
  if (still) { const once = () => frame(performance.now()); img.addEventListener("load", () => setTimeout(once, 0)); once(); }
  else start();
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load("20px 'UnifrakturMaguntia'"), document.fonts.load("900 20px 'Playfair Display'"), document.fonts.load("700 20px 'Playfair Display'")]).then(() => { if (still) frame(performance.now()); }).catch(() => {});
  }
  document.addEventListener("visibilitychange", () => {
    if (still) return;
    if (document.hidden) cancelAnimationFrame(raf); else start();
  });
  const mb = document.getElementById("motion-btn");
  if (mb) {
    let pref = null; try { pref = localStorage.getItem("second-look-motion"); } catch (_) {}
    const sync = () => { mb.setAttribute("aria-pressed", String(still)); mb.querySelector("span").textContent = still ? "Play motion" : "Pause motion"; };
    if (pref === "paused" && !still) { still = true; cancelAnimationFrame(raf); setTimeout(() => frame(performance.now()), 50); }
    sync();
    mb.addEventListener("click", () => {
      still = !still;
      if (still) cancelAnimationFrame(raf); else start();
      try { localStorage.setItem("second-look-motion", still ? "paused" : "playing"); } catch (_) {}
      sync();
    });
  }
})();
