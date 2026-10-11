/* Second Look: text measurements and file metadata checks, run in the browser. */
/* ---------- Local text fingerprint ---------- */
const URGENT = ["breaking","urgent","shocking","share","banned","exposed","they don't want","wake up","before it's deleted","100%","must see","you won't believe","secret","cover-up","miracle","act now","outrage","destroyed"];
function textStats(t) {
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 2);
  const words = (t.match(/[\p{L}\p{N}']+/gu) || []);
  const lens = sentences.map(s => (s.match(/[\p{L}\p{N}']+/gu) || []).length);
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const sd = lens.length > 1 ? Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length) : 0;
  const sampleW = words.slice(0, 400).map(w => w.toLowerCase());
  const lower = t.toLowerCase();
  return {
    words: words.length,
    sentences: sentences.length,
    avgSentence: Math.round(mean * 10) / 10,
    variation: mean ? Math.round((sd / mean) * 100) : 0,
    diversity: sampleW.length ? Math.round(new Set(sampleW).size / sampleW.length * 100) : 0,
    caps: words.filter(w => w.length > 2 && w === w.toUpperCase() && /\p{L}/u.test(w)).length,
    exclaim: (t.match(/!/g) || []).length,
    urgent: URGENT.filter(k => lower.includes(k)).length,
    sourceCues: (lower.match(/according to|said|reported|study|https?:\/\/|\bsource\b|“|"/g) || []).length
  };
}
function statsText(s) {
  return `Words: ${s.words}; sentences: ${s.sentences}; average sentence length: ${s.avgSentence} words; sentence-length variation: ${s.variation}% (human writing is often above ~50%, AI text is often more uniform); word variety: ${s.diversity}% unique in first 400 words; ALL-CAPS words: ${s.caps}; exclamation marks: ${s.exclaim}; urgency/sensational phrases: ${s.urgent}; source/attribution cues: ${s.sourceCues}.`;
}

/* ---------- Local file forensics ---------- */
const GENERATORS = [
  ["Stable Diffusion", /stable[\s_-]?diffusion|sd_xl|sdxl|automatic1111|negative prompt:/i],
  ["ComfyUI", /comfyui|"class_type"/i],
  ["Midjourney", /midjourney/i],
  ["DALL·E / OpenAI", /dall[\s·.-]?e|openai/i],
  ["Adobe Firefly", /firefly/i],
  ["Google AI (Imagen/Gemini)", /imagen|gemini|synthid/i],
  ["Flux", /black forest labs|flux\.1/i],
  ["NovelAI", /novelai/i],
  ["Leonardo.ai", /leonardo\.ai/i],
  ["Runway / Sora / Pika", /runwayml|\bsora\b|pika labs/i]
];
function latin1(u8) { let s = ""; const CH = 32768; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return s; }
function readExif(dv, tiff) {
  const out = {};
  const le = dv.getUint16(tiff) === 0x4949;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  const want = { 0x010F: "Camera make", 0x0110: "Camera model", 0x0131: "Software", 0x0132: "Modified", 0x013B: "Artist", 0x9003: "Taken", 0xA434: "Lens", 0x010E: "Description" };
  const readIfd = (off, depth) => {
    if (off <= 0 || tiff + off + 2 > dv.byteLength || depth > 2) return;
    const n = u16(tiff + off);
    for (let i = 0; i < n && i < 200; i++) {
      const e = tiff + off + 2 + i * 12; if (e + 12 > dv.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (tag === 0x8769) { readIfd(u32(e + 8), depth + 1); continue; }
      if (want[tag] && type === 2) {
        const p = count <= 4 ? e + 8 : tiff + u32(e + 8);
        let s = ""; for (let k = 0; k < count - 1 && p + k < dv.byteLength && k < 200; k++) s += String.fromCharCode(dv.getUint8(p + k));
        s = s.replace(/\0/g, "").trim(); if (s) out[want[tag]] = s;
      }
    }
  };
  readIfd(u32(tiff + 4), 0);
  return out;
}
function pngText(dv, u8) {
  const out = [];
  let o = 8;
  while (o + 12 <= dv.byteLength && out.length < 30) {
    const len = dv.getUint32(o), type = String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);
    if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
      const d = u8.subarray(o + 8, o + 8 + Math.min(len, 4000));
      const z = d.indexOf(0);
      const key = latin1(d.subarray(0, z > 0 ? z : 0));
      let val = "";
      if (type === "tEXt") val = latin1(d.subarray(z + 1));
      else if (type === "iTXt" && d[z + 1] === 0) { let p = z + 3; p = d.indexOf(0, p) + 1; p = d.indexOf(0, p) + 1; try { val = new TextDecoder().decode(d.subarray(p)); } catch (_) {} }
      else val = "(compressed)";
      out.push({ key, val });
    }
    if (type === "IEND") break;
    o += 12 + len;
  }
  return out;
}
async function inspectFile(f) {
  const notes = [];   // {tone: "ai"|"edit"|"camera"|"info", k, v}
  try {
    const head = new Uint8Array(await f.slice(0, 4 * 1048576).arrayBuffer());
    const tail = f.size > 4 * 1048576 ? new Uint8Array(await f.slice(-262144).arrayBuffer()) : new Uint8Array(0);
    const dv = new DataView(head.buffer);
    const text = latin1(head) + latin1(tail);

    if (head[0] === 0xFF && head[1] === 0xD8) {
      let o = 2;
      while (o + 4 < head.length && head[o] === 0xFF) {
        const m = head[o + 1], len = dv.getUint16(o + 2);
        if (m === 0xE1 && latin1(head.subarray(o + 4, o + 10)) === "Exif\0\0") {
          const ex = readExif(dv, o + 10);
          Object.entries(ex).forEach(([k, v]) => notes.push({ tone: k.startsWith("Camera") || k === "Lens" || k === "Taken" ? "camera" : "info", k, v }));
          break;
        }
        if (m === 0xDA) break;
        o += 2 + len;
      }
    } else if (head[0] === 0x89 && head[1] === 0x50) {
      pngText(dv, head).forEach(({ key, val }) => {
        const k = key.toLowerCase();
        const ai = ["parameters", "prompt", "workflow", "invokeai_metadata", "sd-metadata", "dream"].includes(k);
        notes.push({ tone: ai ? "ai" : "info", k: "PNG “" + key + "”", v: val.slice(0, 160) + (val.length > 160 ? "…" : "") });
      });
    }

    const xmp = text.match(/<x:xmpmeta[\s\S]{0,20000}?<\/x:xmpmeta>/);
    if (xmp) {
      const ct = xmp[0].match(/CreatorTool(?:="|>)([^"<]+)/); if (ct) notes.push({ tone: "edit", k: "Created with", v: ct[1] });
      const dst = xmp[0].match(/DigitalSourceType(?:="|>)[^"<]*?([A-Za-z]+)["<]/);
      if (dst) {
        const v = dst[1];
        const ai = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia/i.test(v);
        notes.push({ tone: ai ? "ai" : "info", k: "Source type", v: ai ? v + " (marked as AI-generated)" : v });
      }
      if (/photoshop:History|xmpMM:History/.test(xmp[0])) notes.push({ tone: "edit", k: "Edit history", v: "File records editing steps" });
    }
    if (/c2pa|jumbf|\bjumb\b|contentauth/i.test(text)) notes.push({ tone: "info", k: "Content Credentials", v: "C2PA provenance data present. Check it at contentcredentials.org/verify" });
    if (/trainedAlgorithmicMedia/.test(text) && !notes.some(n => n.tone === "ai" && n.k === "Source type")) notes.push({ tone: "ai", k: "AI label", v: "File is labelled trainedAlgorithmicMedia (AI-generated)" });
    const seen = new Set();
    GENERATORS.forEach(([name, re]) => { if (re.test(text) && !seen.has(name)) { seen.add(name); notes.push({ tone: "ai", k: "Generator trace", v: name + " signature found in file data" }); } });

    if (f.type.startsWith("image/")) {
      const dims = await new Promise((res) => { const i = new Image(); const u = URL.createObjectURL(f); i.onload = () => { res([i.naturalWidth, i.naturalHeight]); URL.revokeObjectURL(u); }; i.onerror = () => res(null); i.src = u; });
      if (dims) {
        const common = [512, 768, 1024, 1536, 2048];
        const square = dims[0] === dims[1];
        const aiSize = common.includes(dims[0]) && common.includes(dims[1]);
        notes.push({ tone: aiSize ? "ai" : "info", k: "Dimensions", v: dims[0] + " × " + dims[1] + (aiSize ? " (a size AI generators often output)" : square ? " (square)" : "") });
      }
    }
    if (!notes.some(n => n.tone === "camera" || n.tone === "ai" || n.tone === "edit" || n.k === "Content Credentials")) {
      notes.push({ tone: "info", k: "Metadata", v: "None found. Common for screenshots and files from social media, which strip it. Not evidence either way." });
    }
  } catch (_) {
    notes.push({ tone: "info", k: "Metadata", v: "Could not read this file’s metadata." });
  }
  notes.unshift({ tone: "info", k: "File", v: (f.type || "unknown type") + " · " + (f.size / 1048576).toFixed(2) + " MB" });
  return notes;
}
function notesText(notes) { return notes.map(n => `- ${n.k}: ${n.v}`).join("\n"); }
