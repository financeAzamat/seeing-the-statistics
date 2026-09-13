"""Choose the bin count and the dot budget from evidence, not taste.

Constraints the layout has to satisfy, all three at once:

  FITS     the tallest column must fit the pixels available with >= 1.8 px
           between dots, or the column stops reading as dots and becomes a
           solid bar. ~170 px of height => about 90 dots.
  DENSE    most bins should be occupied. A high bin count with a low dot
           budget produces a sparse comb that hides the shape.
  WHOLE    nothing clipped off the right edge. Clamping real observations
           at an axis boundary draws a value they do not have.
"""
import json
import re
from pathlib import Path

import numpy as np

src = (Path(__file__).resolve().parent.parent / "datasets.js").read_text()
body = src[src.index("["):src.rindex("]") + 1]
objs = [json.loads(m) for m in re.findall(r"^\{.*\}(?=,?$)", body, re.M)]

AVAIL_PX = 170          # height the population pile gets at a typical viewport
MIN_GAP = 1.8           # px between stacked dots before they merge visually
MAX_DOTS = int(AVAIL_PX / MIN_GAP)
print(f"budget: {AVAIL_PX} px / {MIN_GAP} px = tallest column must be <= {MAX_DOTS} dots\n")

for npop in (1100, 900, 700, 560):
    print(f"---------- dot budget {npop} ----------")
    for K in (50, 80, 110, 140, 170, 200):
        line = []
        ok = True
        for d in objs:
            v = np.array(d["vals"], float)
            if len(v) > npop:                     # same seeded thinning the page would use
                rng = np.random.default_rng(7)
                v = v[np.sort(rng.choice(len(v), npop, replace=False))]
            lo, hi = d["axis"]
            h = (hi - lo) / K
            idx = np.clip(((v - lo) / h).astype(int), 0, K - 1)
            c = np.bincount(idx, minlength=K)
            tall, used = int(c.max()), int((c > 0).sum())
            fits = tall <= MAX_DOTS
            dense = used / K >= 0.55
            ok &= fits and dense
            line.append(f"{d['id'][:7]}: tall={tall:>3}{'' if fits else '!'} "
                        f"used={used:>3}/{K}{'' if dense else '?'}")
        print(f"  K={K:>3}  " + "   ".join(line) + ("   <== viable" if ok else ""))
    print()
