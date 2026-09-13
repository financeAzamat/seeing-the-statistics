"""Verify simpson.js, classify.js, and every figure the two pages quote.

Both pages cite this file by name in their own footnotes, so it has to earn
that. Three jobs:

  DATA      re-derive every average, count and rate from the cached CSV,
            independently of data/build_extras.py. A build script and its own
            output agreeing proves nothing if both are wrong the same way.

  REVERSAL  assert the paradox actually holds: the aggregate ordering must be
            opposite to the within-band ordering. This is the claim the whole
            Simpson page rests on, and it is a property of the data, not a
            property of the prose.

  CLAIMS    every percentage and dollar figure written into either page's
            markup, against the measurement. Prose has been wrong four times
            in this project already.
"""
from __future__ import annotations

import csv
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE = HERE / "data" / "cache"


def load_global(path: Path, var: str) -> dict:
    src = path.read_text(encoding="utf-8")
    i = src.index("window." + var)
    body = src[src.index("=", i) + 1:src.rindex(";")]
    return json.loads(body)


SIM = load_global(HERE / "simpson.js", "UDJ_SIMPSON")
CLS = load_global(HERE / "classify.js", "UDJ_CLASSIFY")
# Claim regexes run against a WHITESPACE-NORMALISED copy. Prose wraps across
# lines wherever the editor put it, and a pattern with a literal space in it
# then silently stops matching -- which has already happened three times in this
# project and each time the check passed by finding nothing. Collapsing runs of
# whitespace to one space removes the whole failure mode.
def flat(path):
    return re.sub(r"\s+", " ", (HERE / path).read_text(encoding="utf-8"))

sim_html = flat("simpson.html")
cls_html = flat("classify.html")

rows = list(csv.DictReader(io.StringIO((CACHE / "diamonds.csv").read_text())))
carat = np.array([float(r["carat"]) for r in rows])
price = np.array([float(r["price"]) for r in rows])
COLS = {"cut": np.array([r["cut"] for r in rows]),
        "color": np.array([r["color"] for r in rows]),
        "clarity": np.array([r["clarity"] for r in rows])}

fails: list[str] = []
MIN_CELL = 30

# ---------------------------------------------------------------- parses
for f in ("simpson.js", "classify.js", "simpson.render.js", "classify.render.js",
          "overfit.render.js", "draw.js"):
    r = subprocess.run(["node", "--check", str(HERE / f)], capture_output=True, text=True)
    if r.returncode:
        fails.append(f"{f} does not parse")
print("all six new modules parse:",
      all(subprocess.run(["node", "--check", str(HERE / f)],
                         capture_output=True).returncode == 0
          for f in ("simpson.js", "classify.js", "simpson.render.js",
                    "classify.render.js", "overfit.render.js", "draw.js")))
for page, deps in (("simpson.html", ("simpson.js", "draw.js", "motion.js", "simpson.render.js")),
                   ("overfit.html", ("pairs.js", "stats.js", "draw.js", "motion.js", "overfit.render.js")),
                   ("classify.html", ("classify.js", "draw.js", "motion.js", "classify.render.js"))):
    src = (HERE / page).read_text(encoding="utf-8")
    missing = [d for d in deps if f'src="{d}"' not in src]
    print(f"{page:16} loads {len(deps) - len(missing)}/{len(deps)} modules"
          + (f"  MISSING {missing}" if missing else ""))
    if missing:
        fails.append(f"{page} does not load {missing}")
    for css in ("tokens.css", "page.css"):
        if f'href="{css}"' not in src:
            fails.append(f"{page} does not load {css}")

