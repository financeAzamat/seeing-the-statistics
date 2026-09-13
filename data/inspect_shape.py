"""Inspect the built datasets: quantiles, subsample representativeness, and
how the dots would actually pile up for a candidate axis.

The point is to choose the axis range from the data instead of guessing, and
to see whether the tallest column would swamp the picture.
"""
import json
import re
import statistics
from pathlib import Path

import numpy as np

src = (Path(__file__).resolve().parent.parent / "datasets.js").read_text()
body = src[src.index("["):src.rindex("]") + 1]
# the file is one JSON object per line inside the array
objs = [json.loads(m) for m in re.findall(r"^\{.*\}(?=,?$)", body, re.M)]

K = 50
for d in objs:
    v = np.array(d["vals"], float)
    print(f"\n=== {d['id']}  ({d['shape']})  n={len(v):,}  unit={d['unit']} ===")
    print(f"  source n={d['n_source']:,}  full mean={d['full_mu']:.2f} sd={d['full_sd']:.2f}")
    print(f"  pool   n={d['n_pool']:,}  pool mean={d['pool_mu']:.2f} sd={d['pool_sd']:.2f}")
    print(f"  embed  n={len(v):,}  mean={d['mu']:.2f} sd={d['sd']:.2f}"
          f"   (mean is {abs(d['mu']-d['pool_mu'])/d['pool_sd']*100:.1f}% of a pool SD from pool mean)")
    qs = [0, 5, 10, 25, 50, 75, 90, 95, 99, 100]
    print("  quantiles: " + "  ".join(f"p{q}={np.percentile(v,q):,.0f}" for q in qs))

    for hi in {d["axis"][1], int(np.percentile(v, 95)), int(np.percentile(v, 90)),
               int(np.percentile(v, 75))}:
        lo = d["axis"][0]
        if hi <= lo:
            continue
        h = (hi - lo) / K
        idx = np.clip(((v - lo) / h).astype(int), 0, K - 1)
        counts = np.bincount(idx, minlength=K)
        over = int((v > hi).sum())
        # a column taller than ~90 dots stops being readable in the space we have
        print(f"  axis[{lo},{hi:,}] binw={h:,.0f}  tallest column={counts.max():>4} dots"
              f"  bins used={int((counts>0).sum()):>3}/{K}  beyond axis={over:>4}"
              f" ({over/len(v)*100:.1f}%)")
