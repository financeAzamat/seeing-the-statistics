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

import html
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Every page is held to the rules. The list is no longer a backlog — it is the
# whole set, so a new page or a reworded paragraph that reintroduces a banned
# construction or decorative bold fails the build rather than being noted.
ENFORCED = {
    "index.html", "intuition.html", "typical.html", "corr.html", "clt.html",
    "ci.html", "test.html", "regression.html", "overfit.html",
    "diagnostics.html", "classify.html", "simpson.html",
    "ru/index.html", "ru/simpson.html", "ru/intuition.html", "ru/typical.html",
    "ru/corr.html", "ru/clt.html", "ru/ci.html", "ru/test.html",
    "ru/regression.html",
}

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
        # "not"/"never" negate a proposition; a bare "no" is usually a
        # determiner inside a noun phrase ("with no transform", "no line at
        # all") and is only rhetorical when it OPENS the sentence ("No model.
        # No data."). Treating every "no" as rhetorical flagged a setting name.
        tail = " ".join(words[-3:]).lower()
        rhetorical = (re.search(r"\b(not|never)\b", tail)
                      or re.match(r"^no\b", s, re.I))
        if not rhetorical:
            continue
        nxt = sents[i + 1].split()
        if len(nxt) <= 8:
            out.append(f"{s} {sents[i + 1]}"[:60])
    return out

def ru_negate_replace(txt: str) -> list[str]:
    """The Russian «не X, а Y» move: a negated word immediately replaced by its
    positive counterpart.

    A bare `не <word>, а` regex is too loose, because Russian «а» is also an
    ordinary clause-joining conjunction. It flagged "почти ничего не стоит, а
    R² = 0,84 не сказал об этом ничего" -- two independent statements, where the
    English original simply reads ", and". The discriminator is the same one the
    English detector uses: the rhetorical move is SHORT. «не изъян, а
    особенность» replaces one noun with another; a following clause that carries
    its own subject and verb is not the move.
    """
    out = []
    for m in re.finditer(r"\bне ([а-яё]+), а\b(.*)", txt):
        tail = m.group(2).strip()
        # Words up to the end of this clause. The comma split must IGNORE a
        # comma between digits: Russian writes decimals as "0,84", and splitting
        # on it cut the clause down to "R² = 0" -- three words, so a two-clause
        # sentence was read as the clipped rhetorical move. The checker had the
        # very locale bug the pages are being fixed for.
        clause = re.split(r"(?<!\d),(?!\d)|[.;—]", tail)[0].strip()
        if clause and len(clause.split()) <= 4:
            out.append(f"не {m.group(1)}, а {clause}"[:46])
    return out


RU_BANNED = [
    (r"Не [а-яё]+\.\s+[А-ЯЁ]", "«Не X. Y» — сформулируйте X, затем Y"),
    (r"\bважно отметить\b|\bстоит отметить\b|\bследует отметить\b",
     "удаляемая вставка"),
    (r"\bглавный вывод\b|\bключевой инсайт\b", "лишнее выделение"),
]

MAX_BOLD = 2   # a term at its point of definition, once or twice per page

# A .formula block does not wrap, so a line wider than the left column is cut
# off. 44 monospace characters is what 29rem holds at --body size minus the
# block's own padding; the English pages that fit sit at 32-43.
MAX_FORMULA = 44

# Pages whose formula blocks fit today, so a regression on them is a failure.
# The rest are a NAMED BACKLOG, not an exemption: overfit.html (70 chars),
# clt.html (60) and classify.html (58) each lose the right-hand end of a line
# and need their formulas reworded, which is prose work on the English pages.
ENFORCED_FORMULA = {
    "ci.html", "corr.html", "index.html", "intuition.html", "regression.html",
    "simpson.html", "test.html", "typical.html", "diagnostics.html",
    "ru/ci.html", "ru/clt.html", "ru/corr.html", "ru/index.html",
    "ru/intuition.html", "ru/simpson.html", "ru/test.html", "ru/typical.html",
    "ru/regression.html",
}


def blocks_of(seg: str) -> list[str]:
    """The visible text of each block element, separately.

    The rhetorical pair lives INSIDE one paragraph or list item. Running the
    detector over a flattened page produced four false pairs: an <h2> heading
    read as the first half ("Why squares, and not just distances." + the
    paragraph under it), and one list item read as the first half of the next.
    Neither is the construction; both are just adjacent text.
    """
    out = []
    for m in re.finditer(r"<(p|h1|h2|h3|li|dd|dt)\b[^>]*>(.*?)</\1>", seg,
                         re.S | re.I):
        t = re.sub(r"<[^>]+>", " ", m.group(2))
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            out.append(t)
    return out