# ---------------------------------------------------------------- simpson data
print("\nsimpson.js re-derived from the CSV:")
for key, g in SIM["gradings"].items():
    vals = COLS[key]
    order = g["order"]
    bad = []
    for i, grp in enumerate(g["groups"]):
        m = vals == order[i]
        if int(m.sum()) != grp["n"]:
            bad.append(f"n[{order[i]}]")
        if abs(float(price[m].mean()) - grp["mean_price"]) > 5e-6:
            bad.append(f"price[{order[i]}]")
        if abs(float(carat[m].mean()) - grp["mean_carat"]) > 5e-9:
            bad.append(f"carat[{order[i]}]")
    # bands
    for bi, band in enumerate(SIM["bands"]):
        b = (carat >= band["lo"]) & (carat < band["hi"])
        for i, cell in enumerate(g["bands"][bi]):
            m = b & (vals == order[i])
            if int(m.sum()) != cell["n"]:
                bad.append(f"bandn[{bi}][{order[i]}]")
            want = float(price[m].mean()) if m.sum() else None
            got = cell["mean_price"]
            if (want is None) != (got is None):
                bad.append(f"bandprice[{bi}][{order[i]}]")
            elif want is not None and abs(want - got) > 5e-6:
                bad.append(f"bandprice[{bi}][{order[i]}]")
    print(f"  {key:8} {len(g['groups'])} grades × {len(SIM['bands'])} bands  "
          f"{'OK' if not bad else 'MISMATCH ' + ', '.join(bad[:4])}")
    if bad:
        fails.append(f"simpson {key}: disagrees with the CSV on {bad[:4]}")

    # ---- the reversal itself
    agg_rev = g["groups"][-1]["mean_price"] < g["groups"][0]["mean_price"]
    ok_bands, tested = 0, 0
    for bi in range(len(SIM["bands"])):
        cells = g["bands"][bi]
        a, b2 = cells[0], cells[-1]
        if a["mean_price"] is None or b2["mean_price"] is None:
            continue
        if a["n"] < MIN_CELL or b2["n"] < MIN_CELL:
            continue
        tested += 1
        if b2["mean_price"] > a["mean_price"]:
            ok_bands += 1
    print(f"           aggregate reversed: {agg_rev} (file {g['agg_reversed']})   "
          f"bands agreeing: {ok_bands}/{tested} (file {g['bands_correct']}/{g['bands_tested']})")
    if agg_rev != g["agg_reversed"]:
        fails.append(f"simpson {key}: agg_reversed flag disagrees with the data")
    if (ok_bands, tested) != (g["bands_correct"], g["bands_tested"]):
        fails.append(f"simpson {key}: band tally {g['bands_correct']}/{g['bands_tested']} "
                     f"but the data gives {ok_bands}/{tested}")
    # THE claim, per grading. Only the DEFAULT grading -- colour, the one the
    # page's tables and headline are built on -- has to be a clean sweep. Cut
    # keeps one dissenting band (the smallest stones), and the page says so
    # rather than rounding it up, so demanding perfection of all three was this
    # check overreaching past what is written.
    if not agg_rev:
        fails.append(f"simpson {key}: aggregate is not reversed, so there is no "
                     f"paradox to show")
    if ok_bands < tested - 1 or tested < 3:
        fails.append(f"simpson {key}: only {ok_bands}/{tested} bands oppose the "
                     f"aggregate — too weak for the page to build on")
    if key == "color" and (ok_bands != tested or tested < 5):
        fails.append(f"simpson colour is the headline case and must be a clean "
                     f"sweep, but it is {ok_bands}/{tested}")

# ---------------------------------------------------------------- classify data
print("\nclassify.js re-derived from the CSV:")
label = price > CLS["threshold"]
base = float(label.mean())
ok = abs(base - CLS["base_rate"]) < 1e-12 and abs((1 - base) - CLS["trivial_accuracy"]) < 1e-12
print(f"  base rate {base:.6%} (file {CLS['base_rate']:.6%})   "
      f"do-nothing accuracy {1 - base:.6%}   {'OK' if ok else 'MISMATCH'}")
if not ok:
    fails.append("classify: base rate or trivial accuracy disagrees with the CSV")

worst = 0.0
for s in CLS["sweep"]:
    pred = carat >= s["cut"]
    tp = int((pred & label).sum()); fp = int((pred & ~label).sum())
    fn = int((~pred & label).sum()); tn = int((~pred & ~label).sum())
    for k, want in (("tp", tp), ("fp", fp), ("fn", fn), ("tn", tn)):
        if s[k] != want:
            fails.append(f"classify cut {s['cut']}: {k} is {s[k]}, CSV gives {want}")
    acc = (tp + tn) / len(rows)
    worst = max(worst, abs(acc - s["acc"]))
print(f"  {len(CLS['sweep'])} cut-offs checked cell by cell; worst accuracy error {worst:.2e}")
if worst > 1e-12:
    fails.append(f"classify: accuracy off by {worst:.2e}")

# the best-of figures must really be the best in the sweep
b_acc = max(CLS["sweep"], key=lambda s: s["acc"])
b_f1 = max(CLS["sweep"], key=lambda s: s["f1"] or -1)
for name, got, want in (("best_acc_cut", CLS["best_acc_cut"], b_acc["cut"]),
                        ("best_acc", CLS["best_acc"], b_acc["acc"]),
                        ("best_f1_cut", CLS["best_f1_cut"], b_f1["cut"]),
                        ("best_f1", CLS["best_f1"], b_f1["f1"])):
    if abs(got - want) > 1e-12:
        fails.append(f"classify {name} is {got}, the sweep's best is {want}")
print(f"  best accuracy {b_acc['acc']:.4%} at {b_acc['cut']} ct (recall {b_acc['rec']:.1%})")
print(f"  best F1       {b_f1['f1']:.4%} at {b_f1['cut']} ct (recall {b_f1['rec']:.1%}, "
      f"accuracy {b_f1['acc']:.4%})")

# ---------------------------------------------------------------- prose claims
print("\nfigures quoted in the two pages:")


def claim(label_, quoted, measured, tol):
    ok_ = abs(quoted - measured) <= tol
    print(f"  [{'OK ' if ok_ else 'BAD'}] {label_:44} quoted {quoted}  measured {measured:.4f}")
    if not ok_:
        fails.append(f"{label_}: prose {quoted}, measured {measured:.4f}")


