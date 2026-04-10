#!/usr/bin/env python3
"""Fail if EN translation keys in indexTEST.html are missing from translations-fr.js."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "indexTEST.html"
FR = ROOT / "translations-fr.js"


def main() -> int:
    if not HTML.is_file():
        print("check-i18n: missing indexTEST.html", file=sys.stderr)
        return 1
    if not FR.is_file():
        print("check-i18n: missing translations-fr.js", file=sys.stderr)
        return 1
    html = HTML.read_text(encoding="utf-8")
    fr = FR.read_text(encoding="utf-8")
    m = re.search(r"en:\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\};", html)
    if not m:
        print("check-i18n: could not find TRANSLATIONS.en block", file=sys.stderr)
        return 1
    en_keys = set(re.findall(r"^\s+([a-zA-Z0-9_]+):", m.group(1), re.M))
    fr_keys = set(re.findall(r"^\s+([a-zA-Z0-9_]+):", fr, re.M))
    missing = sorted(en_keys - fr_keys)
    if missing:
        print("check-i18n: FR missing keys (fall back to EN at runtime):", file=sys.stderr)
        for k in missing:
            print(f"  {k}", file=sys.stderr)
        return 1
    print(f"check-i18n: OK - {len(en_keys)} EN keys present in FR")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
