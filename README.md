# Seeing the statistics

Eleven interactive explanations of the ideas in an *Uncertainty, Data and
Judgment* course. Each one runs in a browser with no dependencies, and each one
runs on **real published data** — no invented numbers, and no scripted
animations standing in for a computation.

**[Read the course →](https://financeazamat.github.io/seeing-the-statistics/)**

## The rule the project is built around

Every figure quoted in the prose is checked against the data by a script that
ships beside it. If a page says the correlation is `+0.088`, a verification
script re-derives that number from the raw CSV and fails the build if it
disagrees. There are sixteen such scripts.

This is not decoration. Writing the pages this way overturned the planned lesson
four separate times and caught more than twenty errors that reading the prose did
not — a claimed 50× price multiple that was really 7.8×, a "hardly ever" that was
one time in fourteen, a peak-finding routine that reported two clusters of a
geyser's behaviour when both were inside the same cluster.

## The pages

| | Page | What it shows |
|---|---|---|
| 01 | Where your judgment goes wrong | Six questions, answered by you before the measurement is revealed |
| 03 | The average is not typical | 77.3% of 19,773 real orders fall below their own average |
| 04 | Correlation and the range you looked at | The same relationship scores +0.92 or +0.09 |
| 05·1 | The Central Limit Theorem | Why "n ≈ 30" is a rule about tails, not a constant |
| 05·2 | Confidence intervals | Where a nominal 95% quietly delivers 86% |
| 06 | p-values and hypothesis tests | A real +5% lift, detected 23% of the time |
| 07 | Regression and R² | The two highest-R² datasets are the least trustworthy |
| 07·2 | Overfitting and adjusted R² | R² climbing on pure noise |
| 08 | Regression diagnostics | Four checks, and the repair that fixes three of them |
| 09 | Accuracy and the confusion matrix | "Always say no" scores 90.3% |
| + | Simpson's paradox | Colour grade reverses in five of five size bands |

## The data

Three real sources, cited on every page that uses them:

- **[UCI Online Retail](https://archive.ics.uci.edu/dataset/352/online+retail)** —
  541,909 line items from a UK online gift retailer, aggregated to 19,773 invoices.
- **Diamonds** — the 53,940-stone reference table shipped with ggplot2 and seaborn.
- **Old Faithful** — 272 consecutive eruptions (Azzalini & Bowman, 1990).

Downloads are cached locally and deliberately not committed, so a clean clone
re-fetches from the cited originals.

## Layout

    *.html *.js *.css     the pages, renderers, and generated data files
    docs/                 the built site — what GitHub Pages serves
    data/build_*.py       generate the data files from the raw sources
    data/measure_*.py     measure a claim BEFORE any prose is written about it
    verify_*.py           re-derive every published figure, independently

## Building and checking it yourself

Needs Python 3 with `numpy`, `scipy`, `pandas` and `openpyxl`, plus `node` for
the checks that run the shipped JavaScript outside a browser.

    # rebuild the data files and the site bundle
    cd data && python3 build_datasets.py && python3 build_site.py

    # re-derive every published figure from its raw source
    for v in ../verify_*.py; do python3 "$v" >/dev/null && echo "PASS $v"; done

    # serve locally
    python3 -m http.server 8000 --bind 127.0.0.1

## Design notes

- **Measure first.** No claim is written until a `data/measure_*.py` script shows
  it holds in the real data. This is the discipline that keeps the pages honest,
  and it is why several intended lessons were dropped.
- **Population versus sample.** Statistics are computed on full populations;
  scatter plots draw a seeded sample so they stay legible. Every panel states
  both counts, because measuring on 53,940 rows beside a picture of 1,200 is a
  mismatch that has already produced one wrong figure here.
- **Shared axes.** Where two panels compare, they share a scale and it is never
  rescaled — that comparison is usually the entire point of the page.
- **Motion is verified.** Easings, staggers and tweens come from one small
  module with its own tests, so nothing on screen is animated by frame counting.
- **Reduced motion is honoured.** Every page paints one correct static frame and
  starts no animation loop when the reader has asked for less movement.

## Licence

The code is MIT. The datasets belong to their cited owners and are not
redistributed here.
