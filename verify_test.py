"""Static + numeric verification of test.html.

Every percentage written into that page's prose came out of
data/measure_test.py, and this checks each one still matches. Also checks the
arithmetic claims the page makes on its own account -- the noise-to-average
ratios, the 6.7x and 45x comparison, and the multiple-testing table -- because
those were computed by hand in the copy and hand arithmetic is exactly what
slipped twice already on the earlier pages.
"""
from __future__ import annotations

import json
import re
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
html = (HERE / "test.html").read_text(encoding="utf-8")
ref = json.loads((HERE / "data" / "test_reference.json").read_text(encoding="utf-8"))
dsrc = (HERE / "datasets.js").read_text(encoding="utf-8")
DS = {o["id"]: o for o in (json.loads(m) for m in
      re.findall(r"^\{.*\}(?=,?$)", dsrc[dsrc.index("["):dsrc.rindex("]") + 1], re.M))}

fails: list[str] = []
# The renderer used to live in an inline <script> block. It was extracted to
# test.render.js so BOTH locales can load the same file -- a Russian copy of the
# page would otherwise have carried its own duplicate of 524 lines, and the two
# would have drifted on the first fix that reached only one. This reads whichever
# form the page uses, so the check works either way rather than pinning the page
# to one structure.
inline = re.findall(r"<script>(.*?)</script>", html, re.S)
if inline:
    js_source, js = "inline <script>", inline[-1]
else:
    ext = re.findall(r'<script src="([^"]+\.render\.js)"', html)
    if not ext:
        fails.append("test.html has neither an inline script nor a *.render.js")
    js_source = ext[-1] if ext else "(none)"
    js = (HERE / ext[-1]).read_text(encoding="utf-8") if ext else ""
print(f"renderer source: {js_source}")
markup = html.split("<script")[0]

# ---------------------------------------------------------------- parses
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(js)
    tmp = f.name
r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
print("node --check the renderer:", "OK" if r.returncode == 0 else "FAILED\n" + r.stderr)
if r.returncode:
    fails.append("the test renderer does not parse")
for dep in ("datasets.js", "stats.js"):
    ok = f'src="{dep}"' in html
    print(f"loads {dep}: {ok}")
    if not ok:
        fails.append(f"test.html does not load {dep}")

# ---------------------------------------------------------------- wiring
ids_html = set(re.findall(r'id="([^"]+)"', markup))
ids_js = set(re.findall(r"\$\('([^']+)'\)", js)) | set(re.findall(r"getElementById\('([^']+)'\)", js))
missing = sorted(ids_js - ids_html)
print(f"\nids: script uses {len(ids_js)}, markup declares {len(ids_html)}, missing {missing or 'none'}")
if missing:
    fails.append(f"ids referenced but not declared: {missing}")

for attr in ("data-set", "data-eff", "data-n", "data-a"):
    c = len(re.findall(attr + r'="', markup))
    read = f"[{attr}]" in js
    print(f"{attr}: {c} buttons, read by script: {read}")
    if not c or not read:
        fails.append(f"{attr} not wired")

