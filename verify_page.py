"""Static checks on clt.html that do not need a browser.

Catches the failure modes that actually happen when hand-writing a page like
this: a readout the script writes to but the markup never declares, a control
whose data attribute the script does not read, an initial pressed state that
disagrees with the script's starting variables, and a dataset field the script
reads but the build never emitted.
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
html = (HERE / "clt.html").read_text(encoding="utf-8")
dsjs = (HERE / "datasets.js").read_text(encoding="utf-8")

fails = []

# ---- the inline script must parse
inline = re.findall(r"<script>(.*?)</script>", html, re.S)
print(f"inline script blocks: {len(inline)}")
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(inline[-1])
    tmp = f.name
r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
print("node --check:", "OK" if r.returncode == 0 else "FAILED\n" + r.stderr)
if r.returncode:
    fails.append("inline script does not parse")

# datasets.js must parse too, and be loaded by the page
r2 = subprocess.run(["node", "--check", str(HERE / "datasets.js")], capture_output=True, text=True)
print("datasets.js parse:", "OK" if r2.returncode == 0 else "FAILED\n" + r2.stderr)
if r2.returncode:
    fails.append("datasets.js does not parse")
if 'src="datasets.js"' not in html:
    fails.append("clt.html never loads datasets.js")
print("page loads datasets.js:", 'src="datasets.js"' in html)

markup = html.split("<script")[0]
js = inline[-1]

# ---- every id the script writes to must exist
ids_html = set(re.findall(r'id="([^"]+)"', markup))
ids_js = set(re.findall(r"\$\('([^']+)'\)", js)) | set(re.findall(r"getElementById\('([^']+)'\)", js))
missing = sorted(ids_js - ids_html)
print(f"\nids: script uses {len(ids_js)}, markup declares {len(ids_html)}, missing {missing or 'none'}")
if missing:
    fails.append(f"ids referenced but not declared: {missing}")
unused = sorted(ids_html - ids_js - {"clt"})
print(f"declared but never written: {unused or 'none'}")

# ---- controls: attribute present in markup and read by the script
for attr in ("data-n", "data-set"):
    in_markup = len(re.findall(attr + r'="', markup))
    read = f"[{attr}]" in js
    print(f"{attr}: {in_markup} buttons, script reads selector: {read}")
    if not in_markup or not read:
        fails.append(f"{attr} controls not wired")

# ---- default pressed state must match the script's initial values
pressed_n = re.findall(r'data-n="(\d+)" aria-pressed="true"', markup)
pressed_set = re.findall(r'data-set="(\w+)" aria-pressed="true"', markup)
init_n = re.findall(r"let D = DATA\[0\], n = (\d+)", js)
print(f"\ndefault n button={pressed_n} script n={init_n}")
if pressed_n and init_n and pressed_n[0] != init_n[0]:
    fails.append(f"default n button {pressed_n[0]} != script initial n {init_n[0]}")

# ---- the dataset the script starts on is DATA[0]; its button must be pressed
objs = [json.loads(m) for m in
        re.findall(r"^\{.*\}(?=,?$)", dsjs[dsjs.index("["):dsjs.rindex("]") + 1], re.M)]
first_id = objs[0]["id"]
print(f"default dataset button={pressed_set} DATA[0].id={first_id}")
if pressed_set and pressed_set[0] != first_id:
    fails.append(f"pressed dataset {pressed_set[0]} != DATA[0] {first_id}")

# every data-set value must name a real dataset
declared = set(re.findall(r'data-set="(\w+)"', markup))
have = {o["id"] for o in objs}
if declared - have:
    fails.append(f"buttons reference unknown datasets: {sorted(declared - have)}")
print(f"dataset buttons {sorted(declared)} vs data {sorted(have)}: "
      f"{'OK' if declared <= have else 'MISMATCH'}")

# ---- every D.<field> the script reads must exist on every dataset
fields = set(re.findall(r"\bD\.(\w+)", js))
print(f"\nscript reads D.{{{', '.join(sorted(fields))}}}")
for o in objs:
    absent = sorted(f for f in fields if f not in o)
    if absent:
        fails.append(f"{o['id']}: missing fields {absent}")
    print(f"  {o['id']:8} missing: {absent or 'none'}")

# ---- HINTS must cover every dataset, or a switch shows a blank hint
hint_keys = set(re.findall(r"^\s{4}(\w+):\s*'", js, re.M))
uncovered = sorted(have - hint_keys)
print(f"hint coverage: {sorted(hint_keys & have)}  uncovered={uncovered or 'none'}")
if uncovered:
    fails.append(f"datasets with no hint text: {uncovered}")

# ---- the sizes the page offers must be the sizes verify_stats.py tests,
#      otherwise a button exists that nothing ever checked
offered = sorted(int(x) for x in re.findall(r'data-n="(\d+)"', markup))
vs = (HERE / "verify_stats.py").read_text(encoding="utf-8")
tested_m = re.search(r"NS = \(([\d,\s]+)\)", vs)
tested = sorted(int(x) for x in tested_m.group(1).split(",") if x.strip()) if tested_m else []
print(f"\nn buttons offered: {offered}")
print(f"n sizes verified : {tested}")
if offered != tested:
    fails.append(f"offered sizes {offered} != verified sizes {tested}")

# ---- claims in the prose that quote a sample size must name a real button
for m in re.finditer(r"Click <b>(?:n = )?(\d+)</b>", markup):
    if int(m.group(1)) not in offered:
        fails.append(f"prose tells the reader to click n={m.group(1)}, which has no button")
print("prose-referenced sample sizes all have buttons:",
      all(int(m.group(1)) in offered for m in re.finditer(r"Click <b>(?:n = )?(\d+)</b>", markup)))

print("\n" + "=" * 60)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("clt.html parses, loads its data, and every readout, control, dataset")
print("field and hint is wired to something that exists.")
