# Second Look

A fake news and AI-content checker. Paste text, or upload a picture or video clip, and get an estimate of how likely it is to be **AI-generated** and how likely it is to be **false or misleading**, with the evidence behind each number.

## Features

- **Text, picture and video checks.** Videos are checked as evenly spaced still frames (4–12).
- **Two scores and a confidence level:** likely AI-generated (0–100%) and likely false or misleading (0–100%).
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
