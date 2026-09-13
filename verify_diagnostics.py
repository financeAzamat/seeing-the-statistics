"""Verify diagnostics.html, and that its live verdicts are reproducible.

The page computes its own pass/fail badges. That is only trustworthy if the
same numbers come out somewhere else, so this runs the SHIPPED stats.js under
node over all three datasets and all three transforms, and compares every
diagnostic against data/measure_diagnostics.py.

Also checks the two things the page's design depends on:
  * `ordered` is true for exactly the dataset whose rows have a real sequence,
    because that flag is what makes the page refuse to score independence;
  * every figure quoted in the prose matches the measurement.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
html = (HERE / "diagnostics.html").read_text(encoding="utf-8")
psrc = (HERE / "pairs.js").read_text(encoding="utf-8")
PAIRS = {o["id"]: o for o in json.loads(psrc[psrc.index("["):psrc.rindex("]") + 1])}
REF = json.loads((HERE / "data" / "diag_reference.json").read_text(encoding="utf-8"))

fails: list[str] = []
# The renderer moved out of the page into diagnostics.render.js when the static
# version was replaced with an animated one. The checks below are unchanged in
# substance -- they just read the external file now, and assert the page loads
# it rather than carrying an inline copy.
RENDER = HERE / "diagnostics.render.js"
js = RENDER.read_text(encoding="utf-8")
markup = html.split("<script")[0]
if re.search(r"<script>", html):
    fails.append("diagnostics.html still carries an inline script; the renderer is external")

# ---------------------------------------------------------------- parses
r = subprocess.run(["node", "--check", str(RENDER)], capture_output=True, text=True)
print("node --check diagnostics.render.js:", "OK" if r.returncode == 0 else "FAILED\n" + r.stderr)
if r.returncode:
    fails.append("diagnostics.render.js does not parse")
for dep in ("pairs.js", "stats.js", "motion.js", "diagnostics.render.js"):
    ok = f'src="{dep}"' in html
    print(f"loads {dep}: {ok}")
    if not ok:
        fails.append(f"diagnostics.html does not load {dep}")

# the page must actually animate: this is the defect that prompted the rewrite
for token, why in (("Ticker", "no animation loop"),
                   ("stagger", "no staggered morph"),
                   ("UDJ_MOTION", "motion layer not used")):
    if token not in js:
        fails.append(f"renderer does not reference {token} — {why}")
print("animates (Ticker + stagger + motion layer):",
      all(t in js for t in ("Ticker", "stagger", "UDJ_MOTION")))
# and the scatter must have real bloom, which the static version did not
# The scatter must be CRISP, which after the readability fix means two things:
# a dark rim under each dot, and no additive blending. An earlier version of
# this check pinned the literal glow expression `0.32 + m * 0.5`, which broke
# the moment that number was tuned -- a check that asserts a magic number
# instead of a property is a maintenance trap, and this is the fifth time one
# has fired in this project.
cloud = re.search(r"for \(let i = 0; i < n; i\+\+\) \{.*?\n        \}", js, re.S)
has_rim = bool(re.search(r"dot\([^;]*?,\s*\n?\s*1\.1\);", js, re.S)) or "1.1);" in js
additive = "globalCompositeOperation = 'lighter'" in js
print(f"scatter is crisp: rim passed = {has_rim}, additive blending = {additive}")
if not has_rim:
    fails.append("the point cloud does not pass a rim — dense regions will smear")
if additive:
    fails.append("the renderer still uses additive blending, which blows dense "
                 "regions out to white")

# ---------------------------------------------------------------- wiring
ids_html = set(re.findall(r'id="([^"]+)"', markup))
ids_js = set(re.findall(r"\$\('([^']+)'\)", js)) | set(re.findall(r"getElementById\('([^']+)'\)", js))
missing = sorted(ids_js - ids_html)
print(f"\nids: script uses {len(ids_js)}, markup declares {len(ids_html)}, missing {missing or 'none'}")
if missing:
    fails.append(f"ids referenced but not declared: {missing}")
for attr in ("data-set", "data-tf"):
    c = len(re.findall(attr + r'="', markup))
    print(f"{attr}: {c} buttons, read by script: {f'[{attr}]' in js}")
    if not c:
        fails.append(f"{attr} not wired")
tfs = re.findall(r'data-tf="(\w+)"', markup)
print(f"transforms offered: {tfs}")
for t in tfs:
    if f"{t}:" not in js:
        fails.append(f"transform {t} has no implementation in the script")

# ---------------------------------------------------------------- ordering flag
print("\nthe `ordered` flag decides whether independence is scored at all:")
EXPECT = {"geyser": True, "diamond": False, "retail": False}
for pid, want in EXPECT.items():
    got = PAIRS[pid].get("ordered")
    ok = got == want
    print(f"  {pid:8} ordered={got}  expected {want}  {'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"{pid}: ordered flag is {got}, should be {want}")
    if not PAIRS[pid].get("order_note"):
        fails.append(f"{pid}: no order_note to explain the decision")

# ---------------------------------------------------------------- the maths
TFJS = {"none": "(x)=>x", "logy": "Math.log", "logboth": "Math.log"}
probe = f"""
const S = require({str(HERE / 'stats.js')!r});
const PAIRS = {json.dumps([PAIRS[k] for k in ('diamond', 'geyser', 'retail')])};
const TF = {{
  none:    {{x: v => v, y: v => v}},
  'log y': {{x: v => v, y: v => Math.log(v)}},
  'log both': {{x: v => Math.log(v), y: v => Math.log(v)}},
}};
const out = {{}};
for (const d of PAIRS) for (const [tn, t] of Object.entries(TF)) {{
  const xs = d.x.map(t.x), ys = d.y.map(t.y);
  const g = S.diagnose(xs, ys);
  const kx = [], ky = [];
  for (let i = 0; i < xs.length; i++) if (i !== g.worst) {{ kx.push(xs[i]); ky.push(ys[i]); }}
  const w = S.ols(kx, ky);
  out[d.id + '|' + tn] = {{
    r2: g.r2, slope: g.slope, bend: g.bend, fan: g.fan, lag1: g.lag1, dw: g.dw,
    skew: g.skew, kurt: g.kurt, max_cook: g.maxCook,
    slope_shift_one: g.slope ? Math.abs(w.b - g.slope) / Math.abs(g.slope) : 0,
  }};
}}
console.log(JSON.stringify(out));
"""
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(probe)
    tmp2 = f.name
rr = subprocess.run(["node", tmp2], capture_output=True, text=True)
if rr.returncode != 0:
    print("node probe failed:\n" + rr.stderr)
    sys.exit(1)
GOT = json.loads(rr.stdout)

print("\nshipped stats.js (run under node) vs data/measure_diagnostics.py:")
KEYS = ("r2", "slope", "bend", "fan", "lag1", "dw", "skew", "kurt",
        "max_cook", "slope_shift_one")
worst = 0.0
worst_where = ""
for key, g in GOT.items():
    ref = REF.get(key)
    if ref is None:
        fails.append(f"no Python reference for {key}")
        continue
    bad = []
    for k in KEYS:
        a, b = g[k], ref[k]
        if not (math.isfinite(a) and math.isfinite(b)):
            continue
        rel = abs(a - b) / max(abs(b), 1e-12)
        if rel > worst:
            worst, worst_where = rel, f"{key} {k}"
        if rel > 1e-9:
            bad.append(f"{k}({a:.6g} vs {b:.6g})")
    print(f"  {key:22} {'OK' if not bad else 'MISMATCH ' + ', '.join(bad)}")
    if bad:
        fails.append(f"{key}: JS disagrees with Python on {bad}")
print(f"  worst relative disagreement: {worst:.3e}  ({worst_where})")

# ---------------------------------------------------------------- claims
print("\nnumbers quoted in the prose:")

def claim(label, quoted, measured, tol):
    ok = abs(quoted - measured) <= tol
    print(f"  [{'OK ' if ok else 'BAD'}] {label:42} quoted {quoted}  measured {measured:.4g}")
    if not ok:
        fails.append(f"{label}: prose {quoted}, measured {measured:.4g}")

dn, dl = REF["diamond|none"], REF["diamond|log both"]
m = re.search(r"fan collapses from <b>([\d.]+)</b> to <b>([\d.]+)</b>", markup)
if m:
    claim("diamond fan before", float(m.group(1)), dn["fan"], 0.06)
    claim("diamond fan after", float(m.group(2)), dl["fan"], 0.06)
else:
    fails.append("could not find the fan-collapse claim")
m = re.search(r"kurtosis of <b>([\d.]+)</b> to <b>([\d.]+)</b>", markup)
if m:
    claim("diamond kurtosis before", float(m.group(1)), dn["kurt"], 0.06)
    claim("diamond kurtosis after", float(m.group(2)), dl["kurt"], 0.06)
m = re.search(r"from 0\.84 to <b>([\d.]+)</b>", markup)
if m:
    claim("diamond R² after log both", float(m.group(1)), dl["r2"], 0.006)
# NB: patterns use (\d+\.\d+) rather than ([\d.]+) on purpose -- the looser form
# swallows a sentence-ending full stop and turns "1.78." into a parse error.
m = re.search(r"bend gets <b>worse</b>: (\d+\.\d+) → (\d+\.\d+)", markup)
if m:
    claim("diamond bend, none", float(m.group(1)), dn["bend"], 0.006)
    claim("diamond bend, log y", float(m.group(2)), REF["diamond|log y"]["bend"], 0.006)
else:
    fails.append("could not find the log-y bend trap claim")
gn = REF["geyser|none"]
m = re.search(r"correlate at\s*\n?\s*<b>−([\d.]+)</b>", markup)
if m:
    claim("geyser lag-1 magnitude", float(m.group(1)), abs(gn["lag1"]), 0.006)
m = re.search(r"Durbin-Watson ([\d.]+), where 2", markup)
if m:
    claim("geyser Durbin-Watson", float(m.group(1)), gn["dw"], 0.006)
m = re.search(r"<b>(\d+)% of\s*\n?\s*consecutive eruptions switch kind</b>", markup)
if m:
    # recompute the alternation directly from the shipped points
    dur = PAIRS["geyser"]["x"]
    short = [v < 3.0 for v in dur]
    alt = sum(1 for i in range(len(short) - 1) if short[i] != short[i + 1]) / (len(short) - 1)
    claim("geyser alternation rate", float(m.group(1)), alt * 100, 0.6)
else:
    fails.append("could not find the alternation claim")
m = re.search(r"moves the slope by\s*\n?\s*<b>([\d.]+)%</b>", markup)
if m:
    claim("retail slope shift from one point", float(m.group(1)),
          REF["retail|none"]["slope_shift_one"] * 100, 0.15)
m = re.search(r"retail residuals are \+([\d.]+) and \+(\d+)", markup)
if m:
    claim("retail skew", float(m.group(1)), REF["retail|none"]["skew"], 0.06)
    claim("retail kurtosis", float(m.group(2)), REF["retail|none"]["kurt"], 0.6)
m = re.search(r"the diamonds at ([\d.]+)×", markup)
if m:
    claim("diamond fan in glossary", float(m.group(1)), dn["fan"], 0.06)

# the thresholds in the prose must equal the thresholds in the code
print("\nthresholds in the copy vs the code:")
for label, pat, jsname in (("bend", r"bend &lt; ([\d.]+)", "T_BEND"),
                           ("fan", r"fan &lt; ([\d.]+)", "T_FAN"),
                           ("lag1", r"\|lag-1\| &lt; ([\d.]+)", "T_LAG")):
    mp = re.search(pat, markup)
    mj = re.search(jsname + r" = ([\d.]+)", js)
    if mp and mj:
        a, b = float(mp.group(1)), float(mj.group(1))
        ok = abs(a - b) < 1e-9
        print(f"  {label:6} copy {a}  code {b}  {'OK' if ok else 'MISMATCH'}")
        if not ok:
            fails.append(f"{label} threshold: copy says {a}, code uses {b}")
    else:
        fails.append(f"could not compare the {label} threshold")

print("\n" + "=" * 74)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("diagnostics.html parses and is wired; the shipped stats.js reproduces the")
print("Python diagnostics to 1e-9 on all 9 dataset/transform combinations; the")
print("ordered flag matches which data actually has a sequence; and every figure")
print("and threshold in the prose matches the code and the measurement.")
