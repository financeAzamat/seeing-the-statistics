"""Make every claim pattern in the verify_*.py scripts markup-agnostic.

A claim should pin the NUMBER, not the HTML around it. Requiring a literal <b>
couples a data assertion to a styling decision: removing decorative bold then
breaks the claim, which happened to five patterns in verify_corr.py and cost a
round of debugging.

Inverting the dependency is the durable fix. Once <b> and </b> are optional
everywhere, bold can be removed from any page without touching a single check —
which is what the remaining style work needs.

Transformation: inside a raw-string regex literal, `<b>` becomes `(?:<b>)?` and
`</b>` becomes `(?:</b>)?`. Already-optional groups are left alone so the script
is idempotent.

Run:  python3 relax_bold_in_claims.py          # report only
      python3 relax_bold_in_claims.py --apply
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

RAW = re.compile(r'r"((?:[^"\\]|\\.)*)"')


def relax(src: str) -> tuple[str, int]:
    n = 0

    def fix_literal(m: re.Match) -> str:
        nonlocal n
        body = m.group(1)
        if "<b>" not in body and "</b>" not in body:
            return m.group(0)
        out = body
        # skip anything already made optional
        out = re.sub(r"(?<!\(\?:)<b>(?!\)\?)", "(?:<b>)?", out)
        out = re.sub(r"(?<!\(\?:)</b>(?!\)\?)", "(?:</b>)?", out)
        if out != body:
            n += 1
        return f'r"{out}"'

    return RAW.sub(fix_literal, src), n


def main() -> None:
    apply = "--apply" in sys.argv
    total = 0
    # verify_style.py counts <b> deliberately -- relaxing its pattern to
    # (?:<b>)? makes it match the empty string everywhere and report nonsense.
    # A checker that measures markup must not have its markup made optional.
    SKIP = {"verify_style.py"}
    for p in sorted(ROOT.glob("verify_*.py")):
        if p.name in SKIP:
            continue
        src = p.read_text(encoding="utf-8")
        new, n = relax(src)
        if n:
            print(f"  {p.name:<24} {n} pattern(s) relaxed")
            total += n
            if apply:
                p.write_text(new, encoding="utf-8")
    audit = ROOT / "data" / "audit_claims.py"
    if audit.exists():
        src = audit.read_text(encoding="utf-8")
        new, n = relax(src)
        if n:
            print(f"  {audit.name:<24} {n} pattern(s) relaxed")
            total += n
            if apply:
                audit.write_text(new, encoding="utf-8")
    print(f"\n  {total} pattern(s) {'relaxed' if apply else 'would be relaxed'}")
    if not apply:
        print("  re-run with --apply to write the changes")


if __name__ == "__main__":
    main()
