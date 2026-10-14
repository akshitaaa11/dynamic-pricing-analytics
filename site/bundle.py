"""Inline each page's CSS, JavaScript and data so it works as a single self-contained file.

Usage: python site/bundle.py OUT_DIR
Writes OUT_DIR/<page>.html for every page. index.html is written as a fragment (no doctype, html,
head or body tags) because the Artifact tool wraps the main page in its own skeleton.
"""
import re
import sys
from pathlib import Path

root = Path(__file__).parent
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
SRC = re.compile(r'<script src="([^"]+)"></script>')
CSS = re.compile(r'<link rel="stylesheet" href="(assets/[^"]+)">')


def inline(html: str) -> str:
    html = CSS.sub(lambda m: "<style>" + (root / m.group(1)).read_text(encoding="utf-8") + "</style>", html)
    return SRC.sub(lambda m: "<script>" + (root / m.group(1)).read_text(encoding="utf-8").replace("</", "<\\/") + "</script>", html)


for page in sorted(root.glob("*.html")):
    html = inline(page.read_text(encoding="utf-8"))
    if page.name == "index.html":
        title = re.search(r"<title>.*?</title>", html).group(0)
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
        head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>|<title>.*?</title>', "", head)
        html = "<title>Dynamic Pricing Analytics</title>" + '<meta name="claude:viewport-fit-sides" content="cover">' + head + body
    (out / page.name).write_text(html, encoding="utf-8")
    print(page.name, f"{len(html) / 1e6:.2f} MB")
