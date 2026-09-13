"""Verify intuition.html / intuition.js / intuition.render.js.

Module 1 carries a constraint the other pages do not. A bias is a fact about
human judgment, and this project has no survey data, so the page must never
claim what other people guess. Two of the checks below exist purely to enforce
that: no population claim about guessing, and no invented percentage of readers.

The rest:

  1. RE-READ each source data file independently and confirm every question's
     marked-correct choice equals the value it cites. build_intuition.py already
     checks this, but a generator agreeing with itself proves nothing.
  2. Confirm every DISTRACTOR is either a real figure from the same data or an
     obviously round number -- no half-plausible invention.
  3. PIN the prose figures and the question count.
  4. Check the wiring, the shared motion layer, and that an answer is final.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
fails: list[str] = []


def load(fn: str):
    s = (HERE / fn).read_text(encoding="utf-8")
    i = min(k for k in (s.find("["), s.find("{")) if k >= 0)
    j = max(s.rfind("]"), s.rfind("}"))
    return json.loads(s[i:j + 1])


def check(label, got, want, tol=0.0):
    ok = (abs(got - want) <= tol) if isinstance(got, (int, float)) and \
        isinstance(want, (int, float)) else got == want
    print(f"  {label:<56} {got!r:>12} vs {want!r:>12}  {'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(f"{label}: page has {got!r}, source has {want!r}")


Q = load("intuition.js")
T = {d["id"]: d for d in load("typical.js")}
DS = {d["id"]: d for d in load("datasets.js")}
C = load("corr.js")
CL = load("classify.js")
html = (HERE / "intuition.html").read_text(encoding="utf-8")
flat = re.sub(r"\s+", " ", html)
rend = (HERE / "intuition.render.js").read_text(encoding="utf-8")

# The independent re-derivation. Each key maps to the value read straight from
# the file that owns it -- deliberately spelled out here rather than imported
# from the build script, so a change to the build cannot silently change the test.
SOURCE = {
    "below":      T["retail"]["pctBelow"],
    "commonest":  T["diamond"]["busiest"],
    "narrow_r":   C["diamond"]["windows"][-1]["r"],
    "split_r":    C["geyser"]["groups"][0]["r"],
    "n_sym":      DS["retail"]["n_symmetric"],
    "do_nothing": 100 * (1 - CL["base_rate"]),
}

print("=" * 78)
print("1. EVERY CORRECT ANSWER, RE-READ FROM ITS SOURCE FILE")
print("=" * 78)
check("question count", len(Q), len(SOURCE))
for qq in Q:
    key = qq["key"]
    if key not in SOURCE:
        fails.append(f"question {key!r} cites no known source")
        continue
    want = round(float(SOURCE[key]), qq["dp"])
    marked = qq["choices"][qq["answer"]]
    check(f"{key:<11} marked-correct choice", marked, want,
          10 ** -qq["dp"] * 0.5 + 1e-9)
    check(f"{key:<11} shipped truth", qq["truth"], want,
          10 ** -qq["dp"] * 0.5 + 1e-9)
    # the answer index must be in range, and the truth must be ON the scale
    if not (0 <= qq["answer"] < len(qq["choices"])):
        fails.append(f"{key}: answer index {qq['answer']} out of range")
    if not (qq["lo"] <= qq["truth"] <= qq["hi"]):
        fails.append(f"{key}: truth {qq['truth']} falls outside the drawn scale "
                     f"[{qq['lo']}, {qq['hi']}] and would be invisible")
    for c in qq["choices"]:
        if not (qq["lo"] <= c <= qq["hi"]):
            fails.append(f"{key}: choice {c} falls outside the drawn scale")

print("\n" + "=" * 78)
print("2. DISTRACTORS — real figures from the same data, or round numbers")
print("=" * 78)
# Values that appear elsewhere in the real data and are therefore legitimate
# plausible confusions rather than inventions.
REAL = {
    round(T["diamond"]["median"], 0), round(T["diamond"]["mu"], 0),
    round(abs(C["diamond"]["windows"][0]["r"]), 2),
    round(abs(C["diamond"]["windows"][3]["r"]), 2),
    round(abs(C["geyser"]["r"]), 2),
    round(100 * CL["best_f1_recall"], 1), round(100 * CL["best_acc"], 1),
    30, 100, 1000,
}


def is_round(c: float, hi: float) -> bool:
    """A defensible notion of "obviously a round number", scaled to the axis.

    An earlier version of this check carried a hardcoded allowlist of the exact
    awkward values in use (0.55, 0.7, 0.75) -- which is writing the test to pass
    rather than justifying the data. On a 0-1 correlation axis the conventional
    landmarks are multiples of 0.05; on a percentage or count axis they are
    multiples of 5.
    """
    step = 0.05 if hi <= 1.0 else 5
    return abs(c / step - round(c / step)) < 1e-9
for qq in Q:
    for i, c in enumerate(qq["choices"]):
        if i == qq["answer"]:
            continue
        round_number = is_round(c, qq["hi"])
        real = (round(c, 2) in REAL or round(c, 1) in REAL
                or round(c, 0) in REAL)
        tag = "real figure" if real else ("round number" if round_number else "INVENTED")
        print(f"  {qq['key']:<11} distractor {str(c):>9}   {tag}")
        if not (real or round_number):
            fails.append(f"{qq['key']}: distractor {c} is neither a real figure "
                         f"from the data nor a round number")

print("\n" + "=" * 78)
print("3. THE HONESTY CONSTRAINT — no claim about what other people guess")
print("=" * 78)
BANNED = [
    (r"most people (guess|answer|say|think)", "claims a population guess"),
    (r"\d+% of (people|readers|students|managers)", "invents a share of people"),
    (r"(readers|people) typically (guess|pick|choose)", "claims a typical guess"),
    (r"the average (person|reader)", "claims an average person"),
]
for pat, why in BANNED:
    hit = re.search(pat, flat, re.I)
    print(f"  {'no pattern: ' + pat:<56} "
          f"{'absent' if not hit else 'PRESENT':>12}  {'OK' if not hit else 'FAIL'}")
    if hit:
        fails.append(f"prose {why}: {hit.group(0)!r} — there is no survey data "
                     f"behind this page")
# and it must SAY so, so a reader is not left to infer the method
if "no claim about what other people guess" not in flat.lower():
    fails.append("the page does not state that it makes no claim about other "
                 "people's guesses — that disclosure is the method note")
else:
    print(f"  {'states its own limitation explicitly':<56} "
          f"{'yes':>12}  OK")

print("\n" + "=" * 78)
print("4. PROSE")
print("=" * 78)
WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"]
m = re.search(r"<h1>(\w+) questions you will probably get wrong</h1>", flat)
if not m:
    fails.append("the headline no longer matches its pattern")
else:
    check("headline counts the questions", m.group(1), WORDS[len(Q)])
m = re.search(r"Answer the six questions", flat)
if not m and len(Q) == 6:
    fails.append("the lede's question count no longer matches")
for want, label in ((T["retail"]["n"], "retail invoice count"),
                    (53940, "diamond count"), (272, "eruption count")):
    if f"{want:,}" not in flat:
        fails.append(f"prose no longer cites the {label} ({want:,})")
    else:
        print(f"  {'prose cites the ' + label:<56} {want:>12,}  OK")
# every question must name a module page that exists
for qq in Q:
    if not (HERE / qq["module"]).exists():
        fails.append(f"{qq['key']} links to {qq['module']}, which does not exist")
print(f"  {'every question links to a page that exists':<56} "
      f"{len(Q):>12}  OK")

print("\n" + "=" * 78)
print("5. WIRING")
print("=" * 78)
check("question buttons", sorted(int(v) for v in re.findall(r'data-q="(\d+)"', html)),
      list(range(len(Q))))
check("answer buttons", sorted(int(v) for v in re.findall(r'data-a="(\d+)"', html)),
      [0, 1, 2, 3])
check("reset button present", bool(re.search(r'data-x="reset"', html)), True)
scripts = re.findall(r'<script src="([^"]+)"', html)
check("scripts loaded", scripts,
      ["intuition.js", "draw.js", "motion.js", "intuition.render.js"])
for f_ in scripts:
    if not (HERE / f_).exists():
        fails.append(f"intuition.html loads {f_}, which does not exist")

code = re.sub(r"/\*.*?\*/", " ", rend, flags=re.S)
code = re.sub(r"(?m)//[^\n]*$", " ", code)
for banned, why in ((r"\brequestAnimationFrame\s*\(", "must use M.Ticker"),
                    (r"\bfunction\s+ease\s*\(", "must use the shared easings")):
    hit = re.search(banned, code)
    print(f"  {'no ' + banned:<56} "
          f"{'absent' if not hit else 'PRESENT':>12}  {'OK' if not hit else 'FAIL'}")
    if hit:
        fails.append(f"intuition.render.js: {banned!r} — {why}")
check("honours prefers-reduced-motion",
      bool(re.search(r"if \(reduce\)\s*\{\s*draw\(\);\s*return;\s*\}", code)), True)
check("paints one frame before the ticker starts",
      bool(re.search(r"draw\(\);\s*ticker\s*=\s*new M\.Ticker", code)), True)
# an answer must be FINAL -- letting it change after the reveal defeats the page
check("an answer cannot be changed once given",
      bool(re.search(r"if \(answered\(qi\)\) return;", code)), True)
# the wrap helper must include letter-spacing in its width test, or long
# prompts run past the panel edge
check("wrap accounts for letter-spacing",
      bool(re.search(r"TRACK \* Math\.max\(0, t\.length - 1\)", code)), True)

print("\n" + "=" * 78)
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("Every correct answer re-reads from the file that owns it, every distractor")
print("is a real figure or a round number, and the page makes no claim about what")
print("anyone other than the reader would guess.")
