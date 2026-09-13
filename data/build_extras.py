"""Build the data for the three new visuals.

  simpson.js    diamonds with their quality grades, plus the aggregate and
                within-size averages that make the reversal measurable.
  classify.js   diamonds as a real imbalanced classification: "is this stone
                over $10,000?", predicted from its size.

The overfitting page needs no new data -- it reuses pairs.js and generates its
noise predictors in the browser, which is the point: you watch R-squared rise
on columns that are provably meaningless.

Same rules as every other build here: everything written out is a recorded
observation, every summary figure is computed from the exact rows shipped
beside it, and each filter is recorded so the page can print it.
"""
from __future__ import annotations

import csv
import io
import json
import statistics
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
SEED = 20260913
N_EMBED = 900

rows = list(csv.DictReader(io.StringIO((CACHE / "diamonds.csv").read_text())))
carat = np.array([float(r["carat"]) for r in rows])
price = np.array([float(r["price"]) for r in rows])
GRADES = {
    "cut":     (np.array([r["cut"] for r in rows]),
                ["Fair", "Good", "Very Good", "Premium", "Ideal"], "Cut"),
    "color":   (np.array([r["color"] for r in rows]),
                ["J", "I", "H", "G", "F", "E", "D"], "Colour"),
    "clarity": (np.array([r["clarity"] for r in rows]),
                ["I1", "SI2", "SI1", "VS2", "VS1", "VVS2", "VVS1", "IF"], "Clarity"),
}
BANDS = [(0.2, 0.5), (0.5, 0.8), (0.8, 1.1), (1.1, 1.6), (1.6, 5.1)]

# ------------------------------------------------------------------ simpson
rng = np.random.default_rng(SEED)
idx = np.sort(rng.choice(len(rows), N_EMBED, replace=False))

simpson = {
    "n_source": len(rows),
    "n_embed": int(N_EMBED),
    "source": "diamonds (Wickham, H., ggplot2)",
    "url": "https://github.com/mwaskom/seaborn-data/blob/master/diamonds.csv",
    "what": ("53,940 real diamonds, each with its size in carats, its retail price, "
             "and three independent quality grades assigned by a grader."),
    "filters": [f"all {len(rows):,} priced records used to compute every average below",
                f"{N_EMBED:,} drawn at random (seed {SEED}) as the points on screen"],
    "bands": [{"lo": lo, "hi": hi} for lo, hi in BANDS],
    "carat": [round(float(v), 3) for v in carat[idx]],
    "price": [round(float(v), 2) for v in price[idx]],
    "gradings": {},
}

print("=" * 92)
print("SIMPSON — every average below is computed from the full 53,940 records")
print("=" * 92)
for key, (vals, order, label) in GRADES.items():
    order = [g for g in order if (vals == g).any()]
    groups = []
    for g in order:
        m = vals == g
        groups.append({
            "name": g, "n": int(m.sum()),
            "mean_price": float(price[m].mean()),
            "mean_carat": float(carat[m].mean()),
        })
    # per band, per grade
    band_rows = []
    for lo, hi in BANDS:
        b = (carat >= lo) & (carat < hi)
        per = []
        for g in order:
            m = b & (vals == g)
            per.append({"name": g, "n": int(m.sum()),
                        "mean_price": float(price[m].mean()) if m.sum() else None})
        band_rows.append(per)

    # how many bands put the best grade above the worst -- the honest statement
    ok = 0
    tested = 0
    for per in band_rows:
        a, b2 = per[0]["mean_price"], per[-1]["mean_price"]
        na, nb = per[0]["n"], per[-1]["n"]
        if a is None or b2 is None or na < 30 or nb < 30:
            continue
        tested += 1
        if b2 > a:
            ok += 1

    agg_reversed = groups[-1]["mean_price"] < groups[0]["mean_price"]
    simpson["gradings"][key] = {
        "key": key, "label": label, "order": order, "groups": groups,
        "bands": band_rows, "agg_reversed": bool(agg_reversed),
        "bands_correct": ok, "bands_tested": tested,
        "grade": [int(order.index(v)) for v in vals[idx]],
        "worst": order[0], "best": order[-1],
    }
    print(f"\n  {label:8} worst {order[0]:>9} ${groups[0]['mean_price']:>8,.0f} "
          f"({groups[0]['mean_carat']:.3f} ct)   "
          f"best {order[-1]:>9} ${groups[-1]['mean_price']:>8,.0f} "
          f"({groups[-1]['mean_carat']:.3f} ct)")
    print(f"           aggregate reversed: {agg_reversed}   "
          f"within-size bands where the better grade costs more: {ok}/{tested}")

