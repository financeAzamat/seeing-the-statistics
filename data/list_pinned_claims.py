"""List, per page, the prose patterns its verification pins.

Rewording a page silently breaks these. Four claim regexes in this project
already stopped matching after a rewrite and reported success, so the rule for
any prose edit is: every pattern below must still match afterwards.

Run:  python3 list_pinned_claims.py [page.html ...]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# This script lives in data/, but the verification scripts and pages live in the
# parent. Resolving against HERE silently read paths that do not exist and
# reported "0 patterns" for every page — a false all-clear, which is worse than
# an error, because the whole point is to warn before a rewrite.
ROOT = HERE.parent

# Which verification script reads which page's markup.
OWNER = {
    "clt.html": ["verify_stats.py", "verify_page.py", "data/audit_claims.py"],
    "ci.html": ["verify_ci.py"],
    "test.html": ["verify_test.py"],
    "regression.html": ["verify_regression.py"],
    "diagnostics.html": ["verify_diagnostics.py"],
    "overfit.html": ["verify_extras.py"],
    "classify.html": ["verify_extras.py"],
    "simpson.html": ["verify_extras.py"],
    "typical.html": ["verify_typical.py"],
    "corr.html": ["verify_corr.py"],
    "intuition.html": ["verify_intuition.py"],
}

# A raw-string literal that looks like a prose pattern rather than a code one.
PAT = re.compile(r'r"((?:[^"\\]|\\.)+)"|r\'((?:[^\'\\]|\\.)+)\'')


def prose_patterns(script: Path) -> list[str]:
    if not script.exists():
        return []
    src = script.read_text(encoding="utf-8")
    out = []
    for m in PAT.finditer(src):
        p = m.group(1) or m.group(2)
        # Keep patterns that clearly target page markup or prose wording.
        if re.search(r"[A-Za-z]{4,}\s+[A-Za-z]{3,}|<(td|b|h1|em|span)", p):
            if p not in out:
                out.append(p)
    return out


def main() -> None:
    pages = sys.argv[1:] or sorted(OWNER)
    for page in pages:
        scripts = OWNER.get(page, [])
        print(f"\n{'=' * 74}\n{page}   (checked by: {', '.join(scripts) or 'nothing'})\n{'=' * 74}")
        total = 0
        for s in scripts:
            pats = prose_patterns(ROOT / s)
            if not pats:
                continue
            print(f"  --- {s} ---")
            for p in pats:
                print(f"    {p}")
                total += 1
        print(f"  {total} pattern(s) that must still match after a rewrite")


if __name__ == "__main__":
    main()
