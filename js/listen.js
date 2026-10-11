/* Second Look: read the result aloud with captions, plus the reading progress line. */
const PLAY_ICON = '<svg class="play-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg><svg class="pause-i" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>';
/* ---------- Listen: read the result aloud ---------- */
const TTS = ("speechSynthesis" in window) && typeof SpeechSynthesisUtterance !== "undefined";
const player = { queue: [], idx: 0, playing: false, rate: 0.95, token: 0, voice: null, lastEl: null };
const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy|Deranged|Hysterical|Pipe Organ)\b/i;
function voiceScore(v) {
  if (!/^en(-|_|$)/i.test(v.lang) || NOVELTY.test(v.name)) return -1;
  let s = 0;
  if (/premium|enhanced|natural|neural|online/i.test(v.name)) s += 100;
  if (/\b(Ava|Zoe|Evan|Nathan|Allison|Susan|Serena|Jamie|Aria|Jenny|Guy|Libby|Sonia|Ryan|Emma|Andrew|Brian|Siri)\b/i.test(v.name)) s += 60;
  if (/google/i.test(v.name)) s += 45;
  if (/\b(Samantha|Daniel|Karen|Moira|Tessa)\b/i.test(v.name)) s += 25;
  if (/en[-_](US|GB)/i.test(v.lang)) s += 10;
  return s;
}
function rankedVoices() { if (!TTS) return []; return speechSynthesis.getVoices().map(v => [v, voiceScore(v)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).map(x => x[0]); }
function pickVoice() {
  const vs = rankedVoices();
  let saved = null; try { saved = localStorage.getItem("second-look-voice"); } catch (_) {}
  return vs.find(v => v.name === saved) || vs[0] || null;
}
function fillVoices() {
  const sel = $("pl-voice"); if (!sel) return;
  const vs = rankedVoices().slice(0, 10);
  sel.replaceChildren(); sel.hidden = vs.length < 2;
  vs.forEach(v => { const o = document.createElement("option"); o.value = v.name; o.textContent = v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+-\s+English.*$/, "").trim() + (/premium|enhanced|natural|neural|online/i.test(v.name) ? " ★" : ""); sel.append(o); });
  if (player.voice) sel.value = player.voice.name;
}
if (TTS) { try { speechSynthesis.onvoiceschanged = () => { player.voice = pickVoice(); fillVoices(); }; player.voice = pickVoice(); setTimeout(fillVoices, 0); } catch (_) {} }
function sentences(t) { return (String(t).match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) || []).map(s => s.trim()).filter(Boolean); }
function setNarration(items) {
  stopListening();
  player.queue = [];
  items.forEach(it => sentences(it.text).forEach(s => player.queue.push({ text: s, el: it.el, label: it.label })));
  const words = player.queue.reduce((n, q) => n + q.text.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 160));
}
function speakAt(i) {
  if (!TTS) return;
  const my = ++player.token;
  try { speechSynthesis.cancel(); } catch (_) {}
  if (i >= player.queue.length) { finishListening(); return; }
  player.idx = Math.max(0, i);
  const q = player.queue[player.idx];
  const u = new SpeechSynthesisUtterance(q.text);
  if (player.voice) u.voice = player.voice;
  u.rate = player.rate; u.pitch = 1.02; u.lang = (player.voice && player.voice.lang) || "en-US";
  u.onend = () => { if (my === player.token && player.playing) speakAt(player.idx + 1); };
  u.onerror = (e) => { if (my === player.token && player.playing && e.error !== "interrupted" && e.error !== "canceled") speakAt(player.idx + 1); };
  highlight(q);
  updatePlayer();
  setTimeout(() => { if (my === player.token) speechSynthesis.speak(u); }, 40);
}
function highlight(q) {
  if (player.lastEl && player.lastEl !== q.el) player.lastEl.classList.remove("reading");
  if (q.el) {
    q.el.classList.add("reading");
    if (player.lastEl !== q.el) {
      const r = q.el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 120) q.el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }
  }
  player.lastEl = q.el;
}
function playListening() { if (!player.queue.length) return; player.playing = true; $("player").hidden = false; speakAt(player.idx); }
function pauseListening() { player.playing = false; player.token++; try { speechSynthesis.cancel(); } catch (_) {} updatePlayer(); }
function stopListening() {
  player.playing = false; player.token++; player.idx = 0;
  try { if (TTS) speechSynthesis.cancel(); } catch (_) {}
  if (player.lastEl) player.lastEl.classList.remove("reading"); player.lastEl = null;
  const p = $("player"); if (p) p.hidden = true;
  updatePlayer();
}
function finishListening() { player.playing = false; if (player.lastEl) player.lastEl.classList.remove("reading"); player.lastEl = null; player.idx = 0; updatePlayer(); $("pl-label").textContent = "Finished"; }
function updatePlayer() {
  const n = player.queue.length || 1;
  $("pl-bar").style.width = (100 * player.idx / n).toFixed(1) + "%";
  $("pl-play").setAttribute("aria-label", player.playing ? "Pause" : "Play");
  $("pl-play").classList.toggle("is-playing", player.playing);
  const q = player.queue[player.idx];
  $("pl-label").textContent = q ? q.label : "";
  $("pl-caption").textContent = q ? q.text : "";
  $("pl-track").setAttribute("aria-valuenow", String(Math.round(100 * player.idx / n)));
  document.body.classList.toggle("has-player", !$("player").hidden);
  $("pl-rate").textContent = player.rate + "×";
  const lb = document.querySelector(".listen-btn");
  if (lb) { lb.classList.toggle("is-playing", player.playing); lb.querySelector(".lb-text").textContent = player.playing ? "Pause" : "Listen"; }
}
function skipSection(dir) {
  const cur = player.queue[player.idx]; if (!cur) return;
  let i = player.idx;
  if (dir > 0) { while (i < player.queue.length && player.queue[i].el === cur.el) i++; }
  else {
    while (i > 0 && player.queue[i - 1].el === cur.el) i--;
    if (i === player.idx || player.idx - i < 1) { i--; const prevEl = player.queue[Math.max(0, i)]?.el; while (i > 0 && player.queue[i - 1].el === prevEl) i--; }
  }
  i = Math.max(0, Math.min(player.queue.length - 1, i));
  if (player.playing) speakAt(i); else { player.idx = i; highlight(player.queue[i]); updatePlayer(); }
}
$("pl-play").addEventListener("click", () => player.playing ? pauseListening() : playListening());
$("pl-back").addEventListener("click", () => skipSection(-1));
$("pl-next").addEventListener("click", () => skipSection(1));
$("pl-rate").addEventListener("click", () => { const rs = [0.95, 1.15, 1.35, 0.8]; player.rate = rs[(rs.indexOf(player.rate) + 1) % rs.length]; if (player.playing) speakAt(player.idx); else updatePlayer(); });
$("pl-close").addEventListener("click", stopListening);
$("pl-voice").addEventListener("change", (e) => { const v = rankedVoices().find(x => x.name === e.target.value); if (v) { player.voice = v; try { localStorage.setItem("second-look-voice", v.name); } catch (_) {} if (player.playing) speakAt(player.idx); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("player").hidden) { stopListening(); const b = document.querySelector(".listen-btn"); if (b) b.focus(); } });
function announce(t) { const a = $("announce"); a.textContent = ""; setTimeout(() => { a.textContent = t; }, 60); }
// Arrow keys move between tabs
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll(".tab")]; const i = tabs.indexOf(document.activeElement); if (i < 0) return;
  let j = -1;
  if (e.key === "ArrowRight") j = (i + 1) % tabs.length; else if (e.key === "ArrowLeft") j = (i + tabs.length - 1) % tabs.length; else if (e.key === "Home") j = 0; else if (e.key === "End") j = tabs.length - 1;
  if (j >= 0) { e.preventDefault(); tabs[j].focus(); setMode(tabs[j].dataset.mode); }
});
window.addEventListener("pagehide", () => { try { if (TTS) speechSynthesis.cancel(); } catch (_) {} });

/* Reading progress line */
(function () {
  const bar = $("read-progress");
  const upd = () => {
    const r = $("report").getBoundingClientRect();
    const total = r.height - window.innerHeight * 0.5;
    const done = Math.min(1, Math.max(0, (window.innerHeight * 0.5 - r.top) / Math.max(1, total)));
    bar.style.transform = "scaleX(" + done.toFixed(3) + ")";
  };
  window.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); upd();
})();
