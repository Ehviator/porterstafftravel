"""Extract <style> block from indexTEST.html into vite-scaffold/src/index.css (with Tailwind directives)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "indexTEST.html").read_text(encoding="utf-8")
m = re.search(r"<style>([\s\S]*?)</style>", html)
if not m:
    raise SystemExit("no style block")
css = m.group(1).strip()
out = ROOT / "vite-scaffold" / "src" / "index.css"
header = """@tailwind base;
@tailwind components;
@tailwind utilities;

"""
out.write_text(header + css + "\n", encoding="utf-8")
print("Wrote", out)
