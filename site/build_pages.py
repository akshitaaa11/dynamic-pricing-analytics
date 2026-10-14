"""Generate the HTML shells for the website pages (one per page, listing the data files each needs)."""
from pathlib import Path

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500&display=swap">'
PAGES = {
    "index": ("Home", ["overview", "forecast", "pricing", "customers", "search"]),
    "demand": ("Demand", ["overview", "search"]),
    "customers": ("Customers", ["customers", "search"]),
    "products": ("Products", ["overview", "products", "pricing", "forecast", "search"]),
    "forecast": ("Forecast", ["overview", "forecast", "search"]),
    "lab": ("Forecast lab", ["overview", "forecast", "products", "search"]),
    "elasticity": ("Elasticity", ["pricing", "search"]),
    "pricing": ("Recommendations", ["overview", "pricing", "products", "forecast", "search"]),
    "impact": ("Impact", ["pricing", "search"]),
    "data": ("Data and limits", ["data", "overview", "search"]),
    "about": ("Method", ["data", "forecast", "pricing", "overview", "search"]),
}
root = Path(__file__).parent
for name, (title, data) in PAGES.items():
    scripts = "".join(f'<script src="data/{d}.js"></script>' for d in data)
    (root / f"{name}.html").write_text(
        f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{title} · Dynamic Pricing Analytics</title>{FONTS}<link rel=\"stylesheet\" href=\"assets/style.css\">"
        f'<script src="vendor/chart.umd.js"></script>{scripts}<script src="assets/app.js"></script></head><body>'
        f'<script src="assets/{name}.js"></script></body></html>\n', encoding="utf-8")
print("wrote", len(PAGES), "pages")
