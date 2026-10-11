/* Second Look: the prompts, running a check, follow-up chat and report export. */
/* ---------- Analysis ---------- */
const FORMAT = `Reply with only one JSON object in this shape:
{"ai_generated": 0-100 integer (how likely the content was created or substantially altered by AI),
 "misleading": 0-100 integer (how likely the content is false, fabricated, or misleading as presented),
 "confidence": "low" | "medium" | "high",
 "verdict": "2-5 words, e.g. Probably fake / Likely real / Real photo, false caption / Likely AI-generated / Can't tell yet",
 "bottom_line": "1-2 sentences, max 40 words, the core reason, said the way you'd explain it to a friend",
 "tactics": ["short name of a manipulation tactic present, e.g. Clickbait, False context, Fake quote, Emotional language, Urgency, No source, Cherry-picked data, Impersonation, Share bait, Conspiracy framing"] (0-5 items, only ones actually present),
 "arguments": [{"point": "the argument as a short headline, max 10 words",
                "about": "fake" | "ai",
                "weight": "strong" | "moderate" | "weak" (how much this alone should move someone),
                "tactic": "optional manipulation tactic name, or omit",
                "evidence": "the specific thing in the content that shows it: an exact short quote in “curly quotes”, or a precise visual observation with location, e.g. 'left hand has six fingers'",
                "reasoning": "2-3 plain sentences, max 60 words: WHY this points to fake or AI. Explain the logic and what real news or real photos would look like instead. No jargon."}]
              (2-4 items, strongest first; these are the heart of the answer, make each one a real argument, not a label),
 "counterpoints": [{"point": "short headline", "reasoning": "1-2 sentences: evidence pointing the other way or why it might be genuine"}] (0-2 items; include when honest),
 "passages": [{"quote": "EXACT substring copied from the text, 4-25 words", "kind": "ai" | "misleading", "reason": "one short reason"}] (0-6 items; text only, empty for images),
 "claims": [{"claim": "a checkable claim", "assessment": "likely true" | "likely false" | "unverified" | "opinion", "note": "one short reason", "search": "3-8 word search query to verify it"}] (0-5 items),
 "check_next": ["concrete step to confirm"] (2-4 items)}
You cannot browse the web. For events you cannot know about, mark claims "unverified" rather than guessing, and lower confidence. Be calibrated: do not give extreme numbers without strong evidence. Treat the measured statistics and file metadata as supporting evidence, not proof: metadata is often stripped by social media, and it can be faked. Write for a general audience.`;

function errorCopy(e) {
  switch (e && e.code) {
    case "not_granted": case "sampling_disabled": case "not_declared": case "capability_disabled": case "capability_removed":
      return "Checking needs permission to use Claude. Allow it from the artifact’s permissions menu, then reload.";
    case "rate_limited": return "Too many checks in a short time. Wait a minute and try again.";
    case "bad_key": return "Your API key was rejected. Choose Change API key and paste a working key.";
    case "no_credit": return "Your Anthropic account is out of credit. Add credit in the Anthropic Console, then try again.";
    case "session_expired": return "Your Claude session expired. Sign in again, then try once more.";
    case "image_rejected": return "That file couldn’t be read. Try a different picture or a shorter clip.";
    case "images_unavailable": return "Picture checks aren’t available in this view. Text checks still work.";
    case "prompt_too_large": return "That text is too long. Paste a shorter excerpt.";
    case "refused": return "Claude declined to analyze this content.";
    case "invalid_json": return "The answer came back in the wrong format. Try again.";
    default: return "Something went wrong while checking. Try again.";
  }
}

