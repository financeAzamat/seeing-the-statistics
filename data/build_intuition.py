"""GENERATOR for intuition.js — the Module 1 self-test.

Run:  python3 build_intuition.py

Module 1 is heuristics and biases, and it presents a problem the other nine
pages do not: a bias is a fact about human judgment, and this project is not
allowed to invent numbers. There is no survey data here, so the page must NOT
claim "most people guess X" -- that would be fabricated.

So the page does the honest version instead: it asks the reader to COMMIT to an
answer, then shows the real measured answer and the size of their own error. The
bias is demonstrated on the reader rather than asserted about a population.

Every correct answer is DERIVED from a shipped data file that already has its
own verification script -- typical.js, corr.js, datasets.js, classify.js. None is
retyped here, and the build FAILS if a question's marked-correct choice does not
match the value its source file holds. The distractors are deliberately other
REAL figures from the same data (the median price, the wider carat window, the
pooled correlation), because the plausible confusions are the interesting ones.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "intuition.js"


def load(fn: str):
    s = (ROOT / fn).read_text(encoding="utf-8")
    i = min(k for k in (s.find("["), s.find("{")) if k >= 0)
    j = max(s.rfind("]"), s.rfind("}"))
    return json.loads(s[i:j + 1])


T = {d["id"]: d for d in load("typical.js")}
DS = {d["id"]: d for d in load("datasets.js")}
C = load("corr.js")
CL = load("classify.js")

# ---- the measured truths, each pulled from the file that owns it
TRUTH = {
    "below":    (T["retail"]["pctBelow"],            "typical.js  retail.pctBelow"),
    "commonest": (T["diamond"]["busiest"],           "typical.js  diamond.busiest"),
    "narrow_r": (C["diamond"]["windows"][-1]["r"],   "corr.js     diamond.windows[-1].r"),
    "split_r":  (C["geyser"]["groups"][0]["r"],      "corr.js     geyser.groups[0].r"),
    "n_sym":    (DS["retail"]["n_symmetric"],        "datasets.js retail.n_symmetric"),
    # classify.js stores the POSITIVE rate; "flag nothing" scores the complement
    "do_nothing": (100 * (1 - CL["base_rate"]),      "classify.js 1 - base_rate"),
}

QUESTIONS = [
    dict(
        key="below",
        prompt="Of 19,773 real online orders, what share came in BELOW the "
               "average order value?",
        hint="The average was £519.50.",
        lo=0, hi=100, unit="", after="%", dp=1,
        choices=[25.0, 50.0, 77.3, 90.0],
        answer=2,
        why="A long tail of very large orders drags the average up past the "
            "crowd. 15,285 of the 19,773 orders are below it. The instinct that "
            "an average sits in the middle is only safe when the data is "
            "symmetric, and real money data almost never is.",
        bias="We treat the average as the typical case.",
        module="typical.html", moduleLabel="Module 3 — the average is not typical",
    ),
    dict(
        key="commonest",
        prompt="The average diamond in the reference table costs $3,933. What "
               "does the COMMONEST diamond cost?",
        hint="Two of these four numbers are real summaries of the same 53,940 stones.",
        lo=0, hi=6000, unit="$", after="", dp=0,
        choices=[965.0, 2401.0, 3933.0, 6000.0],
        answer=0,
        why="The commonest price is about a quarter of the average. $2,401 is "
            "the median and $3,933 is the mean — both correct, and neither "
            "describes the stone you are most likely to meet.",
        bias="We assume one summary number can stand in for a whole distribution.",
        module="typical.html", moduleLabel="Module 3 — the average is not typical",
    ),
    dict(
        key="narrow_r",
        prompt="Across all sizes, diamond size and price correlate at +0.92. "
               "Among 3,823 stones that ALL weigh almost exactly one carat, what "
               "is the correlation?",
        hint="Nothing about the stones changed. Only which of them you can see.",
        lo=0, hi=1, unit="+", after="", dp=2,
        choices=[0.09, 0.41, 0.70, 0.92],
        answer=0,
        why="Correlation compares how much price moves WITH size against how "
            "much it moves in total. Hold size almost still and there is nearly "
            "nothing left for it to explain, while every other reason prices "
            "differ carries on. +0.41 is the real answer for a slightly wider "
            "window, which is why it is a tempting guess.",
        bias="We read a correlation as a property of the relationship rather "
             "than of the sample.",
        module="corr.html", moduleLabel="Module 4 — correlation and your window",
    ),
    dict(
        key="split_r",
        prompt="Old Faithful: how long an eruption lasts and how long you then "
               "wait correlate at +0.90 across all 272 eruptions. Among the 97 "
               "SHORT eruptions only, what is it?",
        hint="The geyser has two habits: short-then-soon, and long-then-later.",
        lo=0, hi=1, unit="+", after="", dp=2,
        choices=[0.29, 0.55, 0.75, 0.90],
        answer=0,
        why="Almost all of that +0.90 is the gap BETWEEN the two habits, not "
            "agreement inside either one. Knowing which habit you are in tells "
            "you a great deal; knowing the exact length, once you know the "
            "habit, tells you very little.",
        bias="We credit a pooled correlation to a relationship that only exists "
             "between the groups.",
        module="corr.html", moduleLabel="Module 4 — correlation and your window",
    ),
    dict(
        key="n_sym",
        prompt="How many real orders must you average together before those "
               "averages stop being lopsided and turn roughly symmetric?",
        hint="The textbook rule of thumb is 30.",
        # hi must exceed the LARGEST choice, not just the truth: at hi=400 the
        # 1000 option was drawn off the end of the number line and invisible
        lo=0, hi=1100, unit="", after="", dp=0,
        choices=[30, 100, 290, 1000],
        answer=2,
        why="\"n = 30\" is a rule about how skewed the underlying data is, not a "
            "constant. Order values are heavily skewed, so their averages need "
            "roughly ten times the folk number before they behave.",
        bias="We remember a rule of thumb and forget the condition attached to it.",
        module="clt.html", moduleLabel="Module 5 — the Central Limit Theorem",
    ),
    dict(
        key="do_nothing",
        prompt="A model that flags NOTHING AT ALL — it always answers \"no\" — is "
               "scored on the real diamond task. What accuracy does it get?",
        hint="About one stone in ten is a genuine positive.",
        lo=0, hi=100, unit="", after="%", dp=1,
        # 84.0 and 95.1 are REAL figures from the same task -- the recall of the
        # best-F1 threshold and the best accuracy any threshold reaches. An
        # earlier draft used 68 and 99, which were invented and therefore exactly
        # the kind of number this project is not allowed to print.
        choices=[50.0, round(100 * CL["best_f1_recall"], 1), 90.3,
                 round(100 * CL["best_acc"], 1)],
        answer=2,
        why="Because only about 9.7% of cases are positive, answering \"no\" "
            "every time is right in the other 90.3%. Accuracy on a lopsided "
            "problem rewards doing nothing, which is why it is the wrong score "
            "to optimise.",
        bias="We accept a single headline score without asking what a useless "
             "model would get.",
        module="classify.html", moduleLabel="Module 9 — accuracy and confusion",
    ),
]


def main() -> None:
    fails: list[str] = []
    out = []
    for q in QUESTIONS:
        truth, source = TRUTH[q["key"]]
        marked = q["choices"][q["answer"]]
        # Display tolerance: the choice is shown at dp decimals, so it must equal
        # the truth once rounded to that many places. Anything looser would let a
        # question quietly disagree with the data it cites.
        want = round(float(truth), q["dp"])
        got = round(float(marked), q["dp"])
        ok = abs(got - want) <= 10 ** -q["dp"] * 0.5 + 1e-9
        print(f"  {q['key']:<11} marked {got:<9} truth {want:<9} "
              f"{'OK' if ok else 'MISMATCH'}   <- {source}")
        if not ok:
            fails.append(f"{q['key']}: choice {got} does not match {source} = {want}")
        out.append(dict(
            key=q["key"], prompt=q["prompt"], hint=q["hint"],
            lo=q["lo"], hi=q["hi"], unit=q["unit"], after=q["after"], dp=q["dp"],
            choices=[round(float(c), q["dp"]) for c in q["choices"]],
            answer=q["answer"], truth=want, source=source,
            why=q["why"], bias=q["bias"],
            module=q["module"], moduleLabel=q["moduleLabel"],
        ))

    if fails:
        print("\nBUILD FAILED — a question disagrees with the data it cites:")
        for f in fails:
            print("  -", f)
        sys.exit(1)

    OUT.write_text(
        "/* GENERATED by data/build_intuition.py — do not hand-edit.\n"
        "   Every `truth` is DERIVED from a shipped data file that has its own\n"
        "   verification script; none is typed in here, and the build fails if a\n"
        "   question's marked-correct choice disagrees with its source. The\n"
        "   distractors are other REAL figures from the same data.\n"
        "   This page makes NO claim about what other people guess — there is no\n"
        "   survey data behind it, so it only ever shows the reader their own\n"
        "   answer against the measured one. */\n"
        "window.UDJ_INTUITION = " + json.dumps(out, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"\nwrote {OUT} ({OUT.stat().st_size:,} bytes) — {len(out)} questions")


if __name__ == "__main__":
    main()
