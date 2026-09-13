"""For one page, list every <b> span in its prose and say whether it is PROTECTED.

A bold span is protected when a verification regex for that page mentions <b>
around the same text: deleting the tag then breaks the claim. Everything else is
free, and freeing it is the point — the house rule reserves bold for a term at
its point of definition.

Run:  python3 bold_audit.py typical.html
      python3 bold_audit.py            # every page
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

from list_pinned_claims import OWNER, prose_patterns  # noqa: E402


def audit(page: str) -> tuple[int, int]:
    html = (ROOT / page).read_text(encoding="utf-8")
    a = html.find("<section>")
    b = html.find('<section class="stage">')
    body = html[a:b if b > 0 else len(html)]
    # bold outside the fenced reference blocks, which the rule exempts
    prose = re.sub(r'<div class="(note|tech)"[\s\S]*?</div>', " ", body)

    pats = []
    for s in OWNER.get(page, []):
        pats.extend(prose_patterns(ROOT / s))
    pinned_with_bold = [p for p in pats if "<b>" in p]

    spans = re.findall(r"<b>(.*?)</b>", prose, re.S)
    free, prot = [], []
    for text in spans:
        flat = re.sub(r"\s+", " ", text).strip()
        # protected if any pinned pattern containing <b> also carries a
        # distinctive run of this span's literal text
        hit = False
        for p in pinned_with_bold:
            bare = re.sub(r"\\([.\\^$*+?()\[\]{}|])", r"\1", p)
            bare = re.sub(r"\([^)]*\)", "", bare)
            frag = re.sub(r"<[^>]+>", " ", bare)
            frag = re.sub(r"\s+", " ", frag).strip()
            # Match on words AND on numeric runs. Looking only for 5+ letter
            # words misclassified three number-only spans (+0.901, 90%, +0.922)
            # as free, and removing their bold broke three claims.
            toks = (re.findall(r"[A-Za-z]{5,}", frag)
                    + re.findall(r"[\d]+[.,]?[\d]*", frag))
            for word in toks:
                if len(word) >= 2 and word in flat:
                    hit = True
                    break
            if hit:
                break
        (prot if hit else free).append(flat[:56])

    print(f"\n{page}   {len(spans)} bold span(s) in prose   "
          f"({len(pats)} pinned pattern(s), {len(pinned_with_bold)} mention <b>)")
    if prot:
        print("  PROTECTED — a pinned claim needs this bold, leave it:")
        for t in prot:
            print(f"    {t!r}")
    print("  FREE — rewrite the sentence so the emphasis is not needed:")
    for t in free:
        print(f"    {t!r}")
    return len(free), len(prot)


def main() -> None:
    pages = sys.argv[1:] or [p for p in OWNER if (ROOT / p).exists()]
    tf = tp = 0
    for page in pages:
        f, p = audit(page)
        tf += f
        tp += p
    print(f"\ntotal: {tf} free, {tp} protected across {len(pages)} page(s)")


if __name__ == "__main__":
    main()
