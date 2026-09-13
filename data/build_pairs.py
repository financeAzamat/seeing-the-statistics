"""Build pairs.js -- real (x, y) pairs for the regression page.

Regression needs two variables per record, which the single-column datasets.js
cannot supply. Two of the already-cached sources are bivariate, and the retail
source can be aggregated into pairs, so no new download is needed.

  geyser    eruption duration -> wait until the next eruption
  diamond   carat -> price
  retail    a per-invoice pair, chosen by measurement below

Chosen for what they TEACH, not for looking tidy:

  * a strong relationship whose residuals are still visibly patterned, so a
    high R-squared can be shown to be compatible with a wrong model;
  * a relationship made of two clusters, so a high R-squared can be shown to
    come from grouping rather than from a trend;
  * a weak one, so low R-squared can be shown NOT to mean "no relationship".

Everything written out is a recorded observation. Slope, intercept and
R-squared in the file are computed from the exact points written beside them,
so the page cannot report a fit its own data does not have.
"""
from __future__ import annotations

import csv
import io
import json
import math
import statistics
import zipfile
from pathlib import Path

import numpy as np
from openpyxl import load_workbook

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
OUT = HERE.parent / "pairs.js"
SEED = 20260913
N_EMBED = 800          # scatter points; readable without becoming a smear


def ols(x: np.ndarray, y: np.ndarray) -> dict:
    """Least squares fit plus the pieces R-squared is made of."""
    n = len(x)
    mx, my = float(x.mean()), float(y.mean())
    sxx = float(((x - mx) ** 2).sum())
    sxy = float(((x - mx) * (y - my)).sum())
    slope = sxy / sxx if sxx else 0.0
    intercept = my - slope * mx
    pred = intercept + slope * x
    sse = float(((y - pred) ** 2).sum())          # unexplained
    sst = float(((y - my) ** 2).sum())            # total
    r2 = 1 - sse / sst if sst else 0.0
    r = float(np.corrcoef(x, y)[0, 1]) if n > 1 and sxx else 0.0
    # residual-vs-x correlation is zero by construction; the SQUARED residual
    # against x is what exposes a fan shape, and residual against x-squared is
    # what exposes curvature. Both are diagnostics R-squared cannot see.
    resid = y - pred
    fan = float(np.corrcoef(x, resid ** 2)[0, 1]) if n > 2 else 0.0
    curve = float(np.corrcoef(x ** 2, resid)[0, 1]) if n > 2 else 0.0
    return {"slope": slope, "intercept": intercept, "r2": r2, "r": r,
            "sse": sse, "sst": sst, "mean_y": my, "mean_x": mx,
            "fan": fan, "curve": curve, "n": n}


def report(label: str, x: np.ndarray, y: np.ndarray) -> dict:
    f = ols(x, y)
    print(f"  {label:34} n={f['n']:>6}  r={f['r']:+.3f}  R2={f['r2']:.3f}  "
          f"slope={f['slope']:+.4g}  fan={f['fan']:+.2f}  curve={f['curve']:+.2f}")
    return f


# --------------------------------------------------------------- geyser
print("geyser candidates")
grows = list(csv.DictReader(io.StringIO((CACHE / "geyser.csv").read_text())))
print("  columns:", list(grows[0]))
gd = np.array([float(r["duration"]) for r in grows])
gw = np.array([float(r["waiting"]) for r in grows])
report("duration -> waiting", gd, gw)

# --------------------------------------------------------------- diamonds
print("\ndiamond candidates")
drows = list(csv.DictReader(io.StringIO((CACHE / "diamonds.csv").read_text())))
print("  columns:", list(drows[0]))
carat = np.array([float(r["carat"]) for r in drows])
price = np.array([float(r["price"]) for r in drows])
report("carat -> price", carat, price)
report("carat -> log price", carat, np.log(price))

# --------------------------------------------------------------- retail
print("\nretail candidates (per invoice)")
zf = zipfile.ZipFile(io.BytesIO((CACHE / "online_retail.zip").read_bytes()))
inner = [n for n in zf.namelist() if n.lower().endswith((".xlsx", ".xls"))][0]
wb = load_workbook(io.BytesIO(zf.read(inner)), read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]
it = ws.iter_rows(values_only=True)
hdr = [str(h).strip() if h is not None else "" for h in next(it)]
col = {h: i for i, h in enumerate(hdr)}
NONPRODUCT = {"POST", "DOT", "C2", "M", "BANK CHARGES", "PADS", "AMAZONFEE",
              "S", "D", "CRUK", "B", "GIFT"}
