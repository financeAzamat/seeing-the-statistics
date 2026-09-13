"""Audit the numeric claims the prose makes, one by one.

Written because several claims in the copy were typed from intuition rather
than measured, which is the same failure the whole data rewrite was meant to
fix -- prose is not exempt just because it is prose.
"""
import csv
import io
import json
import math
import re
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ds = (ROOT / "datasets.js").read_text(encoding="utf-8")
objs = {o["id"]: o for o in (json.loads(m) for m in
        re.findall(r"^\{.*\}(?=,?$)", ds[ds.index("["):ds.rindex("]") + 1], re.M))}

def chk(claim, ok, detail):
    print(f"  [{'OK ' if ok else 'BAD'}] {claim}\n         {detail}")
    return ok

bad = 0
print("retail")
r = objs["retail"]
v = r["vals"]
bad += not chk("mean is about £458", abs(r["mu"] - 458) < 1, f"mu={r['mu']:.2f}")
bad += not chk("typical (median) is about £305",
               abs(statistics.median(v) - 305) < 2, f"median={statistics.median(v):.2f}")
bad += not chk("range is about £2 to just over £4,000",
               1 <= min(v) <= 4 and 3900 <= max(v) <= 4200, f"min={min(v):.2f} max={max(v):.2f}")
bad += not chk("700 invoices on screen", len(v) == 700, f"n={len(v)}")
bad += not chk("drawn from 19,583", r["n_pool"] == 19583, f"n_pool={r['n_pool']:,}")
se25, se100 = r["sd"] / 5, r["sd"] / 10
bad += not chk("typical miss £118 at n=25, £59 at n=100 (exactly halved)",
               abs(se25 - 118) < 1 and abs(se100 - 59) < 1 and abs(se25 / se100 - 2) < 1e-9,
               f"SE25={se25:.2f} SE100={se100:.2f} ratio={se25/se100:.4f}")
bad += not chk("needs n about 290", r["n_symmetric"] == 290, f"n_sym={r['n_symmetric']}")

print("\ngeyser")
g = objs["geyser"]
gv = g["vals"]
bad += not chk("mean is 71 minutes", abs(g["mu"] - 71) < 0.5, f"mu={g['mu']:.2f}")
bad += not chk("even by n=5", g["n_symmetric"] == 5, f"n_sym={g['n_symmetric']}")
# the two humps: split at the midpoint of the gap and take each side's centre
lo = [x for x in gv if x < 66]
hi = [x for x in gv if x >= 66]
bad += not chk("waits about 54 or about 80 minutes",
               abs(statistics.median(lo) - 54) <= 1.5 and abs(statistics.median(hi) - 80) <= 1.5,
               f"lower hump median={statistics.median(lo):.1f} ({len(lo)} obs), "
               f"upper hump median={statistics.median(hi):.1f} ({len(hi)} obs)")
near = sum(1 for x in gv if 69 <= x <= 73)
bad += not chk("only about one wait in fourteen falls near 71 minutes",
               13 <= len(gv) / near <= 15,
               f"{near}/{len(gv)} = {near/len(gv)*100:.1f}% within 69-73 min "
               f"= 1 in {len(gv)/near:.1f}")

print("\ndiamond")
d = objs["diamond"]
dv = d["vals"]
bad += not chk("53,940 records in the source", d["n_source"] == 53940, f"n_source={d['n_source']:,}")
bad += not chk("needs n about 66", d["n_symmetric"] == 66, f"n_sym={d['n_symmetric']}")
ratio = max(dv) / statistics.median(dv)
bad += not chk("the dearest costs nearly EIGHT times the middle one",
               7.0 <= ratio <= 8.5,
               f"max={max(dv):,.0f} median={statistics.median(dv):,.0f} ratio={ratio:.1f}x")
# what the true multiple is, so the prose can quote it
csvp = HERE / "cache" / "diamonds.csv"
if csvp.exists():
    allp = [float(x["price"]) for x in csv.DictReader(io.StringIO(csvp.read_text())) if x.get("price")]
    print(f"         full source: max={max(allp):,.0f} median={statistics.median(allp):,.0f} "
          f"ratio={max(allp)/statistics.median(allp):.1f}x")

print("\ngeneral claims")
bad += not chk("a 1,000-person poll gives about +/-3 points",
               abs(1.96 * math.sqrt(0.25 / 1000) * 100 - 3) < 0.3,
               f"1.96*sqrt(.25/1000) = {1.96*math.sqrt(0.25/1000)*100:.2f} points")
bad += not chk("ten times the data buys a threefold improvement",
               abs(math.sqrt(10) - 3) < 0.2, f"sqrt(10) = {math.sqrt(10):.3f}")
bad += not chk("four times the data halves the miss",
               abs(math.sqrt(4) - 2) < 1e-9, f"sqrt(4) = {math.sqrt(4):.1f}")

print(f"\n{'=' * 60}\n{bad} claim(s) need correcting" if bad else
      f"\n{'=' * 60}\nevery prose claim checks out")
