"""Verify the packaged site: docs/ and the injected navigation.

Three things a bundle can be wrong about, all checked here:

  1. NAVIGATION CORRECTNESS. Every page carries exactly one nav block, its
     position matches the running order, and its prev/next point at the real
     neighbours -- with no prev on the first page and no next on the last. An
     off-by-one here is invisible until someone clicks.

  2. SELF-CONTAINMENT. Every local asset referenced by a page in docs/ must
     EXIST in docs/. No page may reach outside the bundle with `../` or an
     absolute path. This is the check that catches a bundle which works only
     because the developer's source tree happens to sit next to it.

  3. NOTHING PRIVATE SHIPPED. The repository holds a 26 MB download cache, the
     measurement scripts and fifteen verification scripts. A bundle that leaks
     any of it is a defect, so docs/ is asserted to contain only pages and the
     assets the pages name.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE / "docs"   # see build_site.py: Pages serves a root or /docs only
sys.path.insert(0, str(HERE / "data"))

from build_site import NAV_BEGIN, NAV_END, manifest  # noqa: E402

fails: list[str] = []


def check(label, got, want):
    ok = got == want
    print(f"  {label:<58} {str(got)[:22]:>22} vs {str(want)[:22]:>22}  "
          f"{'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(f"{label}: got {got!r}, expected {want!r}")


if not DIST.exists():
    print("docs/ does not exist — run data/build_site.py first")
    sys.exit(1)

ORDER = manifest()
N = len(ORDER)
print(f"running order from index.html: {N} pages")

print("\n" + "=" * 78)
print("1. NAVIGATION — one block per page, correct position and neighbours")
print("=" * 78)
pages = ["index.html"] + [e["href"] for e in ORDER]
for href in pages:
    p = DIST / href
    if not p.exists():
        fails.append(f"{href} is in the running order but missing from docs/")
        continue
    s = p.read_text(encoding="utf-8")
    nb, ne = s.count(NAV_BEGIN), s.count(NAV_END)
    if nb != 1 or ne != 1:
        fails.append(f"{href}: {nb} nav-begin and {ne} nav-end markers — "
                     f"expected exactly one of each")
        continue
    nav = s[s.index(NAV_BEGIN):s.index(NAV_END)]
    if 'href="nav.css"' not in s:
        fails.append(f"{href} does not link nav.css, so its bar is unstyled")

    if href == "index.html":
        # the contents page offers a start link and no position
        has_start = f'href="{ORDER[0]["href"]}"' in nav
        print(f"  {'index.html links to the first page':<58} "
              f"{str(has_start):>22} vs {'True':>22}  {'OK' if has_start else 'FAIL'}")
        if not has_start:
            fails.append("index.html's nav does not link to the first page")
        if "sn-pos" in nav:
            fails.append("index.html shows a page position, but it is not a page "
                         "in the sequence")
        continue

    i = [e["href"] for e in ORDER].index(href)
    # position label
    m = re.search(r'class="sn-count">(\d+) of (\d+)<', nav)
    if not m:
        fails.append(f"{href}: nav has no 'N of M' position label")
    else:
        if int(m.group(1)) != i + 1 or int(m.group(2)) != N:
            fails.append(f"{href}: nav says {m.group(1)} of {m.group(2)}, "
                         f"should be {i + 1} of {N}")
    # prev / next targets
    prev = re.search(r'class="sn-prev" href="([^"]+)"', nav)
    nxt = re.search(r'class="sn-next" href="([^"]+)"', nav)
    want_prev = ORDER[i - 1]["href"] if i > 0 else None
    want_next = ORDER[i + 1]["href"] if i < N - 1 else None
    got_prev = prev.group(1) if prev else None
    got_next = nxt.group(1) if nxt else None
    ok = got_prev == want_prev and got_next == want_next
    print(f"  {href:<24} {i + 1:>2}/{N}  prev={str(got_prev):<18} "
          f"next={str(got_next):<18} {'OK' if ok else 'FAIL'}")
    if got_prev != want_prev:
        fails.append(f"{href}: prev is {got_prev!r}, should be {want_prev!r}")
    if got_next != want_next:
        fails.append(f"{href}: next is {got_next!r}, should be {want_next!r}")

print("\n" + "=" * 78)
print("2. SELF-CONTAINMENT — every referenced local asset exists IN docs/")
print("=" * 78)
referenced: set[str] = set()
for f in sorted(DIST.glob("*.html")):
    s = f.read_text(encoding="utf-8")
    for m in re.finditer(r'<(?:script|link)[^>]*?(?:src|href)="([^"]+)"', s):
        u = m.group(1)
        if u.startswith(("http://", "https://", "//", "#", "data:", "mailto:")):
            continue
        if ".." in u or u.startswith("/"):
            fails.append(f"{f.name} reaches outside the bundle: {u!r}")
            continue
        referenced.add(u)
        if not (DIST / u).exists():
            fails.append(f"{f.name} loads {u!r}, which is NOT in docs/")
    # an <a> to a sibling page must also resolve inside the bundle
    for m in re.finditer(r'<a[^>]*?href="([^"]+\.html)"', s):
        u = m.group(1)
        if not (DIST / u).exists():
            fails.append(f"{f.name} links to {u!r}, which is not in docs/")
print(f"  {len(referenced)} distinct local assets referenced, all present: "
      f"{'yes' if not fails else 'NO'}")
orphans = sorted({f.name for f in DIST.glob("*")
                  if f.is_file() and f.suffix in (".js", ".css")}
                 - referenced)
print(f"  assets present but referenced by no page: {orphans or 'none'}")
if orphans:
    fails.append(f"docs/ carries unreferenced assets: {orphans}")

print("\n" + "=" * 78)
print("3. NOTHING PRIVATE SHIPPED")
print("=" * 78)
BAD_SUFFIX = {".py", ".zip", ".xlsx", ".csv", ".pyc", ".bak"}
BAD_DIR = {"data", "cache", ".attic", "__pycache__"}
leaked = []
for f in DIST.rglob("*"):
    rel = f.relative_to(DIST)
    if any(part in BAD_DIR for part in rel.parts):
        leaked.append(str(rel))
    elif f.is_file() and f.suffix in BAD_SUFFIX:
        leaked.append(str(rel))
check("private files in docs/", leaked, [])
allowed = {".html", ".js", ".css", ".json", ".md"}
odd = sorted({f.suffix for f in DIST.rglob("*") if f.is_file()} - allowed)
check("unexpected file types in docs/", odd, [])
total = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
print(f"  bundle size: {total / 1024:.0f} KB across "
      f"{sum(1 for f in DIST.rglob('*') if f.is_file())} files")
if total > 3 * 1024 * 1024:
    fails.append(f"bundle is {total / 1024 / 1024:.1f} MB — the data cache has "
                 f"probably leaked in")

print("\n" + "=" * 78)
print("4. THE MANIFEST MATCHES WHAT SHIPPED")
print("=" * 78)
mf = json.loads((DIST / "manifest.json").read_text(encoding="utf-8"))
check("manifest page count", len(mf["pages"]), N)
check("manifest order is 1..N", [p["order"] for p in mf["pages"]],
      list(range(1, N + 1)))
check("every manifest page is in docs/",
      all((DIST / p["href"]).exists() for p in mf["pages"]), True)
check("every manifest asset is in docs/",
      all((DIST / a).exists() for a in mf["assets"]), True)
check("a deployment README shipped", (DIST / "README.md").exists(), True)
# the README must be honest about the one external dependency
readme = (DIST / "README.md").read_text(encoding="utf-8")
check("README discloses the Google Fonts dependency",
      "Google Fonts" in readme, True)

print("\n" + "=" * 78)
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("Every page carries one correct nav block, every asset a page loads exists")
print("inside the bundle, nothing reaches outside it, and no measurement script,")
print("dataset cache or verification script shipped.")