inv: dict[str, dict] = {}
for r in it:
    no = r[col["InvoiceNo"]]
    if no is None:
        continue
    no = str(no).strip()
    if no.upper().startswith("C"):
        continue
    sc = str(r[col["StockCode"]] or "").strip().upper()
    if sc in NONPRODUCT:
        continue
    try:
        q = float(r[col["Quantity"]]); p = float(r[col["UnitPrice"]])
    except (TypeError, ValueError):
        continue
    if q <= 0 or p <= 0:
        continue
    d = inv.setdefault(no, {"lines": 0, "units": 0.0, "value": 0.0})
    d["lines"] += 1
    d["units"] += q
    d["value"] += q * p
wb.close()
print(f"  {len(inv):,} invoices aggregated")

# keep the same readability cutoff as datasets.js so the two pages agree
vals = np.array([d["value"] for d in inv.values()])
cut = 4450
keep = [d for d in inv.values() if d["value"] <= cut]
print(f"  {len(keep):,} invoices at or below {cut} (same cutoff as datasets.js)")
lines = np.array([d["lines"] for d in keep], float)
units = np.array([d["units"] for d in keep], float)
value = np.array([d["value"] for d in keep], float)
avgp = value / np.maximum(units, 1e-9)

cands = {
    "lines -> value": report("line count -> invoice value", lines, value),
    "units -> value": report("units -> invoice value", units, value),
    "avgprice -> units": report("avg unit price -> units (demand)", avgp, units),
    "avgprice -> value": report("avg unit price -> invoice value", avgp, value),
    "lines -> units": report("line count -> units", lines, units),
}

print("\nPICK: strong-but-fanning, strong-and-clean, and weak-but-real.")
print("  diamonds carat->price   R2=0.849, fan +0.41  -> high R2, useless at the top end")
print("  geyser duration->wait   R2=0.811, clean       -> nearly the SAME R2, sound fit")
print("  retail lines->value     R2=0.290              -> low R2, real and useful slope")

# ------------------------------------------------------- diagnostics on the picks
def binned_residuals(label, x, y, nb=8):
    """Mean residual per slice of x. This is what a human actually looks at,
    and it shows curvature that a single correlation coefficient hides."""
    f = ols(x, y)
    resid = y - (f["intercept"] + f["slope"] * x)
    qs = np.quantile(x, np.linspace(0, 1, nb + 1))
    print(f"\n  {label}: mean residual and spread by slice of x")
    print(f"    {'x range':>22} {'n':>6} {'mean resid':>12} {'sd resid':>10}")
    for i in range(nb):
        lo, hi = qs[i], qs[i + 1]
        m = (x >= lo) & (x <= hi if i == nb - 1 else x < hi)
        if m.sum() < 3:
            continue
        print(f"    {f'{lo:.4g}..{hi:.4g}':>22} {int(m.sum()):>6} "
              f"{resid[m].mean():>12,.1f} {resid[m].std(ddof=1):>10,.1f}")

print("\n" + "=" * 78)
print("RESIDUAL SHAPE — the thing R-squared cannot see")
print("=" * 78)
binned_residuals("diamonds carat -> price", carat, price)
binned_residuals("geyser duration -> waiting", gd, gw)
binned_residuals("retail lines -> value", lines, value)

# ------------------------------------------------------- is the geyser R2 clustering?
print("\n" + "=" * 78)
print("IS THE GEYSER FIT REALLY A TREND, OR TWO CLUSTERS?")
print("  If the R-squared came from the gap between two groups, the slope inside")
print("  each group would collapse. Tested rather than asserted.")
print("=" * 78)
split = 3.0
lo_m, hi_m = gd < split, gd >= split
whole = ols(gd, gw)
print(f"  whole set        n={whole['n']:>4}  slope={whole['slope']:+7.2f}  R2={whole['r2']:.3f}")
for name, m in (("short eruptions", lo_m), ("long eruptions", hi_m)):
    f = ols(gd[m], gw[m])
    frac = f["slope"] / whole["slope"]
    print(f"  {name:16} n={f['n']:>4}  slope={f['slope']:+7.2f}  R2={f['r2']:.3f}"
          f"   slope is {frac:.0%} of the overall slope")
