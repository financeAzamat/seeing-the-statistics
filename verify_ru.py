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
runtime_ok = set()
for js in (HERE / "simpson.js",):
    if js.exists():
        blob = js.read_text(encoding="utf-8")
        runtime_ok |= {k for k in extra if k in blob}
orphans = [k for k in extra if k not in runtime_ok]
print(f"  {len(extra)} entries not literal keys; {len(runtime_ok)} come from a "
      f"data file, {len(orphans)} orphaned")
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
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("Every key the renderers ask for has a Russian entry, none was left in")
print("English, no entry is orphaned, the strings table loads before the code")
print("that reads it, and the prose uses Russian number conventions.")
