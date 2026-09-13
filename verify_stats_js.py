"""Verify stats.js -- the ACTUAL file the page loads -- against scipy.

This runs the shipped module under node and compares its output to
scipy.stats, rather than checking a Python reimplementation. A p-value
function that is subtly wrong produces a page that looks perfect and teaches
the wrong thing, so it is checked over the whole range the pages use,
including the far tail where a naive 1 - cdf loses its digits.
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import stats

HERE = Path(__file__).resolve().parent

# grid: every df the Welch test can realistically produce, and t from
# nothing-to-see all the way out to a p-value of ~1e-12
DFS = [1, 2, 3, 4.7, 9, 28.4, 58, 199.5, 998, 3997.2]
TS = [0.0, 0.05, 0.3, 0.9, 1.6449, 1.96, 2.5758, 3.5, 5.0, 8.0, 12.0]
# a QQ plot with n = 800 puts its extreme points at p = 0.5/800 and 799.5/800,
# so the tails matter as much as the middle
PS = [0.5 / 800, 0.001, 0.01, 0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975, 0.99,
      0.999, 1 - 0.5 / 800]
ZS = [-6.0, -4.0, -2.5, -1.0, 0.0, 1.0, 2.5, 4.0, 6.0]

probe = f"""
const S = require({str(HERE / 'stats.js')!r});
const dfs = {json.dumps(DFS)}, ts = {json.dumps(TS)};
const out = [];
for (const df of dfs) for (const t of ts) {{
  out.push([df, t, S.tTwoSided(Math.abs(t), df), S.tCdf(t, df)]);
}}
// a couple of concrete Welch cases too, summary-stat form
const w = [
  S.welch(458.5, 587.6 ** 2, 30, 481.4, 616.9 ** 2, 30),
  S.welch(70.9, 13.57 ** 2, 100, 74.4, 14.25 ** 2, 100),
  S.welch(3880.3, 3862.8 ** 2, 500, 4074.3, 4056.0 ** 2, 500),
];
// inverse normal across the range a QQ plot touches, plus deep tails
const ps = {json.dumps(PS)};
const ppf = ps.map(p => [p, S.normPpf(p)]);
const cdfz = {json.dumps(ZS)}.map(z => [z, S.normCdf(z), S.erfc(z)]);
// OLS on a small fixed set, so the shipped fitter is checked too
const ox = [1,2,3,4,5,6,7,8,9,10];
const oy = [2.1,3.9,6.2,7.8,10.3,11.9,14.1,16.2,17.8,20.1];
const o = S.ols(ox, oy);

// many-predictor least squares. A FIXED pseudo-random design, so Python can
// rebuild the identical matrix and compare coefficients rather than only fit
// quality -- a solver can land the right R-squared with wrong betas.
// MINSTD rather than the pages' LCG: (s * 1103515245) exceeds 2^53 and loses
// precision in a double BEFORE the bitwise mask, so Python cannot rebuild that
// sequence. 2147483646 * 48271 stays exact, which makes the design matrix
// reproducible and puts the solver -- not the generator -- under test.
function lcg(seed) {{
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {{ s = (s * 48271) % 2147483647; return (s - 1) / 2147483646; }};
}}
const LS = {{}};
for (const spec of [[60, 3], [272, 20], [272, 100], [800, 50], [800, 120]]) {{
  const n = spec[0], k = spec[1];
  const r = lcg(4242 + k);
  const cols = [new Array(n).fill(1)];
  for (let j = 0; j < k; j++) {{
    const c = [];
    for (let i = 0; i < n; i++) c.push(r() * 2 - 1);
    cols.push(c);
  }}
  const y = [];
  for (let i = 0; i < n; i++) y.push(3 + 2 * cols[1][i] + (r() * 2 - 1) * 0.5);
  const f = S.lstsq(cols, y);
  LS[n + 'x' + k] = {{ n: n, k: k, r2: f.r2, adj: f.adj, sse: f.sse, dof: f.dof,
                       beta: Array.from(f.beta) }};
}}
// out-of-sample scoring must be able to go NEGATIVE
const SN = S.scoreR2([[1, 1, 1, 1], [0, 1, 2, 3]], [10, -10, 10, -10], [0, 5]);

