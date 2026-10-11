#!/usr/bin/env python3
"""Second Look from the command line.

Checks a piece of text or an image for signs that it's fake news or AI-generated,
using the same instructions as the website (read from js/analysis.js so the two
never drift apart).

Examples:
    python python/second_look.py "BREAKING: city bans all cars tomorrow!!!"
    python python/second_look.py --file article.txt --source "WhatsApp group"
    python python/second_look.py --image photo.jpg --caption "Flooding in Paris yesterday"
    python python/second_look.py --file post.txt --deep --json

Needs ANTHROPIC_API_KEY (or an `ant auth login` profile). Each check is billed to that account.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import shutil
import sys
import textwrap
from pathlib import Path

import anthropic

MODEL = "claude-opus-5-5"
ROOT = Path(__file__).resolve().parent.parent
PROMPT_SOURCE = ROOT / "js" / "analysis.js"

URGENT = ["breaking", "urgent", "shocking", "share", "banned", "exposed", "they don't want", "wake up",
          "before it's deleted", "100%", "must see", "you won't believe", "secret", "cover-up", "miracle",
          "act now", "outrage", "destroyed"]
GENERATORS = [
    ("Stable Diffusion", r"stable[\s_-]?diffusion|sd_xl|sdxl|automatic1111|negative prompt:"),
    ("ComfyUI", r"comfyui|\"class_type\""),
    ("Midjourney", r"midjourney"),
    ("DALL·E / OpenAI", r"dall[\s·.-]?e|openai"),
    ("Adobe Firefly", r"firefly"),
    ("Google AI (Imagen/Gemini)", r"imagen|gemini|synthid"),
    ("Flux", r"black forest labs|flux\.1"),
    ("NovelAI", r"novelai"),
    ("Leonardo.ai", r"leonardo\.ai"),
    ("Runway / Sora / Pika", r"runwayml|\bsora\b|pika labs"),
]


def load_format() -> str:
    """Reuse the website's output-format instructions so web and CLI ask Claude the same thing."""
    try:
        js = PROMPT_SOURCE.read_text(encoding="utf-8")
    except FileNotFoundError:
        sys.exit(f"Can't find {PROMPT_SOURCE}. Run this script from inside the second-look repository.")
    m = re.search(r"const FORMAT = `(.*?)`;", js, re.S)
    if not m:
        sys.exit(f"Couldn't read the prompt format from {PROMPT_SOURCE}.")
    return m.group(1)


def text_stats(t: str) -> dict:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", t) if len(s.split()) >= 2]
    words = re.findall(r"[\w']+", t)
    lens = [len(re.findall(r"[\w']+", s)) for s in sentences]
    mean = sum(lens) / len(lens) if lens else 0
    sd = (sum((x - mean) ** 2 for x in lens) / len(lens)) ** 0.5 if len(lens) > 1 else 0
    first = [w.lower() for w in words[:400]]
    lower = t.lower()
    return {
        "words": len(words),
        "sentences": len(sentences),
        "avg_sentence": round(mean, 1),
        "variation": round(sd / mean * 100) if mean else 0,
        "diversity": round(len(set(first)) / len(first) * 100) if first else 0,
        "caps": sum(1 for w in words if len(w) > 2 and w.isupper()),
        "exclaim": t.count("!"),
        "urgent": sum(1 for k in URGENT if k in lower),
        "source_cues": len(re.findall(r"according to|said|reported|study|https?://|\bsource\b|“|\"", lower)),
    }


def stats_text(s: dict) -> str:
    return (f"Words: {s['words']}; sentences: {s['sentences']}; average sentence length: {s['avg_sentence']} words; "
            f"sentence-length variation: {s['variation']}% (human writing is often above ~50%, AI text is often more uniform); "
            f"word variety: {s['diversity']}% unique in first 400 words; ALL-CAPS words: {s['caps']}; "
            f"exclamation marks: {s['exclaim']}; urgency/sensational phrases: {s['urgent']}; "
            f"source/attribution cues: {s['source_cues']}.")


