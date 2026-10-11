# Second Look

A fake news and AI-content checker. Paste text, or upload a picture or video clip, and get an estimate of how likely it is to be **AI-generated** and how likely it is to be **false or misleading**, with the evidence behind each number.

> **About this project:** This is a fun side project, not a serious or research-grade tool. I built it entirely by prompt engineering with Claude Code, to test my prompts and see what I could achieve with such a powerful AI tool. Don't rely on it to decide what's true.

## Features

- **Text, picture and video checks.** Videos are checked as evenly spaced still frames (4–12).
- **A plain-language verdict** with two scores (likely fake or misleading, likely AI-generated) and how sure it is.
- **Arguments, not just labels:** each reason shows what was found in the content, why it matters, and how strong a sign it is, plus points on the other side.
- **A calm layout:** verdict and reasons first; extra details are folded away until you open them.
- **Flagged passages:** the exact sentences that sound AI-written or misleading are highlighted in the original text.
- **Manipulation tactics:** clickbait, false context, fake quotes, urgency, share bait and similar.
- **Text fingerprint:** sentence-length variation, word variety, all-caps and exclamation counts, urgency phrases and source cues, measured in the browser.
- **File forensics in the browser:** EXIF camera data, editing software, C2PA Content Credentials, IPTC "AI-generated" labels, and generator traces from Stable Diffusion, ComfyUI, DALL·E, Midjourney, Firefly and others.
- **Claim table** with one-click News and Fact Check Explorer searches.
- **Deep analysis mode** for a slower, more thorough check.
- **Follow-up questions** about any result.
- **Downloadable Markdown report** and a history of past checks saved in your browser.

## How it runs

The analysis uses Claude through the claude.ai Artifact runtime (`window.claude.use("sample")`), so it runs on the signed-in viewer's own Claude account at no cost to the site owner. Opened anywhere else (for example GitHub Pages), the page shows the layout and an example result, but checks are disabled.

## Limits

This is an estimate, not proof. AI detectors make mistakes in both directions. Claude doesn't search the web during a check, so it can't confirm breaking news. Video sound and motion aren't analyzed, and image metadata is often stripped by social media.

## Credits

- Earth imagery: NASA Blue Marble (public domain).
- Country borders: Natural Earth (public domain), via the `world-atlas` package.
- Globe rendering: [d3-geo](https://d3js.org/) and [topojson-client](https://github.com/topojson/topojson-client).
- Newspaper names in the background are invented and don't refer to real publications.
