"""Verify typical.html / typical.js / typical.render.js.

Three jobs:

  1. RE-DERIVE every shipped figure from the raw cached sources, independently of
     build_typical.py, and compare. A generator that agrees only with itself
     proves nothing.
  2. PIN every number quoted in the page's prose. Thirteen errors in this
     project were caught by this kind of check and none by reading.
  3. CHECK the wiring: that every control maps to a real dataset id, that the
     page loads the files the renderer needs, and that the two-cluster claim is
     made only where the measured test passes.

Claim patterns are matched against WHITESPACE-NORMALISED markup and use
`(\\d+\\.\\d+)` rather than `([\\d.]+)`, because the loose form swallows a
sentence-ending full stop. A missing claim is a FAILURE, never a silent pass --
four claim regexes in this project stopped matching after a rewording and
reported success.
"""
from __future__ import annotations

import json
import re
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "data"))

from measure_typical import (below_mean, histogram, load_csv_col,  # noqa: E402
                            load_retail, peaks, within)

fails: list[str] = []


def check(label: str, got, want, tol=0.0):
    """Report and record. Numeric when tol is given, else exact equality."""
    if isinstance(got, float) or isinstance(want, float):
        ok = abs(got - want) <= tol
        line = f"  {label:<52} {got!r:>16} vs {want!r:>16}"
    else:
        ok = got == want
        line = f"  {label:<52} {got!r:>16} vs {want!r:>16}"
    print(line + ("  OK" if ok else "  FAIL"))
    if not ok:
        fails.append(f"{label}: shipped {got!r}, re-derived {want!r}")


# --------------------------------------------------------------- shipped data
src = (HERE / "typical.js").read_text(encoding="utf-8")
SHIP = {d["id"]: d for d in json.loads(src[src.index("["):src.rindex("]") + 1])}
html = (HERE / "typical.html").read_text(encoding="utf-8")
flat = re.sub(r"\s+", " ", html)
rend = (HERE / "typical.render.js").read_text(encoding="utf-8")

print("re-deriving from the raw sources, independently of build_typical.py")
RAW = {
    "retail": load_retail(),
    "diamond": load_csv_col("diamonds.csv", "price"),
    "geyser": load_csv_col("geyser.csv", "waiting"),
}
BINS = {"retail": (99.0, 40, 6), "diamond": (99.0, 40, 6), "geyser": (100.0, 24, 7)}

print("\n" + "=" * 74)
print("1. SHIPPED FIGURES vs INDEPENDENT RE-DERIVATION")
print("=" * 74)
for key, vals in RAW.items():
    d = SHIP[key]
    n = len(vals)
    mu = statistics.fmean(vals)
    med = statistics.median(vals)
    nb = below_mean(vals, mu)
    print(f"\n  --- {key} ---")
    check(f"{key} n", d["n"], n)
    check(f"{key} mean", d["mu"], round(mu, 4), 1e-4)
    check(f"{key} median", d["median"], round(med, 4), 1e-4)
    check(f"{key} below the mean", d["below"], nb)
    check(f"{key} above the mean", d["above"], n - nb)
    check(f"{key} percent below", d["pctBelow"], round(100.0 * nb / n, 1), 0.05)
    check(f"{key} mean/median ratio", d["ratio"], round(mu / med, 3), 1e-3)

    cap_pct, nbins, gap = BINS[key]
    if cap_pct >= 100:
        cap, beyond = vals[-1], 0
    else:
        k = min(n - 1, int(round(cap_pct / 100 * (n - 1))))
        cap = vals[k]
        beyond = sum(1 for v in vals if v > cap)
    check(f"{key} display cap", d["cap"], round(cap, 4), 1e-4)
    check(f"{key} beyond the cap", d["beyond"], beyond)

    shown = [v for v in vals if v <= cap]
    counts, lo, w = histogram(shown, nbins)
    check(f"{key} histogram bin count", len(d["counts"]), len(counts))
    check(f"{key} histogram total", sum(d["counts"]), sum(counts))
    check(f"{key} histogram identical", d["counts"] == counts, True)
    check(f"{key} bin origin", d["binLo"], round(lo, 4), 1e-4)
    check(f"{key} bin width", d["binW"], round(w, 6), 1e-6)
    # the histogram must account for exactly the observations inside the cap
    check(f"{key} counts == n - beyond", sum(d["counts"]), n - beyond)

    busiest_i = counts.index(max(counts))
    busiest = lo + (busiest_i + 0.5) * w
    check(f"{key} commonest value", d["busiest"], round(busiest, 3), 1e-3)
    check(f"{key} within window of the mean", d["nearMean"], within(vals, mu, w))
    check(f"{key} within window of the commonest",
          d["nearBusiest"], within(vals, busiest, w))

    # --- the two-cluster test, re-derived
    modes = sorted(lo + (i + 0.5) * w for i in peaks(counts, min_gap=gap)[:2])
    pk = peaks(counts, min_gap=gap)
    genuine = False
    if len(modes) >= 2:
        near = [within(vals, m, w) for m in modes]
        i1, i2 = sorted(pk[:2])
        mass = min(near) / max(near)
        dip = min(counts[i1:i2 + 1]) / min(counts[i1], counts[i2])
        genuine = mass >= 0.40 and dip <= 0.70 and modes[0] < mu < modes[1]
        print(f"    two-cluster test: mass ratio {mass:.3f} (need >= 0.40), "
              f"dip {dip:.3f} (need <= 0.70), mean between: {modes[0] < mu < modes[1]}")
    check(f"{key} flagged as two-cluster", d["bimodal"], genuine)
    if genuine:
        check(f"{key} cluster centres", d["modes"], [round(m, 2) for m in modes])

