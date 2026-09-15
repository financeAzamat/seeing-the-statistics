"""Verify the Russian locale.

A translation fails in ways a normal check cannot see: a key added to the code
with no entry in the strings table falls back to English and looks merely
inconsistent rather than broken, and an entry copied without translating looks
finished. Both are asserted here.

  1. EVERY TR KEY IS TRANSLATED. The keys are extracted from the renderers, and
     the strings table is loaded with node -- not substring-matched -- so
     concatenated format strings are compared as the single key they become.
  2. NOTHING IS LEFT IN ENGLISH. A value identical to its key means the entry
     was added but never translated.
  3. NO ORPHANS. An entry with no matching key in any renderer is dead weight,
     and usually means the code was reworded and the table was not.
  4. THE LOAD ORDER IS RIGHT. The strings file must be loaded BEFORE the
     renderer, or the renderer reads an empty table and silently shows English.
  5. RUSSIAN NUMBER CONVENTIONS. A Russian page quoting a decimal point instead
     of a comma is a translation miss, not a style choice.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
RU = HERE / "ru"
fails: list[str] = []

# Renderers that participate in translation, and the strings table they use.
STRINGS = RU / "strings.js"


def tr_keys(path: Path) -> list[str]:
    """Every TR('...' + '...') key in a renderer, joined as the code joins it."""
    src = path.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(
        r"TR\(\s*('(?:[^'\\]|\\.)*'(?:\s*\+\s*'(?:[^'\\]|\\.)*')*)", src
    ):
        parts = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(1))
        out.append("".join(parts))
    return list(dict.fromkeys(out))


def shared_keys() -> list[str]:
    """Keys looked up by the SHARED drawing layer rather than by a renderer.

    draw.js is not a *.render.js and does not call TR -- it reads the strings
    table directly through its own fmtUnit() helper, for the compact magnitude
    suffixes on axis labels. Without harvesting these, every such entry looks
    like an orphan and the check reports a failure for a string that is very
    much in use. fmtUnit takes (key, english_fallback), so only the first
    argument is a table key.
    """
    out: list[str] = []
    src = HERE / "draw.js"
    if src.exists():
        out += re.findall(r"fmtUnit\(\s*'((?:[^'\\]|\\.)*)'",
                          src.read_text(encoding="utf-8"))
    return list(dict.fromkeys(out))


def load_strings() -> dict[str, str]:
    """Load the table with node, so concatenation and escapes are handled by the
    same engine the browser uses rather than by a regex."""
    probe = (
        "globalThis.window = {};\n"
        f"require({json.dumps(str(STRINGS))});\n"
        "process.stdout.write(JSON.stringify(window.UDJ_STRINGS));\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(probe)
        tmp = f.name
    r = subprocess.run(["node", tmp], capture_output=True, text=True)
    if r.returncode != 0:
        print("ru/strings.js does not load under node:\n" + r.stderr)
        sys.exit(1)
    return json.loads(r.stdout)


RENDERERS = sorted(p for p in HERE.glob("*.render.js")
                   if "TR(" in p.read_text(encoding="utf-8"))
print(f"renderers using TR(): {[p.name for p in RENDERERS] or 'none'}")
if not RENDERERS:
    print("nothing to verify yet")
    sys.exit(0)

table = load_strings()
print(f"ru/strings.js loads under node: {len(table)} entries")

keys: list[str] = []
for p in RENDERERS:
    keys.extend(tr_keys(p))
keys.extend(shared_keys())
keys = list(dict.fromkeys(keys))

print("\n" + "=" * 74)
print("1. EVERY KEY IN THE CODE HAS A RUSSIAN ENTRY")
print("=" * 74)
missing = [k for k in keys if k not in table]
print(f"  {len(keys)} keys in the renderers, {len(missing)} without an entry")
for k in missing:
    print(f"   MISSING: {k[:66]!r}")
    fails.append(f"no Russian for {k[:60]!r}")

print("\n" + "=" * 74)
print("2. NOTHING WAS LEFT IN ENGLISH")
print("=" * 74)
untranslated = [k for k, v in table.items() if k == v]
print(f"  {len(untranslated)} entr(ies) identical to their key")
for k in untranslated:
    print(f"   NOT TRANSLATED: {k[:66]!r}")
    fails.append(f"{k[:60]!r} is present but identical to the English")
# a Russian value with no Cyrillic at all is almost certainly a miss
NO_CYR = [k for k, v in table.items()
          if not re.search(r"[А-Яа-яЁё]", v) and re.search(r"[A-Za-z]{4}", v)]
for k in NO_CYR:
    print(f"   NO CYRILLIC: {k[:50]!r} -> {table[k][:40]!r}")
    fails.append(f"the value for {k[:50]!r} contains no Cyrillic")

print("\n" + "=" * 74)
print("3. NO ORPHANED ENTRIES")
print("=" * 74)
# Data-file prose and grading labels are passed through TR at runtime rather
# than appearing as literals, so they are legitimate non-literal keys. Keys
# beginning `__` are directives to the renderer (e.g. __locale), not strings.
extra = [k for k in table if k not in keys and not k.startswith("__")]


def data_strings() -> set[str]:
    """Every string value in every shipped data file.

    Two things this must get right. It scans ALL data files rather than a named
    one, so translating another page does not require editing this check. And it
    compares against PARSED values, because a key containing a double quote is
    escaped in the JSON source — a raw substring match reports every such key as
    an orphan, which it did for all six quiz questions.
    """
    out: set[str] = set()

    def walk(v):
        if isinstance(v, str):
            out.add(v)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    for js in sorted(HERE.glob("*.js")):
        if js.name.endswith(".render.js") or js.name in (
                "draw.js", "motion.js", "stats.js", "nav.js"):
            continue
        txt = js.read_text(encoding="utf-8")
        try:
            i = min(k for k in (txt.find("["), txt.find("{")) if k >= 0)
            j = max(txt.rfind("]"), txt.rfind("}"))
            walk(json.loads(txt[i:j + 1]))
        except Exception:
            continue          # not a plain JSON payload; nothing to harvest
    return out


def renderer_literals() -> set[str]:
    """Every string literal that appears verbatim in a renderer.

    A renderer may hold its own lookup table whose values are fetched at runtime
    and passed through TR -- clt.render.js keeps a HINTS object with one
    explanatory paragraph per dataset, read as `TR(HINTS[D.id])`. The literal
    therefore never appears INSIDE a TR( call and is not in a data file either,
    so without this the three paragraphs were reported as orphans while being
    very much on screen.

    This keeps the check's real purpose intact: an entry whose text appears
    nowhere in the code or the data is still an orphan.
    """
    out: set[str] = set()
    for p in RENDERERS:
        src = p.read_text(encoding="utf-8")
        for m in re.finditer(r"'((?:[^'\\\n]|\\.){12,})'", src):
            out.add(m.group(1).replace("\\'", "'").replace('\\"', '"'))
        for m in re.finditer(r'"((?:[^"\\\n]|\\.){12,})"', src):
            out.add(m.group(1).replace("\\'", "'").replace('\\"', '"'))
    return out


runtime_ok = {k for k in extra if k in data_strings() or k in renderer_literals()}
orphans = [k for k in extra if k not in runtime_ok]
print(f"  {len(extra)} entries not literal keys; {len(runtime_ok)} come from a "
      f"data file or a renderer lookup table, {len(orphans)} orphaned")
for k in orphans:
    print(f"   ORPHAN: {k[:66]!r}")
    fails.append(f"{k[:60]!r} matches nothing in the code or the data")

print("\n" + "=" * 74)
print("4. LOAD ORDER — the strings table must come BEFORE the renderer")
print("=" * 74)
for page in sorted(RU.glob("*.html")):
    scripts = re.findall(r'<script src="([^"]+)"', page.read_text(encoding="utf-8"))
    rend = [s for s in scripts if s.endswith(".render.js")]
    if not rend:
        print(f"  {page.name:<18} no renderer — nothing to order")
        continue
    if "strings.js" not in scripts:
        fails.append(f"ru/{page.name} loads a renderer but not strings.js")
        continue
    ok = scripts.index("strings.js") < min(scripts.index(r) for r in rend)
    print(f"  {page.name:<18} strings.js before {rend[0]}: {ok}")
    if not ok:
        fails.append(f"ru/{page.name} loads strings.js after the renderer, so the "
                     f"table is empty when the renderer reads it")

print("\n" + "=" * 74)
print("5. RUSSIAN NUMBER CONVENTIONS IN THE PROSE")
print("=" * 74)
for page in sorted(RU.glob("*.html")):
    s = page.read_text(encoding="utf-8")
    body = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", s)
    body = re.sub(r"<[^>]+>", " ", body)
    # a decimal POINT between digits, outside code/ids, reads as untranslated
    pts = re.findall(r"(?<![\w.])\d+\.\d+(?![\w.])", body)
    pts = [p for p in pts if p not in ("3.14",)]
    print(f"  {page.name:<18} decimal points in prose: {len(pts)} {pts[:6]}")
    if pts:
        fails.append(f"ru/{page.name} quotes {pts[:4]} with a decimal point; "
                     f"Russian uses a comma")

print("\n" + "=" * 74)
print("6. NUMBER FORMATTING IN THE RENDERERS")
print("=" * 74)
# A translated renderer must not format a displayed number with toFixed():
# toFixed always emits a decimal POINT regardless of locale, so the canvas
# printed "27.3%" and "1.16 ct" next to Russian prose written with a comma. The
# prose check above cannot see canvas text, so this is checked in the code.
for p in RENDERERS:
    code = re.sub(r"/\*.*?\*/", " ", p.read_text(encoding="utf-8"), flags=re.S)
    code = re.sub(r"(?m)//[^\n]*$", " ", code)
    bare = re.findall(r"\.toFixed\(", code)
    hard = "toLocaleString('en-GB')" in code or 'toLocaleString("en-GB")' in code
    print(f"  {p.name:<26} bare .toFixed(): {len(bare)}   hard-coded en-GB: "
          f"{'yes' if hard else 'no'}")
    if bare:
        fails.append(f"{p.name} formats {len(bare)} number(s) with .toFixed(), which "
                     f"always emits a decimal point — use a locale-aware formatter")
    if hard:
        fails.append(f"{p.name} hard-codes the en-GB locale for digit grouping")

print("\n" + "=" * 74)
print("7. DATA-FILE TEXT FIELDS ARE ROUTED THROUGH TR")
print("=" * 74)
# The bug this catches: the geyser axis printed "50,0 min" beside Russian prose
# saying "минуты", because the unit affixes live in the DATA file and were
# concatenated raw. Checks 1-3 cannot see it -- there is no literal key to be
# missing, and the string IS in a data file so it is not an orphan either. So
# assert the code shape instead: a textual field read off a data record must be
# wrapped at every use.
TEXT_FIELDS = ("unit", "unitAfter", "label", "what", "source", "xLabel", "yLabel")
for p in RENDERERS:
    code = re.sub(r"/\*.*?\*/", " ", p.read_text(encoding="utf-8"), flags=re.S)
    code = re.sub(r"(?m)//[^\n]*$", " ", code)
    # Three shapes are reads that are NOT display, and counting them produced
    # false positives. Removing them before counting is what keeps the check
    # worth reading:
    #   `qq.source.split(' ')[0]`   -> tokenising a FILE NAME out of a citation
    #   `label: g.label`            -> copying a field into a state object
    #   `/^[£$€]$/.test(D.unit)`    -> branching on the unit, not printing it
    # A check that flags these teaches the reader to ignore it.
    for fld in TEXT_FIELDS:
        code = re.sub(r"\b\w+\.%s\s*\.\s*split\s*\(" % fld, " SPLIT( ", code)
        code = re.sub(r"\b\w+\s*:\s*\w+\.%s\b" % fld, " COPY ", code)
        code = re.sub(r"\.test\(\s*\w+\.%s\s*\)" % fld, ".test( TESTED )", code)
    raw: list[str] = []
    for fld in TEXT_FIELDS:
        total = len(re.findall(r"\b\w+\.%s\b" % fld, code))
        wrapped = len(re.findall(r"TR\(\s*\w+\.%s\b" % fld, code))
        if total > wrapped:
            raw.append(f"{fld} ({total - wrapped} raw)")
    print(f"  {p.name:<26} unwrapped text fields: {', '.join(raw) or 'none'}")
    for r_ in raw:
        fails.append(f"{p.name} reads {r_} straight from the data file without "
                     f"TR(), so it stays English on a translated page")

print("\n" + "=" * 74)
print("8. NO STRAY CJK / FULLWIDTH CHARACTERS")
print("=" * 74)
# Twice now a CJK character has been typed into Russian prose by accident
# ("短cuts" in a sub-heading, "даёт많 много" in a paragraph). Both were caught by
# eye, which is not a control -- a single ideograph inside a Cyrillic word is
# easy to read straight past. This scans the Russian sources AND the strings
# table, since a bad character in a translation value renders just the same.
CJK = re.compile(
    "[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff"
    "\uac00-\ud7af\uff00-\uffef]"
)
scanned = sorted(RU.glob("*.html")) + [STRINGS]
for p in scanned:
    if not p.exists():
        continue
    hits = CJK.findall(p.read_text(encoding="utf-8"))
    uniq = sorted(set(hits))
    print(f"  {p.name:<18} CJK/fullwidth: {len(hits)} {uniq[:6]}")
    if hits:
        fails.append(f"ru/{p.name} contains {len(hits)} CJK/fullwidth "
                     f"character(s) {uniq[:4]} — almost certainly a typo")

print("\n" + "=" * 74)
print("9. NO OVERSIZED NON-BREAKING RUNS IN RUSSIAN HEADINGS")
print("=" * 74)
# The English headings use &nbsp; to keep a short pair together ("The
# Central&nbsp;Limit"). Copying that into Russian glued "Центральная предельная"
# into ONE unbreakable ~700px token, which overflowed the 29rem left column and
# painted the h1 straight over the stage's control bar -- buttons included. The
# left column is `minmax(300px, 29rem)`, so an unbreakable run much past ~16
# characters cannot fit at the display size. No existing check could see this:
# the markup is valid, the prose is correct, and only a screenshot showed it.
NBSP_RUN = re.compile(r"(?s)<(h1|h2)[^>]*>(.*?)</\1>")
for page in sorted(RU.glob("*.html")):
    text = page.read_text(encoding="utf-8")
    worst: list[str] = []
    for m in NBSP_RUN.finditer(text):
        inner = re.sub(r"<[^>]+>", "", m.group(2))
        # a "run" is words joined only by non-breaking spaces
        for run in re.split(r"[ \t\n]+", inner.replace("&nbsp;", "\u00a0")):
            joined = run.replace("\u00a0", " ").strip()
            if "\u00a0" in run and len(joined) > 16:
                worst.append(joined)
    print(f"  {page.name:<18} oversized non-breaking runs: {len(worst)} {worst[:2]}")
    for w in worst:
        fails.append(f"ru/{page.name} glues {w!r} ({len(w)} chars) with a "
                     f"non-breaking space; it cannot wrap and overflows the column")

print("\n" + "=" * 74)
print("10. NO DUPLICATE KEYS IN THE STRINGS TABLE")
print("=" * 74)
# This one is a genuine blind spot for every other check here: load_strings()
# runs the file through node, and a JavaScript object literal silently keeps only
# the LAST of a duplicated key. So a second entry for a key that already exists
# is invisible after loading -- and if the two translations differed, the first
# would vanish with no error anywhere. Found exactly that: 'Wait between
# eruptions' had been added twice, once for typical.js and once for datasets.js.
# This reads the SOURCE, which is the only place the duplication still exists.
src = STRINGS.read_text(encoding="utf-8")
key_lines: list[str] = []
for m in re.finditer(r"(?m)^  (?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")\s*:", src):
    key_lines.append(m.group(1) if m.group(1) is not None else m.group(2))
for m in re.finditer(r"(?m)^  \[([^\]]*)\]\s*:", src):
    parts = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(1))
    key_lines.append("".join(parts))
dupes = sorted({k for k in key_lines if key_lines.count(k) > 1})
print(f"  {len(key_lines)} keys in the source, {len(dupes)} duplicated")
for k in dupes:
    print(f"   DUPLICATE: {k[:60]!r}")
    fails.append(f"{k[:50]!r} appears {key_lines.count(k)} times in "
                 f"ru/strings.js; the object literal keeps only the last")

print("\n" + "=" * 74)
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("Every key the renderers ask for has a Russian entry, none was left in")
print("English, no entry is orphaned, the strings table loads before the code")
print("that reads it, and the prose uses Russian number conventions.")
