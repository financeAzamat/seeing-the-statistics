"""Verify regression.html and pairs.js.

Two jobs:

  MATH    re-derive slope, intercept, R-squared, SSE and SST from the embedded
          points, independently of build_pairs.py, and confirm the shipped fit
          is genuinely the least-squares optimum -- by perturbing it and
          checking the error goes UP in every direction. A page whose "best
          fit" is not actually best would still look convincing.

  CLAIMS  every number the prose quotes -- the R-squared table, the 15-fold
          fan, the within-cluster 0.08 and 0.14, the £7 slope -- against the
          data. Four errors have already been caught this way on earlier
          pages; the prose is not exempt.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
html = (HERE / "regression.html").read_text(encoding="utf-8")
psrc = (HERE / "pairs.js").read_text(encoding="utf-8")
PAIRS = {o["id"]: o for o in json.loads(psrc[psrc.index("["):psrc.rindex("]") + 1])}

fails: list[str] = []
inline = re.findall(r"<script>(.*?)</script>", html, re.S)
js = inline[-1]
markup = html.split("<script")[0]

# ---------------------------------------------------------------- parses
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(js)
    tmp = f.name
r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
print("node --check regression.html:", "OK" if r.returncode == 0 else "FAILED\n" + r.stderr)
if r.returncode:
    fails.append("regression.html inline script does not parse")
r2 = subprocess.run(["node", "--check", str(HERE / "pairs.js")], capture_output=True, text=True)
print("pairs.js parse:", "OK" if r2.returncode == 0 else "FAILED")
if r2.returncode:
    fails.append("pairs.js does not parse")
print("loads pairs.js:", 'src="pairs.js"' in html)
if 'src="pairs.js"' not in html:
    fails.append("regression.html does not load pairs.js")

# ---------------------------------------------------------------- wiring
ids_html = set(re.findall(r'id="([^"]+)"', markup))
ids_js = set(re.findall(r"\$\('([^']+)'\)", js)) | set(re.findall(r"getElementById\('([^']+)'\)", js))
missing = sorted(ids_js - ids_html)
print(f"\nids: script uses {len(ids_js)}, markup declares {len(ids_html)}, missing {missing or 'none'}")
if missing:
    fails.append(f"ids referenced but not declared: {missing}")
for attr in ("data-set",):
    c = len(re.findall(attr + r'="', markup))
    print(f"{attr}: {c} buttons, read by script: {f'[{attr}]' in js}")
    if not c:
        fails.append(f"{attr} not wired")
declared = set(re.findall(r'data-set="(\w+)"', markup))
if declared - set(PAIRS):
    fails.append(f"buttons name unknown datasets: {sorted(declared - set(PAIRS))}")
print(f"dataset buttons {sorted(declared)} vs data {sorted(PAIRS)}: "
      f"{'OK' if declared <= set(PAIRS) else 'MISMATCH'}")
# the sliders are the keyboard path; both must exist and be read
for sid in ("s-slope", "s-int"):
    ok = f'id="{sid}"' in markup and sid in js
    print(f"slider {sid}: {'OK' if ok else 'MISSING'}")
    if not ok:
        fails.append(f"slider {sid} not wired")

# ---------------------------------------------------------------- the maths
print("\nre-deriving each fit from the embedded points:")
for pid, d in PAIRS.items():
    x = np.asarray(d["x"], float); y = np.asarray(d["y"], float)
    mx, my = x.mean(), y.mean()
    sxx = ((x - mx) ** 2).sum(); sxy = ((x - mx) * (y - my)).sum()
    slope = sxy / sxx; intercept = my - slope * mx
    pred = intercept + slope * x
    sse = float(((y - pred) ** 2).sum()); sst = float(((y - my) ** 2).sum())
    r_2 = 1 - sse / sst
    rr = float(np.corrcoef(x, y)[0, 1])
    checks = [
        ("slope", slope, d["slope"], abs(slope) * 1e-9 + 1e-9),
        ("intercept", intercept, d["intercept"], abs(intercept) * 1e-9 + 1e-9),
        ("r2", r_2, d["r2"], 1e-9),
        ("sse", sse, d["sse"], abs(sse) * 1e-9),
        ("sst", sst, d["sst"], abs(sst) * 1e-9),
        ("mean_y", my, d["mean_y"], 1e-9),
        ("r_vs_sqrt_r2", rr * rr, d["r2"], 1e-9),   # for one predictor R2 == r^2
    ]
    bad = [c[0] for c in checks if abs(c[1] - c[2]) > c[3]]
    print(f"  {pid:8} n={len(x):>4} slope={slope:+12.5g} R2={r_2:.6f} "
          f"r²={rr*rr:.6f}  {'OK' if not bad else 'MISMATCH ' + ','.join(bad)}")
    if bad:
        fails.append(f"{pid}: pairs.js disagrees with its own points on {bad}")

    # is the shipped fit really the optimum? perturb and confirm error rises
    worse = 0
    for ds in (-1, 0, 1):
        for di in (-1, 0, 1):
            if ds == 0 and di == 0:
                continue
            s2 = slope + ds * abs(slope or 1) * 1e-3
            i2 = intercept + di * abs(intercept or 1) * 1e-3
            if float(((y - (i2 + s2 * x)) ** 2).sum()) > sse:
                worse += 1
    print(f"           perturbed 8 directions, error rose in {worse}/8")
    if worse != 8:
        fails.append(f"{pid}: shipped fit is not a strict least-squares minimum")

# ---------------------------------------------------------------- claims
print("\nnumbers quoted in the prose:")

def claim(label, quoted, measured, tol):
    ok = abs(quoted - measured) <= tol
    print(f"  [{'OK ' if ok else 'BAD'}] {label:40} quoted {quoted}  measured {measured:.4g}")
    if not ok:
        fails.append(f"{label}: prose {quoted}, measured {measured:.4g}")

tbl = re.search(r"<th>What R² missed</th>.*?</tbody>", markup, re.S).group(0)
rows = re.findall(r"<tr><td>([^<]+)</td><td[^>]*>([\d.]+)</td>", tbl)
NAME = {"Diamonds: carat → price": "diamond", "Geyser: length → wait": "geyser",
        "Retail: items → value": "retail"}
if len(rows) != 3:
    fails.append(f"expected 3 R-squared rows, parsed {len(rows)}")
for label, q in rows:
    pid = NAME.get(label.strip())
    if pid is None:
        fails.append(f"unknown row label: {label}")
        continue
    claim(f"R² {pid}", float(q), PAIRS[pid]["r2"], 0.006)

m = re.search(r"fan out (\d+)×", markup)
if m:
    claim("diamond fan ratio (table)", float(m.group(1)), PAIRS["diamond"]["diag"]["sd_ratio"], 0.6)
m = re.search(r"about (\d+) times wider for the big stones", markup)
if m:
    claim("diamond fan ratio (prose)", float(m.group(1)), PAIRS["diamond"]["diag"]["sd_ratio"], 0.6)
m = re.search(r"a fan of only\s*\n?\s*about (\d+)× against the diamonds' (\d+)×", markup)
if m:
    claim("retail fan ratio", float(m.group(1)), PAIRS["retail"]["diag"]["sd_ratio"], 0.6)
    claim("diamond fan ratio (retail bullet)", float(m.group(2)),
          PAIRS["diamond"]["diag"]["sd_ratio"], 0.6)
else:
    fails.append("could not find the retail fan comparison in the markup")
m = re.search(r"R² collapses to\s*(?:<b>)?(\d+\.\d+)(?:</b>)?", markup)
if m:
    claim("geyser within-cluster R² (short)", float(m.group(1)),
          PAIRS["geyser"]["diag"]["within_r2_lo"], 0.006)
m = re.search(r"only the long ones, (?:<b>)?(\d+\.\d+)(?:</b>)?", markup)
if m:
    claim("geyser within-cluster R² (long)", float(m.group(1)),
          PAIRS["geyser"]["diag"]["within_r2_hi"], 0.006)
m = re.search(r"worth\s+about\s+(?:<b>)?£(\d+)(?:</b>)?", markup)
if m:
    claim("retail slope, pounds per item", float(m.group(1)), PAIRS["retail"]["slope"], 0.5)
else:
    fails.append("could not find the retail slope claim in the markup")
m = re.search(r"R² of ([\d.]+) means order size", markup)
if m:
    claim("retail R² in prose", float(m.group(1)), PAIRS["retail"]["r2"], 0.006)

# the bend claim: residual mean must be positive at BOTH ends and negative in
# the middle for the diamonds, which is what "bends into a U" asserts
b = PAIRS["diamond"]["diag"]["bend"]
u = b[0] > 0 and b[-1] > 0 and min(b[1:-1]) < 0
print(f"  [{'OK ' if u else 'BAD'}] diamond residuals bend into a U       "
      f"first={b[0]:+,.0f} min-middle={min(b[1:-1]):+,.0f} last={b[-1]:+,.0f}")
if not u:
    fails.append("diamond residual bend is not the U shape the prose claims")

# geyser is claimed to have an even band: no fan, small bend
g = PAIRS["geyser"]["diag"]
flat = g["sd_ratio"] < 1.4 and max(abs(v) for v in g["bend"] if v is not None) < 5
print(f"  [{'OK ' if flat else 'BAD'}] geyser residual band is even          "
      f"fan={g['sd_ratio']:.2f} largest-bend={max(abs(v) for v in g['bend'] if v is not None):.1f}")
if not flat:
    fails.append("geyser residual band is not as even as the prose claims")

print("\n" + "=" * 72)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("regression.html parses and is wired; every fit in pairs.js is re-derived")
print("from its own points and confirmed to be a strict least-squares minimum;")
print("and every number in the prose matches the data.")