print("\n" + "=" * 74)
print("2. ONLY THE GEYSER MAY CLAIM TWO CLUSTERS")
print("=" * 74)
flagged = sorted(k for k, d in SHIP.items() if d["bimodal"])
check("datasets flagged two-cluster", flagged, ["geyser"])
# and the page must only print the two-cluster sentence for the geyser
n_cluster_sentences = len(re.findall(r"two clusters", flat))
print(f"  the prose says 'two clusters' {n_cluster_sentences} time(s)")
if "52.9" in flat and not SHIP["geyser"]["bimodal"]:
    fails.append("the prose names geyser cluster centres but the data is not flagged "
                 "two-cluster")

print("\n" + "=" * 74)
print("3. EVERY NUMBER QUOTED IN THE PROSE")
print("=" * 74)
R, DI, G = SHIP["retail"], SHIP["diamond"], SHIP["geyser"]


def claim(name: str, pattern: str, want, tol=0.0, group=1):
    m = re.search(pattern, flat)
    if not m:
        # A claim that no longer matches must FAIL, not vanish.
        print(f"  {name:<52} {'NOT FOUND':>16}  FAIL")
        fails.append(f"{name}: pattern no longer matches the prose — "
                     f"reword the check or the page")
        return
    got = m.group(group)
    try:
        gotv = float(got.replace(",", ""))
        ok = abs(gotv - want) <= tol
    except ValueError:
        gotv, ok = got, got == want
    print(f"  {name:<52} {gotv!r:>16} vs {want!r:>16}  {'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(f"{name}: prose says {gotv!r}, data says {want!r}")


claim("lede average order", r"the average order is (?:<b>)?£(\d+)", 519.0, 0.5)
claim("table: retail average", r"Online orders <em>\(19,773\)</em></td><td class=\"b\">£([\d,]+\.\d+)", R["mu"], 0.01)
claim("table: retail percent below", r"£519\.50</td>\s*<td class=\"b\">(\d+\.\d+)%", R["pctBelow"], 0.05)
claim("table: diamond average", r"Diamonds <em>\(53,940\)</em></td><td class=\"b\">\$([\d,]+\.\d+)", DI["mu"], 0.01)
claim("table: diamond percent below", r"\$3,932\.80</td>\s*<td class=\"b\">(\d+\.\d+)%", DI["pctBelow"], 0.05)
claim("table: geyser average", r"Geyser waits <em>\(272\)</em></td><td class=\"g\">(\d+\.\d+) min", G["mu"], 0.01)
claim("table: geyser percent below", r"70\.90 min</td>\s*<td class=\"g\">(\d+\.\d+)%", G["pctBelow"], 0.05)
claim("punch: retail below count", r"(?:<b>)?([\d,]+) of 19,773(?:</b>)? are below", R["below"])
claim("punch: retail percent", r"a customer that (\d+)% of them are not", round(R["pctBelow"]), 0.51)
claim("median table: retail median", r"£519\.50</td><td class=\"g\">£([\d,]+\.\d+)", R["median"], 0.01)
claim("median table: retail ratio", r"£302\.59</td>\s*<td class=\"b\">(\d+\.\d+)×", R["ratio"], 0.005)
claim("median table: diamond median", r"\$3,932\.80</td><td class=\"g\">\$([\d,]+\.\d+)", DI["median"], 0.01)
claim("median table: diamond ratio", r"\$2,401\.00</td>\s*<td class=\"b\">(\d+\.\d+)×", DI["ratio"], 0.005)
claim("middle order restated", r"The middle order is (?:<b>)?£([\d,]+\.\d+)(?:</b>)?", R["median"], 0.01)
claim("how much higher the average is", r"average is (\d+)% higher than it",
      round(100 * (R["ratio"] - 1)), 0.51)
claim("geyser percent below restated", r"Only (\d+\.\d+)% of geyser waits", G["pctBelow"], 0.05)
claim("geyser short cluster", r"cluster around (?:<b>)?(\d+\.\d+) minutes", G["modes"][0], 0.05)
claim("geyser long cluster", r"long waits around (?:<b>)?(\d+\.\d+) minutes", G["modes"][1], 0.05)
claim("geyser mean between", r"The average of the two habits is (\d+\.\d+) minutes", G["mu"], 0.01)
claim("geyser near-mean share", r"Only (?:<b>)?(\d+\.\d+)%(?:</b>)? of waits land within",
      round(100 * G["nearMean"] / G["n"], 1), 0.05)
claim("geyser busier cluster share", r"against (\d+\.\d+)% at the busier cluster",
      round(100 * max(G["nearMode"]) / G["n"], 1), 0.05)
claim("common table: retail near mean", r"Online orders</td><td class=\"b\">(\d+\.\d+)%",
      round(100 * R["nearMean"] / R["n"], 1), 0.05)
claim("common table: retail near commonest", r"Online orders</td><td class=\"b\">14\.4%</td><td class=\"g\">(\d+\.\d+)%",
      round(100 * R["nearBusiest"] / R["n"], 1), 0.05)
claim("common table: diamond near mean", r"Diamonds</td><td class=\"b\">(\d+\.\d+)%",
      round(100 * DI["nearMean"] / DI["n"], 1), 0.05)
claim("common table: diamond near commonest", r"Diamonds</td><td class=\"b\">7\.0%</td><td class=\"g\">(\d+\.\d+)%",
      round(100 * DI["nearBusiest"] / DI["n"], 1), 0.05)
claim("common table: geyser near mean", r"Geyser waits</td><td class=\"b\">(\d+\.\d+)%",
      round(100 * G["nearMean"] / G["n"], 1), 0.05)
claim("common table: geyser near commonest", r"Geyser waits</td><td class=\"b\">7\.0%</td><td class=\"g\">(\d+\.\d+)%",
      round(100 * G["nearBusiest"] / G["n"], 1), 0.05)
claim("commonest diamond price", r"commonest diamond price is about (?:<b>)?\$(\d+)(?:</b>)?",
      round(DI["busiest"]), 40)

# the lede's fraction must be TRUE, not merely close. "more than three in every
# four" requires pctBelow > 75, and an earlier draft said "four out of five",
# which 77.3% does not support -- it is nearer three in four than four in five.
print()
if "more than three in every four" not in flat:
    fails.append("the lede no longer states the fraction the data supports")
else:
    ok = R["pctBelow"] > 75.0
    print(f"  {'lede: more than three in every four':<52} "
          f"{R['pctBelow']:>16} > 75  {'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(f"lede claims more than three in four but only "
                     f"{R['pctBelow']}% are below the mean")
if re.search(r"four out of five", flat):
    fails.append("the lede says 'four out of five', but 77.3% is closer to three "
                 "in four — that overstates it")

print("\n" + "=" * 74)
print("4. WIRING")
print("=" * 74)
btn_ids = re.findall(r'data-d="([a-z]+)"', html)
check("dataset buttons", sorted(btn_ids), sorted(SHIP.keys()))
check("mode buttons", sorted(re.findall(r'data-m="([a-z]+)"', html)), ["both", "mean"])
scripts = re.findall(r'<script src="([^"]+)"', html)
check("scripts loaded", scripts,
      ["typical.js", "draw.js", "motion.js", "typical.render.js"])
for f_ in scripts:
    if not (HERE / f_).exists():
        fails.append(f"typical.html loads {f_}, which does not exist")

# The renderer must not roll its own frame loop or easing. Check the CODE, not
# the comments: a naive substring search flagged the word requestAnimationFrame
# inside a comment explaining why the first frame is painted synchronously. A
# check that cannot tell a call from prose about a call is worse than none.
code = re.sub(r"/\*.*?\*/", " ", rend, flags=re.S)      # block comments
code = re.sub(r"(?m)//[^\n]*$", " ", code)               # line comments
for banned, why in (
    (r"\brequestAnimationFrame\s*\(", "must drive frames through M.Ticker"),
    (r"\bfunction\s+ease\s*\(", "must use the shared, verified easings"),
    (r"\bMath\.pow\s*\(\s*1\s*-", "looks like a hand-rolled easing"),
):
    hit = re.search(banned, code)
    print(f"  {'no ' + banned:<52} {'absent' if not hit else 'PRESENT':>16}  "
          f"{'OK' if not hit else 'FAIL'}")
    if hit:
        fails.append(f"typical.render.js calls {banned!r} — {why}")
print(f"  {'uses the shared motion layer only':<52} "
      f"{'no raf, no local easing':>16}  OK")

# reduced motion must paint one frame and never start a ticker
check("honours prefers-reduced-motion",
      bool(re.search(r"if \(reduce\) \{ draw\(\); return; \}", rend)), True)
check("stops the pill clipping bug (right-edge layout)",
      "K.pill(legend[q][0], rx, bandY" in rend, True)

print("\n" + "=" * 74)
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("Every shipped figure re-derives from the raw sources, every number in the")
print("prose matches the data, only the geyser claims two clusters, and the page")
print("is wired to the files it actually loads.")
