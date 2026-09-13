"""Measure the four regression assumptions on the real pairs, and whether the
standard repairs actually repair them.

Module 8 lists assumptions and fixes. This checks, on real data, which
assumption each dataset breaks and whether the textbook fix works -- because
"take logs" is advice, not a guarantee, and the page should only recommend it
where it is measurably true here.

  SHAPE          is the mean residual flat across x, or does it bend?
  SPREAD         is the residual spread constant, or does it fan?
  INDEPENDENCE   are consecutive residuals related? Only answerable when the
                 data HAS a meaningful order -- which is itself a lesson.
  NORMALITY      are the residuals bell-shaped, or heavy-tailed and skewed?
  INFLUENCE      how far does the line move if the single most influential
                 point is dropped?

Transforms tested: none, log y, and log both. All three datasets are strictly
positive so every log is defined.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np
from scipy import stats

HERE = Path(__file__).resolve().parent
psrc = (HERE.parent / "pairs.js").read_text(encoding="utf-8")
PAIRS = json.loads(psrc[psrc.index("["):psrc.rindex("]") + 1])


def fit(x, y):
    mx, my = x.mean(), y.mean()
    sxx = ((x - mx) ** 2).sum()
    b = ((x - mx) * (y - my)).sum() / sxx
    a = my - b * mx
    r = y - (a + b * x)
    sse = float((r ** 2).sum()); sst = float(((y - my) ** 2).sum())
    return {"a": a, "b": b, "resid": r, "r2": 1 - sse / sst, "sse": sse,
            "sxx": sxx, "mx": mx}


def diagnostics(x, y, nb=8):
    f = fit(x, y)
    r, n = f["resid"], len(x)
    qs = np.quantile(x, np.linspace(0, 1, nb + 1))
    means, sds = [], []
    for i in range(nb):
        m = (x >= qs[i]) & (x <= qs[i + 1] if i == nb - 1 else x < qs[i + 1])
        if m.sum() >= 3:
            means.append(float(r[m].mean())); sds.append(float(r[m].std(ddof=1)))
    rsd = float(r.std(ddof=1))
    # bend, expressed as a share of the overall residual spread so it compares
    # across datasets with wildly different units
    bend = (max(means) - min(means)) / rsd if rsd else 0.0
    fan = (max(sds) / min(sds)) if min(sds) > 0 else float("inf")
    # independence: lag-1 autocorrelation and Durbin-Watson, in stored order
    d1 = float(np.corrcoef(r[:-1], r[1:])[0, 1]) if n > 3 else 0.0
    dw = float(((np.diff(r)) ** 2).sum() / (r ** 2).sum())
    # normality of the residuals
    sk = float(stats.skew(r)); ku = float(stats.kurtosis(r))          # excess
    # leverage and influence. Cook's D for simple regression needs p = 2.
    h = 1.0 / n + (x - f["mx"]) ** 2 / f["sxx"]
    s2 = f["sse"] / (n - 2)
    cook = (r ** 2 / (2 * s2)) * (h / (1 - h) ** 2)
    j = int(np.argmax(cook))
    keep = np.ones(n, bool); keep[j] = False
    f2 = fit(x[keep], y[keep])
    slope_shift = abs(f2["b"] - f["b"]) / abs(f["b"]) if f["b"] else 0.0
    return {"r2": f["r2"], "slope": f["b"], "bend": bend, "fan": fan,
            "lag1": d1, "dw": dw, "skew": sk, "kurt": ku,
            "max_cook": float(cook[j]), "max_lev": float(h.max()),
            "worst_i": j, "slope_shift_one": slope_shift,
            "resid_sd": rsd}


TRANSFORMS = {
    "none":     lambda x, y: (x, y),
    "log y":    lambda x, y: (x, np.log(y)),
    "log both": lambda x, y: (np.log(x), np.log(y)),
}

print("=" * 104)
print("THE FOUR ASSUMPTIONS, MEASURED — and whether taking logs repairs them")
print("  bend  = swing in mean residual, as a multiple of residual spread   (want < 0.5)")
print("  fan   = widest residual spread / narrowest, across slices of x     (want < 2)")
print("  lag1  = correlation between consecutive residuals                  (want ~ 0)")
print("  skew / kurt = shape of the residuals                              (want ~ 0, ~ 0)")
print("  shift = how much the slope moves if the most influential point goes")
print("=" * 104)

report = {}
for d in PAIRS:
    x0 = np.asarray(d["x"], float); y0 = np.asarray(d["y"], float)
    print(f"\n### {d['id']}   {d['xlab']} -> {d['ylab']}   n={len(x0)}")
    print(f"  {'transform':10} {'R2':>7} {'bend':>7} {'fan':>7} {'lag1':>7} {'DW':>6} "
          f"{'skew':>7} {'kurt':>7} {'maxCook':>8} {'shift':>7}")
    for tname, tf in TRANSFORMS.items():
        xx, yy = tf(x0, y0)
        g = diagnostics(xx, yy)
        report[f"{d['id']}|{tname}"] = g
        flag = ""
        if g["bend"] > 0.5:
            flag += " BEND"
        if g["fan"] > 2:
            flag += " FAN"
        if abs(g["lag1"]) > 0.15:
            flag += " AUTOCORR"
        if abs(g["skew"]) > 1 or g["kurt"] > 2:
            flag += " NON-NORMAL"
        print(f"  {tname:10} {g['r2']:>7.3f} {g['bend']:>7.2f} {g['fan']:>7.2f} "
              f"{g['lag1']:>+7.3f} {g['dw']:>6.2f} {g['skew']:>+7.2f} {g['kurt']:>+7.2f} "
              f"{g['max_cook']:>8.3f} {g['slope_shift_one']:>6.1%}{flag}")

# ------------------------------------------------------------------ ordering
print("\n" + "=" * 104)
print("CAN INDEPENDENCE EVEN BE CHECKED? It needs a meaningful order.")
print("=" * 104)
print("  geyser   the 272 eruptions are stored in the order they happened, so")
print("           consecutive residuals are a real question.")
print("  diamond  a cross-section of stones. There is no order, so the")
print("  retail   lag-1 figure above is an artefact of file order, not a finding.")
print("           Reporting it as autocorrelation would be a mistake -- which is")
print("           itself the lesson: you cannot test independence without a sequence.")

g = report["geyser|none"]
print(f"\n  geyser lag-1 = {g['lag1']:+.3f}, Durbin-Watson = {g['dw']:.2f}")
print("  DW near 2 means no autocorrelation; below 2 positive; above 2 negative.")

# alternation check, since Old Faithful is said to alternate short/long
gy = [p for p in PAIRS if p["id"] == "geyser"][0]
dur = np.asarray(gy["x"], float)
short = dur < 3.0
alt = float((short[:-1] != short[1:]).mean())
print(f"  short/long alternation: {alt:.1%} of consecutive pairs switch kind "
      f"(50% would be a coin flip)")

(HERE / "diag_reference.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
print(f"\nwrote {HERE / 'diag_reference.json'}")
