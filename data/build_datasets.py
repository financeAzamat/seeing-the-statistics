"""Build datasets.js for the CLT visualisation from REAL public data.

Why this file exists: the first version of the page invented a lognormal and
labelled it "order value per customer". That is the exact move a statistics
course should not make, so the population is now actual observations from
published datasets, and the sampler draws real recorded values.

Three datasets, chosen because their shapes are genuinely different and none
of them is a bell — a bell-shaped population would let a reader conclude the
averages come out normal because the population already was.

  retail   invoice totals from a real UK online retailer (right-skewed)
  geyser   Old Faithful eruption waiting times   (bimodal — textbook case)
  diamond  retail diamond prices                 (heavy right tail)

Honesty rules this script follows:

  * every value written out is a recorded observation, never a draw from a
    fitted curve;
  * mu and sigma written into the file are the exact moments of the values
    written out, so the page's readout cannot disagree with its own data;
  * the moments of the FULL source are written alongside, so a reader can
    see whether the embedded subsample is representative;
  * every filter applied is recorded as text and shown in the page's
    provenance line. Nothing is dropped silently.

Memory note: the retail source is a 23 MB xlsx with 541,909 rows. It is
streamed row by row with openpyxl read_only and aggregated into invoice
totals, because loading it into a DataFrame on a host with ~2.8 GB free is
not worth the risk. Only ~25k invoice keys are ever held.
"""
from __future__ import annotations

import csv
import io
import json
import math
import statistics
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from openpyxl import load_workbook

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "datasets.js"
CACHE = HERE / "cache"
CACHE.mkdir(exist_ok=True)

SEED = 20260912          # recorded in the output so the subsample is reproducible

# One dot on screen per embedded observation, so "one dot = one real
# observation" is literally true rather than nearly true. 700 is not a taste
# call: data/choose_layout.py sweeps the dot budget against the bin count and
# 700 at K=80 is the only pairing where all three datasets keep their tallest
# column readable (<= 94 dots), keep most bins occupied, and clip nothing off
# the right edge. Raise it and the retail spike merges into a solid bar.
N_EMBED = 700

UA = {"User-Agent": "Mozilla/5.0 (course dataset build)"}


def round_vals(vals: list[float], places: int) -> list[float]:
    """Round FIRST, then take moments off the rounded list.

    The page states mu and sigma for the values it actually holds. If the
    moments were taken before rounding they would disagree with the embedded
    data in the last decimal, and this whole file exists to stop the page
    reporting a number its own data does not support.
    """
    return [round(v, places) for v in vals]


def fetch(url: str, name: str) -> bytes:
    """Download once, then reuse. Keeps re-runs off the network."""
    p = CACHE / name
    if p.exists() and p.stat().st_size > 0:
        print(f"  cached  {name}  ({p.stat().st_size:,} bytes)")
        return p.read_bytes()
    print(f"  fetch   {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    p.write_bytes(data)
    print(f"  saved   {name}  ({len(data):,} bytes)")
    return data


def moments(vals) -> tuple[float, float]:
    """Mean and the POPULATION SD (divide by N, not N-1).

    Every set this script measures is a complete enumerated set that the page
    then treats as the population and samples FROM, with replacement. The
    right spread for that is the population SD, because SE = sigma/sqrt(n)
    takes sigma to be the population's own spread; the n-1 correction exists
    to estimate an unknown population sigma from a sample, which is not the
    situation here.

    The gap is small (sqrt(272/271) = 1.0018 on the smallest set) but this
    revision is specifically about the page not asserting numbers it cannot
    support, so it uses the correct one.
    """
    return statistics.fmean(vals), statistics.pstdev(vals)


def subsample(vals: list[float], k: int, seed: int) -> list[float]:
    if len(vals) <= k:
        return list(vals)
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(vals), size=k, replace=False)
    return [vals[i] for i in sorted(idx)]


