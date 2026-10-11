/* Second Look: drawing the result, history and input handling. */
/* ---------- Rendering ---------- */
function meter(title, value, note) {
  const m = el("div", "meter");
  const top = el("div", "meter-top");
  top.append(el("span", "label", title), el("span", "pct", value + "%"));
  const track = el("div", "track"); track.setAttribute("role", "img"); track.setAttribute("aria-label", title + ": " + value + " percent");
  const bar = el("div", "bar"); bar.style.width = value + "%"; track.append(bar);
  const ticks = el("div", "ticks"); ["0", "25", "50", "75", "100"].forEach(t => ticks.append(el("span", null, t)));
  m.append(top, track, ticks, el("div", "band", bandFor(value) + " · " + note));
  return m;
}
function pillClass(a) {
  a = String(a || "").toLowerCase();
  if (a.includes("false") || a.includes("mislead")) return "false";
  if (a.includes("true") || a.includes("accurate")) return "true";
  if (a.includes("opinion")) return "opinion";
  return "unverified";
}
function section(title) { const s = el("div", "section"); s.append(el("h2", "label", title)); return s; }
function verdictEl(t) { const h = el("h2", "verdict", t); h.id = "verdict"; h.tabIndex = -1; return h; }

function annotate(text, passages) {
  const box = el("div", "annotated");
  const spans = [];
  (passages || []).forEach(p => {
    const q = String(p.quote || "").trim(); if (q.length < 4) return;
    let i = text.indexOf(q);
    if (i < 0) i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return;
    if (spans.some(s => i < s.end && i + q.length > s.start)) return;
    spans.push({ start: i, end: i + q.length, kind: p.kind === "ai" ? "ai" : "mis", reason: p.reason || "" });
  });
  spans.sort((a, b) => a.start - b.start);
  let pos = 0;
  spans.forEach(s => {
    box.append(document.createTextNode(text.slice(pos, s.start)));
    const m = el("mark", s.kind, text.slice(s.start, s.end)); m.title = s.reason; box.append(m); box.append(el("span", "sr-only", " (flagged as " + (s.kind === "ai" ? "sounding AI-written" : "false or misleading") + ": " + s.reason + ") "));
    pos = s.end;
  });
  box.append(document.createTextNode(text.slice(pos)));
  return { box, count: spans.length, spans };
}

function fold(title, count, open) {
  const d = el("details", "fold"); if (open) d.open = true;
  const s = el("summary"); s.append(el("span", null, title));
  if (count != null) s.append(el("span", "count", String(count)));
  const b = el("div", "fold-body"); d.append(s, b);
  return { d, b };
}

// Older saved checks used "signals" and "summary"; turn them into the newer shape.
function argsOf(r) {
  if (Array.isArray(r.arguments) && r.arguments.length) return r.arguments;
  return (r.signals || []).filter(s => s.type !== "reassuring").map(s => ({ point: s.text, weight: "moderate", about: "fake" }));
}
function countersOf(r) {
  if (Array.isArray(r.counterpoints)) return r.counterpoints;
  return (r.signals || []).filter(s => s.type === "reassuring").map(s => ({ point: s.text }));
}

