"""Measure what confidence intervals ACTUALLY do on the three real datasets.

Nothing on the next page gets claimed until it is measured here. The questions
that matter, and that the textbook answers only asymptotically:

  1. Does a 95% interval really contain mu 95% of the time?
  2. Does it matter whether you know sigma (z) or estimate it from the sample
     (t)?  The t interval assumes a normal POPULATION, and none of these three
     datasets is normal, so its coverage at small n is an open question rather
     than a given.
  3. How badly does the common error -- estimating s but still using z --
     under-cover?
  4. On the extremely skewed retail data, where the CLT page showed n = 30 is
     not enough for symmetry, is a 95% interval at n = 30 actually 95%?

Also emits the exact critical values the page needs, so the browser never has
to approximate an inverse t.
"""
from __future__ import annotations

import importlib
import json
import math
import re
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ds = (HERE.parent / "datasets.js").read_text(encoding="utf-8")
OBJS = [json.loads(m) for m in
        re.findall(r"^\{.*\}(?=,?$)", ds[ds.index("["):ds.rindex("]") + 1], re.M)]

try:
    stats = importlib.import_module("scipy.stats")
    print("scipy available:", importlib.import_module("scipy").__version__)
except Exception:
    stats = None
    print("scipy NOT available -- using own t quantile")


