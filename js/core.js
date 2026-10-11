/* Second Look: example result, shared helpers and page state. */
const EXAMPLE_TEXT = "BREAKING: The city council has BANNED all private cars starting tomorrow morning!!! The mayor announced it on TV last night. Officials say the move will transform the city, reduce pollution, and create a healthier future for everyone. SHARE before it's deleted!";
const EXAMPLE = {
  ai_generated: 64,
  misleading: 83,
  confidence: "medium",
  verdict: "Probably fake",
  bottom_line: "A real city ban this big would come with an official notice and months of warning. This post has neither, and it’s written to make you share it before you check.",
  tactics: ["Urgency", "No source", "Share bait"],
  arguments: [
    { about: "fake", weight: "strong", tactic: "Too big to be this quiet", point: "A ban this big doesn’t happen overnight",
      evidence: "“BANNED all private cars starting tomorrow morning”",
      reasoning: "Cities announce car restrictions months ahead, with exemptions for deliveries, disabled drivers and emergencies. A ban starting the next morning would cause chaos, and it would be front-page news everywhere." },
    { about: "fake", weight: "strong", tactic: "No source", point: "There’s no way to check where it came from",
      evidence: "“The mayor announced it on TV last night”",
      reasoning: "It doesn’t name the mayor, the channel or the date. Real news gives you enough detail to find the original. Leaving it vague makes the claim impossible to check, which is often the point." },
    { about: "fake", weight: "moderate", tactic: "Share bait", point: "It pushes you to share before thinking",
      evidence: "“SHARE before it’s deleted!”",
      reasoning: "Genuine news isn’t at risk of being “deleted”. This line creates panic so people spread it before checking. It’s one of the most common tricks in viral hoaxes." },
    { about: "ai", weight: "weak", point: "One sentence reads like AI filler",
      evidence: "“transform the city, reduce pollution, and create a healthier future for everyone”",
      reasoning: "Vague, upbeat lists of three are typical of AI writing. On its own this proves little, since PR writers do the same." }
  ],
  counterpoints: [
    { point: "Car restrictions are real", reasoning: "Some cities do limit cars in their centres, so the topic isn’t made up. The overnight, city-wide part is what doesn’t hold up." }
  ],
  passages: [
    { quote: "BANNED all private cars starting tomorrow morning", kind: "misleading", reason: "Bans like this are announced months ahead and phased in." },
    { quote: "transform the city, reduce pollution, and create a healthier future for everyone", kind: "ai", reason: "Vague, balanced triple phrasing common in AI writing." },
    { quote: "SHARE before it's deleted!", kind: "misleading", reason: "Classic share-bait used to spread false stories fast." }
  ],
  claims: [
    { claim: "All private cars are banned starting tomorrow", assessment: "likely false", note: "Bans like this are announced months ahead and phased in.", search: "city council bans all private cars" },
    { claim: "The mayor announced it on TV last night", assessment: "unverified", note: "No broadcaster or date is given.", search: "mayor announces car ban" }
  ],
  check_next: ["Search the city government’s official website for the announcement", "Look for the story on two established news outlets", "Run a reverse image search on any photo attached to the post"]
};

const $ = (id) => document.getElementById(id);
let mode = "text";
let file = null;
let sample = null, downloads = null;
let imageLimits = null;
let ctl = null;
let current = null;        // {mode, input, result, forensics, date}
let chatTurns = [];

function clamp(n) { n = Math.round(Number(n)); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
function bandFor(v) { return v < 34 ? "Low" : v < 67 ? "Moderate" : "High"; }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function setStatus(t, err) { $("status").textContent = t; $("status").classList.toggle("err", !!err); }
