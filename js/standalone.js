/* Second Look: running outside claude.ai with a visitor-supplied Claude API key. */
/* ---------- Standalone mode (GitHub Pages and anywhere outside claude.ai) ---------- */
// Visitors connect their own Claude API key. The key stays in their browser and is sent only to api.anthropic.com.
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm";
const MODEL = "claude-opus-5-5";
const KEYK = "second-look-api-key";
let standalone = false;

function storedKey() { try { return localStorage.getItem(KEYK) || sessionStorage.getItem(KEYK) || ""; } catch (_) { return ""; } }
function storeKey(k, remember) {
  try { localStorage.removeItem(KEYK); sessionStorage.removeItem(KEYK); (remember ? localStorage : sessionStorage).setItem(KEYK, k); } catch (_) {}
}
function forgetKey() { try { localStorage.removeItem(KEYK); sessionStorage.removeItem(KEYK); } catch (_) {} }

async function imageForApi(blob) {
  // Downscale to at most 1568px on the long side and re-encode, so every image fits the API limits.
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise(res => c.toBlob(res, "image/jpeg", 0.88));
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(out); });
    return { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
  } catch (_) { throw { code: "image_rejected" }; }
  finally { URL.revokeObjectURL(url); }
}
function parseJsonLoose(t) {
  try { return JSON.parse(t); } catch (_) {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch (_) {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {} }
  return undefined;
}
function apiError(e, signal) {
  if (signal && signal.aborted) return { code: "cancelled" };
  const s = e && e.status, msg = String((e && e.message) || "");
  if (s === 401 || s === 403) return { code: "bad_key" };
  if (s === 429) return { code: "rate_limited" };
  if (s === 413) return { code: "prompt_too_large" };
  if (s === 400 && /credit|billing|balance/i.test(msg)) return { code: "no_credit" };
  if (s === 400) return { code: "invalid_request", message: msg };
  return { code: "upstream_error" };
}
function makeApiSample(client) {
  let useFallbacks = true;
  async function once(messages, opts) {
    const base = { model: MODEL, max_tokens: 16000, output_config: { effort: opts.modelTier === "complex" ? "high" : "medium" }, messages };
    const stream = useFallbacks
      ? client.beta.messages.stream({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, { signal: opts.signal })
      : client.messages.stream(base, { signal: opts.signal });
    let text = "";
    stream.on("text", (d) => { text += d; if (opts.onText) { try { opts.onText({ text, delta: d }); } catch (_) {} } });
    return stream.finalMessage();
  }
  const f = async (input, opts = {}) => {
    let messages;
    if (typeof input === "string") {
      const parts = [];
      const imgs = opts.images ? Array.from(opts.images.length != null ? opts.images : [opts.images]) : [];
      for (const b of imgs) parts.push(await imageForApi(b));
      parts.push({ type: "text", text: input });
      messages = [{ role: "user", content: parts }];
    } else {
      messages = [];
      input.forEach(m => { const last = messages[messages.length - 1]; if (last && last.role === m.role) last.content += "\n\n" + m.content; else messages.push({ role: m.role, content: m.content }); });
    }
    let msg;
    try { msg = await once(messages, opts); }
    catch (e) {
      if (useFallbacks && e && e.status === 400 && /fallback|beta/i.test(String(e.message))) { useFallbacks = false; try { msg = await once(messages, opts); } catch (e2) { throw apiError(e2, opts.signal); } }
      else throw apiError(e, opts.signal);
    }
    if (msg.stop_reason === "refusal") throw { code: "refused" };
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    if (!text.trim()) throw { code: "empty_completion" };
    return { text, truncated: msg.stop_reason === "max_tokens", modelTierApplied: opts.modelTier || "default" };
  };
  f.json = async (input, opts = {}) => {
    const { text } = await f(input, { ...opts, onText: undefined });
    const v = parseJsonLoose(text);
    if (v === undefined) throw { code: "invalid_json", text };
    return v;
  };
  f.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 20, maxInputBytes: 20 * 1048576, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } });
  return f;
}
const localDownloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: /\.md$/.test(filename) ? "text/markdown" : "application/octet-stream" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return { status: "saved" };
  }
};

async function connectKey(key, remember, verify) {
  const msg = $("key-msg");
  msg.textContent = "Connecting…"; msg.classList.remove("err");
  try {
    const m = await import(SDK_URL);
    const Anthropic = m.default || m.Anthropic;
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
    if (verify) await client.models.retrieve(MODEL); // free call that confirms the key works
    sample = makeApiSample(client);
    imageLimits = (await sample.limits()).images;
    storeKey(key, remember);
    $("keypanel").hidden = true; $("key-change").hidden = false; $("key-in").value = "";
    msg.textContent = "";
    setStatus("Connected. Paste something and press Check it.");
    if (current) $("followup").hidden = false;
    if (mode === "image") $("file-in").accept = imageLimits.mediaTypes.join(",");
    return true;
  } catch (e) {
    const s = e && e.status;
    msg.classList.add("err");
    msg.textContent = s === 401 || s === 403 ? "That key didn’t work. Check that you copied the whole key, then try again."
      : s === 404 ? "This key can’t use the model this page needs. Try a key from a different workspace."
      : "Couldn’t reach Claude. Check your connection and try again.";
    if (s === 401 || s === 403) forgetKey();
    $("keypanel").hidden = false;
    return false;
  }
}

async function initStandalone() {
  standalone = true;
  downloads = localDownloads;
  document.body.classList.add("standalone");
  initLocalLearning();
  const k = storedKey();
  if (k) { await connectKey(k, (() => { try { return !!localStorage.getItem(KEYK); } catch (_) { return false; } })(), false); }
  else { $("keypanel").hidden = false; setStatus("Connect your Claude API key below to start checking."); }
}
$("key-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const k = $("key-in").value.trim();
  if (!/^sk-ant-/.test(k)) { $("key-msg").textContent = "Claude API keys start with sk-ant-. Copy it from the Anthropic Console."; $("key-msg").classList.add("err"); return; }
  if (await connectKey(k, $("key-remember").checked, true)) announce("Connected. You can run checks now.");
});
$("key-change").addEventListener("click", () => { $("keypanel").hidden = false; $("key-in").focus(); });
$("key-forget").addEventListener("click", () => { forgetKey(); sample = null; $("key-change").hidden = true; $("key-msg").textContent = "Key removed from this device."; $("key-msg").classList.remove("err"); setStatus("Connect your Claude API key below to start checking."); });

/* Learning without a shared database: verified checks are kept in this browser. */
const LOCAL_FB = "second-look-feedback-v1";
function initLocalLearning() {
  learn.local = true; learn.uid = "local";
  try { learn.mine = JSON.parse(localStorage.getItem(LOCAL_FB) || "[]"); } catch (_) { learn.mine = []; }
  learn.all = learn.mine.filter(x => x && x.label);
  renderTrackRecord();
}
