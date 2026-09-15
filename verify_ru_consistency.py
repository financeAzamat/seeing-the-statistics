#!/usr/bin/env python3
"""Do the eleven Russian pages agree with EACH OTHER?

The other checks each look at one page at a time. verify_extras.py and friends
re-derive the figures, verify_ru.py asserts nothing was left untranslated, and
verify_style.py holds each page to the writing rules. None of them can see
DRIFT: a term rendered two ways, a percent sign spaced two ways, a shared
section heading worded two ways. Each is invisible on any single page and
obvious across the set.

Four things are asserted. The rest is printed for a human to read.

  1. NUMBER CONVENTIONS. Russian groups thousands with a space, so an
     English-style `53,940` that survived translation is a miss. The
     discriminator is the ENGLISH page: `0,658` in Russian beside `0.658` in
     English is a correctly converted decimal, while `53,940` in Russian beside
     `53,940` in English is an unconverted separator. Without that comparison
     the check flags every three-decimal correlation coefficient on corr.html.

  2. PERCENT SPACING. GOST would put a space before `%`, but the canvas
     renderers emit `95,03%` with none, and prose that disagrees with the figure
     beside it looks like a typo. The course convention is therefore no space,
     and this holds every page and the strings table to it.

  3. SHARED HEADING PARITY. The tech section is headed two ways in English
     ("In exam language" and "The same thing, in exam language"). That is
     allowed, but each English wording must map to exactly ONE Russian wording.
     It did not: six English "In exam language" pages split four/two between
     two Russian headings.

  4. TYPOGRAPHY. One convention per mark across the whole set.
"""
from __future__ import annotations

import collections
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
RU = HERE / "ru"
PAGES = sorted(RU.glob("*.html"))

STRIP = [
    re.compile(r"<script.*?</script>", re.S),
    re.compile(r"<style.*?</style>", re.S),
    re.compile(r"<code>.*?</code>", re.S),
    re.compile(r"<!--.*?-->", re.S),
]

fails: list[str] = []


def prose(path: pathlib.Path) -> str:
    s = path.read_text(encoding="utf-8")
    for rx in STRIP:
        s = rx.sub(" ", s)
    return re.sub(r"<[^>]+>", " ", s).replace("&nbsp;", " ")


def head(name: str) -> None:
    print("\n" + "=" * 74)
    print(name)
    print("=" * 74)


# ---------------------------------------------------------------------------
head("1. THOUSANDS ARE GROUPED WITH A SPACE, NOT A COMMA")
for p in PAGES:
    en = HERE / p.name
    en_txt = prose(en) if en.exists() else ""
    ru_txt = prose(p)
    # A token is an unconverted separator only if the English page writes the
    # SAME token with a comma. A converted decimal shows up in English with a
    # dot, so it never matches.
    bad = sorted({t for t in re.findall(r"\d{1,3},\d{3}(?!\d)", ru_txt)
                  if t in en_txt})
    print(f"  {p.name:<20} comma-grouped survivors: {bad or 'none'}")
    for t in bad:
        fails.append(f"{p.name} keeps the English separator in {t!r} — "
                     f"Russian groups thousands with a space")

# ---------------------------------------------------------------------------
head("2. PERCENT SIGN — no space before it, everywhere")
targets = list(PAGES) + [RU / "strings.js"]
for p in targets:
    txt = prose(p) if p.suffix == ".html" else p.read_text(encoding="utf-8")
    hits = sorted(set(re.findall(r"\d\s%", txt)))
    print(f"  {p.name:<20} spaced percent: {len(hits)}")
    if hits:
        fails.append(f"{p.name} writes a space before % ({len(hits)} form(s)); "
                     f"the canvas emits '95,03%' with none")

# ---------------------------------------------------------------------------
head("3. SHARED HEADINGS — one English wording, one Russian wording")


def tech_h2(path: pathlib.Path) -> str | None:
    m = re.search(r'<div class="tech">\s*<h2>(.*?)</h2>',
                  path.read_text(encoding="utf-8"), re.S)
    return m.group(1).strip() if m else None


mapping: dict[str, set[str]] = collections.defaultdict(set)
for p in PAGES:
    en = HERE / p.name
    if not en.exists():
        continue
    e, r = tech_h2(en), tech_h2(p)
    if e and r:
        mapping[e].add(r)
for e, rs in sorted(mapping.items()):
    ok = len(rs) == 1
    print(f"  {'OK  ' if ok else 'DRIFT'}  {e!r}")
    for r in sorted(rs):
        print(f"           -> {r!r}")
    if not ok:
        fails.append(f"the English heading {e!r} is translated {len(rs)} "
                     f"different ways: {sorted(rs)}")

# ---------------------------------------------------------------------------
head("4. TYPOGRAPHY — one convention per mark")
TYPO = [
    ("straight double quote", r'"'),
    ("apostrophe inside a word", r"(?<=\w)'(?=\w)"),
    ("'e' where 'yo' belongs", r"\b(ее|еще)\b"),
    ("hyphen as a dash between spaces", r"\s-\s"),
    ("three dots instead of an ellipsis", r"\.\.\."),
    ("decimal point between digits", r"\d\.\d"),
]
for label, pat in TYPO:
    hits = []
    for p in PAGES:
        n = len(re.findall(pat, prose(p)))
        if n:
            hits.append(f"{p.stem}:{n}")
    print(f"  {label:<36} {', '.join(hits) if hits else 'clean'}")
    for h in hits:
        fails.append(f"{h.split(':')[0]}.html — {label}")

# ---------------------------------------------------------------------------
head("5. SHARED UI STRINGS (report only — confirm these SHOULD match)")
labels: dict[str, set[str]] = collections.defaultdict(set)
for p in PAGES:
    s = p.read_text(encoding="utf-8")
    for m in re.finditer(r"<button[^>]*>(.*?)</button>", s, re.S):
        t = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        if not t.isdigit():
            labels["button: " + t].add(p.stem)
    for m in re.finditer(r'<span class="k">(.*?)</span>', s, re.S):
        labels["readout: " + re.sub(r"<[^>]+>", "", m.group(1)).strip()].add(p.stem)
for k in sorted(labels):
    if len(labels[k]) > 1:
        print(f"  {k:<34} {len(labels[k])} pages")

# ---------------------------------------------------------------------------
print("\n" + "=" * 74)
if fails:
    print(f"{len(fails)} CONSISTENCY FAILURE(S)")
    for f in fails:
        print(f"  - {f}")
    sys.exit(1)
print("The eleven Russian pages agree with each other: thousands grouped with a")
print("space, no space before %, each shared heading translated one way, and one")
print("typographic convention per mark.")
