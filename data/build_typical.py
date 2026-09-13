"""GENERATOR for typical.js — the data behind the "average is not typical" page.

Run:  python3 build_typical.py

Everything the page displays comes from here, and every number is derived from
the raw cached source, never typed in. Histogram counts are exact integers.
The mean, median and below-mean tallies are computed on the FULL population,
not on the histogram, so binning choices cannot move them.

Display axes are CAPPED for the skewed sets, because a single £168,000 invoice
would squash all 19,772 others into the first pixel. The number of observations
beyond the cap is carried in the data and stated on the page -- a cap the reader
is not told about is a lie, and the tail is the whole point here.
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

from measure_typical import (below_mean, histogram, load_csv_col, load_retail,
                             peaks, within)

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "typical.js"

SPECS = [
    dict(
        id="retail", label="Order value", unit="£", unit_after="",
        what="Every completed order placed with a UK online gift retailer "
             "between 1 Dec 2010 and 9 Dec 2011, with line items summed to one "
             "total per invoice.",
        plain="what one customer spent in one order",
        source="UCI Online Retail (Chen, D., 2015)",
        url="https://archive.ics.uci.edu/dataset/352/online+retail",
        filters=["541,909 line items in the source file",
                 "credit notes and cancellations removed (invoice no. begins 'C')",
                 "non-product lines removed (postage, samples, bank charges)",
                 "returns and zero-priced rows removed",
                 "19,773 invoices remain"],
        cap_pct=99.0, bins=40, gap=6,
    ),
    dict(
        id="diamond", label="Diamond price", unit="$", unit_after="",
        what="Every stone in the standard diamonds reference table, priced in "
             "US dollars.",
        plain="what one diamond costs",
        source="Diamonds (ggplot2 / seaborn reference dataset, 53,940 stones)",
        url="https://github.com/mwaskom/seaborn-data/blob/master/diamonds.csv",
        filters=["all 53,940 stones, no exclusions"],
        cap_pct=99.0, bins=40, gap=6,
    ),
    dict(
        id="geyser", label="Wait between eruptions", unit="", unit_after=" min",
        what="The wait before each eruption of the Old Faithful geyser, in "
             "minutes, over a continuous run of observations.",
        plain="how long you wait for the next eruption",
        source="Old Faithful eruptions (Azzalini & Bowman, 1990; 272 waits)",
        url="https://github.com/mwaskom/seaborn-data/blob/master/geyser.csv",
        filters=["all 272 recorded waits, no exclusions"],
        cap_pct=100.0, bins=24, gap=7,
    ),
]


def pack(spec: dict, vals: list[float]) -> dict:
    n = len(vals)
    mu = statistics.fmean(vals)
    med = statistics.median(vals)
    nb = below_mean(vals, mu)

    # Display cap. Everything beyond it is counted, not silently dropped.
    if spec["cap_pct"] >= 100:
        cap = vals[-1]
        beyond = 0
    else:
        k = min(n - 1, int(round(spec["cap_pct"] / 100 * (n - 1))))
        cap = vals[k]
        beyond = sum(1 for v in vals if v > cap)
    shown = [v for v in vals if v <= cap]

    counts, lo, w = histogram(shown, spec["bins"])
    pk = peaks(counts, min_gap=spec["gap"])
    modes = sorted(lo + (i + 0.5) * w for i in pk[:2])

    out = dict(
        id=spec["id"], label=spec["label"], unit=spec["unit"],
        unitAfter=spec["unit_after"], plain=spec["plain"], what=spec["what"],
        source=spec["source"], url=spec["url"], filters=spec["filters"],
        n=n,
        mu=round(mu, 4), median=round(med, 4),
        below=nb, above=n - nb,
        pctBelow=round(100.0 * nb / n, 1),
        ratio=round(mu / med, 3),
        # histogram of the displayed range
        binLo=round(lo, 4), binW=round(w, 6), counts=counts,
        cap=round(cap, 4), beyond=beyond,
        min=round(vals[0], 4), max=round(vals[-1], 4),
    )

    # Is the average itself a common value? Only meaningful for a genuinely
    # TWO-CLUSTER quantity, and "a second local maximum exists" is nowhere near
    # sufficient: on the first run this flagged retail as bimodal on a tail bump
    # holding 39 observations against the main mode's 7,335. Three conditions,
    # all measured, all required:
    #   1. two separated modes exist,
    #   2. the smaller carries real mass -- at least 40% of the larger's,
    #   3. the valley between them dips well below the smaller mode,
    # plus the mean must actually fall between them for the framing to apply.
    # How common is the average itself? Meaningful for EVERY shape, so always
    # emitted: the count within one bin either side of the mean, against the
    # same window placed on the single busiest bin.
    half = w
    busiest = counts.index(max(counts))
    out.update(window=round(half, 3),
               nearMean=within(vals, mu, half),
               busiest=round(lo + (busiest + 0.5) * w, 3),
               nearBusiest=within(vals, lo + (busiest + 0.5) * w, half))

    out["bimodal"] = False
    if len(modes) >= 2:
        near = [within(vals, m, half) for m in modes]
        i1, i2 = sorted(pk[:2])
        valley = min(counts[i1:i2 + 1])
        mass_ratio = min(near) / max(near)
        dip_ratio = valley / min(counts[i1], counts[i2])
        between = modes[0] < mu < modes[1]
        genuine = mass_ratio >= 0.40 and dip_ratio <= 0.70 and between
        out["modeTest"] = dict(massRatio=round(mass_ratio, 3),
                               dipRatio=round(dip_ratio, 3),
                               meanBetween=between, genuine=genuine)
        if genuine:
            out.update(bimodal=True, modes=[round(m, 2) for m in modes],
                       nearMode=near)
    return out


def main() -> None:
    print("loading the real sources...")
    raw = {
        "retail": load_retail(),
        "diamond": load_csv_col("diamonds.csv", "price"),
        "geyser": load_csv_col("geyser.csv", "waiting"),
    }
    packed = []
    for spec in SPECS:
        d = pack(spec, raw[spec["id"]])
        packed.append(d)
        t = d.get("modeTest")
        if d["bimodal"]:
            tail = (f"    TWO CLUSTERS at {d['modes']} — {d['nearMean']} near the "
                    f"mean vs {d['nearMode']} near the clusters")
        elif t:
            tail = (f"    single-peaked (mass ratio {t['massRatio']}, dip "
                    f"{t['dipRatio']}, mean between: {t['meanBetween']})")
        else:
            tail = "    single-peaked (no second mode)" 
        print(f"  {d['id']:<8} n={d['n']:>6,}  mean {d['mu']:>10.2f}  "
              f"median {d['median']:>9.2f}  {d['pctBelow']:>4.1f}% below  "
              f"cap {d['cap']:.2f} ({d['beyond']} beyond)")
        print(tail)
        # the counts must account for exactly the displayed observations
        assert sum(d["counts"]) == d["n"] - d["beyond"], (
            f"{d['id']}: histogram holds {sum(d['counts'])} but "
            f"{d['n'] - d['beyond']} are inside the cap")

    body = ",\n".join(json.dumps(d, ensure_ascii=False) for d in packed)
    OUT.write_text(
        "/* GENERATED by data/build_typical.py — do not hand-edit.\n"
        "   Histogram counts are exact integers. mu / median / below are\n"
        "   computed on the FULL population, not on the histogram, so the\n"
        "   choice of bins cannot move them. `beyond` counts observations past\n"
        "   the display cap; the page states that number rather than hiding it.\n"
        "   Re-run the script to rebuild. */\n"
        "window.UDJ_TYPICAL = [\n" + body + "\n];\n",
        encoding="utf-8")
    print(f"\nwrote {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
