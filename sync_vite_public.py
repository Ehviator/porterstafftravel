"""Copy static assets from repo root into vite-scaffold/public for Vite dev/build."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "vite-scaffold" / "public"
(PUB / "js").mkdir(parents=True, exist_ok=True)

IMAGES = [
    "Mitch1.jpg",
    "Mitch2.jpg",
    "Mitch3.jpg",
    "Mitch4.jpg",
    "Mitch5.jpg",
    "Mitch6.jpg",
    "Mitch7.jpg",
    "Mitch8.jpg",
    "Mitch9.jpg",
    "PXL_20241110_221052339.jpg",
    "Porter Airlines_id2odtXerw_1.png",
    "icon-192.png",
    "icon-512.png",
]

for f in IMAGES:
    src = ROOT / f
    if src.is_file():
        shutil.copy2(src, PUB / f)
        print("copied", f)
    else:
        print("skip missing", f)

for rel in [
    ("js/mytrips-timezones.js", "js/mytrips-timezones.js"),
    ("translations-fr.js", "translations-fr.js"),
    ("manifest.json", "manifest.json"),
    ("sw.js", "sw.js"),
]:
    src = ROOT / rel[0]
    dst = PUB / rel[1]
    if src.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print("copied", rel[0])
    else:
        print("skip missing", rel[0])

print("sync_vite_public done")
