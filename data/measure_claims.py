"""Measure the claims the page's prose makes, so none of them is guessed.

The copy asserts three things that are not in datasets.js:

  * the Old Faithful population has two modes, at roughly X and Y minutes
  * the geyser's sampling distribution is symmetric by about n = 5
  * the diamond one is still visibly lopsided at n = 10

Skewness of the sampling distribution is the measurable version of "looks
symmetric". |skew| < 0.20 is the threshold used here: below that a histogram
of a few hundred draws reads as symmetric to the eye.
"""
import json
import re
import statistics
from pathlib import Path

import numpy as np

src = (Path(__file__).resolve().parent.parent / "datasets.js").read_text(encoding="utf-8")
objs = [json.loads(m) for m in
        re.findall(r"^\{.*\}(?=,?$)", src[src.index("["):src.rindex("]") + 1], re.M)]

SYM = 0.20
print(f"symmetry threshold |skewness| < {SYM}\n")

for d in objs:
    v = np.asarray(d["vals"], float)
    mu, sd = statistics.fmean(v.tolist()), statistics.pstdev(v.tolist())
    pop_skew = statistics.fmean((((v - mu) / sd) ** 3).tolist())
    print(f"=== {d['id']}  population skewness {pop_skew:+.2f} ===")

    # --- modes, from a smoothed histogram. Reported only so the prose can
    #     quote a measured figure instead of a remembered one.
    lo, hi = float(v.min()), float(v.max())
    nb = 40
    cnt, edges = np.histogram(v, bins=nb, range=(lo, hi))
    k = np.array([1, 2, 3, 2, 1], float); k /= k.sum()
    sm = np.convolve(cnt.astype(float), k, mode="same")
    peaks = [(float((edges[i] + edges[i + 1]) / 2), float(sm[i]))
             for i in range(1, nb - 1)
             if sm[i] > sm[i - 1] and sm[i] >= sm[i + 1] and sm[i] > 0.28 * sm.max()]
    peaks.sort(key=lambda p: -p[1])
    print("    modes near: " + ", ".join(f"{p:,.0f} (height {h:.0f})" for p, h in peaks[:3]))

    rng = np.random.default_rng(99)
    first = None
    for n in (1, 2, 5, 10, 30, 100):
        m = v[rng.integers(0, len(v), size=(120_000, n))].mean(axis=1)
        s = float(statistics.fmean((((m - m.mean()) / m.std()) ** 3).tolist()))
        sym = abs(s) < SYM
        if sym and first is None:
            first = n
        print(f"    n={n:>4}  sampling-dist skewness {s:+.3f}   "
              f"{'symmetric' if sym else 'still lopsided'}")
    print(f"    -> first symmetric at n = {first}\n")