async function run() {
  if (!sample) {
    if (standalone) { $("keypanel").hidden = false; $("key-in").focus(); setStatus("Connect your Claude API key first.", true); }
    else setStatus("Checking only works when the page is opened on claude.ai while signed in.", true);
    return;
  }
  const deep = $("deep").checked;
  const c = { mode, date: Date.now(), deep };
  let prompt, images;
  try {
    if (mode === "text") {
      const t = $("text-in").value.trim();
      if (t.length < 20) { setStatus("Paste at least a sentence or two to check.", true); return; }
      c.input = t.slice(0, 20000);
      c.stats = textStats(c.input);
      const src = $("src-in").value.trim();
      prompt = "You are a careful fact-checker and AI-content analyst. Assess the text below for (1) whether it was likely written by an AI model and (2) whether it is likely fake news, false, or misleading. Quote flagged passages exactly as they appear.\n\n" + FORMAT +
        "\n\nMEASURED TEXT STATISTICS (computed by the page):\n" + statsText(c.stats) +
        (src ? "\n\nWHERE THE USER SAW IT:\n" + src.slice(0, 500) : "") +
        "\n\nTEXT TO ASSESS:\n\"\"\"\n" + c.input + "\n\"\"\"";
    } else {
      if (!imageLimits) { setStatus("Picture and video checks aren’t available in this view. Text checks still work.", true); return; }
      if (!file) { setStatus(mode === "video" ? "Choose a video clip first." : "Choose a picture first.", true); return; }
      c.fileName = file.name;
      const ctxText = $("ctx-in").value.trim();
      c.context = ctxText;
      setStatus("Reading file metadata…");
      c.forensics = await inspectFile(file);
      if (mode === "image") {
        images = [file];
        prompt = "You are a careful image forensics analyst and fact-checker. Look at the attached picture and assess (1) whether it was likely generated or edited with AI (look for distorted hands and fingers, garbled or nonsensical text, inconsistent lighting and shadows, overly smooth or waxy textures, warped backgrounds, mismatched reflections, odd jewelry or accessories) and (2) whether it, together with its caption, is likely being used to spread false or misleading news (e.g. a real photo with a false caption or from a different event).";
      } else {
        setStatus("Taking frames from the video…");
        const want = Number($("frames").value) || 6;
        const n = Math.max(1, Math.min(want, imageLimits.maxCount || 1));
        const { frames, duration, size } = await videoFrames(file, n);
        if (!frames.length) { setStatus("Couldn’t read frames from that video. Try an MP4 file.", true); return; }
        c.forensics.push({ tone: "info", k: "Video", v: duration.toFixed(1) + " s · " + size + " · " + frames.length + " frames checked" });
        images = frames;
        prompt = "You are a careful video forensics analyst and fact-checker. The attached images are " + frames.length + " still frames taken evenly from a " + duration.toFixed(1) + "-second video, in order. Assess (1) whether the video was likely AI-generated or a deepfake (look for face warping or blurring at edges, details that change between frames, unnatural skin, teeth or eyes, garbled text, inconsistent backgrounds, physics that don't add up) and (2) whether it, together with its caption, is likely being used to spread false or misleading news. You only see stills, not audio or motion; reflect that in your confidence.";
      }
      prompt += "\n\n" + FORMAT + "\n\nFILE METADATA FOUND BY THE PAGE:\n" + notesText(c.forensics) +
        (ctxText ? "\n\nCAPTION OR CLAIM THAT CAME WITH IT:\n\"\"\"\n" + ctxText.slice(0, 4000) + "\n\"\"\"" : "\n\nNo caption was provided.");
    }
  } catch (e) {
    setStatus("Couldn’t read that file in this browser. Try a different format.", true); return;
  }

  const lessons = lessonsFor(c);
  if (lessons.text) { prompt += "\n\n" + lessons.text; c.learnedFrom = lessons.count; }

  ctl = new AbortController();
  $("go").disabled = true; $("stop").hidden = false;
  setStatus(deep ? "Running deep analysis… this can take a minute or two." : "Analyzing… this can take up to a minute.");
  try {
    const opts = { signal: ctl.signal };
    if (images) opts.images = images;
    if (deep) opts.modelTier = "complex";
    const r = await sample.json(prompt, opts);
    if (!r || typeof r !== "object") throw { code: "invalid_json" };
    c.result = r;
    const h = loadHist(); h.unshift(c); saveHist(h); renderHist();
    openCase(c);
    setStatus("Done.");
    announce("Result ready. " + (r.verdict || "") + ". " + clamp(r.misleading) + " percent likely fake or misleading, " + clamp(r.ai_generated) + " percent likely AI-generated. " + (r.bottom_line || ""));
    setTimeout(() => { const v = $("verdict"); if (v) v.focus({ preventScroll: true }); }, 400);
  } catch (e) {
    if (e && e.code === "cancelled") setStatus("Stopped.");
    else setStatus(errorCopy(e), true);
  } finally {
    $("go").disabled = false; $("stop").hidden = true;
  }
}

