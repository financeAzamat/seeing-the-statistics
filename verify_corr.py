"""Verify corr.html / corr.js / corr.render.js.

  1. RE-DERIVE every correlation from the raw CSVs, independently of
     build_corr.py. A generator that only agrees with itself proves nothing.
  2. CHECK the population-vs-sample discipline. Every r describes the full
     population inside its window; the plotted points are a seeded sample. This
     project has already shipped one wrong figure by measuring on the full source
     while drawing a sample, so: every drawn point must be a real row, and each
     window's `drawn` count must match the sample it is quoted beside.
  3. PIN every number in the prose, including the count word in the headline.
  4. CHECK the wiring and that the renderer uses the shared motion layer.

Claim patterns match WHITESPACE-NORMALISED markup and use `(\\d+\\.\\d+)` rather
than `([\\d.]+)`, which swallows a sentence-ending full stop. A pattern that no
longer matches is a FAILURE, never a silent pass.
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "data"))

from measure_corr import load, pearson, spearman  # noqa: E402

fails: list[str] = []


def check(label, got, want, tol=0.0):
    if isinstance(got, float) or isinstance(want, float):
        ok = abs(got - want) <= tol
    else:
        ok = got == want
    print(f"  {label:<54} {got!r:>14} vs {want!r:>14}  {'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(f"{label}: shipped {got!r}, re-derived {want!r}")


src = (HERE / "corr.js").read_text(encoding="utf-8")
SHIP = json.loads(src[src.index("{"):src.rindex("}") + 1])
D, G, DIRT = SHIP["diamond"], SHIP["geyser"], SHIP["dirt"]
html = (HERE / "corr.html").read_text(encoding="utf-8")
flat = re.sub(r"\s+", " ", html)
rend = (HERE / "corr.render.js").read_text(encoding="utf-8")

print("re-deriving from the raw CSVs, independently of build_corr.py")
DIA = load("diamonds.csv")
GEY = load("geyser.csv")
carat, price = DIA["carat"], DIA["price"]

TRUE: dict[str, float] = {}      # unrounded, for the prose assertions below

print("\n" + "=" * 76)
print("1. DIAMOND WINDOWS — r on the FULL population inside each")
print("=" * 76)
check("population size", D["nAll"], len(carat))
for w in D["windows"]:
    lo, hi = w["lo"], w["hi"]
    sel = ([i for i in range(len(carat)) if lo <= carat[i] <= hi]
           if lo is not None else list(range(len(carat))))
    r = pearson([carat[i] for i in sel], [price[i] for i in sel])
    TRUE[w["label"]] = r
    check(f"{w['label']:<14} n", w["n"], len(sel))
    check(f"{w['label']:<14} r", w["r"], round(r, 4), 1e-4)

# the collapse the page claims, re-derived as a ratio
full_r, tight_r = D["windows"][0]["r"], D["windows"][-1]["r"]
lost = round(100 * (1 - abs(tight_r) / abs(full_r)))
print(f"\n  r falls from {full_r:+.4f} to {tight_r:+.4f} — a loss of {lost}% of its size")

print("\n" + "=" * 76)
print("2. WHAT r MEASURES — straight line vs any monotone vs log-log")
print("=" * 76)
TRUE["pearson"] = pearson(carat, price)
TRUE["spearman"] = spearman(carat, price)
check("pearson r", D["pearson"], round(TRUE["pearson"], 4), 1e-4)
check("spearman rho", D["spearman"], round(TRUE["spearman"], 4), 1e-4)
pos = [(a, b) for a, b in zip(carat, price) if a > 0 and b > 0]
rl = pearson([math.log(a) for a, _ in pos], [math.log(b) for _, b in pos])
TRUE["logr"] = rl
check("r on log-log", D["logr"], round(rl, 4), 1e-4)
if not (abs(D["spearman"]) > abs(D["pearson"])):
    fails.append("the page claims rank correlation beats r here, but it does not")

print("\n" + "=" * 76)
print("3. GEYSER — high across two clusters, low inside either")
print("=" * 76)
gd, gw = GEY["duration"], GEY["waiting"]
check("eruptions", G["nAll"], len(gd))
TRUE["geyser"] = pearson(gd, gw)
check("overall r", G["r"], round(TRUE["geyser"], 4), 1e-4)
check("overall rho", G["rho"], round(spearman(gd, gw), 4), 1e-4)
for k, (lbl, pred) in enumerate((("short", lambda v: v < G["split"]),
                                 ("long", lambda v: v >= G["split"]))):
    keep = [i for i in range(len(gd)) if pred(gd[i])]
    r = pearson([gd[i] for i in keep], [gw[i] for i in keep])
    TRUE["geyser_" + lbl] = r
    check(f"{lbl} eruptions n", G["groups"][k]["n"], len(keep))
    check(f"{lbl} eruptions r", G["groups"][k]["r"], round(r, 4), 1e-4)
# the lesson requires BOTH within-group coefficients to be far below the pooled one
for k in (0, 1):
    if abs(G["groups"][k]["r"]) >= abs(G["r"]) * 0.6:
        fails.append(f"group {k} r {G['groups'][k]['r']} is not clearly below the "
                     f"pooled {G['r']} — the reverse-trap lesson does not hold")

print("\n" + "=" * 76)
print("4. POPULATION vs DRAWN SAMPLE")
print("=" * 76)
check("drawn points", len(D["pts"]), D["nDrawn"])
real = set()
for i in range(len(carat)):
    real.add((round(carat[i], 2), int(price[i])))
missing = [p for p in D["pts"] if (p[0], p[1]) not in real]
check("every drawn point is a real row", len(missing), 0)
if missing:
    fails.append(f"{len(missing)} plotted points do not exist in the source CSV")
for w in D["windows"]:
    lo, hi = w["lo"], w["hi"]
    got = len([1 for p in D["pts"]
               if lo is None or (lo <= p[0] <= hi)])
    check(f"{w['label']:<14} drawn inside", w["drawn"], got)
# and the page must never quote the drawn count as the population
for w in D["windows"][1:]:
    if w["drawn"] >= w["n"]:
        fails.append(f"{w['label']}: drawn {w['drawn']} >= population {w['n']}")
check("geyser plots every point", len(G["pts"]), len(gd))

print("\n" + "=" * 76)
print("5. REAL DIRT IN THE DIAMONDS TABLE")
print("=" * 76)
bad = [i for i in range(len(DIA["x"]))
       if DIA["x"][i] == 0 or DIA["y"][i] == 0 or DIA["z"][i] == 0]
ext = [i for i in range(len(DIA["y"])) if DIA["y"][i] > 20 or DIA["z"][i] > 20]
drop = set(bad) | set(ext)
keep = [i for i in range(len(DIA["x"])) if i not in drop]
check("zero-dimension rows", DIRT["nZero"], len(bad))
check("over-20mm rows", DIRT["nHuge"], len(ext))
check("rows dropped", DIRT["nDropped"], len(drop))
TRUE["dirty"] = pearson(DIA["x"], DIA["y"])
TRUE["clean"] = pearson([DIA["x"][i] for i in keep], [DIA["y"][i] for i in keep])
check("x->y r as shipped", DIRT["rDirty"], round(TRUE["dirty"], 4), 1e-4)
check("x->y r once cleaned", DIRT["rClean"], round(TRUE["clean"], 4), 1e-4)

print("\n" + "=" * 76)
print("6. EVERY NUMBER QUOTED IN THE PROSE")
print("=" * 76)


def claim(name, pattern, want, tol=0.0, group=1):
    m = re.search(pattern, flat)
    if not m:
        print(f"  {name:<54} {'NOT FOUND':>14}  FAIL")
        fails.append(f"{name}: pattern no longer matches the prose")
        return
    got = m.group(group)
    try:
        gv = float(got.replace(",", "").replace("\u2212", "-"))
        ok = abs(gv - want) <= tol
    except ValueError:
        gv, ok = got, got == want
    print(f"  {name:<54} {gv!r:>14} vs {want!r:>14}  {'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(f"{name}: prose says {gv!r}, data says {want!r}")


def at3(key: str) -> float:
    """The 3-decimal rounding of the TRUE coefficient -- exactly what the prose
    quotes. Rounding the already-4dp shipped value instead puts a legitimate
    0.406 (true 0.4055369) on the wrong side of a 0.0005 tolerance."""
    return round(abs(TRUE[key]), 3)


WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
claim("headline counts the windows shown",
      r"<h1>The same relationship, (\w+) different answers</h1>",
      WORDS[len(D["windows"])])
claim("lede r at full range", r"size and price is (?:<b>)?\+(\d+\.\d+)",
      round(abs(full_r), 2), 0.005)
claim("lede r in the tightest window",
      r"or (?:<b>)?\+(\d+\.\d+)(?:</b>)? depending only on", round(abs(tight_r), 2), 0.005)
claim("table: all sizes n", r"<td>all sizes</td><td>([\d,]+)</td>", D["windows"][0]["n"])
claim("table: all sizes r", r"<td>all sizes</td><td>[\d,]+</td><td class=\"g\">\+(\d+\.\d+)</td>",
      at3("full range"), 1e-9)
claim("table: 0.50-1.20 n", r"<td>0\.50–1\.20 ct</td><td>([\d,]+)</td>", D["windows"][2]["n"])
claim("table: 0.50-1.20 r", r"<td>0\.50–1\.20 ct</td><td>[\d,]+</td><td>\+(\d+\.\d+)</td>",
      at3("0.50–1.20 ct"), 1e-9)
claim("table: 0.90-1.10 n", r"<td>0\.90–1\.10 ct</td><td>([\d,]+)</td>", D["windows"][3]["n"])
claim("table: 0.90-1.10 r", r"<td>0\.90–1\.10 ct</td><td>[\d,]+</td><td class=\"b\">\+(\d+\.\d+)</td>",
      at3("0.90–1.10 ct"), 1e-9)
claim("table: 0.99-1.01 n", r"<td>0\.99–1\.01 ct</td><td>([\d,]+)</td>", D["windows"][5]["n"])
claim("table: 0.99-1.01 r", r"<td>0\.99–1\.01 ct</td><td>[\d,]+</td><td class=\"b\">\+(\d+\.\d+)</td>",
      at3("0.99–1.01 ct"), 1e-9)
claim("how much of r is lost", r"loses (?:<b>)?(\d+)%(?:</b>)? of its size", lost, 0.51)
claim("prose: r in the tightest window restated",
      r"<b>r = \+(\d+\.\d+) is the correct answer", at3("0.99–1.01 ct"), 1e-9)
claim("geyser: pooled r", r"correlate at (?:<b>)?\+(\d+\.\d+)", at3("geyser"), 1e-9)
claim("geyser table: all n", r"<td>all of them</td><td>(\d+)</td>", G["nAll"])
claim("geyser table: all r", r"<td>all of them</td><td>\d+</td><td class=\"g\">\+(\d+\.\d+)</td>",
      at3("geyser"), 1e-9)
claim("geyser table: short n", r"<td>short, under 3 min</td><td>(\d+)</td>", G["groups"][0]["n"])
claim("geyser table: short r", r"<td>short, under 3 min</td><td>\d+</td><td class=\"b\">\+(\d+\.\d+)</td>",
      at3("geyser_short"), 1e-9)
claim("geyser table: long n", r"<td>long, 3 min or more</td><td>(\d+)</td>", G["groups"][1]["n"])
claim("geyser table: long r", r"<td>long, 3 min or more</td><td>\d+</td><td class=\"b\">\+(\d+\.\d+)</td>",
      at3("geyser_long"), 1e-9)
claim("geyser: pooled r restated", r"That \+(\d+\.\d+) is almost entirely", at3("geyser"), 1e-9)
claim("three ways: pearson", r"how straight-line the rise is</td><td class=\"b\">\+(\d+\.\d+)</td>",
      at3("pearson"), 1e-9)
claim("three ways: spearman", r"does it rise at all</td><td class=\"g\">\+(\d+\.\d+)</td>",
      at3("spearman"), 1e-9)
claim("three ways: log-log", r"taking logs of both</td><td class=\"g\">\+(\d+\.\d+)</td>",
      at3("logr"), 1e-9)
claim("pearson restated after the table", r"The (?:<b>)?\+(\d+\.\d+)(?:</b>)? is r being docked",
      at3("pearson"), 1e-9)
claim("dirt: zero-dimension rows", r"<b>(\d+)</b> rows with a physically impossible",
      DIRT["nZero"])
claim("dirt: over-2cm stones", r"<b>(\d+)</b> stones recorded as over 2 cm", DIRT["nHuge"])
claim("dirt: rows dropped", r"those (\d+) rows of 53,940", DIRT["nDropped"])
claim("dirt: r before", r"correlation from <b>\+(\d+\.\d+)</b>", at3("dirty"), 1e-9)
claim("dirt: r after", r"to <b>\+(\d+\.\d+)</b>\. Twenty-three", at3("clean"), 1e-9)
claim("note: drawn sample size", r"seeded random sample of ([\d,]+) stones", D["nDrawn"])

print("\n" + "=" * 76)
print("7. WIRING")
print("=" * 76)
wb = sorted(int(v) for v in re.findall(r'data-w="(\d+)"', html))
check("window buttons", wb, list(range(len(D["windows"]))))
check("geyser buttons", sorted(re.findall(r'data-g="([a-z]+)"', html)),
      ["all", "long", "short"])
scripts = re.findall(r'<script src="([^"]+)"', html)
check("scripts loaded", scripts, ["corr.js", "draw.js", "motion.js", "corr.render.js"])
for f_ in scripts:
    if not (HERE / f_).exists():
        fails.append(f"corr.html loads {f_}, which does not exist")

# check the CODE, not the comments -- a substring search once flagged the word
# requestAnimationFrame inside a comment explaining a synchronous first paint
code = re.sub(r"/\*.*?\*/", " ", rend, flags=re.S)
code = re.sub(r"(?m)//[^\n]*$", " ", code)
for banned, why in ((r"\brequestAnimationFrame\s*\(", "must use M.Ticker"),
                    (r"\bfunction\s+ease\s*\(", "must use the shared easings")):
    hit = re.search(banned, code)
    print(f"  {'no ' + banned:<54} {'absent' if not hit else 'PRESENT':>14}  "
          f"{'OK' if not hit else 'FAIL'}")
    if hit:
        fails.append(f"corr.render.js: {banned!r} — {why}")
check("honours prefers-reduced-motion",
      bool(re.search(r"if \(reduce\)\s*\{\s*draw\(\);\s*return;\s*\}", code)), True)
# search the comment-stripped code: a trailing `// paint before the first raf`
# sat between draw() and the ticker and defeated the raw-source pattern
check("paints one frame before the ticker starts",
      bool(re.search(r"draw\(\);\s*ticker\s*=\s*new M\.Ticker", code)), True)

print("\n" + "=" * 76)
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("Every coefficient re-derives from the raw CSVs, every plotted point is a")
print("real row, every window's drawn count matches its sample, and all the prose")
print("figures match the population they claim to describe.")
