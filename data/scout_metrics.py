"""Scout the next candidates: single numbers that hide something, tested on the
data already cached rather than asserted from a textbook.

R-squared earned its page because the claim was measurable: the two highest-R²
datasets were the two least worth trusting. A candidate only qualifies if the
same is true of it HERE, in data on this disk. Three are checked:

  1. SIMPSON'S PARADOX   does an aggregate average reverse inside every
                         subgroup? The diamonds carry cut / colour / clarity,
                         so this is answerable rather than hypothetical.
  2. ADJUSTED R-SQUARED  does R-squared really climb when predictors that are
                         pure noise are added? By how much, on real data?
  3. ACCURACY            on an imbalanced outcome, how good does "always say
                         no" look?

Anything that fails to misbehave here does not get built.
"""
from __future__ import annotations

import csv
import io
import json
import re
import statistics
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"

rows = list(csv.DictReader(io.StringIO((CACHE / "diamonds.csv").read_text())))
carat = np.array([float(r["carat"]) for r in rows])
price = np.array([float(r["price"]) for r in rows])
cut = np.array([r["cut"] for r in rows])
colour = np.array([r["color"] for r in rows])
clarity = np.array([r["clarity"] for r in rows])

# ------------------------------------------------------------ 1. Simpson
print("=" * 84)
print("1. SIMPSON'S PARADOX — does the aggregate reverse inside subgroups?")
print("=" * 84)
ORDER = {
    "cut": ["Fair", "Good", "Very Good", "Premium", "Ideal"],           # worst -> best
    "color": ["J", "I", "H", "G", "F", "E", "D"],                        # worst -> best
    "clarity": ["I1", "SI2", "SI1", "VS2", "VS1", "VVS2", "VVS1", "IF"], # worst -> best
}
COLS = {"cut": cut, "color": colour, "clarity": clarity}
report = {}
for name, vals in COLS.items():
    order = [g for g in ORDER[name] if (vals == g).any()]
    print(f"\n  by {name} (worst → best):")
    print(f"    {'group':10} {'n':>7} {'mean price':>12} {'mean carat':>11}")
    means, carats = [], []
    for g in order:
        m = vals == g
        means.append(price[m].mean()); carats.append(carat[m].mean())
        print(f"    {g:10} {int(m.sum()):>7} {price[m].mean():>12,.0f} {carat[m].mean():>11.3f}")
    # the paradox: quality goes UP while the average price goes DOWN
    agg_down = means[-1] < means[0]
    print(f"    aggregate: best-grade average is {means[-1]:,.0f} vs worst {means[0]:,.0f}"
          f"  → {'REVERSED (cheaper!)' if agg_down else 'as expected'}")

    # now hold size roughly fixed and ask again
    bands = [(0.2, 0.5), (0.5, 0.8), (0.8, 1.1), (1.1, 1.6), (1.6, 5.1)]
    holds = 0
    print(f"    within carat bands:")
    for lo, hi in bands:
        band = (carat >= lo) & (carat < hi)
        a = price[band & (vals == order[0])]
        b = price[band & (vals == order[-1])]
        if len(a) < 30 or len(b) < 30:
            continue
        better = b.mean() > a.mean()
        holds += 1 if better else 0
        print(f"      {lo:.1f}–{hi:.1f} ct   {order[0]:>9} {a.mean():>9,.0f}   "
              f"{order[-1]:>9} {b.mean():>9,.0f}   "
              f"{'best costs more ✓' if better else 'still reversed'}")
    report[name] = {"agg_reversed": bool(agg_down),
                    "mean_worst": means[0], "mean_best": means[-1],
                    "carat_worst": carats[0], "carat_best": carats[-1],
                    "bands_correct": holds}
    print(f"    → aggregate reversed: {agg_down};  bands where the better grade "
          f"costs more: {holds}")

# ------------------------------------------------------------ 2. adjusted R2
print("\n" + "=" * 84)
print("2. ADJUSTED R-SQUARED — does R² climb on predictors that are pure noise?")
print("=" * 84)
psrc = (HERE.parent / "pairs.js").read_text(encoding="utf-8")
PAIRS = {o["id"]: o for o in json.loads(psrc[psrc.index("["):psrc.rindex("]") + 1])}


def fit_multi(Xcols, y):
    X = np.column_stack([np.ones(len(y))] + Xcols)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    pred = X @ beta
    sse = float(((y - pred) ** 2).sum())
    sst = float(((y - y.mean()) ** 2).sum())
    n, k = len(y), len(Xcols)
    r2 = 1 - sse / sst
    adj = 1 - (1 - r2) * (n - 1) / (n - k - 1) if n - k - 1 > 0 else float("nan")
    return r2, adj


for pid in ("retail", "geyser"):
    d = PAIRS[pid]
    x = np.asarray(d["x"], float); y = np.asarray(d["y"], float)
    rng = np.random.default_rng(11)
    print(f"\n  {pid}: {d['xlab']} → {d['ylab']}  (n = {len(y)})")
    print(f"    {'noise cols':>11} {'R²':>8} {'adjusted R²':>12} {'R² gained':>10}")
    base = None
    for k in (0, 1, 5, 20, 50, 100):
        cols = [x] + [rng.normal(size=len(y)) for _ in range(k)]
        r2, adj = fit_multi(cols, y)
        if base is None:
            base = r2
        print(f"    {k:>11} {r2:>8.4f} {adj:>12.4f} {r2 - base:>+10.4f}")
        report[f"adjr2|{pid}|{k}"] = {"r2": r2, "adj": adj}

# ------------------------------------------------------------ 3. accuracy
print("\n" + "=" * 84)
print("3. ACCURACY on an imbalanced outcome — how good is 'always say no'?")
print("=" * 84)
for thresh in (5000, 10000, 15000):
    y = price > thresh
    base = float(y.mean())
    print(f"  'is this diamond over ${thresh:,}?'   true rate {base:.2%}   "
          f"always-say-no accuracy {1 - base:.2%}   "
          f"recall {0.0:.0%}   precision undefined")
    report[f"acc|{thresh}"] = {"rate": base, "trivial_accuracy": 1 - base}

(HERE / "scout_reference.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
print(f"\nwrote {HERE / 'scout_reference.json'}")