# ---------------------------------------------------------------- t quantiles
def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction for the incomplete beta function (Lentz's method)."""
    tiny = 1e-30
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d
    for m in range(1, 300):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < 3e-16:
            break
    return h


def betainc(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lb = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
          + a * math.log(x) + b * math.log1p(-x))
    if x < (a + 1.0) / (a + b + 2.0):
        return math.exp(lb) * _betacf(a, b, x) / a
    return 1.0 - math.exp(lb) * _betacf(b, a, 1.0 - x) / b


def t_cdf(t: float, df: float) -> float:
    x = df / (df + t * t)
    p = 0.5 * betainc(df / 2.0, 0.5, x)
    return 1.0 - p if t > 0 else p


def t_ppf(p: float, df: float) -> float:
    """Two-sided-friendly inverse t by bisection. Plenty fast for a table."""
    lo, hi = -400.0, 400.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if t_cdf(mid, df) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def z_crit(conf: float) -> float:
    from statistics import NormalDist
    return NormalDist().inv_cdf(0.5 + conf / 2)


def t_crit(conf: float, df: int) -> float:
    if stats is not None:
        return float(stats.t.ppf(0.5 + conf / 2, df))
    return t_ppf(0.5 + conf / 2, df)


# sanity-check the home-grown quantile against known textbook values
KNOWN = {(0.95, 1): 12.706, (0.95, 4): 2.776, (0.95, 24): 2.064,
         (0.95, 29): 2.045, (0.95, 99): 1.984, (0.99, 24): 2.797,
         (0.90, 9): 1.833, (0.80, 24): 1.318}
print("\nt quantile check against published tables:")
worst = 0.0
for (c, df), want in sorted(KNOWN.items()):
    got = t_crit(c, df)
    worst = max(worst, abs(got - want))
    print(f"  t({c:.2f}, df={df:>3}) = {got:7.4f}  table {want:6.3f}  "
          f"{'OK' if abs(got - want) < 0.002 else 'MISMATCH'}")
print(f"  worst deviation {worst:.5f}")
assert worst < 0.002, "t quantile is wrong -- do not ship it"

CONFS = (0.80, 0.90, 0.95, 0.99)
NS = (1, 5, 25, 30, 100, 300)
REPS = 40_000

# ---------------------------------------------------------------- coverage
print("\n" + "=" * 78)
print("COVERAGE: share of intervals that actually contain the true mean mu")
print("  z(sigma) = sigma known, x-bar +/- z*sigma/sqrt(n)   <- textbook ideal")
print("  t(s)     = sigma estimated, x-bar +/- t*s/sqrt(n)   <- what you really do")
print("  z(s)     = sigma estimated but z used anyway        <- the common error")
print("=" * 78)

table: dict[str, dict] = {}
for d in OBJS:
    v = np.asarray(d["vals"], float)
    mu, sd = d["mu"], d["sd"]
    print(f"\n### {d['id']}  (skew {d['skew']:+.2f})   mu={mu:,.2f}  sigma={sd:,.2f}")
    for conf in CONFS:
        zc = z_crit(conf)
        print(f"  --- nominal {conf:.0%}  (z = {zc:.4f}) ---")
        print(f"  {'n':>4} {'z(sigma)':>9} {'t(s)':>9} {'z(s)':>9}   {'half-width z(sigma)':>20}")
        for n in NS:
            rng = np.random.default_rng(1234 + n)
            samp = v[rng.integers(0, len(v), size=(REPS, n))]
            xbar = samp.mean(axis=1)

            hw_z_sigma = zc * sd / math.sqrt(n)
            cov_z_sigma = float((np.abs(xbar - mu) <= hw_z_sigma).mean())

            if n >= 2:
                s = samp.std(axis=1, ddof=1)
                tc = t_crit(conf, n - 1)
                cov_t = float((np.abs(xbar - mu) <= tc * s / math.sqrt(n)).mean())
                cov_z_s = float((np.abs(xbar - mu) <= zc * s / math.sqrt(n)).mean())
                ts = f"{cov_t:>8.1%} {cov_z_s:>9.1%}"
            else:
                tc, cov_t, cov_z_s = float("nan"), float("nan"), float("nan")
                ts = f"{'n/a':>8} {'n/a':>9}"

            print(f"  {n:>4} {cov_z_sigma:>8.1%} {ts}   {hw_z_sigma:>20,.2f}")
            table[f"{d['id']}|{conf}|{n}"] = {
                "z": zc, "t": None if math.isnan(tc) else tc,
                "cov_z_sigma": cov_z_sigma,
                "cov_t": None if math.isnan(cov_t) else cov_t,
                "cov_z_s": None if math.isnan(cov_z_s) else cov_z_s,
            }

# ---------------------------------------------------------------- crit values
print("\n" + "=" * 78)
print("CRITICAL VALUES the page needs (embedded so the browser never approximates)")
print("=" * 78)
crit = {"z": {f"{c}": z_crit(c) for c in CONFS},
        "t": {f"{c}": {str(n): t_crit(c, n - 1) for n in NS if n >= 2} for c in CONFS}}
for c in CONFS:
    print(f"  {c:.0%}  z={crit['z'][str(c)]:.4f}   "
          + "  ".join(f"t(n={n})={crit['t'][str(c)][str(n)]:.3f}" for n in NS if n >= 2))

(HERE / "ci_reference.json").write_text(
    json.dumps({"crit": crit, "coverage": table}, indent=1), encoding="utf-8")
print(f"\nwrote {HERE / 'ci_reference.json'}")

# Emit the table the page loads. Generated rather than hand-typed: transcribing
# 24 critical values by hand is exactly how a wrong 2.045 gets shipped.
out = HERE.parent / "ci_crit.js"
out.write_text(
    "/* GENERATED by data/measure_ci.py -- do not hand-edit.\n"
    "   Two-sided critical values. z from the normal, t from the t distribution\n"
    "   with n-1 degrees of freedom, checked against published tables in the\n"
    "   script that wrote this file. n = 1 is absent on purpose: a spread cannot\n"
    "   be estimated from a single observation, so there is no t for df = 0. */\n"
    "window.UDJ_CRIT = " + json.dumps(
        {"z": {str(c): round(crit["z"][str(c)], 6) for c in CONFS},
         "t": {str(c): {str(n): round(crit["t"][str(c)][str(n)], 6)
                        for n in NS if n >= 2} for c in CONFS}},
        indent=1) + ";\n",
    encoding="utf-8")
print(f"wrote {out}")

# ------------------------------------------------------- why it under-covers
# Claim to be tested, not assumed: on right-skewed data x-bar and s are
# POSITIVELY CORRELATED, because a sample that happens to miss the big tail
# values has both a low mean and a low spread. That builds a narrow interval
# centred too low, so the misses should pile up on ONE side.
print("\n" + "=" * 78)
print("MECHANISM: are the misses one-sided, and are x-bar and s correlated?")
print("=" * 78)
print(f"  {'dataset':9} {'n':>4} {'corr(xbar,s)':>13} {'miss low':>9} {'miss high':>10} "
      f"{'coverage':>9}")
for d in OBJS:
    v = np.asarray(d["vals"], float)
    mu, sd = d["mu"], d["sd"]
    for n in (5, 30, 300):
        rng = np.random.default_rng(777 + n)
        samp = v[rng.integers(0, len(v), size=(REPS, n))]
        xbar, s = samp.mean(axis=1), samp.std(axis=1, ddof=1)
        hw = t_crit(0.95, n - 1) * s / math.sqrt(n)
        low = int(((xbar + hw) < mu).sum())        # whole interval below mu
        high = int(((xbar - hw) > mu).sum())       # whole interval above mu
        corr = float(np.corrcoef(xbar, s)[0, 1])
        cov = 1 - (low + high) / REPS
        print(f"  {d['id']:9} {n:>4} {corr:>+13.3f} {low / REPS:>9.1%} "
              f"{high / REPS:>10.1%} {cov:>9.1%}")
print("\n  A positive corr with misses concentrated LOW is the skew mechanism:")
print("  miss the tail -> low mean AND narrow interval -> confidently wrong.")
