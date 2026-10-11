#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file.

The repository keeps the site as separate files (index.html, css/, js/, assets/, data/)
so it's easy to read and remix. Some hosts, like a claude.ai artifact, want a single
file instead. This script inlines the stylesheet, every local script, the Earth
texture and the country borders into dist/second-look.html.

Usage:
    python tools/build.py              # full HTML document
    python tools/build.py --artifact   # page content only, for publishing as a claude.ai artifact
"""
from __future__ import annotations

import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build(artifact: bool) -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="css/styles.css">', "<style>\n" + css + "</style>")

    earth = base64.b64encode((ROOT / "assets" / "earth.jpg").read_bytes()).decode()
    world = json.dumps(json.loads((ROOT / "data" / "countries-110m.json").read_text()), separators=(",", ":"))
    inline_data = ("<script>\n/* Earth imagery: NASA Blue Marble (public domain). Borders: Natural Earth via world-atlas (public domain). */\n"
                   f'window.SECOND_LOOK_INLINE = {{ earth: "data:image/jpeg;base64,{earth}", world: {world} }};\n</script>\n')

    def inline_script(m: re.Match) -> str:
        src = m.group(1)
        code = (ROOT / src).read_text(encoding="utf-8")
        prefix = inline_data if src == "js/background.js" else ""
        return prefix + "<script>\n" + code.replace("</script", "<\\/script") + "</script>"

    html = re.sub(r'<script src="(js/[\w-]+\.js)"></script>', inline_script, html)

    if artifact:
        # claude.ai wraps artifact pages in its own document skeleton: keep <title>, fonts, styles and body content.
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
        keep = "\n".join(line for line in head.splitlines()
                         if line.strip().startswith(("<title", "<link", "<style")) or not line.strip().startswith("<meta"))
        html = keep.strip() + "\n" + body.strip() + "\n"
    return html


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--artifact", action="store_true", help="output page content only (for a claude.ai artifact)")
    p.add_argument("--out", default=str(ROOT / "dist" / "second-look.html"))
    args = p.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(args.artifact), encoding="utf-8")
    print(f"Wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
