"""SCOUT for the Module 4 correlation page. Decides nothing about the page yet --
it measures candidate lessons on the real data so the page can be built around
whichever ones actually hold.

The hazard this scout exists to avoid: for a simple linear fit r-squared IS
r squared, so a page about "r hides things" would just be the Module 7
regression page again. So the candidates below are deliberately effects that
r-squared-on-the-full-data cannot show:

  A. SAME r, DIFFERENT PICTURE — two real pairs whose r agrees to two decimals
     while their shapes are nothing alike.
  B. RANGE RESTRICTION — take a narrow slice of x and r collapses, even though
     the underlying relationship is untouched. This is what happens whenever you
     only get to see the candidates you hired or the loans you approved.
  C. MONOTONE BUT NOT STRAIGHT — Pearson r versus Spearman rho. A nearly perfect
     curved relationship scores a mediocre r because r only looks for a line.
  D. OUTLIER LEVERAGE — r before and after dropping a handful of bad rows. The
     diamonds table contains real data-entry errors (zero dimensions), so this
     can be shown on genuine dirt rather than manufactured noise.
"""
from __future__ import annotations

import csv
import math
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"


def load(name: str) -> dict[str, list]:
    with (CACHE / name).open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out: dict[str, list] = {k: [] for k in rows[0]}
    for r in rows:
        for k, v in r.items():
            try:
                out[k].append(float(v))
            except (TypeError, ValueError):
                out[k].append(v)
    return out


def pearson(xs, ys) -> float:
    n = len(xs)
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxy = sxx = syy = 0.0
    for i in range(n):
        a, b = xs[i] - mx, ys[i] - my
        sxy += a * b; sxx += a * a; syy += b * b
    return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else float("nan")


def ranks(v: list[float]) -> list[float]:
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[order[k]] = avg
        i = j + 1
    return r


def spearman(xs, ys) -> float:
    return pearson(ranks(xs), ranks(ys))


def main() -> None:
    D = load("diamonds.csv")
    G = load("geyser.csv")

    print("=" * 78)
    print("A. CANDIDATE PAIRS — r, rho, n")
    print("=" * 78)
    pairs = [
        ("diamond carat -> price", D["carat"], D["price"]),
        ("diamond carat -> depth", D["carat"], D["depth"]),
        ("diamond table -> price", D["table"], D["price"]),
        ("diamond depth -> table", D["depth"], D["table"]),
        ("diamond x -> price", D["x"], D["price"]),
        ("diamond x -> y", D["x"], D["y"]),
        ("diamond carat -> x", D["carat"], D["x"]),
        ("geyser duration -> wait", G["duration"], G["waiting"]),
    ]
    got = {}
    for name, xs, ys in pairs:
        r, rho = pearson(xs, ys), spearman(xs, ys)
        got[name] = (r, rho, len(xs))
        print(f"  {name:<26} n={len(xs):>6,}  r={r:+.4f}  rho={rho:+.4f}  "
              f"r2={r*r:.4f}")

    print("\n  pairs whose r agrees to two decimals (candidate lesson A):")
    keys = list(got)
    found = False
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            ri, rj = got[keys[i]][0], got[keys[j]][0]
            if abs(abs(ri) - abs(rj)) < 0.012:
                print(f"    {keys[i]} (r={ri:+.4f})  ==  {keys[j]} (r={rj:+.4f})")
                found = True
    if not found:
        print("    none — lesson A needs a different pair of variables")

    print("\n" + "=" * 78)
    print("B. RANGE RESTRICTION — same relationship, narrower slice of x")
    print("=" * 78)
    xs, ys = D["carat"], D["price"]
    full = pearson(xs, ys)
    print(f"  full range (n={len(xs):,}): r = {full:+.4f}")
    for lo, hi in [(0.2, 2.5), (0.3, 1.5), (0.5, 1.2), (0.9, 1.1), (0.95, 1.05),
                   (0.99, 1.01)]:
        sel = [(a, b) for a, b in zip(xs, ys) if lo <= a <= hi]
        if len(sel) < 30:
            print(f"  {lo}–{hi} ct: only {len(sel)} stones, skipped")
            continue
        sx = [a for a, _ in sel]; sy = [b for _, b in sel]
        r = pearson(sx, sy)
        print(f"  {lo:>5}–{hi:<5} ct  n={len(sel):>6,}  r = {r:+.4f}   "
              f"({100 * (1 - abs(r) / abs(full)):+5.1f}% vs full)")

    print("\n" + "=" * 78)
    print("C. MONOTONE BUT NOT STRAIGHT — Pearson vs Spearman vs log-log")
    print("=" * 78)
    for name, a, b in [("diamond carat -> price", D["carat"], D["price"]),
                       ("diamond x -> price", D["x"], D["price"])]:
        r, rho = pearson(a, b), spearman(a, b)
        pos = [(u, v) for u, v in zip(a, b) if u > 0 and v > 0]
        la = [math.log(u) for u, _ in pos]; lb = [math.log(v) for _, v in pos]
        rl = pearson(la, lb)
        print(f"  {name}")
        print(f"    Pearson r (straight line)   {r:+.4f}   r2={r*r:.4f}")
        print(f"    Spearman rho (any monotone) {rho:+.4f}   "
              f"gap {abs(rho) - abs(r):+.4f}")
        print(f"    Pearson r on log-log        {rl:+.4f}   r2={rl*rl:.4f}")

    print("\n" + "=" * 78)
    print("D. OUTLIER LEVERAGE — real data-entry errors in the diamonds table")
    print("=" * 78)
    bad = [i for i in range(len(D["x"]))
           if D["x"][i] == 0 or D["y"][i] == 0 or D["z"][i] == 0]
    print(f"  rows with a zero dimension (physically impossible): {len(bad)}")
    ext = [i for i in range(len(D["y"])) if D["y"][i] > 20 or D["z"][i] > 20]
    print(f"  rows with a dimension over 20 mm (a 2 cm stone): {len(ext)}")
    for lbl, drop in [("zero dimensions", set(bad)),
                      ("zero + over-20mm", set(bad) | set(ext))]:
        for xn, yn in [("x", "y"), ("x", "price"), ("z", "price")]:
            a0, b0 = D[xn], D[yn]
            r0 = pearson(a0, b0)
            keep = [i for i in range(len(a0)) if i not in drop]
            r1 = pearson([a0[i] for i in keep], [b0[i] for i in keep])
            if abs(r1 - r0) > 0.005:
                print(f"  dropping {lbl:<18} {xn}->{yn:<6} "
                      f"r {r0:+.4f} -> {r1:+.4f}  (moves {r1 - r0:+.4f}, "
                      f"{len(a0) - len(keep)} of {len(a0):,} rows)")

    print("\n" + "=" * 78)
    print("E. THE GEYSER PAIR — two clusters, and what r says about them")
    print("=" * 78)
    gd, gw = G["duration"], G["waiting"]
    print(f"  overall r = {pearson(gd, gw):+.4f}  rho = {spearman(gd, gw):+.4f}")
    short = [(a, b) for a, b in zip(gd, gw) if a < 3]
    long_ = [(a, b) for a, b in zip(gd, gw) if a >= 3]
    for lbl, sel in [("short eruptions (<3 min)", short),
                     ("long eruptions (>=3 min)", long_)]:
        if len(sel) < 20:
            continue
        r = pearson([a for a, _ in sel], [b for _, b in sel])
        print(f"  {lbl:<26} n={len(sel):>4}  r = {r:+.4f}")


if __name__ == "__main__":
    main()
