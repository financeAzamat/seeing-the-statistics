"""Check the prose against the house style rules.

The rules come from the exec-doc-writing skill: the "not X, it's Y" construction
is banned on sight, filler emphasis ("the takeaway", "importantly") is deleted
rather than softened, and bold is reserved for a term at its point of definition
— so a body with several bold spans has emphasis doing work the sentences should
do.

These were being applied by hand and drifted. A mechanical check is the only
version that holds.

ENFORCED vs REPORTED. Pages listed in ENFORCED must be clean or this script
fails. Every other page is reported so the backlog is visible, without blocking
a publish on prose that was written before the rules were mechanised. Move a
page into ENFORCED as it is rewritten; the list is the record of what has been
brought up to standard.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Pages held to the rules today. Add to this as pages are rewritten.
ENFORCED = {"simpson.html", "ru/simpson.html", "index.html", "ru/index.html"}

EN_BANNED = [
    (r"\bis not a [a-z ]+; it is\b|\bisn't [a-z ]+, it's\b|\bnot [a-z]+, but\b",
     "'not X, it's Y' construction"),
    (r"\bthe takeaway\b|\bkey insight\b|\bimportantly\b|\bcritically\b"
     r"|\bnotably\b|\bcrucially\b",
     "filler emphasis — if it mattered it is already first"),
    (r"\bworth noting\b|\bit is important to\b|\bit should be noted\b",
     "deletable clause"),
    (r"\bthe tell\b|\bsmoking gun\b|\bdouble duty\b|\bhas teeth\b",
     "cliché"),
    (r"\bbites in real work\b|\bsnaps back\b|\bchase top\b",
     "colloquial register"),
    (r"\bRead literally\b|\bIn today's\b|\bIn a world where\b",
     "rhetorical frame or scene-setting opener"),
    (r"\bmay potentially\b|\bcould possibly\b|\bmight perhaps\b",
     "stacked hedges — use one qualifier"),
]


def negate_then_assert(txt: str) -> list[str]:
    """The 'Not misleading. Backwards.' move: a SHORT sentence whose whole point
    is a negation, followed by a SHORT sentence supplying the positive.

    A plain regex for `not <word>. <Capital>` cannot express this and produced
    three false positives out of seven — it flagged trailing qualifiers such as
    "computed from the draws actually made on screen, not scripted." where the
    negation is an aside at the end of a long sentence, not the sentence's
    purpose. The discriminator is LENGTH: the rhetorical move needs both halves
    short, because its effect comes from the clipped pair.
    """
    out = []
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", txt) if s.strip()]
    for i, s in enumerate(sents[:-1]):
        words = s.split()
        if len(words) > 8:
            continue                      # a long sentence is not the move
        if not re.search(r"\b(not|never|no)\b", s, re.I):
            continue
        tail = " ".join(words[-3:]).lower()
        if not re.search(r"\b(not|never|no)\b", tail):
            continue                      # negation must be the sentence's point
        nxt = sents[i + 1].split()
        if len(nxt) <= 8:
            out.append(f"{s} {sents[i + 1]}"[:60])
    return out

RU_BANNED = [
    (r"Не [а-яё]+\.\s+[А-ЯЁ]", "«Не X. Y» — сформулируйте X, затем Y"),
    (r"\bне [а-яё]+, а\b", "«не X, а Y»"),
    (r"\bважно отметить\b|\bстоит отметить\b|\bследует отметить\b",
     "удаляемая вставка"),
    (r"\bглавный вывод\b|\bключевой инсайт\b", "лишнее выделение"),
]

MAX_BOLD = 2   # a term at its point of definition, once or twice per page


def body_of(s: str) -> str:
    """The prose column only — controls and canvas markup are not prose."""
    a = s.find("<section>")
    b = s.find('<section class="stage">')
    if a < 0:
        a = s.find("<body>")
    if b < 0:
        b = len(s)
    seg = s[a:b]
    seg = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", seg)
    return seg


def pages():
    for p in sorted(HERE.glob("*.html")):
        yield p.name, p
    ru = HERE / "ru"
    if ru.exists():
        for p in sorted(ru.glob("*.html")):
            yield f"ru/{p.name}", p


fails: list[str] = []
backlog: list[str] = []

print("=" * 76)
print("HOUSE STYLE — banned constructions and bold density")
print("=" * 76)
print(f"enforced: {sorted(ENFORCED)}\n")

for name, path in pages():
    s = path.read_text(encoding="utf-8")
    body = body_of(s)
    txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body))
    pats = RU_BANNED if name.startswith("ru/") else EN_BANNED
    hits = [(why, m.group(0).strip()[:46])
            for pat, why in pats for m in re.finditer(pat, txt)]
    for pair in negate_then_assert(txt):
        hits.append(("'not X. Y' — state X, then state Y in two sentences", pair))
    # Bold is counted in PROSE only. The .note and .tech blocks are fenced
    # reference material where a bold span is a label (`Coverage:`, `Data:`) and
    # therefore structure rather than emphasis. A banned construction is wrong
    # anywhere, so those are still counted across the whole body.
    prose = re.sub(r'<div class="(note|tech)"[\s\S]*?</div>', " ", body)
    bold = len(re.findall(r"<b>", prose))
    over = max(0, bold - MAX_BOLD)
    ok = not hits and not over
    tag = "OK  " if ok else ("FAIL" if name in ENFORCED else "todo")
    print(f"  [{tag}] {name:<20} banned {len(hits):>2}   <b> {bold:>2} "
          f"(limit {MAX_BOLD})")
    for why, txt_ in hits[:4]:
        print(f"          {why}: {txt_!r}")
    if len(hits) > 4:
        print(f"          … and {len(hits) - 4} more")
    if not ok:
        msg = (f"{name}: {len(hits)} banned construction(s), "
               f"{bold} bold span(s)")
        if name in ENFORCED:
            fails.append(msg)
        else:
            backlog.append(msg)

print("\n" + "=" * 76)
if backlog:
    print(f"NOT YET ENFORCED — {len(backlog)} page(s) still to rewrite:")
    for b in backlog:
        print("  -", b)
    print("\nThese do not fail the build. Add a page to ENFORCED once rewritten.")
if fails:
    print("\nFAILURES on enforced pages:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print(f"\nEvery enforced page is clean: no banned construction survives and bold "
      f"stays at or under {MAX_BOLD} span(s).")