def image_clues(data: bytes) -> list[str]:
    """Look for generator traces and provenance markers in the raw file bytes. No extra packages needed."""
    raw = (data[: 4 * 1024 * 1024] + data[-262144:]).decode("latin-1")
    notes = []
    if re.search(r"c2pa|jumbf|\bjumb\b|contentauth", raw, re.I):
        notes.append("Content Credentials: C2PA provenance data present (check it at contentcredentials.org/verify)")
    if "trainedAlgorithmicMedia" in raw:
        notes.append("AI label: file is labelled trainedAlgorithmicMedia (AI-generated)")
    for name, pattern in GENERATORS:
        if re.search(pattern, raw, re.I):
            notes.append(f"Generator trace: {name} signature found in file data")
    tool = re.search(r'CreatorTool(?:="|>)([^"<]+)', raw)
    if tool:
        notes.append(f"Created with: {tool.group(1)}")
    if not notes:
        notes.append("Metadata: no AI or provenance markers found. Common for screenshots and social media files; not evidence either way.")
    return notes


def build_request(args, fmt: str) -> list[dict]:
    if args.image:
        path = Path(args.image)
        data = path.read_bytes()
        media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        if media_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
            sys.exit("Use a JPEG, PNG, WebP or GIF image.")
        if len(data) > 5 * 1024 * 1024:
            sys.exit("That image is over 5 MB. Resize it and try again.")
        prompt = ("You are a careful image forensics analyst and fact-checker. Look at the attached picture and assess "
                  "(1) whether it was likely generated or edited with AI (look for distorted hands and fingers, garbled or "
                  "nonsensical text, inconsistent lighting and shadows, overly smooth or waxy textures, warped backgrounds, "
                  "mismatched reflections, odd jewelry or accessories) and (2) whether it, together with its caption, is likely "
                  "being used to spread false or misleading news (e.g. a real photo with a false caption or from a different event).")
        prompt += "\n\n" + fmt + "\n\nFILE METADATA FOUND BY THE PAGE:\n" + "\n".join("- " + n for n in image_clues(data))
        prompt += (f'\n\nCAPTION OR CLAIM THAT CAME WITH IT:\n"""\n{args.caption[:4000]}\n"""' if args.caption else "\n\nNo caption was provided.")
        return [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.standard_b64encode(data).decode("utf-8")}},
            {"type": "text", "text": prompt},
        ]}]

    text = Path(args.file).read_text(encoding="utf-8") if args.file else (args.text or "")
    if not text.strip() and not sys.stdin.isatty():
        text = sys.stdin.read()
    text = text.strip()
    if len(text) < 20:
        sys.exit("Give me at least a sentence or two to check (as an argument, --file, or piped in).")
    text = text[:20000]
    prompt = ("You are a careful fact-checker and AI-content analyst. Assess the text below for (1) whether it was likely "
              "written by an AI model and (2) whether it is likely fake news, false, or misleading. Quote flagged passages "
              "exactly as they appear.\n\n" + fmt +
              "\n\nMEASURED TEXT STATISTICS (computed by the page):\n" + stats_text(text_stats(text)) +
              (f"\n\nWHERE THE USER SAW IT:\n{args.source[:500]}" if args.source else "") +
              f'\n\nTEXT TO ASSESS:\n"""\n{text}\n"""')
    return [{"role": "user", "content": prompt}]


def parse_json(t: str):
    for candidate in (t, *(m.group(1) for m in re.finditer(r"```(?:json)?\s*([\s\S]*?)```", t))):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
    a, b = t.find("{"), t.rfind("}")
    if a >= 0 and b > a:
        try:
            return json.loads(t[a:b + 1])
        except json.JSONDecodeError:
            pass
    return None


def ask_claude(client: anthropic.Anthropic, messages: list[dict], deep: bool) -> str:
    params = dict(model=MODEL, max_tokens=16000, messages=messages,
                  output_config={"effort": "high" if deep else "medium"})
    try:
        # Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
        with client.beta.messages.stream(**params, betas=["server-side-fallback-2026-07-01"], fallbacks="default") as stream:
            msg = stream.get_final_message()
    except (TypeError, anthropic.BadRequestError) as e:
        if isinstance(e, anthropic.BadRequestError) and "fallback" not in str(e).lower() and "beta" not in str(e).lower():
            raise
        with client.messages.stream(**params) as stream:
            msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        sys.exit("Claude declined to analyze this content.")
    return "".join(b.text for b in msg.content if b.type == "text")


