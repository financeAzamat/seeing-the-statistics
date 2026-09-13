"""GENERATOR for corr.js — the data behind the Module 4 correlation page.

Run:  python3 build_corr.py

The lesson the measurements supported (see measure_corr.py) is that r is not a
property of a relationship: it is a property of the relationship AND the range
of x you happened to observe. Two real demonstrations, from opposite directions:

  * DIAMONDS — narrow the carat window and r falls from +0.922 to +0.088 while
    the underlying relationship is untouched.
  * GEYSER — r is +0.901 overall, but +0.290 and +0.373 inside the two clusters.
    Nearly all of that correlation is the GAP between the groups, not agreement
    within them.

IMPORTANT — population vs drawn sample. Every r shipped here is computed on the
FULL population for that window. The `pts` arrays are a seeded random SAMPLE,
present only so the page has something to draw. Mixing the two is a mistake this
project has already made once (a fan ratio measured on the full source while the
page plotted 800 rows), so each window carries BOTH counts and the page states
which is which.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from measure_corr import load, pearson, spearman

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "corr.js"

SEED = 20260913
SAMPLE = 1200

# Carat windows, widest first. Chosen from the scout run because they show a
# smooth collapse rather than a single dramatic jump.
WINDOWS = [
    (None, None, "full range"),
    (0.30, 1.50, "0.30–1.50 ct"),
    (0.50, 1.20, "0.50–1.20 ct"),
    (0.90, 1.10, "0.90–1.10 ct"),
    (0.95, 1.05, "0.95–1.05 ct"),
    (0.99, 1.01, "0.99–1.01 ct"),
]


def lcg(seed: int):
    """MINSTD. Reproducible in BOTH Python and JS -- the larger multiplier used
    elsewhere in this project exceeds 2^53 and loses precision in JS, so it can
    never be mirrored exactly."""
    s = seed % 2147483647 or 1
    while True:
        s = (s * 48271) % 2147483647
        yield s / 2147483647


def sample_idx(n: int, k: int, seed: int) -> list[int]:
    rnd = lcg(seed)
    keep: list[int] = []
    for i in range(n):
        # reservoir-free: take each row with probability k/n, then trim
        if next(rnd) < k / n * 1.25:
            keep.append(i)
    return keep[:k]


def main() -> None:
    D = load("diamonds.csv")
    G = load("geyser.csv")

    # ---------------------------------------------------------- diamonds
    carat, price = D["carat"], D["price"]
    n_all = len(carat)
    idx = sample_idx(n_all, SAMPLE, SEED)
    pts = [[round(carat[i], 2), int(price[i])] for i in idx]

    windows = []
    for lo, hi, label in WINDOWS:
        if lo is None:
            sel = list(range(n_all))
        else:
            sel = [i for i in range(n_all) if lo <= carat[i] <= hi]
        r = pearson([carat[i] for i in sel], [price[i] for i in sel])
        drawn = len([1 for i in idx if lo is None or lo <= carat[i] <= hi])
        windows.append(dict(lo=lo, hi=hi, label=label, n=len(sel),
                            r=round(r, 4), drawn=drawn))
        print(f"  window {label:<14} population n={len(sel):>6,}  r={r:+.4f}  "
              f"drawn={drawn:>4}")

    # what r measures at all: straight line vs any monotone vs log-log
    rho = spearman(carat, price)
    pos = [(a, b) for a, b in zip(carat, price) if a > 0 and b > 0]
    rlog = pearson([math.log(a) for a, _ in pos], [math.log(b) for _, b in pos])
    print(f"  pearson {windows[0]['r']:+.4f}  spearman {rho:+.4f}  "
          f"log-log {rlog:+.4f}")

    # ---------------------------------------------------------- geyser
    gd, gw = G["duration"], G["waiting"]
    SPLIT = 3.0
    g_all = pearson(gd, gw)
    groups = []
    for label, keep in (("short eruptions, under 3 min",
                         [i for i in range(len(gd)) if gd[i] < SPLIT]),
                        ("long eruptions, 3 min or more",
                         [i for i in range(len(gd)) if gd[i] >= SPLIT])):
        r = pearson([gd[i] for i in keep], [gw[i] for i in keep])
        groups.append(dict(label=label, n=len(keep), r=round(r, 4)))
        print(f"  geyser {label:<32} n={len(keep):>4}  r={r:+.4f}")
    print(f"  geyser overall n={len(gd)}  r={g_all:+.4f}  "
          f"rho={spearman(gd, gw):+.4f}")

    # ---------------------------------------------------------- real dirt
    bad = [i for i in range(len(D["x"]))
           if D["x"][i] == 0 or D["y"][i] == 0 or D["z"][i] == 0]
    ext = [i for i in range(len(D["y"])) if D["y"][i] > 20 or D["z"][i] > 20]
    drop = set(bad) | set(ext)
    keep = [i for i in range(len(D["x"])) if i not in drop]
    r_dirty = pearson(D["x"], D["y"])
    r_clean = pearson([D["x"][i] for i in keep], [D["y"][i] for i in keep])
    print(f"  dirt: {len(bad)} zero-dimension rows + {len(ext)} over-20mm; "
          f"x->y r {r_dirty:+.4f} -> {r_clean:+.4f}")

    out = dict(
        diamond=dict(
            xLabel="Size (carat)", yLabel="Price ($)",
            source="Diamonds (ggplot2 / seaborn reference dataset)",
            url="https://github.com/mwaskom/seaborn-data/blob/master/diamonds.csv",
            what="Every stone in the standard diamonds reference table: its weight "
                 "in carats against its price in US dollars.",
            filters=["all 53,940 stones, no exclusions",
                     f"every r computed on the FULL population inside its window",
                     f"{SAMPLE} stones drawn at random (MINSTD seed {SEED}) for the plot only"],
            nAll=n_all, nDrawn=len(pts), seed=SEED,
            pts=pts, windows=windows,
            pearson=round(windows[0]["r"], 4), spearman=round(rho, 4),
            logr=round(rlog, 4),
        ),
        geyser=dict(
            xLabel="Eruption length (min)", yLabel="Wait until next (min)",
            source="Old Faithful eruptions (Azzalini & Bowman, 1990)",
            url="https://github.com/mwaskom/seaborn-data/blob/master/geyser.csv",
            what="272 consecutive Old Faithful eruptions: how long each one "
                 "lasted against how long you then waited for the next.",
            filters=["all 272 eruptions, no exclusions",
                     "split at an eruption length of 3 minutes",
                     "every point plotted — no sampling"],
            nAll=len(gd), split=SPLIT,
            r=round(g_all, 4), rho=round(spearman(gd, gw), 4),
            groups=groups,
            pts=[[round(gd[i], 3), round(gw[i], 1)] for i in range(len(gd))],
        ),
        dirt=dict(nZero=len(bad), nHuge=len(ext), nDropped=len(drop),
                  nAll=len(D["x"]), rDirty=round(r_dirty, 4),
                  rClean=round(r_clean, 4)),
    )
    OUT.write_text(
        "/* GENERATED by data/build_corr.py — do not hand-edit.\n"
        "   Every r here is computed on the FULL population for its window.\n"
        "   `pts` is a seeded random SAMPLE, present only so the page has\n"
        "   something to draw — never treat it as the population. Each window\n"
        "   carries both counts (`n` and `drawn`) so the page can say which\n"
        "   number a figure describes. Re-run the script to rebuild. */\n"
        "window.UDJ_CORR = " + json.dumps(out, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"\nwrote {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