# ------------------------------------------------------------------ classify
print("\n" + "=" * 92)
print("CLASSIFY — 'is this stone over $10,000?', predicted from its size")
print("=" * 92)
THRESH = 10000.0
label = price > THRESH
base = float(label.mean())
# the honest sweep: for every candidate carat cut-off, the full confusion matrix
cuts = [round(v, 2) for v in np.arange(0.30, 3.01, 0.02)]
sweep = []
for c in cuts:
    pred = carat >= c
    tp = int((pred & label).sum()); fp = int((pred & ~label).sum())
    fn = int((~pred & label).sum()); tn = int((~pred & ~label).sum())
    n = tp + fp + fn + tn
    acc = (tp + tn) / n
    prec = tp / (tp + fp) if tp + fp else None
    rec = tp / (tp + fn) if tp + fn else None
    f1 = (2 * prec * rec / (prec + rec)) if prec and rec else None
    sweep.append({"cut": c, "tp": tp, "fp": fp, "fn": fn, "tn": tn,
                  "acc": acc, "prec": prec, "rec": rec, "f1": f1})
best_acc = max(sweep, key=lambda s: s["acc"])
best_f1 = max(sweep, key=lambda s: s["f1"] or -1)
print(f"  base rate (actual positives): {base:.2%}")
print(f"  'always say no'  accuracy {1 - base:.2%}, recall 0%")
print(f"  best ACCURACY    cut {best_acc['cut']:.2f} ct → acc {best_acc['acc']:.2%}, "
       f"recall {best_acc['rec']:.1%}, precision {best_acc['prec']:.1%}")
print(f"  best F1          cut {best_f1['cut']:.2f} ct → acc {best_f1['acc']:.2%}, "
       f"recall {best_f1['rec']:.1%}, precision {best_f1['prec']:.1%}")

classify = {
    "n_source": len(rows), "n_embed": int(N_EMBED),
    "source": simpson["source"], "url": simpson["url"],
    "question": "Is this diamond worth more than $10,000?",
    "what": ("Every diamond in the ggplot2 set, labelled by whether its price is "
             "above $10,000, predicted from the one thing you can measure without "
             "a grader: its size."),
    "filters": [f"all {len(rows):,} records used for every rate below",
                f"{N_EMBED:,} drawn at random (seed {SEED}) as the points on screen"],
    "threshold": THRESH, "base_rate": base,
    "trivial_accuracy": 1 - base,
    "cuts": cuts, "sweep": sweep,
    "best_acc_cut": best_acc["cut"], "best_acc": best_acc["acc"],
    "best_acc_recall": best_acc["rec"],
    "best_f1_cut": best_f1["cut"], "best_f1": best_f1["f1"],
    "best_f1_acc": best_f1["acc"], "best_f1_recall": best_f1["rec"],
    "carat": simpson["carat"], "price": simpson["price"],
    "label": [bool(v) for v in label[idx]],
    "carat_max": float(carat.max()),
}

for name, obj, var in (("simpson.js", simpson, "UDJ_SIMPSON"),
                       ("classify.js", classify, "UDJ_CLASSIFY")):
    out = HERE.parent / name
    out.write_text(
        f"/* GENERATED by data/build_extras.py — do not hand-edit.\n"
        f"   Every value is a recorded observation from the cited source, and every\n"
        f"   summary figure is computed from the rows shipped beside it. */\n"
        f"window.{var} = " + json.dumps(obj, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"\nwrote {out}  ({out.stat().st_size:,} bytes)")
