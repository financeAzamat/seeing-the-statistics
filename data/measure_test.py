"""Measure what a two-sample test ACTUALLY does on the three real datasets.

The setup is an A/B test on real money. Two samples of size n are drawn from
the same real dataset; group B's values are then multiplied by (1 + effect),
which is how a business change behaves -- a 5% lift in order value, not a
+5 flat shift. Welch's two-sample t-test is run on every pair.

  effect = 0   the two groups really are the same. Every "significant"
               result is a FALSE POSITIVE, and the share of them should
               equal alpha. Whether it does, on skewed real data at n = 30,
               is the open question.

  effect > 0   there really is a difference. The share of tests that find
               it is the POWER. Whether a realistic test has any is the
               second open question, and the more useful one.

Also checks the claim the next page is built on: under the null a p-value is
uniformly distributed on 0..1. Flat means every value equally likely, which
is exactly why 5% of them land under 0.05.

Memory: chunked deliberately. n = 2000 at 3000 reps is 12M floats per group,
and this host has ~3 GB free.
"""
from __future__ import annotations

import json
import math
import re
import zlib
from pathlib import Path

import numpy as np
from scipy import stats

HERE = Path(__file__).resolve().parent
ds = (HERE.parent / "datasets.js").read_text(encoding="utf-8")
OBJS = [json.loads(m) for m in
        re.findall(r"^\{.*\}(?=,?$)", ds[ds.index("["):ds.rindex("]") + 1], re.M)]

# Reps are NOT limited by memory -- run_cell chunks -- so they are set for
# precision instead. At a 21% rate, 20,000 reps gives a standard error of
# 0.29 percentage points, which is tight enough to quote to one decimal.
NS = {30: 20_000, 100: 20_000, 500: 20_000, 2000: 12_000}
EFFECTS = (0.0, 0.02, 0.05, 0.10)
ALPHAS = (0.10, 0.05, 0.01)
CHUNK = 500


def cell_seed(ds_id: str, n: int, effect: float) -> int:
    """Deterministic seed for a cell.

    NOT Python's hash(): string hashing is salted per process unless
    PYTHONHASHSEED is pinned, so an earlier version of this script produced
    different numbers on every run and the figures quoted on the page drifted
    away from the reference file. crc32 is stable across processes and
    versions, which is the only property needed here.
    """
    return zlib.crc32(f"{ds_id}|{n}|{effect}".encode()) & 0x7FFFFFFF


def run_cell(v: np.ndarray, n: int, reps: int, effect: float, seed: int) -> np.ndarray:
    """Return the p-values of `reps` Welch t-tests. Chunked to bound memory."""
    rng = np.random.default_rng(seed)
    out = np.empty(reps)
    done = 0
    while done < reps:
        m = min(CHUNK, reps - done)
        a = v[rng.integers(0, len(v), size=(m, n))]
        b = v[rng.integers(0, len(v), size=(m, n))] * (1.0 + effect)
        # Welch: unequal variances, which is the honest default and is also
        # forced here because scaling group B scales its spread too.
        res = stats.ttest_ind(a, b, axis=1, equal_var=False)
        out[done:done + m] = res.pvalue
        done += m
    return out


report: dict[str, dict] = {}
print("=" * 96)
print("A/B TEST ON REAL DATA — Welch two-sample t-test, group B scaled by (1 + effect)")
print("  effect 0  -> every 'significant' result is a FALSE POSITIVE; the rate should be alpha")
print("  effect >0 -> the share found is POWER; 80% is the usual minimum anyone plans for")
print("=" * 96)

for d in OBJS:
    v = np.asarray(d["vals"], float)
    print(f"\n### {d['id']}  (lopsidedness {d['skew']:+.2f})  mean {d['mu']:,.2f}")
    print(f"  {'effect':>7} {'n':>6} " + " ".join(f"{'a=' + str(a):>9}" for a in ALPHAS)
          + f" {'median p':>10} {'flatness':>9}")
    for effect in EFFECTS:
        for n, reps in NS.items():
            p = run_cell(v, n, reps, effect, seed=cell_seed(d["id"], n, effect))
            rates = [float((p < a).mean()) for a in ALPHAS]
            # under the null p should be Uniform(0,1); KS against that is the
            # cleanest single number for "is the histogram flat"
            ks = float(stats.kstest(p, "uniform").statistic)
            label = "none" if effect == 0 else f"+{effect:.0%}"
            print(f"  {label:>7} {n:>6} "
                  + " ".join(f"{r:>9.1%}" for r in rates)
                  + f" {np.median(p):>10.3f} {ks:>9.3f}")
            report[f"{d['id']}|{effect}|{n}"] = {
                "rates": dict(zip(map(str, ALPHAS), rates)),
                "median_p": float(np.median(p)),
                "ks_uniform": ks,
                "reps": reps,
            }
        print()

# ------------------------------------------------------- the multiple-testing tax
print("=" * 96)
print("THE 20-TEST PROBLEM: run k independent tests when NOTHING is going on.")
print("  chance of at least one 'significant' result at alpha = 0.05")
print("=" * 96)
r30 = report["retail|0.0|30"]["rates"]["0.05"]
r500 = report["retail|0.0|500"]["rates"]["0.05"]
print(f"  {'k tests':>8} {'theory (1-0.95^k)':>19} {'retail n=30 actual':>20} {'retail n=500':>14}")
for k in (1, 5, 10, 20, 50):
    print(f"  {k:>8} {1 - 0.95 ** k:>19.1%} {1 - (1 - r30) ** k:>20.1%} "
          f"{1 - (1 - r500) ** k:>14.1%}")

# ------------------------------------------------------- p-value histogram shape
print("\n" + "=" * 96)
print("HISTOGRAM SHAPE: share of p-values in each 0.05-wide bin (retail, n = 500)")
print("  flat = nothing going on;  piled at the left = a real effect")
print("=" * 96)
for effect in EFFECTS:
    p = run_cell(np.asarray(OBJS[0]["vals"], float), 500, 8000, effect, seed=99)
    h = np.histogram(p, bins=20, range=(0, 1))[0] / len(p)
    bars = "".join("#" if x > 0.09 else ("+" if x > 0.055 else ("-" if x > 0.02 else ".")) for x in h)
    label = "none" if effect == 0 else f"+{effect:.0%}"
    print(f"  effect {label:>5}  |{bars}|  first bin {h[0]:>6.1%}")
print("  bins run 0.00-0.05 ... 0.95-1.00 left to right;  # >9%  + >5.5%  - >2%  . rest")

(HERE / "test_reference.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
print(f"\nwrote {HERE / 'test_reference.json'}")
