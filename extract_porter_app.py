"""Extract inline Babel bundle from indexTEST.html → vite-scaffold/src/porter-app.jsx."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "indexTEST.html").read_text(encoding="utf-8")
# Inline bundle only (not <script type="text/babel" src="...">)
m = re.search(r"<script type=\"text/babel\">\s*\n", html)
if not m:
    raise SystemExit("missing inline babel script")
after_open = m.end()
root_idx = html.find("const root = ReactDOM.createRoot", after_open)
if root_idx < 0:
    raise SystemExit("missing createRoot")
body = html[after_open:root_idx].rstrip()
body = re.sub(
    r"^\s*const\s*\{\s*useState\s*,\s*useMemo\s*,\s*useEffect\s*,\s*useRef\s*\}\s*=\s*React\s*;\s*\n",
    "",
    body,
    count=1,
    flags=re.M,
)
out_dir = ROOT / "vite-scaffold" / "src"
out_dir.mkdir(parents=True, exist_ok=True)
preamble = "import React, { useState, useMemo, useEffect, useRef } from 'react';\n\n"
postamble = "\n\nexport { App, ErrorBoundary };\n"
out = Path(sys.argv[1]) if len(sys.argv) > 1 else (out_dir / "porter-app.jsx")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(preamble + body + postamble, encoding="utf-8")
print("Wrote", out, len(preamble + body + postamble), "chars")