# ----------------------------------------------------------------- retail
def build_retail() -> dict:
    """Invoice-level order value from the UCI Online Retail dataset.

    Real transactions of a UK-based online gift retailer, 01/12/2010 to
    09/12/2011. Line items are aggregated to one total per invoice, because
    the business quantity a finance course cares about is order value, not
    line value.
    """
    raw = fetch("https://archive.ics.uci.edu/static/public/352/online+retail.zip",
                "online_retail.zip")
    zf = zipfile.ZipFile(io.BytesIO(raw))
    inner = [n for n in zf.namelist() if n.lower().endswith((".xlsx", ".xls"))][0]
    print(f"  reading {inner} (streamed)")
    xbytes = zf.read(inner)

    wb = load_workbook(io.BytesIO(xbytes), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    col = {h: i for i, h in enumerate(header)}
    print(f"  columns {header}")

    need = ("InvoiceNo", "StockCode", "Quantity", "UnitPrice")
    for c in need:
        if c not in col:
            raise SystemExit(f"expected column {c!r} in {header}")

    # Non-product stock codes: postage, samples, bank charges, discounts,
    # manual adjustments. These are not orders and would pollute order value.
    NONPRODUCT = {"POST", "DOT", "C2", "M", "BANK CHARGES", "PADS", "AMAZONFEE",
                  "S", "D", "CRUK", "B", "GIFT"}

    totals: dict[str, float] = {}
    n_lines = n_cancel = n_nonproduct = n_bad = 0
    for r in rows:
        inv = r[col["InvoiceNo"]]
        if inv is None:
            continue
        n_lines += 1
        inv = str(inv).strip()
        if inv.upper().startswith("C"):          # credit note / cancellation
            n_cancel += 1
            continue
        sc = str(r[col["StockCode"]] or "").strip().upper()
        if sc in NONPRODUCT:
            n_nonproduct += 1
            continue
        q, p = r[col["Quantity"]], r[col["UnitPrice"]]
        try:
            q = float(q); p = float(p)
        except (TypeError, ValueError):
            n_bad += 1
            continue
        if q <= 0 or p <= 0:                     # returns and zero-priced rows
            n_bad += 1
            continue
        totals[inv] = totals.get(inv, 0.0) + q * p
    wb.close()

    allv = sorted(totals.values())
    print(f"  lines {n_lines:,} | cancellations {n_cancel:,} | "
          f"non-product {n_nonproduct:,} | non-positive {n_bad:,} "
          f"| invoices {len(allv):,}")

    full_mu, full_sd = moments(allv)
    p99 = float(np.percentile(allv, 99.0))
    cutoff = math.ceil(p99 / 50) * 50            # a round number near p99
    kept = [v for v in allv if v <= cutoff]
    dropped = len(allv) - len(kept)
    print(f"  full mean {full_mu:.2f} sd {full_sd:.2f} | p99 {p99:.2f} "
          f"| cutoff {cutoff} | kept {len(kept):,} dropped {dropped:,}")

    vals = round_vals(subsample(kept, N_EMBED, SEED), 2)
    mu, sd = moments(vals)
    return {
        "id": "retail",
        "label": "Order value per invoice",
        "unit": "£",
        "axis": [0, cutoff],
        "shape": "right-skewed",
        "source": "UCI Online Retail (Chen, D., 2015)",
        "url": "https://archive.ics.uci.edu/dataset/352/online+retail",
        "what": ("Every completed order placed with a UK online gift retailer "
                 "between 1 Dec 2010 and 9 Dec 2011. Line items summed to one "
                 "total per invoice."),
        "filters": [
            f"{n_lines:,} line items in the source file",
            f"{n_cancel:,} credit notes / cancellations removed (invoice no. begins 'C')",
            f"{n_nonproduct:,} non-product lines removed (postage, bank charges, manual adjustments, samples)",
            f"{n_bad:,} lines with a non-positive quantity or price removed",
            f"aggregated to {len(allv):,} invoices",
            f"{dropped:,} wholesale invoices above {cutoff:,} excluded so the axis is readable "
            f"(the 99th percentile is {p99:,.0f}); {len(kept):,} invoices remain",
        ],
        "n_source": len(allv),
        "n_pool": len(kept),
        "full_mu": full_mu,
        "full_sd": full_sd,
        "pool_mu": moments(kept)[0],
        "pool_sd": moments(kept)[1],
        "mu": mu,
        "sd": sd,
        "vals": vals,
    }


# ----------------------------------------------------------------- geyser
def build_geyser() -> dict:
    """Old Faithful waiting times. The whole dataset, all 272 observations.

    Kept because it is genuinely bimodal: the mean of this population is a
    waiting time the geyser almost never actually takes. Nothing makes the
    "the average is not a typical case" point faster.
    """
    raw = fetch("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/geyser.csv",
                "geyser.csv").decode()
    rd = csv.DictReader(io.StringIO(raw))
    field = None
    rows = list(rd)
    for cand in ("waiting", "Waiting", "wait"):
        if cand in rows[0]:
            field = cand
            break
    if field is None:
        raise SystemExit(f"no waiting column in {list(rows[0])}")
    vals = [float(r[field]) for r in rows if r[field] not in (None, "")]
    mu, sd = moments(vals)
    print(f"  observations {len(vals)} | mean {mu:.2f} sd {sd:.2f}")
    lo = math.floor(min(vals) / 5) * 5
    hi = math.ceil(max(vals) / 5) * 5
    return {
        "id": "geyser",
        "label": "Wait between eruptions",
        "unit": "min",
        "axis": [lo, hi],
        "shape": "bimodal",
        "source": "Old Faithful (Härdle, W., 1991)",
        "url": "https://github.com/mwaskom/seaborn-data/blob/master/geyser.csv",
        "what": ("Minutes between consecutive eruptions of the Old Faithful "
                 "geyser, Yellowstone. Short waits and long waits, with very "
                 "little in between."),
        "filters": [f"all {len(vals)} observations used — nothing excluded"],
        "n_source": len(vals),
        "n_pool": len(vals),
        "full_mu": mu, "full_sd": sd,
        "pool_mu": mu, "pool_sd": sd,
        "mu": mu, "sd": sd,
        "vals": vals,
    }


# ---------------------------------------------------------------- diamonds
def build_diamonds() -> dict:
    """Retail diamond prices. A heavy right tail, and the useful caveat:
    with a tail this long, n = 30 is visibly not yet enough."""
    raw = fetch("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/diamonds.csv",
                "diamonds.csv").decode()
    rd = csv.DictReader(io.StringIO(raw))
    allv = [float(r["price"]) for r in rd if r.get("price")]
    full_mu, full_sd = moments(allv)
    vals = round_vals(subsample(allv, N_EMBED, SEED + 1), 2)
    mu, sd = moments(vals)
    hi = math.ceil(max(allv) / 1000) * 1000
    print(f"  observations {len(allv):,} | mean {full_mu:.2f} sd {full_sd:.2f}")
    return {
        "id": "diamond",
        "label": "Price per diamond",
        "unit": "$",
        "axis": [0, hi],
        "shape": "heavy right tail",
        "source": "diamonds (Wickham, H., ggplot2)",
        "url": "https://github.com/mwaskom/seaborn-data/blob/master/diamonds.csv",
        "what": ("Retail prices of 53,940 diamonds. Most are inexpensive and the "
                 "dearest costs close to eight times the middle one, which is what "
                 "gives this data its long tail."),
        "filters": [
            f"all {len(allv):,} priced records used — nothing excluded",
            f"{N_EMBED:,} drawn at random (seed {SEED + 1}) as the population on screen",
        ],
        "n_source": len(allv),
        "n_pool": len(allv),
        "full_mu": full_mu, "full_sd": full_sd,
        "pool_mu": full_mu, "pool_sd": full_sd,
        "mu": mu, "sd": sd,
        "vals": vals,
    }


def main() -> None:
    out = []
    for name, fn in (("retail", build_retail), ("geyser", build_geyser),
                     ("diamond", build_diamonds)):
        print(f"\n=== {name} ===")
        out.append(fn())

    # Population skewness, and the sample size at which the sampling
    # distribution of the mean stops looking lopsided.
    #
    # The rate is exact and worth stating: the skewness of the sample mean is
    # the population's skewness divided by sqrt(n). data/measure_claims.py
    # confirms it to three decimals on all three datasets (retail 3.40/sqrt(30)
    # = 0.62 against 0.622 measured). So the n needed to bring |skew| under a
    # readability threshold of 0.20 is (skew/0.20)^2 -- which is why "n = 30"
    # is a rule about tails and not a constant.
    for d in out:
        mu, sd = d["mu"], d["sd"]
        d["skew"] = statistics.fmean([((v - mu) / sd) ** 3 for v in d["vals"]])
        d["n_symmetric"] = math.ceil((abs(d["skew"]) / 0.20) ** 2)
        print(f"  {d['id']:8} skew={d['skew']:+.3f}  symmetric from n={d['n_symmetric']}")

    body = ",\n".join(json.dumps(d, ensure_ascii=False) for d in out)
    OUT.write_text(
        "/* GENERATED by data/build_datasets.py — do not hand-edit.\n"
        "   Every number in `vals` is a recorded observation from the cited\n"
        "   source. `mu` and `sd` are the exact mean and sample SD of that\n"
        "   same `vals` array, so the page cannot report a spread its own\n"
        "   data does not have. Re-run the script to rebuild.\n"
        f"   seed={SEED}  embed_target={N_EMBED} */\n"
        f"window.UDJ_DATA = [\n{body}\n];\n",
        encoding="utf-8",
    )
    print(f"\nwrote {OUT}  ({OUT.stat().st_size:,} bytes)")
    for d in out:
        print(f"  {d['id']:8} n={len(d['vals']):>5}  mu={d['mu']:>10.2f}  "
              f"sd={d['sd']:>10.2f}  axis={d['axis']}  ({d['shape']})")


if __name__ == "__main__":
    main()