def bar(value: int, width: int = 24) -> str:
    filled = round(value / 100 * width)
    return "█" * filled + "░" * (width - filled)


def print_report(r: dict) -> None:
    w = min(88, shutil.get_terminal_size((88, 20)).columns)
    wrap = lambda s, indent="": textwrap.fill(str(s), width=w, initial_indent=indent, subsequent_indent=indent)
    clamp = lambda v: max(0, min(100, int(round(float(v or 0)))))
    mis, ai = clamp(r.get("misleading")), clamp(r.get("ai_generated"))
    print()
    print(f"  {str(r.get('verdict', 'Result')).upper()}")
    if r.get("bottom_line"):
        print(wrap(r["bottom_line"], "  "))
    print()
    print(f"  Likely fake or misleading  {bar(mis)} {mis:3d}%")
    print(f"  Likely AI-generated        {bar(ai)} {ai:3d}%")
    print(f"  How sure we are: {r.get('confidence', 'low')}")
    if r.get("tactics"):
        print(f"  Tactics: {', '.join(r['tactics'])}")
    args = r.get("arguments") or []
    if args:
        print("\n  WHY WE THINK SO")
        for i, a in enumerate(args, 1):
            print(f"\n  {i}. {a.get('point', '')}  [{a.get('weight', 'moderate')} sign, {'AI clue' if a.get('about') == 'ai' else a.get('tactic') or 'fake clue'}]")
            if a.get("evidence"):
                print(wrap("What we saw: " + a["evidence"], "     "))
            if a.get("reasoning"):
                print(wrap("Why it matters: " + a["reasoning"], "     "))
    if r.get("counterpoints"):
        print("\n  ON THE OTHER HAND")
        for c in r["counterpoints"]:
            print(wrap(f"• {c.get('point', '')}. {c.get('reasoning', '')}", "  "))
    if r.get("claims"):
        print("\n  CLAIMS TO CHECK")
        for c in r["claims"]:
            print(wrap(f"• [{c.get('assessment', 'unverified')}] {c.get('claim', '')} - {c.get('note', '')}", "  "))
    if r.get("check_next"):
        print("\n  CHECK IT YOURSELF")
        for i, c in enumerate(r["check_next"], 1):
            print(wrap(f"{i}. {c}", "  "))
    print("\n  This is an estimate, not proof. Check with a trusted source before you share it.\n")


def main() -> None:
    p = argparse.ArgumentParser(description="Check text or an image for signs of fake news or AI generation.")
    p.add_argument("text", nargs="?", help="text to check (or use --file, --image, or pipe text in)")
    p.add_argument("--file", help="read the text to check from this file")
    p.add_argument("--image", help="check this image (JPEG, PNG, WebP or GIF)")
    p.add_argument("--caption", help="caption or claim that came with the image")
    p.add_argument("--source", help="where you saw the text")
    p.add_argument("--deep", action="store_true", help="slower, more thorough analysis")
    p.add_argument("--json", action="store_true", help="print the raw JSON result")
    args = p.parse_args()

    messages = build_request(args, load_format())
    client = anthropic.Anthropic(max_retries=1)
    print("Checking… this can take up to a minute.", file=sys.stderr)
    try:
        text = ask_claude(client, messages, args.deep)
    except anthropic.AuthenticationError:
        sys.exit("Your API key was rejected. Set ANTHROPIC_API_KEY to a working key from console.anthropic.com.")
    except anthropic.RateLimitError:
        sys.exit("Too many requests right now. Wait a minute and try again.")
    except anthropic.APIStatusError as e:
        sys.exit(f"Claude returned an error ({e.status_code}): {e.message}")
    except anthropic.APIConnectionError:
        sys.exit("Couldn't reach Claude. Check your internet connection.")
    result = parse_json(text)
    if not isinstance(result, dict):
        sys.exit("The answer came back in the wrong format. Try again.\n\n" + text[:2000])
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_report(result)


if __name__ == "__main__":
    main()
