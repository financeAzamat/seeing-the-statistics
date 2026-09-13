"""Verify the packaged site: docs/, the injected navigation, and every locale.

Four things a bundle can be wrong about, all checked here:

  1. NAVIGATION CORRECTNESS, per locale. Every page carries exactly one nav
     block, its position matches that locale's running order, and its prev/next
     point at the real neighbours -- no prev on the first page, no next on the
     last. An off-by-one is invisible until someone clicks.

  2. THE LANGUAGE SWITCHER RESOLVES. Every page offers every locale, marks
     exactly one as current, and every link it offers points at a file that
     exists. A switcher that 404s is worse than no switcher.

  3. SELF-CONTAINMENT. Every asset a page loads must exist in that page's OWN
     directory -- each locale directory is self-contained, so no page needs `../`
     for a stylesheet. A `../` is permitted ONLY for a cross-locale page
     fallback, and must still resolve inside docs/.

  4. NOTHING PRIVATE SHIPPED. The repository holds a 26 MB download cache, the
     measurement scripts and sixteen verification scripts. docs/ must contain
     only pages and the assets the pages name.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "docs"   # see build_site.py: Pages serves a root or /docs only
sys.path.insert(0, str(HERE / "data"))

from build_site import LOCALES, NAV_BEGIN, NAV_END, manifest  # noqa: E402

fails: list[str] = []


def check(label, got, want):
    ok = got == want
    print(f"  {label:<56} {str(got)[:20]:>20} vs {str(want)[:20]:>20}  "
          f"{'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(f"{label}: got {got!r}, expected {want!r}")


if not OUT.exists():
    print("docs/ does not exist — run data/build_site.py first")
    sys.exit(1)

print("=" * 78)
print("1. NAVIGATION AND 2. THE LANGUAGE SWITCHER, PER LOCALE")
print("=" * 78)
codes = [l["code"] for l in LOCALES]
for loc in LOCALES:
    order = manifest(loc)
    N = len(order)
    d = OUT if loc["out"] == "." else OUT / loc["out"]
    present = [p.name for p in sorted(d.glob("*.html"))]
    print(f"\n  --- {loc['code']} ({loc['label']}) — {N} entries, "
          f"{len(present)} page(s) built ---")
    if "index.html" not in present:
        fails.append(f"{loc['code']}: no contents page in the output")
        continue

    for href in present:
        s = (d / href).read_text(encoding="utf-8")
        if s.count(NAV_BEGIN) != 1 or s.count(NAV_END) != 1:
            fails.append(f"{loc['code']}/{href}: expected exactly one nav block")
            continue
        nav = s[s.index(NAV_BEGIN):s.index(NAV_END)]
        if 'href="nav.css"' not in s:
            fails.append(f"{loc['code']}/{href} does not link nav.css")

        # --- the switcher: one current locale, every other one a live link
        cur = re.findall(r'<span class="on">([A-Z]{2})</span>', nav)
        offered = re.findall(r'<span class="sn-lang">(.*?)</span>\s*(?:<span|$)',
                             nav, re.S)
        seg = offered[0] if offered else nav
        links = re.findall(r'<a href="([^"]+)">([A-Z]{2})</a>', seg)
        labels = sorted(cur + [l[1] for l in links])
        if labels != sorted(x["label"] for x in LOCALES):
            fails.append(f"{loc['code']}/{href}: switcher offers {labels}, "
                         f"expected every locale")
        if len(cur) != 1 or cur[0] != loc["label"]:
            fails.append(f"{loc['code']}/{href}: switcher marks {cur} as current, "
                         f"expected exactly [{loc['label']!r}]")
        for target, lab in links:
            if not (d / target).resolve().exists():
                fails.append(f"{loc['code']}/{href}: switcher link to {lab} "
                             f"({target}) does not resolve")

        if href == "index.html":
            first = order[0]
            want = first["href"] if (d / first["href"]).exists() \
                else f'../{first["href"]}'
            if f'href="{want}"' not in nav:
                fails.append(f"{loc['code']}/index.html: start link is not "
                             f"{want!r}")
            if "sn-pos" in nav:
                fails.append(f"{loc['code']}/index.html shows a page position, "
                             f"but it is not a page in the sequence")
            print(f"  {'index.html':<20} switcher OK, start -> {want}")
            continue

        i = [e["href"] for e in order].index(href)
        m = re.search(r'class="sn-count">([^<]+)<', nav)
        if not m:
            fails.append(f"{loc['code']}/{href}: nav has no position label")
        else:
            want = loc["of"].format(i=i + 1, n=N)
            if m.group(1).strip() != want:
                fails.append(f"{loc['code']}/{href}: position reads "
                             f"{m.group(1)!r}, expected {want!r}")
        prev = re.search(r'class="sn-prev" href="([^"]+)"', nav)
        nxt = re.search(r'class="sn-next" href="([^"]+)"', nav)
        want_prev = order[i - 1]["href"] if i > 0 else None
        want_next = order[i + 1]["href"] if i < N - 1 else None
        got_prev = prev.group(1) if prev else None
        got_next = nxt.group(1) if nxt else None
        ok = got_prev == want_prev and got_next == want_next
        print(f"  {href:<20} {i + 1:>2}/{N}  prev={str(got_prev):<17} "
              f"next={str(got_next):<17} {'OK' if ok else 'FAIL'}")
        if got_prev != want_prev:
            fails.append(f"{loc['code']}/{href}: prev is {got_prev!r}, "
                         f"should be {want_prev!r}")
        if got_next != want_next:
            fails.append(f"{loc['code']}/{href}: next is {got_next!r}, "
                         f"should be {want_next!r}")

print("\n" + "=" * 78)
print("3. SELF-CONTAINMENT")
print("=" * 78)
for loc in LOCALES:
    d = OUT if loc["out"] == "." else OUT / loc["out"]
    referenced: set[str] = set()
    ups = 0
    for f in sorted(d.glob("*.html")):
        s = f.read_text(encoding="utf-8")
        for m in re.finditer(r'<(?:script|link)[^>]*?(?:src|href)="([^"]+)"', s):
            u = m.group(1)
            if u.startswith(("http://", "https://", "//", "#", "data:", "mailto:")):
                continue
            if ".." in u or u.startswith("/"):
                fails.append(f"{loc['code']}/{f.name}: an ASSET reaches outside "
                             f"its own directory: {u!r} — each locale must be "
                             f"self-contained")
                continue
            referenced.add(u)
            if not (d / u).exists():
                fails.append(f"{loc['code']}/{f.name} loads {u!r}, not present")
        # page links: `../x.html` is allowed as a cross-locale fallback, but
        # must still resolve inside docs/
        for m in re.finditer(r'<a[^>]*?href="([^"]+\.html)"', s):
            u = m.group(1)
            tgt = (d / u).resolve()
            if u.startswith("../"):
                ups += 1
                if OUT.resolve() not in tgt.parents and tgt.parent != OUT.resolve():
                    fails.append(f"{loc['code']}/{f.name}: {u!r} escapes docs/")
            if not tgt.exists():
                fails.append(f"{loc['code']}/{f.name} links to {u!r}, missing")
    orphans = sorted({f.name for f in d.glob("*")
                      if f.is_file() and f.suffix in (".js", ".css")} - referenced)
    print(f"  {loc['code']}: {len(referenced)} assets referenced, all present, "
          f"{ups} cross-locale fallback link(s), orphans: {orphans or 'none'}")
    if orphans:
        fails.append(f"{loc['code']} carries unreferenced assets: {orphans}")

print("\n" + "=" * 78)
print("4. NOTHING PRIVATE SHIPPED")
print("=" * 78)
BAD_SUFFIX = {".py", ".zip", ".xlsx", ".csv", ".pyc", ".bak"}
BAD_DIR = {"data", "cache", ".attic", "__pycache__"}
leaked = [str(f.relative_to(OUT)) for f in OUT.rglob("*")
          if any(p in BAD_DIR for p in f.relative_to(OUT).parts)
          or (f.is_file() and f.suffix in BAD_SUFFIX)]
check("private files in docs/", leaked, [])
allowed = {".html", ".js", ".css", ".json", ".md"}
check("unexpected file types", sorted({f.suffix for f in OUT.rglob("*")
                                       if f.is_file()} - allowed), [])
total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
nfiles = sum(1 for f in OUT.rglob("*") if f.is_file())
print(f"  bundle: {total / 1024:.0f} KB across {nfiles} files")
if total > 3 * 1024 * 1024:
    fails.append(f"bundle is {total / 1024 / 1024:.1f} MB — the cache has leaked")

print("\n" + "=" * 78)
print("5. THE MANIFEST MATCHES WHAT SHIPPED")
print("=" * 78)
mf = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
check("locales recorded", [s["locale"] for s in mf["locales"]], codes)
for s in mf["locales"]:
    d = OUT if s["locale"] == "en" else OUT / s["locale"]
    check(f"{s['locale']}: pages built", s["pages"], len(list(d.glob("*.html"))))
    check(f"{s['locale']}: order length", len(s["order"]), s["entries"])
check("a deployment README shipped", (OUT / "README.md").exists(), True)
readme = (OUT / "README.md").read_text(encoding="utf-8")
check("README discloses the font dependency", "Google Fonts" in readme, True)
check("README lists every locale",
      all(f"`{c}`" in readme for c in codes), True)

print("\n" + "=" * 78)
print("6. THE CONTENTS PAGES DO NOT LIE ABOUT THEMSELVES")
print("=" * 78)
# Every data page has its figures checked; the contents page had nobody checking
# it, and drifted -- it claimed eleven verification scripts and eight renderers
# when there were fifteen and eleven. Self-referential counts get the same
# treatment as any other published figure.
WORD = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
        7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven",
        12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen",
        16: "sixteen", 17: "seventeen", 18: "eighteen"}
n_verify = len(list(HERE.glob("verify_*.py")))
n_render = len(re.findall(r'^\s+"name": "', (HERE / "verify_render.py")
                          .read_text(encoding="utf-8"), re.M))
flat_en = re.sub(r"\s+", " ", (OUT / "index.html").read_text(encoding="utf-8"))

m = re.search(r"<b>Checks:</b> (\w+) verification scripts", flat_en)
check("claimed verification-script count", m.group(1) if m else None,
      WORD.get(n_verify))
m = re.search(r"executes all (\w+) renderers", flat_en)
check("claimed renderer count", m.group(1) if m else None, WORD.get(n_render))

# the coverage claim must match the module numbers the pages actually carry
mods = set()
for p in sorted(HERE.glob("*.html")):
    for mm in re.finditer(r"UDJ · Module (\d+)", p.read_text(encoding="utf-8")):
        mods.add(int(mm.group(1)))
have = sorted(mods)
gaps = [k for k in range(min(have), max(have) + 1) if k not in mods]
print(f"  modules with a page: {have}   gap(s): {gaps}")
if have != [1, 3, 4, 5, 6, 7, 8, 9] or gaps != [2]:
    fails.append(f"the coverage sentence says modules 1 and 3-9 with module 2 "
                 f"missing, but the pages carry {have} with gaps {gaps}")
for loc, cov, acro in (("en", r"modules 1 and 3–9",
                        r"Uncertainty, Data (&amp;|and) Judgment"),
                       ("ru", r"разделы 1 и 3–9",
                        r"Uncertainty, Data and Judgment")):
    d = OUT if loc == "en" else OUT / loc
    txt = re.sub(r"\s+", " ", (d / "index.html").read_text(encoding="utf-8"))
    okc = re.search(cov, txt) is not None
    oka = re.search(acro, txt) is not None
    print(f"  {loc}: coverage stated {okc}, acronym expanded {oka}")
    if not okc:
        fails.append(f"{loc}/index.html does not state which modules are covered")
    if not oka:
        fails.append(f"{loc}/index.html uses 'UDJ' without expanding it")

print("\n" + "=" * 78)
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("Every page in every locale carries one correct nav block with a working")
print("language switcher, each locale directory is self-contained, cross-locale")
print("fallbacks resolve inside the bundle, and nothing private shipped.")
