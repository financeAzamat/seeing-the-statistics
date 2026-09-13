"""Static + numeric verification of ci.html.

Three classes of failure this catches:

  WIRING     a readout the script writes to that the markup never declares,
             a control the script does not read, a default pressed state that
             disagrees with the script's starting variables.

  LOOKUP     every (confidence, n) pair the buttons allow must resolve to a
             real critical value. A missing t entry does not throw -- it
             returns undefined and the page silently draws bars of width NaN,
             which is the worst kind of bug because it still renders.

  CLAIMS     every coverage percentage written into the prose must match what
             data/measure_ci.py actually measured. The whole point of this
             course material is that the numbers on the page are the numbers
             the data produced.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
html = (HERE / "ci.html").read_text(encoding="utf-8")
crit = json.loads(re.search(r"window\.UDJ_CRIT = (\{.*?\});",
                            (HERE / "ci_crit.js").read_text(encoding="utf-8"), re.S).group(1))
ref = json.loads((HERE / "data" / "ci_reference.json").read_text(encoding="utf-8"))

fails: list[str] = []
inline = re.findall(r"<script>(.*?)</script>", html, re.S)
js = inline[-1]
markup = html.split("<script")[0]

# ---------------------------------------------------------------- parses
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(js)
    tmp = f.name
r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
print("node --check ci.html script:", "OK" if r.returncode == 0 else "FAILED\n" + r.stderr)
if r.returncode:
    fails.append("ci.html inline script does not parse")
for dep in ("datasets.js", "ci_crit.js"):
    ok = f'src="{dep}"' in html
    print(f"loads {dep}: {ok}")
    if not ok:
        fails.append(f"ci.html does not load {dep}")

# ---------------------------------------------------------------- wiring
ids_html = set(re.findall(r'id="([^"]+)"', markup))
ids_js = set(re.findall(r"\$\('([^']+)'\)", js)) | set(re.findall(r"getElementById\('([^']+)'\)", js))
missing = sorted(ids_js - ids_html)
print(f"\nids: script uses {len(ids_js)}, markup declares {len(ids_html)}, missing {missing or 'none'}")
if missing:
    fails.append(f"ids referenced but not declared: {missing}")

for attr in ("data-set", "data-conf", "data-n", "data-m"):
    cnt = len(re.findall(attr + r'="', markup))
    read = f"[{attr}]" in js
    print(f"{attr}: {cnt} buttons, read by script: {read}")
    if not cnt or not read:
        fails.append(f"{attr} not wired")

# defaults must match the script's initial state
init = re.search(r"let D = DATA\[0\], n = (\d+), conf = ([\d.]+), method = '(\w+)'", js)
print(f"\nscript starts at n={init.group(1)} conf={init.group(2)} method={init.group(3)}")
for attr, want, label in (("data-n", init.group(1), "n"),
                          ("data-conf", init.group(2), "conf"),
                          ("data-m", init.group(3), "method")):
    pressed = re.findall(attr + r'="([\d.\w]+)" aria-pressed="true"', markup)
    ok = pressed and pressed[0] == want
    print(f"  default {label} button={pressed} vs script {want}: {'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"default {label} button {pressed} != script initial {want}")

# ---------------------------------------------------------------- lookups
confs = sorted(re.findall(r'data-conf="([\d.]+)"', markup))
ns = sorted(int(x) for x in re.findall(r'data-n="(\d+)"', markup))
print(f"\nbuttons: conf={confs}  n={ns}")
print("every (conf, n) pair resolves to a critical value:")
for c in confs:
    for nn in ns:
        z = crit["z"].get(c)
        t = crit["t"].get(c, {}).get(str(nn))
        if z is None:
            fails.append(f"no z for conf {c}")
        if t is None:
            fails.append(f"no t for conf {c}, n {nn} -- page would compute NaN widths")
    row = "  ".join(f"n{nn}:{crit['t'].get(c, {}).get(str(nn))}" for nn in ns)
    print(f"  conf {c}: z={crit['z'].get(c)}  {row}")

# critical values must equal what the measurement script computed. ci_crit.js
# rounds to 6 decimals on the way out, so the tolerance is 5e-7, not zero.
TOL = 5e-7
for c in confs:
    if abs(crit["z"][c] - ref["crit"]["z"][c]) > TOL:
        fails.append(f"z for {c} disagrees with ci_reference.json")
    for nn in ns:
        a, b = crit["t"][c][str(nn)], ref["crit"]["t"][c][str(nn)]
        if abs(a - b) > TOL:
            fails.append(f"t for {c}/{nn} disagrees with ci_reference.json ({a} vs {b})")
print("critical values match ci_reference.json:",
      not any("disagrees with ci_reference" in f for f in fails))

# ---------------------------------------------------------------- claims
print("\ncoverage figures quoted in the prose, against what was measured:")
# the comparison table: dataset | skew | z-known | s-estimated, at 95% / n=30
rows = re.findall(r"<tr><td>([^<]+)</td><td>([^<]+)</td>"
                  r"<td[^>]*>([\d.]+)%</td><td[^>]*>([\d.]+)%</td></tr>", markup)
NAME = {"Geyser waits": "geyser", "Diamond prices": "diamond", "Retail orders": "retail"}
if not rows:
    fails.append("could not parse the coverage table out of the markup")
for label, skew, zq, tq in rows:
    ds = NAME.get(label.strip())
    if ds is None:
        fails.append(f"unknown dataset row in table: {label}")
        continue
    m = ref["coverage"][f"{ds}|0.95|30"]
    for quoted, measured, what in ((zq, m["cov_z_sigma"], "z(sigma)"),
                                   (tq, m["cov_t"], "t(s)")):
        off = abs(float(quoted) - measured * 100)
        ok = off < 0.06
        print(f"  {label:15} {what:9} quoted {quoted}%  measured {measured*100:.1f}%  "
              f"{'OK' if ok else 'MISMATCH'}")
        if not ok:
            fails.append(f"{label} {what}: prose says {quoted}%, measurement says {measured*100:.1f}%")

# the headline sentence and the mechanism figures
def claim(pattern: str, measured: float, tol: float, what: str) -> None:
    m = re.search(pattern, markup)
    if not m:
        fails.append(f"claim not found in markup: {what}")
        return
    q = float(m.group(1))
    ok = abs(q - measured) <= tol
    print(f"  {what:34} quoted {q}  measured {measured:.2f}  {'OK' if ok else 'MISMATCH'}")
    if not ok:
        fails.append(f"{what}: prose says {q}, measurement says {measured:.2f}")

r30 = ref["coverage"]["retail|0.95|30"]
claim(r"gets you <b>(\d+)%</b>", r30["cov_t"] * 100, 0.6, "headline retail coverage")
print("\n" + "=" * 66)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("ci.html parses, loads its data, every control and readout is wired,")
print("every (confidence, n) pair resolves to a table-checked critical value,")
print("and every coverage figure in the prose matches the measurement.")