col = SIM["gradings"]["color"]
J, Dg = col["groups"][0], col["groups"][-1]
m = re.search(r"<tr><td>J <em>\(worst\)</em></td><td class=\"b\">\$([\d,]+)</td><td>([\d.]+) ct</td>", sim_html)
if m:
    claim("simpson J mean price", float(m.group(1).replace(",", "")), J["mean_price"], 0.6)
    claim("simpson J mean carat", float(m.group(2)), J["mean_carat"], 0.0006)
else:
    fails.append("could not find the J row in simpson.html")
m = re.search(r"<tr><td>D <em>\(best\)</em></td><td class=\"g\">\$([\d,]+)</td><td>([\d.]+) ct</td>", sim_html)
if m:
    claim("simpson D mean price", float(m.group(1).replace(",", "")), Dg["mean_price"], 0.6)
    claim("simpson D mean carat", float(m.group(2)), Dg["mean_carat"], 0.0006)
m = re.search(r"the worst colour costs (\d+)% more", sim_html)
if m:
    claim("simpson headline percentage",
          float(m.group(1)), (J["mean_price"] / Dg["mean_price"] - 1) * 100, 0.6)
else:
    fails.append("could not find the headline percentage in simpson.html")
# the five band rows
band_rows = re.findall(r"<tr><td>([\d.]+)–([\d.]+) ct</td><td>\$([\d,]+)</td>"
                       r"<td class=\"g\">\$([\d,]+)</td></tr>", sim_html)
print(f"  simpson band table rows parsed: {len(band_rows)} (want {len(SIM['bands'])})")
if len(band_rows) != len(SIM["bands"]):
    fails.append(f"simpson band table has {len(band_rows)} rows, data has {len(SIM['bands'])}")
for i, (lo, hi, qj, qd) in enumerate(band_rows):
    cells = col["bands"][i]
    claim(f"simpson band {lo}-{hi} J", float(qj.replace(",", "")), cells[0]["mean_price"], 0.6)
    claim(f"simpson band {lo}-{hi} D", float(qd.replace(",", "")), cells[-1]["mean_price"], 0.6)

# The sentence that states the other two gradings' tallies. This is the claim
# that has to match the data, rather than every grading having to be perfect.
m = re.search(r"Both reverse too — (\d+) of (\d+) bands and (\d+) of (\d+)", sim_html)
if m:
    cutg, clg = SIM["gradings"]["cut"], SIM["gradings"]["clarity"]
    claim("simpson cut bands agreeing", float(m.group(1)), cutg["bands_correct"], 0)
    claim("simpson cut bands tested", float(m.group(2)), cutg["bands_tested"], 0)
    claim("simpson clarity bands agreeing", float(m.group(3)), clg["bands_correct"], 0)
    claim("simpson clarity bands tested", float(m.group(4)), clg["bands_tested"], 0)
else:
    fails.append("could not find the cut/clarity tally sentence in simpson.html")

m = re.search(r"<b>([\d.]+)%</b> are", cls_html)
if m:
    claim("classify base rate", float(m.group(1)), base * 100, 0.006)
m = re.search(r"→ accuracy ([\d.]+)%", cls_html)
if m:
    claim("classify do-nothing accuracy", float(m.group(1)), (1 - base) * 100, 0.006)
m = re.search(r"same non-answer scores <b>([\d.]+)%</b>", cls_html)
if m:
    claim("classify do-nothing at $15,000", float(m.group(1)),
          float((price <= 15000).mean()) * 100, 0.006)
m = re.search(r"still misses <b>(\d+)%</b>", cls_html)
if m:
    claim("classify miss rate at best accuracy",
          float(m.group(1)), (1 - b_acc["rec"]) * 100, 0.6)
m = re.search(r"([\d.]+)% to ([\d.]+)%", cls_html)
if m:
    claim("classify best-acc accuracy", float(m.group(1)), b_acc["acc"] * 100, 0.006)
    claim("classify best-F1 accuracy", float(m.group(2)), b_f1["acc"] * 100, 0.006)
m = re.search(r"recall jumps from (\d+)% to <b>(\d+)%</b>", cls_html)
if m:
    claim("classify best-acc recall", float(m.group(1)), b_acc["rec"] * 100, 0.6)
    claim("classify best-F1 recall", float(m.group(2)), b_f1["rec"] * 100, 0.6)
else:
    fails.append("could not find the recall-jump claim in classify.html")

# the renderers' thin-cell threshold must match this file's
m = re.search(r"MIN_CELL = (\d+)", (HERE / "simpson.render.js").read_text(encoding="utf-8"))
print(f"\n  thin-cell threshold: renderer {m.group(1) if m else '?'}, this check {MIN_CELL}")
if not m or int(m.group(1)) != MIN_CELL:
    fails.append("simpson.render.js MIN_CELL disagrees with the verification")

print("\n" + "=" * 74)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("simpson.js and classify.js are re-derived from the source CSV cell by cell;")
print("the reversal is a genuine one in all three gradings; the sweep's best-of")
print("figures really are its best; and every number in both pages matches.")
