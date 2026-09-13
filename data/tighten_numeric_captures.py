"""Tighten numeric captures that were only bounded by a closing </b> tag.

`([\\d.]+)` is greedy over the dot, so it swallows a sentence-ending full stop
and yields '0.14.' — which then fails float(). This project documented that trap
and standardised on `(\\d+\\.\\d+)`, but a handful of patterns kept the loose form
and got away with it because a literal `</b>` terminated the match.

Making the markup optional removed that accidental boundary and exposed them.
Only the patterns where a relaxed `(?:</b>)?` now follows the capture are
rewritten here — the ones bounded by a real character (a '%', ' ct', '</td>')
are already safe and are left alone, since changing a working pattern earns
nothing.

Run:  python3 tighten_numeric_captures.py [--apply]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Capture followed by an OPTIONAL closing tag has no boundary; require a real
# decimal instead.
LOOSE = re.compile(r"\(\[\\d\.\]\+\)(\(\?:</b>\)\?)")


def main() -> None:
    apply = "--apply" in sys.argv
    total = 0
    for p in sorted(ROOT.glob("verify_*.py")):
        src = p.read_text(encoding="utf-8")
        new, n = LOOSE.subn(r"(\\d+\\.\\d+)\1", src)
        if n:
            print(f"  {p.name:<24} {n} loose capture(s) tightened")
            total += n
            if apply:
                p.write_text(new, encoding="utf-8")
    print(f"\n  {total} capture(s) {'tightened' if apply else 'would be tightened'}")
    if not apply:
        print("  re-run with --apply to write the changes")


if __name__ == "__main__":
    main()
