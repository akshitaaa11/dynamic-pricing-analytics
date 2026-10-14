"""Generate the HTML shells for the website pages (one per page, listing the data files each needs)."""
from pathlib import Path

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@200..500&display=swap">'
PAGES = {
    "index": ("Overview", ["overview", "forecast", "pricing", "data", "search"], ["summary", "data", "about"]),
    "demand": ("Demand", ["overview", "customers", "products", "pricing", "forecast", "search"], ["demand", "customers", "products"]),
    "top": ("Top products", ["overview", "products", "pricing", "search"], ["topproducts"]),
    "forecast": ("Forecast", ["overview", "forecast", "products", "search"], ["forecast", "lab"]),
    "pricing": ("Pricing", ["overview", "pricing", "products", "forecast", "search"], ["elasticity", "recs", "impact"]),
}
root = Path(__file__).parent
for name, (title, data, views) in PAGES.items():
    scripts = "".join(f'<script src="data/{d}.js"></script>' for d in data)
    (root / f"{name}.html").write_text(
        f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{title} · Dynamic Pricing Analytics</title>{FONTS}<link rel=\"stylesheet\" href=\"assets/style.css\">"
        f'<script src="vendor/chart.umd.js"></script>{scripts}<script src="assets/app.js"></script></head><body>'
        + "".join(f'<script src="assets/{v}.js"></script>' for v in views)
        + f'<script src="assets/p_{name}.js"></script></body></html>\n', encoding="utf-8")
print("wrote", len(PAGES), "pages")