def text_of(seg: str) -> str:
    """Visible text, with block boundaries preserved as sentence breaks.

    Stripping tags to a single space merges adjacent blocks into one pseudo
    sentence: an <h1> followed by a <p class="sub"> became "Most people are below
    average And that is not an insult." — 10 words, over the length threshold, so
    the banned construction sitting in the sub-heading was never flagged. Any
    check that measures sentences has to respect where sentences actually end.
    """
    seg = re.sub(r"</(p|h1|h2|h3|li|dt|dd|div|td|th|tr|ol|ul|dl|section)>",
                 ". ", seg, flags=re.I)
    seg = re.sub(r"<br\s*/?>", ". ", seg, flags=re.I)
    seg = re.sub(r"<[^>]+>", " ", seg)
    seg = re.sub(r"\s+", " ", seg)
    return re.sub(r"(\.\s*)+\.", ". ", seg)


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
    txt = text_of(body)
    pats = RU_BANNED if name.startswith("ru/") else EN_BANNED
    hits = [(why, m.group(0).strip()[:46])
            for pat, why in pats for m in re.finditer(pat, txt)]
    for blk in blocks_of(body):
        for pair in negate_then_assert(blk):
            hits.append(("'not X. Y' — state X, then state Y in two sentences",
                         pair))
        if name.startswith("ru/"):
            for pair in ru_negate_replace(blk):
                hits.append(("«не X, а Y» — сформулируйте утверждение прямо",
                             pair))
    # Bold is counted in PROSE only. The .note and .tech blocks are fenced
    # reference material where a bold span is a label (`Coverage:`, `Data:`) and
    # therefore structure rather than emphasis. A banned construction is wrong
    # anywhere, so those are still counted across the whole body.
    prose = re.sub(r'<div class="(note|tech)"[\s\S]*?</div>', " ", body)
    # `<b style="color:…">` is a COLOUR KEY, not emphasis: it ties a word in the
    # prose to a colour in the chart beside it ("bars that miss turn red", with
    # `red` in the chart's red). Those are exempt on purpose. Everything else
    # counts -- including a `<b>` carrying any other attribute, which the old
    # bare-`<b>` regex silently ignored, so a decorative `<b class="…">` would
    # have slipped past the limit unnoticed.
    prose = re.sub(r'<b style="color:[^"]*">', " COLOURKEY ", prose)
    bold = len(re.findall(r"<b\b", prose))
    over = max(0, bold - MAX_BOLD)

    # A .formula block is `white-space: pre; overflow-x: auto`, so a line wider
    # than the 29rem left column is not wrapped -- it is silently CUT OFF with a
    # scrollbar a reader will never think to use. Measured: overfit.html loses
    # "← cannot rise as columns are added" entirely. Only TOP-LEVEL lines count;
    # a <span> child is a separate, smaller element that wraps normally.
    widest = 0
    for fm in re.finditer(r'(?s)<div class="formula">(.*?)</div>', body):
        inner = re.sub(r"(?s)<span.*?</span>", "", fm.group(1))
        inner = html.unescape(re.sub(r"<[^>]+>", "", inner))
        for line in inner.split("\n"):
            widest = max(widest, len(line.rstrip()))
    too_wide = widest > MAX_FORMULA

    ok = not hits and not over and not (too_wide and name in ENFORCED_FORMULA)
    tag = "OK  " if ok else ("FAIL" if name in ENFORCED else "todo")
    print(f"  [{tag}] {name:<20} banned {len(hits):>2}   <b> {bold:>2} "
          f"(limit {MAX_BOLD})   formula {widest:>2} (limit {MAX_FORMULA})")
    for why, txt_ in hits[:4]:
        print(f"          {why}: {txt_!r}")
    if len(hits) > 4:
        print(f"          … and {len(hits) - 4} more")
    if too_wide and name not in ENFORCED_FORMULA:
        backlog.append(f"{name}: formula line {widest} chars > {MAX_FORMULA}, "
                       f"cut off by the column")
    if not ok:
        msg = (f"{name}: {len(hits)} banned construction(s), "
               f"{bold} bold span(s)"
               + (f", formula line {widest} chars" if too_wide else ""))
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