function render(c, isExample) {
  const r = c.result;
  $("report-tag").textContent = isExample ? "Example result" : new Date(c.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  $("save-md").hidden = isExample || !downloads;
  const body = $("report-body"); body.replaceChildren();
  const ai = clamp(r.ai_generated), mis = clamp(r.misleading);

  /* 1. Our take */
  const take = el("div", "take");
  const top = el("div", "take-top");
  top.append(el("span", "label", "Our take"), verdictEl(r.verdict || "Result"));
  const bl = r.bottom_line || r.summary;
  if (bl) top.append(el("p", "bottom-line", bl));
  const listenRow = el("div", "listen-row");
  top.append(listenRow);
  take.append(top);
  const narr = [];
  narr.push({ el: take, label: "Our take", text: "Here's what we found. " + (r.verdict || "") + ". " + (bl || "") });
  const scores = el("div", "scores");
  scores.append(meter("Likely fake or misleading", mis, "content or framing"), meter("Likely AI-generated", ai, "made or altered by AI"));
  take.append(scores);
  const conf = String(r.confidence || "low").toLowerCase();
  const n = conf === "high" ? 3 : conf === "medium" ? 2 : 1;
  const cw = el("div", "conf"); cw.append(el("span", "label", "How sure we are"));
  const dots = el("span", "dots"); for (let i = 0; i < 3; i++) dots.append(el("i", i < n ? "on" : ""));
  cw.append(dots, el("span", "band", conf.charAt(0).toUpperCase() + conf.slice(1) + (c.deep ? " · deep analysis" : "") + (c.learnedFrom ? " · learned from " + c.learnedFrom + " verified check" + (c.learnedFrom > 1 ? "s" : "") : "")));
  take.append(cw);
  body.append(take);
  narr.push({ el: scores, label: "The scores", text: "We think there's about a " + mis + " percent chance this is fake or misleading, and a " + ai + " percent chance it was made with AI. We're " + (conf === "high" ? "fairly sure" : conf === "medium" ? "somewhat sure" : "not very sure") + " about this." });

  /* 2. Why we think so */
  const args = argsOf(r);
  if (args.length) {
    const s = section("Why we think so");
    const ol = el("ol", "args");
    const ORD = ["First", "Second", "Third", "Fourth", "Fifth"];
    args.forEach((a, ai_) => {
      const w = ["strong", "moderate", "weak"].includes(a.weight) ? a.weight : "moderate";
      const li = el("li", "arg " + w);
      const h = el("div", "arg-head");
      h.append(el("span", "arg-num", String(ai_ + 1)), el("h3", "arg-point", a.point || ""));
      narr.push({ el: li, label: "Why we think so · " + (ai_ + 1) + " of " + args.length, text: (ai_ === 0 ? "Let me walk you through why. " : "") + (ORD[ai_] || "Next") + ": " + (a.point || "") + ". " + (a.evidence ? "What we saw: " + a.evidence.replace(/[“”"]/g, "") + ". " : "") + (a.reasoning || "") });
      const tags = el("span", "arg-tags");
      tags.append(el("span", "wt " + w, w === "strong" ? "Strong sign" : w === "weak" ? "Weak sign" : "Moderate sign"));
      tags.append(el("span", "about-tag", a.about === "ai" ? "AI clue" : a.tactic || "Fake clue"));
      h.append(tags); li.append(h);
      if (a.evidence) { const ev = el("p", "evidence"); ev.append(el("span", "evidence-label", "What we saw"), document.createTextNode(a.evidence)); li.append(ev); }
      if (a.reasoning) { const rs = el("p", "reason"); rs.append(el("b", null, "Why it matters"), document.createTextNode(a.reasoning)); li.append(rs); }
      ol.append(li);
    });
    s.append(ol); body.append(s);
  }

  /* 3. On the other hand */
  const counters = countersOf(r);
  if (counters.length) {
    const s = section("On the other hand");
    const ul = el("ul", "counter");
    counters.forEach(cp => {
      const li = el("li"); const t = el("span");
      t.append(el("b", null, cp.point || ""));
      if (cp.reasoning) t.append(document.createTextNode(" " + cp.reasoning));
      li.append(el("span", "mark green", "✓"), t); ul.append(li);
    });
    s.append(ul); body.append(s);
    narr.push({ el: ul, label: "On the other hand", text: "On the other hand. " + counters.map(cp => (cp.point || "") + ". " + (cp.reasoning || "")).join(" ") });
  }

  if (!isExample) body.append(feedbackCard(c));

  /* 4. Details, folded away */
  const folds = el("div", "folds");

  if (c.mode === "text" && c.input) {
    const { box, count } = annotate(c.input, r.passages);
    const f = fold("See it in the text", count || null);
    if (count) {
      const lg = el("div", "legend");
      const a = el("span"); a.append(el("i", "sw ai"), document.createTextNode("Sounds AI-written"));
      const b = el("span"); b.append(el("i", "sw mis"), document.createTextNode("False or misleading"));
      lg.append(a, b);
      f.b.append(lg, box, el("p", "empty", "Tap or hover a highlight to see why it was flagged."));
    } else f.b.append(el("p", "empty", "No single passage stood out; the assessment is based on the text as a whole."), box);
    folds.append(f.d);
  }

  if (Array.isArray(r.claims) && r.claims.length) {
    const f = fold("Claims to check", r.claims.length);
    const wrap = el("div", "table-wrap"); const t = el("table", "claims");
    const thead = el("thead"); const hr = el("tr"); ["Claim", "Assessment", "Why", "Check"].forEach(h => hr.append(el("th", null, h))); thead.append(hr);
    const tb = el("tbody");
    r.claims.forEach(cl => {
      const tr = el("tr");
      const a = el("td"); a.append(el("span", "pill " + pillClass(cl.assessment), cl.assessment || "unverified"));
      const q = encodeURIComponent(cl.search || cl.claim || "");
      const links = el("td");
      const g = el("a", null, "News"); g.href = "https://news.google.com/search?q=" + q; g.target = "_blank"; g.rel = "noopener";
      const fc = el("a", null, "Fact checks"); fc.href = "https://toolbox.google.com/factcheck/explorer/search/" + q; fc.target = "_blank"; fc.rel = "noopener";
      links.append(g, document.createTextNode(" · "), fc);
      tr.append(el("td", null, cl.claim), a, el("td", null, cl.note || ""), links);
      tb.append(tr);
    });
    t.append(thead, tb); wrap.append(t); f.b.append(wrap); folds.append(f.d);
  }

  if (Array.isArray(r.check_next) && r.check_next.length) {
    const f = fold("Check it yourself", r.check_next.length + (c.mode !== "text" ? 1 : 0));
    const ol = el("ol", "checks"); r.check_next.forEach(x => ol.append(el("li", null, x)));
    if (c.mode !== "text") {
      const li = el("li"); li.append(document.createTextNode("Reverse image search: "));
      [["Google Lens", "https://lens.google.com/"], ["TinEye", "https://tineye.com/"], ["Content Credentials", "https://contentcredentials.org/verify"]].forEach(([nm, u], i) => {
        if (i) li.append(document.createTextNode(" · ")); const a = el("a", null, nm); a.href = u; a.target = "_blank"; a.rel = "noopener"; li.append(a);
      });
      ol.append(li);
    }
    f.b.append(ol); folds.append(f.d);
  }

  if (c.stats) {
    const f = fold("Writing measurements");
    const g = el("div", "stats");
    const st = c.stats;
    [[st.variation + "%", "sentence-length variation (AI text tends to be low)"], [st.diversity + "%", "word variety"], [st.caps + st.exclaim, "all-caps words and exclamation marks"], [st.urgent, "urgency or sensational phrases"], [st.sourceCues, "source or attribution cues"], [st.words, "words"]]
      .forEach(([v, k]) => { const d = el("div", "stat"); d.append(el("span", "v", String(v)), el("span", "k", k)); g.append(d); });
    f.b.append(g); folds.append(f.d);
  }

  if (c.forensics && c.forensics.length) {
    const flagged = c.forensics.filter(x => x.tone === "ai").length;
    const f = fold("Hidden file data", flagged ? flagged + " AI trace" + (flagged > 1 ? "s" : "") : null);
    const ul = el("ul", "meta");
    c.forensics.forEach(nn => {
      const li = el("li");
      const sym = nn.tone === "ai" ? ["red", "!"] : nn.tone === "camera" ? ["green", "✓"] : nn.tone === "edit" ? ["info", "✎"] : ["info", "i"];
      li.append(el("span", "mark " + sym[0], sym[1]), el("span", "k", nn.k), el("span", "v", nn.v));
      ul.append(li);
    });
    f.b.append(ul); folds.append(f.d);
  }

  if (folds.childElementCount) body.append(folds);
  const fineEl = el("p", "fine", "This is an estimate, not proof. AI detectors make mistakes in both directions, and Claude cannot check today’s news during a check.");
  body.append(fineEl);
  narr.push({ el: fineEl, label: "Before you share", text: "Just remember, this is our best estimate, not proof. If you can, check it with a source you trust before sharing it. Thanks for taking a second look." });
  const mins = setNarration(narr);
  const words = narr.reduce((n, it) => n + String(it.text).split(/\s+/).length, 0);
  listenRow.append(el("span", null, Math.max(1, Math.round(words / 230)) + " min read"));
  if (TTS) {
    const b = el("button", "listen-btn"); b.type = "button";
    const ic = el("span", "ic"); ic.innerHTML = PLAY_ICON; b.append(ic, el("span", "lb-text", "Listen"));
    b.addEventListener("click", () => player.playing ? pauseListening() : playListening());
    listenRow.prepend(b);
    listenRow.append(el("span", null, "· " + mins + " min listen"));
  }
}

/* ---------- History (this browser only) ---------- */
const HKEY = "second-look-history-v1";
function loadHist() { try { return JSON.parse(localStorage.getItem(HKEY) || "[]"); } catch (_) { return []; } }
function saveHist(h) { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 25))); } catch (_) {} }
function renderHist() {
  const h = loadHist(); const ul = $("hist"); ul.replaceChildren();
  $("hist-empty").hidden = h.length > 0; $("clear-hist").disabled = !h.length; $("hist-count").textContent = String(h.length);
  h.forEach((c, i) => {
    const li = el("li"); const b = el("button");
    const title = c.mode === "text" ? (c.input || "").slice(0, 90) : (c.fileName || c.mode);
    b.append(el("span", "h-title", title || "Untitled"),
      el("span", "h-nums", "AI " + clamp(c.result.ai_generated) + "% · Fake " + clamp(c.result.misleading) + "%"),
      el("span", "h-sub", ({ text: "Text", image: "Picture", video: "Video" }[c.mode] || "") + " · " + new Date(c.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })));
    b.addEventListener("click", () => openCase(c));
    li.append(b); ul.append(li);
  });
}
function openCase(c) {
  current = c; chatTurns = []; $("chat").replaceChildren();
  render(c, false); $("followup").hidden = !sample;
  $("report").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

/* ---------- Input handling ---------- */
function setMode(m) {
  mode = m; file = null; $("preview").replaceChildren(); $("file-in").value = "";
  document.querySelectorAll(".tab").forEach(t => { const on = t.dataset.mode === m; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
  $("pane-text").hidden = m !== "text";
  $("pane-media").hidden = m === "text";
  $("frames-opt").hidden = m !== "video";
  $("src-wrap").hidden = m !== "text";
  $("ctx-wrap").hidden = m === "text";
  if (m === "image") {
    $("drop-title").textContent = "Drop a picture here or tap to choose one";
    $("drop-hint").textContent = "JPEG, PNG, WebP or GIF · metadata is read in your browser";
    $("file-in").accept = imageLimits ? imageLimits.mediaTypes.join(",") : "image/*";
  } else if (m === "video") {
    $("drop-title").textContent = "Drop a video clip here or tap to choose one";
    $("drop-hint").textContent = "MP4, WebM or MOV · still frames are checked, not sound";
    $("file-in").accept = "video/*";
  }
  setStatus("");
}
function takeFile(f) {
  if (!f) return;
  const want = mode === "video" ? "video/" : "image/";
  if (!f.type.startsWith(want)) { setStatus(mode === "video" ? "That file isn’t a video. Choose an MP4, WebM or MOV file." : "That file isn’t a picture. Choose a JPEG, PNG, WebP or GIF.", true); return; }
  file = f; setStatus("");
  const pv = $("preview"); pv.replaceChildren();
  if (mode === "image") { const img = el("img"); img.alt = "Picture to check"; img.src = URL.createObjectURL(f); pv.append(img); }
  else pv.append(el("span", "mono", f.name + " · " + (f.size / 1048576).toFixed(1) + " MB"));
}
async function videoFrames(f, count) {
  const url = URL.createObjectURL(f);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("decode")); });
  const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
  const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
  const ctx = c.getContext("2d");
  const out = [];
  const pv = $("preview"); pv.replaceChildren();
  for (let i = 0; i < count; i++) {
    const t = dur * (i + 0.5) / count;
    await new Promise((res) => { v.onseeked = res; v.currentTime = t; });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const b = await new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
    if (b) { out.push(b); const img = el("img"); img.alt = "Frame at " + t.toFixed(1) + " seconds"; img.src = URL.createObjectURL(b); pv.append(img); }
  }
  URL.revokeObjectURL(url);
  return { frames: out, duration: dur, size: v.videoWidth + " × " + v.videoHeight };
}
