/* Second Look: wiring up controls and starting the page. */
/* ---------- Wire up ---------- */
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => setMode(t.dataset.mode)));
$("file-in").addEventListener("change", (e) => takeFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => takeFile(e.dataTransfer.files[0]));
$("go").addEventListener("click", run);
$("stop").addEventListener("click", () => ctl && ctl.abort());
$("ask-form").addEventListener("submit", ask);
$("save-md").addEventListener("click", saveReport);
$("clear-hist").addEventListener("click", () => { saveHist([]); try { localStorage.removeItem(HKEY); } catch (_) {} renderHist(); });

render({ mode: "text", input: EXAMPLE_TEXT, result: EXAMPLE, stats: textStats(EXAMPLE_TEXT), date: Date.now() }, true);
renderHist();

(async () => {
  try {
    if (window.claude) {
      [sample, downloads] = await Promise.all([window.claude.use("sample"), window.claude.use("downloads")]);
      if (sample) imageLimits = (await sample.limits().catch(() => null))?.images || null;
    }
  } catch (_) { sample = null; }
  if (!window.claude) await initStandalone();
  else if (!sample) setStatus("Open this page on claude.ai while signed in to run checks.");
  if (mode === "image") $("file-in").accept = imageLimits ? imageLimits.mediaTypes.join(",") : "image/*";
  if (current) { $("followup").hidden = !sample; $("save-md").hidden = !downloads; }
  if (window.claude) initLearning();
})();