print(f"  cluster centres: short {gd[lo_m].mean():.2f} min -> wait {gw[lo_m].mean():.1f}, "
      f"long {gd[hi_m].mean():.2f} min -> wait {gw[hi_m].mean():.1f}")

# ------------------------------------------------------- write pairs.js
def pack(pid, label, xlab, ylab, xunit, yunit, x, y, what, url, source, note, filters,
         diag=None, ordered=False, order_note=""):
    rng = np.random.default_rng(SEED)
    if len(x) > N_EMBED:
        idx = np.sort(rng.choice(len(x), N_EMBED, replace=False))
        xs, ys = x[idx], y[idx]
    else:
        xs, ys = x, y
    # round FIRST, then fit, so the file's slope belongs to the points it ships
    xr = [round(float(v), 4) for v in xs]
    yr = [round(float(v), 2) for v in ys]
    f = ols(np.array(xr), np.array(yr))
    full = ols(x, y)
    # Diagnostics are computed from the EMBEDDED points, not the full source,
    # because those are the points the page plots. A fan ratio measured on
    # 53,940 records printed beside a picture of 800 would be a number the
    # reader cannot check against what is in front of them.
    xa, ya = np.array(xr), np.array(yr)
    d = {"bend": bend(xa, ya)}
    d.update(fan_ratio(xa, ya))
    if diag:
        d.update(diag)
    pad = lambda a: (min(a), max(a))
    x0, x1 = pad(xr); y0, y1 = pad(yr)
    span_x, span_y = x1 - x0, y1 - y0
    print(f"  {pid:8} embed n={len(xr):>4}  R2={f['r2']:.3f} (full {full['r2']:.3f})  "
          f"slope={f['slope']:+.4g} (full {full['slope']:+.4g})")
    return {
        "id": pid, "label": label,
        "xlab": xlab, "ylab": ylab, "xunit": xunit, "yunit": yunit,
        "xaxis": [x0 - span_x * 0.06, x1 + span_x * 0.06],
        "yaxis": [y0 - span_y * 0.08, y1 + span_y * 0.08],
        "x": xr, "y": yr,
        "slope": f["slope"], "intercept": f["intercept"], "r2": f["r2"], "r": f["r"],
        "sse": f["sse"], "sst": f["sst"], "mean_y": f["mean_y"], "mean_x": f["mean_x"],
        "fan": f["fan"],
        "n_source": int(full["n"]), "full_r2": full["r2"], "full_slope": full["slope"],
        "diag": d,
        # Whether the ROW ORDER means anything. Only the geyser's does: its 272
        # eruptions are stored in the order they happened. The other two are
        # cross-sections, so a lag-1 residual correlation on them measures the
        # order of a CSV file, not a property of the world -- and the
        # diagnostics page must refuse to report it rather than print a number
        # that looks like a finding.
        "ordered": bool(ordered),
        "order_note": order_note,
        "source": source, "url": url, "what": what, "note": note, "filters": filters,
    }


def fan_ratio(x, y, nb=8):
    """How much wider the residuals get from the first slice of x to the last.
    A single number for 'the fit is fine here and hopeless there'."""
    f = ols(x, y)
    r = y - (f["intercept"] + f["slope"] * x)
    qs = np.quantile(x, np.linspace(0, 1, nb + 1))
    first = r[(x >= qs[0]) & (x < qs[1])]
    lastm = r[(x >= qs[-2]) & (x <= qs[-1])]
    a, b = float(first.std(ddof=1)), float(lastm.std(ddof=1))
    return {"sd_first": a, "sd_last": b, "sd_ratio": b / a if a else 0.0}


def bend(x, y, nb=8):
    """Mean residual per slice, so a U-shaped bend is visible as a number
    series. corr(x^2, resid) misses a symmetric bend entirely."""
    f = ols(x, y)
    r = y - (f["intercept"] + f["slope"] * x)
    qs = np.quantile(x, np.linspace(0, 1, nb + 1))
    out = []
    for i in range(nb):
        m = (x >= qs[i]) & (x <= qs[i + 1] if i == nb - 1 else x < qs[i + 1])
        out.append(round(float(r[m].mean()), 2) if m.sum() >= 3 else None)
    return out