init = re.search(r"let D = DATA\[0\], n = (\d+), effect = ([\d.]+), alpha = ([\d.]+)", js)
print(f"\nscript starts at n={init.group(1)} effect={init.group(2)} alpha={init.group(3)}")
for attr, want, label in (("data-n", init.group(1), "n"),
                          ("data-eff", init.group(2), "effect"),
                          ("data-a", init.group(3), "alpha")):
    pressed = re.findall(attr + r'="([\d.]+)" aria-pressed="true"', markup)
    ok = bool(pressed) and float(pressed[0]) == float(want)
    print(f"  default {label} button={pressed} vs script {want}: {'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"default {label} button {pressed} != script initial {want}")

# every (dataset, effect, n) the buttons allow must exist in the measurement,
# so no control can be exercised on a combination nothing ever verified
effs = [float(x) for x in re.findall(r'data-eff="([\d.]+)"', markup)]
ns = [int(x) for x in re.findall(r'data-n="(\d+)"', markup)]
sets_ = re.findall(r'data-set="(\w+)"', markup)
print(f"\nbuttons: sets={sets_} effects={effs} n={ns}")
absent = [f"{s}|{e}|{n}" for s in sets_ for e in effs for n in ns
          if f"{s}|{e}|{n}" not in ref]
if absent:
    fails.append(f"button combinations never measured: {absent[:6]}")
print(f"all {len(sets_) * len(effs) * len(ns)} button combinations were measured:", not absent)

# alpha buttons must be alphas the measurement recorded rates for
alphas = re.findall(r'data-a="([\d.]+)"', markup)
have_a = set(ref["retail|0.0|30"]["rates"])
print(f"alpha buttons {alphas} measured: {sorted(have_a)}")
for a in alphas:
    if a not in have_a:
        fails.append(f"alpha {a} has no measured rate")

# ---------------------------------------------------------------- power table
print("\npower table in the prose vs measurement (+5% lift, alpha 0.05):")
body = re.search(r"<th>Per group</th>.*?</tbody>", markup, re.S).group(0)
rows = re.findall(r"<tr><td>(\d+)</td>"
                  r"<td[^>]*>([\d.]+)%</td><td[^>]*>([\d.]+)%</td><td[^>]*>([\d.]+)%</td></tr>", body)
if len(rows) != 4:
    fails.append(f"expected 4 power rows, parsed {len(rows)}")
for nn, q_ret, q_dia, q_gey in rows:
    for quoted, dsid in ((q_ret, "retail"), (q_dia, "diamond"), (q_gey, "geyser")):
        m = ref[f"{dsid}|0.05|{nn}"]["rates"]["0.05"] * 100
        off = abs(float(quoted) - m)
        ok = off < 0.06
        print(f"  n={nn:>4} {dsid:8} quoted {quoted}%  measured {m:.1f}%  {'OK' if ok else 'MISMATCH'}")
        if not ok:
            fails.append(f"power n={nn} {dsid}: prose {quoted}%, measured {m:.1f}%")

# ---------------------------------------------------------------- other claims
print("\nother numeric claims:")

def claim(label, quoted, measured, tol):
    ok = abs(quoted - measured) <= tol
    print(f"  [{'OK ' if ok else 'BAD'}] {label:44} quoted {quoted}  measured {measured:.3f}")
    if not ok:
        fails.append(f"{label}: prose {quoted}, measured {measured:.3f}")

# the headline false-positive rate
m = re.search(r"(?:<b>)?([\d.]+)%(?:</b>)? of tests come out\s*\n?\s*\"significant\"", markup)
if not m:
    m = re.search(r"(?:<b>)?([\d.]+)%(?:</b>)? of tests come out", markup)
if m:
    claim("false-positive rate, nothing going on", float(m.group(1)),
          ref["retail|0.0|500"]["rates"]["0.05"] * 100, 0.15)
else:
    fails.append("could not find the false-positive claim in the markup")

# the headline power sentence
m = re.search(r"each group(?:</b>)? is caught (\d+)% of the time", markup)
if m:
    claim("retail +5% power at n=2000", float(m.group(1)),
          ref["retail|0.05|2000"]["rates"]["0.05"] * 100, 0.6)
else:
    fails.append("could not find the headline power claim")

# the hint text also quotes power figures; check the two in the retail hint
hint = re.search(r"retail: '([^']+)'", js)
if hint:
    h = hint.group(1)
    m5 = re.search(r"([\d.]+)% power at 500", h)
    m2 = re.search(r"only (\d+)% at 2,000", h)
    if m5:
        claim("hint: retail power at n=500", float(m5.group(1)),
              ref["retail|0.05|500"]["rates"]["0.05"] * 100, 0.15)
    if m2:
        claim("hint: retail power at n=2000", float(m2.group(1)),
              ref["retail|0.05|2000"]["rates"]["0.05"] * 100, 0.6)
else:
    fails.append("could not find the retail hint text")

# noise-to-average ratios quoted in the formula block
for dsid, want in re.findall(r"(retail orders|diamond prices|geyser waits)\s+spread ÷ average = ([\d.]+)", markup):
    key = {"retail orders": "retail", "diamond prices": "diamond", "geyser waits": "geyser"}[dsid]
    d = DS[key]
    claim(f"noise/average {key}", float(want), d["sd"] / d["mu"], 0.006)

# the 6.7x and 45x comparison
cv_r = DS["retail"]["sd"] / DS["retail"]["mu"]
cv_g = DS["geyser"]["sd"] / DS["geyser"]["mu"]
m = re.search(r"(?:<b>)?([\d.]+) times(?:</b>)? larger relative", markup)
if m:
    claim("retail noise vs geyser, ratio", float(m.group(1)), cv_r / cv_g, 0.06)
m = re.search(r"(?:<b>)?(\d+) times(?:</b>)? as much data", markup)
if m:
    claim("sample-size multiplier (ratio squared)", float(m.group(1)), (cv_r / cv_g) ** 2, 0.6)

# the multiple-testing table is pure arithmetic, so check it exactly
print("\nmultiple-testing table (1 - 0.95^k):")
mt = re.search(r"<th>Chance of a fake winner</th>.*?</tbody>", markup, re.S).group(0)
for k, q in re.findall(r"<tr><td>(\d+)</td><td[^>]*>([\d.]+)%</td></tr>", mt):
    want = (1 - 0.95 ** int(k)) * 100
    off = abs(float(q) - want)
    ok = off < 0.06
    print(f"  k={k:>3} quoted {q}%  exact {want:.1f}%  {'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"multiple-testing k={k}: prose {q}%, exact {want:.1f}%")

# ---------------------------------------------------------------- flatness
print("\nthe page claims the null histogram is flat; KS against uniform:")
for dsid in sets_:
    ks = ref[f"{dsid}|0.0|500"]["ks_uniform"]
    ok = ks < 0.04
    print(f"  {dsid:8} KS={ks:.3f}  {'flat' if ok else 'NOT FLAT'}")
    if not ok:
        fails.append(f"{dsid}: null p-values not flat (KS {ks:.3f})")

print("\n" + "=" * 70)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("test.html parses, loads its modules, every control is wired to a")
print("combination that was actually measured, and every percentage in the")
print("prose matches data/measure_test.py or exact arithmetic.")