console.log(JSON.stringify({{grid: out, welch: w, ppf: ppf, cdfz: cdfz,
  ols: {{a: o.a, b: o.b, r2: o.r2, sse: o.sse, sst: o.sst}},
  lstsq: LS, scoreNeg: SN,
  lgamma: [
  S.lgamma(0.5), S.lgamma(1), S.lgamma(5), S.lgamma(0.5 + 1e-3), S.lgamma(1500)
]}}));
"""
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(probe)
    tmp = f.name

r = subprocess.run(["node", tmp], capture_output=True, text=True)
if r.returncode != 0:
    print("node failed:\n" + r.stderr)
    sys.exit(1)
got = json.loads(r.stdout)
fails: list[str] = []

# ---------------------------------------------------------------- lgamma
print("lgamma against math.lgamma:")
for val, x in zip(got["lgamma"], [0.5, 1, 5, 0.5 + 1e-3, 1500]):
    want = math.lgamma(x)
    off = abs(val - want) / max(1.0, abs(want))
    ok = off < 1e-12
    print(f"  lgamma({x:<10}) js={val:< 22.15g} py={want:< 22.15g} relerr={off:.2e} "
          f"{'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"lgamma({x}) off by {off:.2e}")

# ---------------------------------------------------------------- t functions
print("\ntwo-sided p-value and CDF against scipy, over the full grid:")
worst_p = worst_c = 0.0
worst_desc = ""
for df, t, p_js, c_js in got["grid"]:
    p_py = float(2 * stats.t.sf(abs(t), df))
    c_py = float(stats.t.cdf(t, df))
    # relative error on p, because the tail values are tiny and an
    # absolute tolerance would wave through a 100x error at p = 1e-12
    rp = abs(p_js - p_py) / max(p_py, 1e-300)
    rc = abs(c_js - c_py)
    if rp > worst_p:
        worst_p, worst_desc = rp, f"df={df} t={t} js={p_js:.6e} py={p_py:.6e}"
    worst_c = max(worst_c, rc)
print(f"  {len(got['grid'])} grid points")
print(f"  worst RELATIVE error on the two-sided p-value: {worst_p:.3e}   ({worst_desc})")
print(f"  worst ABSOLUTE error on the CDF:               {worst_c:.3e}")
if worst_p > 1e-10:
    fails.append(f"p-value relative error {worst_p:.2e} exceeds 1e-10")
if worst_c > 1e-12:
    fails.append(f"CDF absolute error {worst_c:.2e} exceeds 1e-12")

# a spot check in the deep tail, where a 1-cdf implementation would collapse
deep = [x for x in got["grid"] if x[0] == 998 and x[1] == 12.0]
if deep:
    p_js = deep[0][2]
    p_py = float(2 * stats.t.sf(12.0, 998))
    print(f"  deep tail df=998 t=12: js={p_js:.6e} py={p_py:.6e} "
          f"(a 1-cdf implementation would return 0 here)")
    if p_js <= 0:
        fails.append("deep-tail p-value collapsed to zero -- precision lost")

# ---------------------------------------------------------------- Welch
print("\nWelch two-sample test against scipy.stats.ttest_ind_from_stats:")
CASES = [(458.5, 587.6, 30, 481.4, 616.9, 30),
         (70.9, 13.57, 100, 74.4, 14.25, 100),
         (3880.3, 3862.8, 500, 4074.3, 4056.0, 500)]
for w, (m1, s1, n1, m2, s2, n2) in zip(got["welch"], CASES):
    res = stats.ttest_ind_from_stats(m1, s1, n1, m2, s2, n2, equal_var=False)
    rt = abs(w["t"] - float(res.statistic))
    rp = abs(w["p"] - float(res.pvalue)) / max(float(res.pvalue), 1e-300)
    ok = rt < 1e-10 and rp < 1e-10
    print(f"  n={n1:<5} t: js={w['t']:+.10f} py={float(res.statistic):+.10f}  "
          f"p: js={w['p']:.8e} py={float(res.pvalue):.8e}  df={w['df']:.3f}  "
          f"{'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"welch n={n1}: t off {rt:.2e}, p rel off {rp:.2e}")

# ---------------------------------------------------------------- inverse normal
print("\ninverse normal (QQ-plot quantiles) against scipy:")
worst_ppf = 0.0
for p, z_js in got["ppf"]:
    z_py = float(stats.norm.ppf(p))
    off = abs(z_js - z_py)
    worst_ppf = max(worst_ppf, off)
    print(f"  p={p:<12.6g} js={z_js:+.12f} py={z_py:+.12f} err={off:.2e}")
if worst_ppf > 1e-9:
    fails.append(f"normPpf worst absolute error {worst_ppf:.2e} exceeds 1e-9")
print(f"  worst absolute error: {worst_ppf:.3e}")

print("\nnormal CDF and erfc against scipy / math:")
worst_cdf = worst_erfc = 0.0
for z, c_js, e_js in got["cdfz"]:
    c_py = float(stats.norm.cdf(z))
    e_py = math.erfc(z)
    worst_cdf = max(worst_cdf, abs(c_js - c_py))
    # relative on erfc: at z = 6 it is 2e-17 and an absolute test proves nothing
    worst_erfc = max(worst_erfc, abs(e_js - e_py) / max(e_py, 1e-300))
print(f"  worst CDF absolute error : {worst_cdf:.3e}")
print(f"  worst erfc relative error: {worst_erfc:.3e}")
if worst_cdf > 1e-12:
    fails.append(f"normCdf absolute error {worst_cdf:.2e} exceeds 1e-12")
if worst_erfc > 1e-11:
    fails.append(f"erfc relative error {worst_erfc:.2e} exceeds 1e-11")

# ---------------------------------------------------------------- OLS
print("\nOLS fitter against a NumPy least-squares solve:")
ox = np.arange(1.0, 11.0)
oy = np.array([2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.1, 16.2, 17.8, 20.1])
b_py, a_py = np.polyfit(ox, oy, 1)
pred = a_py + b_py * ox
sse_py = float(((oy - pred) ** 2).sum())
sst_py = float(((oy - oy.mean()) ** 2).sum())
o = got["ols"]
for name, js, py, tol in (("slope", o["b"], float(b_py), 1e-10),
                          ("intercept", o["a"], float(a_py), 1e-10),
                          ("sse", o["sse"], sse_py, 1e-10),
                          ("sst", o["sst"], sst_py, 1e-10),
                          ("r2", o["r2"], 1 - sse_py / sst_py, 1e-12)):
    off = abs(js - py)
    ok = off < tol
    print(f"  {name:10} js={js:+.12g} py={py:+.12g} err={off:.2e} "
          f"{'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"ols {name} off by {off:.2e}")

print("\nmany-predictor least squares against numpy.linalg.lstsq:")


def js_lcg(seed: int):
    """MINSTD, mirroring the probe exactly. Integer arithmetic here matches the
    JS double arithmetic because every product stays below 2^53."""
    s = seed % 2147483647
    if s <= 0:
        s += 2147483646

    def nxt() -> float:
        nonlocal s
        s = (s * 48271) % 2147483647
        return (s - 1) / 2147483646
    return nxt


for key, d in got["lstsq"].items():
    n, k = d["n"], d["k"]
    r = js_lcg(4242 + k)
    cols = [np.ones(n)]
    for _ in range(k):
        cols.append(np.array([r() * 2 - 1 for _ in range(n)]))
    y = np.array([3 + 2 * cols[1][i] + (r() * 2 - 1) * 0.5 for i in range(n)])
    X = np.column_stack(cols)
    beta_py, *_ = np.linalg.lstsq(X, y, rcond=None)
    pred = X @ beta_py
    sse_py = float(((y - pred) ** 2).sum())
    sst_py = float(((y - y.mean()) ** 2).sum())
    r2_py = 1 - sse_py / sst_py
    adj_py = 1 - (1 - r2_py) * (n - 1) / (n - k - 1)
    bmax = float(np.max(np.abs(np.asarray(d["beta"]) - beta_py)))
    ok = (abs(d["r2"] - r2_py) < 1e-9 and abs(d["adj"] - adj_py) < 1e-9
          and abs(d["sse"] - sse_py) / max(sse_py, 1e-12) < 1e-9
          and bmax < 1e-7 and d["dof"] == n - k - 1)
    print(f"  n={n:>4} k={k:>4}  R² js={d['r2']:.10f} py={r2_py:.10f}   "
          f"adj js={d['adj']:+.6f} py={adj_py:+.6f}   "
          f"worst |Δbeta|={bmax:.2e}   dof={d['dof']}  {'OK' if ok else 'MISMATCH'}")
    if abs(d["r2"] - r2_py) > 1e-9:
        fails.append(f"lstsq {key}: R² off by {abs(d['r2'] - r2_py):.2e}")
    if abs(d["adj"] - adj_py) > 1e-9:
        fails.append(f"lstsq {key}: adjusted R² off by {abs(d['adj'] - adj_py):.2e}")
    if bmax > 1e-7:
        fails.append(f"lstsq {key}: worst coefficient off by {bmax:.2e}")
    if d["dof"] != n - k - 1:
        fails.append(f"lstsq {key}: dof {d['dof']}, expected {n - k - 1}")

sn = got["scoreNeg"]
print(f"  out-of-sample R² can go negative: {sn:.4f} (must be < 0)")
if not sn < 0:
    fails.append(f"scoreR2 returned {sn}; it must be able to go negative")

print("\n" + "=" * 70)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("stats.js matches scipy to better than 1e-10 on p-values across the")
print("whole (t, df) range the pages use, including the deep tail, and its")
print("Welch test reproduces scipy exactly. This is the shipped file, run")
print("under node -- not a reimplementation of it.")