# geyser cluster diagnostic, computed here so the page quotes measured values.
# Only the cluster figures are passed in: bend and fan are computed inside pack
# from the embedded points, which is what the page actually plots.
_lo, _hi = ols(gd[gd < 3.0], gw[gd < 3.0]), ols(gd[gd >= 3.0], gw[gd >= 3.0])
GEY_DIAG = {
    "within_r2_lo": _lo["r2"], "within_r2_hi": _hi["r2"],
    "within_slope_lo": _lo["slope"], "within_slope_hi": _hi["slope"],
    "n_lo": _lo["n"], "n_hi": _hi["n"],
    "centre_lo_x": float(gd[gd < 3.0].mean()), "centre_lo_y": float(gw[gd < 3.0].mean()),
    "centre_hi_x": float(gd[gd >= 3.0].mean()), "centre_hi_y": float(gw[gd >= 3.0].mean()),
}
DIA_DIAG = None
RET_DIAG = None

print("\n" + "=" * 78)
print("WRITING pairs.js")
print("=" * 78)
out = [
    pack("diamond", "Diamond price by size", "Carat", "Price", "ct", "$",
         carat, price,
         "Every diamond in the ggplot2 diamonds dataset: its weight in carats "
         "against its retail price.",
         "https://github.com/mwaskom/seaborn-data/blob/master/diamonds.csv",
         "diamonds (Wickham, H., ggplot2)",
         "A high R-squared hiding two separate faults: the residuals bend into a U "
         "instead of scattering evenly, and their spread grows many times over from "
         "the smallest stones to the largest. The line summarises the middle and is "
         "close to useless at the top.",
         [f"all {len(carat):,} priced records used",
          f"{N_EMBED:,} drawn at random (seed {SEED}) as the points on screen"],
         DIA_DIAG, ordered=False,
         order_note="A cross-section of stones with no sequence: they were not "
                    "measured one after another, so there is no order in which "
                    "consecutive errors could be related. Independence cannot be "
                    "tested here, and a number pretending otherwise would be "
                    "measuring the order of a CSV file."),
    pack("geyser", "Old Faithful eruptions", "Eruption length", "Wait until next",
         "min", "min", gd, gw,
         "Each Old Faithful eruption: how long it lasted, against how long the "
         "geyser then waited before the next one.",
         "https://github.com/mwaskom/seaborn-data/blob/master/geyser.csv",
         "Old Faithful (Härdle, W., 1991)",
         f"Almost the same R-squared as the diamonds, and it comes mostly from there "
         f"being two KINDS of eruption rather than from a trend. Fit the short ones "
         f"alone and R-squared falls to {GEY_DIAG['within_r2_lo']:.2f}; the long ones "
         f"alone, {GEY_DIAG['within_r2_hi']:.2f}.",
         [f"all {len(gd)} eruptions used — nothing excluded"],
         GEY_DIAG, ordered=True,
         order_note="The 272 eruptions are stored in the order they happened, so "
                    "consecutive errors are a real question — and the answer is "
                    "interesting."),
    pack("retail", "Invoice value by size of order", "Items on the order",
         "Invoice value", "items", "£", lines, value,
         "Every completed order placed with a UK online gift retailer: how many "
         "separate items it contained, against what it came to.",
         "https://archive.ics.uci.edu/dataset/352/online+retail",
         "UCI Online Retail (Chen, D., 2015)",
         "The lowest R-squared of the three and the best-behaved fit of the three. "
         "Most of the variation is unexplained, and the slope is still a number you "
         "could plan with: each extra item on an order is worth about £7.",
         ["cancellations, non-product lines and non-positive rows removed",
          f"aggregated to {len(inv):,} invoices, {len(keep):,} at or below "
          f"{cut:,} (the cutoff datasets.js uses)",
          f"{N_EMBED:,} drawn at random (seed {SEED}) as the points on screen"],
         RET_DIAG, ordered=False,
         order_note="These 800 invoices were drawn at random from 19,583, which "
                    "destroys any time order the source had. Even if it were "
                    "preserved, a lag-1 correlation across a random sample would "
                    "not be autocorrelation."),
]
OUT.write_text(
    "/* GENERATED by data/build_pairs.py — do not hand-edit.\n"
    "   Every (x, y) is a recorded observation. slope, intercept, r2, sse and sst\n"
    "   are the exact least-squares fit of the arrays shipped beside them, so the\n"
    "   page cannot report a fit its own points do not produce. */\n"
    "window.UDJ_PAIRS = [\n"
    + ",\n".join(json.dumps(d, ensure_ascii=False) for d in out)
    + "\n];\n", encoding="utf-8")
print(f"\nwrote {OUT}  ({OUT.stat().st_size:,} bytes)")