/* ---------- Follow-up chat ---------- */
function caseContext(c) {
  let s = "You previously analyzed some content for AI generation and fake news. Answer the user's follow-up questions about it in plain language, briefly (under 150 words unless asked for more). You cannot browse the web; say so when it matters.\n\n";
  if (c.mode === "text") s += "THE TEXT:\n\"\"\"\n" + (c.input || "").slice(0, 12000) + "\n\"\"\"\n\n";
  else s += "THE CONTENT: a " + c.mode + (c.context ? " with caption: " + c.context.slice(0, 2000) : "") + ". You can no longer see it; rely on your earlier analysis and the metadata.\nMETADATA:\n" + notesText(c.forensics || []) + "\n\n";
  return s + "YOUR ANALYSIS (JSON):\n" + JSON.stringify(c.result).slice(0, 12000);
}
async function ask(e) {
  e.preventDefault();
  const q = $("ask-in").value.trim(); if (!q || !current || !sample) return;
  $("ask-in").value = ""; $("ask-go").disabled = true;
  $("chat").append(el("div", "msg q", q));
  const a = el("div", "msg a", "Thinking…"); $("chat").append(a);
  chatTurns.push({ role: "user", content: q });
  const turns = [{ role: "user", content: caseContext(current) }, { role: "assistant", content: "Understood. What would you like to know?" }, ...chatTurns.slice(-10)];
  try {
    const { text } = await sample(turns, { cache: false, onText: ({ text }) => { a.textContent = text; } });
    chatTurns.push({ role: "assistant", content: text });
  } catch (err) {
    chatTurns.pop();
    a.textContent = (err && err.text) || errorCopy(err);
  } finally { $("ask-go").disabled = false; }
}

/* ---------- Report export ---------- */
function reportMarkdown(c) {
  const r = c.result, L = [];
  L.push("# Second Look report", "", "Checked: " + new Date(c.date).toLocaleString() + " · " + ({ text: "Text", image: "Picture", video: "Video" }[c.mode]) + (c.deep ? " · deep analysis" : ""), "");
  L.push("## " + (r.verdict || "Result"), "", r.bottom_line || r.summary || "", "");
  L.push("- Likely false or misleading: **" + clamp(r.misleading) + "%**", "- Likely AI-generated: **" + clamp(r.ai_generated) + "%**", "- Confidence: " + (r.confidence || "low"), "");
  if (r.tactics?.length) L.push("**Tactics:** " + r.tactics.join(", "), "");
  const args = argsOf(r);
  if (args.length) { L.push("## Why we think so", ""); args.forEach((a, i) => { L.push("### " + (i + 1) + ". " + a.point + " _(" + (a.weight || "moderate") + " sign)_"); if (a.evidence) L.push("", "**What we saw:** " + a.evidence); if (a.reasoning) L.push("", "**Why it matters:** " + a.reasoning); L.push(""); }); }
  const cps = countersOf(r);
  if (cps.length) { L.push("## On the other hand"); cps.forEach(cp => L.push("- **" + cp.point + "**" + (cp.reasoning ? " " + cp.reasoning : ""))); L.push(""); }
  if (r.passages?.length) { L.push("## Flagged passages"); r.passages.forEach(p => L.push("- > " + p.quote + "  \n  " + (p.kind === "ai" ? "AI-sounding" : "Misleading") + ": " + p.reason)); L.push(""); }
  if (c.forensics?.length) { L.push("## File forensics"); c.forensics.forEach(n => L.push("- **" + n.k + ":** " + n.v)); L.push(""); }
  if (r.claims?.length) { L.push("## Claims", "", "| Claim | Assessment | Why |", "|---|---|---|"); r.claims.forEach(x => L.push("| " + [x.claim, x.assessment, x.note].map(v => String(v || "").replace(/\|/g, "/")).join(" | ") + " |")); L.push(""); }
  if (r.check_next?.length) { L.push("## How to confirm"); r.check_next.forEach((x, i) => L.push((i + 1) + ". " + x)); L.push(""); }
  if (c.mode === "text") L.push("## Original text", "", "```", c.input || "", "```", "");
  L.push("_This is an estimate, not proof. AI detectors make mistakes in both directions._");
  return L.join("\n");
}
async function saveReport() {
  if (!downloads || !current) return;
  try { await downloads.save({ filename: "second-look-report-" + new Date(current.date).toISOString().slice(0, 10) + ".md", data: reportMarkdown(current) }); setStatus("Report saved."); }
  catch (e) { if (e && e.code !== "declined") setStatus("The report couldn’t be saved here.", true); }
}
