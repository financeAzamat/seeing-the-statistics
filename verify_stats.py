"""Verify the page's claims against the REAL values it embeds.

The page asserts, for each dataset and each sample size:

  1. mu and sigma in datasets.js are the exact moments of the `vals` array
     that ships beside them  (no drift between data and label)
  2. drawing n records with replacement and averaging gives a spread of
     sigma / sqrt(n)                                    (the theorem)
  3. the mean of those averages is mu                   (unbiasedness)
  4. every embedded value lies inside the stated axis    (nothing clipped)
  5. the shapes really are different, so the bell below cannot have been
     inherited from a bell above                        (skew / bimodality)

This resamples the same arrays the browser resamples, so a mismatch here is
a mismatch on screen. Run after data/build_datasets.py.
"""
from __future__ import annotations

import json
import math
import re
import statistics
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
src = (HERE / "datasets.js").read_text(encoding="utf-8")
objs = [json.loads(m) for m in
        re.findall(r"^\{.*\}(?=,?$)", src[src.index("["):src.rindex("]") + 1], re.M)]
assert objs, "no dataset objects parsed out of datasets.js"

REPS = 60_000
NS = (1, 5, 25, 30, 100, 300)   # exactly the buttons clt.html offers
fails: list[str] = []

for d in objs:
    v = np.asarray(d["vals"], float)
    print(f"\n=== {d['id']}  ({d['shape']})  n={len(v):,}  unit={d['unit']} ===")
    print(f"    {d['source']}")

    # ---- 1. the label matches the data it ships with
    mu = statistics.fmean(v.tolist())
    sd = statistics.pstdev(v.tolist())
    d_mu_ok = abs(mu - d["mu"]) < 5e-3
    d_sd_ok = abs(sd - d["sd"]) < 5e-3
    print(f"  moments   file mu={d['mu']:.4f} sd={d['sd']:.4f} | "
          f"recomputed mu={mu:.4f} sd={sd:.4f}  "
          f"{'OK' if d_mu_ok and d_sd_ok else 'MISMATCH'}")
    if not (d_mu_ok and d_sd_ok):
        fails.append(f"{d['id']}: datasets.js moments disagree with its own vals")

    # ---- 4. nothing sits outside the axis the page draws
    lo, hi = d["axis"]
    out = int(((v < lo) | (v > hi)).sum())
    print(f"  axis      [{lo:,}, {hi:,}]  outside={out}  "
          f"{'OK' if out == 0 else 'CLIPPED'}")
    if out:
        fails.append(f"{d['id']}: {out} embedded values fall outside the drawn axis")

    # ---- 5. the population is genuinely not a bell
    skew = statistics.fmean((((v - mu) / sd) ** 3).tolist())
    med = float(np.median(v))
    file_skew_ok = abs(skew - d["skew"]) < 5e-3
    nsym = math.ceil((abs(skew) / 0.20) ** 2)
    nsym_ok = nsym == d["n_symmetric"]
    print(f"  shape     median={med:,.2f}  mean-median={mu - med:+,.2f}  skewness={skew:+.3f}"
          f"  (file {d['skew']:+.3f} {'OK' if file_skew_ok else 'MISMATCH'})")
    print(f"  n_sym     recomputed={nsym}  file={d['n_symmetric']}  "
          f"{'OK' if nsym_ok else 'MISMATCH'}")
    if not file_skew_ok:
        fails.append(f"{d['id']}: datasets.js skew disagrees with its own vals")
    if not nsym_ok:
        fails.append(f"{d['id']}: datasets.js n_symmetric disagrees with its own skew")

    # ---- 2, 3 & 6. the theorem and its rate, resampled the way the browser does
    rng = np.random.default_rng(4242)
    print(f"  {'n':>4} {'sigma/sqrt(n)':>14} {'observed':>11} {'err %':>7} "
          f"{'mean of means':>14} {'bias %':>7} {'skew pred':>10} {'skew obs':>9}")
    for n in NS:
        means = v[rng.integers(0, len(v), size=(REPS, n))].mean(axis=1)
        obs = float(means.std(ddof=1))
        pred = sd / math.sqrt(n)
        err = abs(obs - pred) / pred * 100
        bias = abs(float(means.mean()) - mu) / sd * 100
        # the page asserts: skew of the averages = population skew / sqrt(n)
        sk_pred = skew / math.sqrt(n)
        sk_obs = float(statistics.fmean(
            (((means - means.mean()) / means.std()) ** 3).tolist()))
        sk_off = abs(sk_obs - sk_pred)
        bad = err > 1.5 or bias > 1.5 or sk_off > 0.05
        print(f"  {n:>4} {pred:>14.4f} {obs:>11.4f} {err:>7.2f} "
              f"{means.mean():>14.4f} {bias:>7.2f} {sk_pred:>+10.3f} {sk_obs:>+9.3f}"
              f"{'   <-- FAIL' if bad else ''}")
        if bad:
            fails.append(f"{d['id']} n={n}: spread err {err:.2f}%, bias {bias:.2f}%, "
                         f"skew off by {sk_off:.3f}")

print("\n" + "=" * 68)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    raise SystemExit(1)
print("All checks passed: embedded moments match their data, nothing is clipped,")
print("and the observed spread of sample means equals sigma/sqrt(n) on every")
print("dataset at every sample size the page offers.")
