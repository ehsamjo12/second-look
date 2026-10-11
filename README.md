# Second Look

A fake news and AI-content checker. Paste text, or upload a picture or video clip, and get an estimate of how likely it is to be **AI-generated** and how likely it is to be **false or misleading**, with the evidence behind each number.

> **About this project:** This is a fun side project, not a serious or research-grade tool. I built it entirely by prompt engineering with Claude Code, to test my prompts and see what I could achieve with such a powerful AI tool. Don't rely on it to decide what's true.

## Features

- **Text, picture and video checks.** Videos are checked as evenly spaced still frames (4–12).
- **A plain-language verdict** with two scores (likely fake or misleading, likely AI-generated) and how sure it is.
- **Arguments, not just labels:** each reason shows what was found in the content, why it matters, and how strong a sign it is, plus points on the other side.
- **Listen to the result:** a Listen button reads the verdict and every argument aloud, with a floating player (pause, skip section, speed) that highlights and scrolls to the part being read.
- **Comfortable editorial reading:** a news serif for everything you read, generous spacing, numbered arguments and a reading progress line.
- **Learns from verified checks:** after a check, people can say whether it turned out to be fake, real or AI-made. Future checks are shown the most similar verified cases plus a track record of past mistakes, so estimates get better over time. (The AI model itself isn't retrained; the page feeds it what it has learned.)
- **Accessible:** skip link, proper headings, keyboard-navigable tabs, screen-reader announcements when a result is ready, live captions for the audio, a natural-voice picker, a pause button for background motion, and a high-contrast mode.
- **Living background:** a textured 3D globe with news pings, plus drifting newspaper clippings, viral phone posts, forwarded chats, warning signs and "UNVERIFIED" tags that show how chaotic the information world can be.
- **A calm layout:** verdict and reasons first; extra details are folded away until you open them.
- **Flagged passages:** the exact sentences that sound AI-written or misleading are highlighted in the original text.
- **Manipulation tactics:** clickbait, false context, fake quotes, urgency, share bait and similar.
- **Text fingerprint:** sentence-length variation, word variety, all-caps and exclamation counts, urgency phrases and source cues, measured in the browser.
- **File forensics in the browser:** EXIF camera data, editing software, C2PA Content Credentials, IPTC "AI-generated" labels, and generator traces from Stable Diffusion, ComfyUI, DALL·E, Midjourney, Firefly and others.
- **Claim table** with one-click News and Fact Check Explorer searches.
- **Deep analysis mode** for a slower, more thorough check.
- **Follow-up questions** about any result.
- **Downloadable Markdown report** and a history of past checks saved in your browser.

## Use this idea

Feel free to copy, fork and remix this project. Everything lives in a single `index.html` file: the layout, styles, prompts and background animation. Good places to start:

- **The prompts:** search for `FORMAT` and `lessonsFor` in `index.html` to see how the AI is asked to argue its verdict and learn from past checks.
- **The look:** the glass style and typography are CSS variables at the top of the file.
- **The background:** search for `Background:` to find the globe and floating objects.

## How it runs

The analysis uses Claude through the claude.ai Artifact runtime (`window.claude.use("sample")`), so it runs on the signed-in viewer's own Claude account at no cost to the site owner. Opened anywhere else (for example GitHub Pages), the page shows the layout and an example result, but checks are disabled.

## Limits

This is an estimate, not proof. AI detectors make mistakes in both directions. Claude doesn't search the web during a check, so it can't confirm breaking news. Video sound and motion aren't analyzed, and image metadata is often stripped by social media.

## Credits

- Earth imagery: NASA Blue Marble (public domain).
- Country borders: Natural Earth (public domain), via the `world-atlas` package.
- Globe rendering: [d3-geo](https://d3js.org/) and [topojson-client](https://github.com/topojson/topojson-client).
- Newspaper names in the background are invented and don't refer to real publications.
