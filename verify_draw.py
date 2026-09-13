"""Verify draw.js: that every primitive runs, and that the grade ramp is
actually distinguishable.

The ramp was replaced because the old one lerped coral straight to cyan and the
middle of a 7-step scale landed on desaturated pink-grey -- three grades that
looked identical on screen. "Are these colours different enough" is a
measurable question, so it is measured here rather than eyeballed: every pair
of steps is compared in CIE Lab (CIE76 dE), and adjacent steps must clear a
threshold that corresponds to an obvious difference side by side.

Also exercises the primitives under node against a stub context, because a
canvas helper that throws on an edge case (a zero-width panel, an empty label)
fails silently in the browser and takes the whole frame with it.
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

PROBE = r"""
const DR = require(PATH);

/* a stub 2D context that records what it was asked to do */
function stub(counts) {
  const grad = { addColorStop() {} };
  const bump = k => () => { counts[k] = (counts[k] || 0) + 1; };
  return {
    setTransform: bump('setTransform'), clearRect: bump('clearRect'),
    fillRect: bump('fillRect'), strokeRect: bump('strokeRect'),
    beginPath: bump('beginPath'), closePath: bump('closePath'),
    moveTo: bump('moveTo'), lineTo: bump('lineTo'),
    arc: bump('arc'), arcTo: bump('arcTo'), rect: bump('rect'),
    fill: bump('fill'), stroke: bump('stroke'),
    save: bump('save'), restore: bump('restore'), clip: bump('clip'),
    translate: bump('translate'), rotate: bump('rotate'),
    setLineDash: bump('setLineDash'),
    fillText: bump('fillText'), drawImage: bump('drawImage'),
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    measureText(t) { return { width: (t ? String(t).length : 0) * 6 }; },
    set globalAlpha(v) { counts.alphas = counts.alphas || []; counts.alphas.push(v); },
    get globalAlpha() { return 1; },
  };
}
globalThis.document = {
  body: {},
  createElement() {
    return { width: 0, height: 0, getContext() { return stub({}); } };
  },
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'monospace' });

const out = { ramp: {}, calls: {} };

/* the ramp, at every scale length the pages use */
for (const n of [2, 5, 7, 8]) {
  const cols = [];
  for (let i = 0; i < n; i++) cols.push(DR.kit(stub({})).gradeColour(i, n));
  out.ramp[n] = cols;
}

/* the rim must actually draw an extra circle */
let c1 = {}, c2 = {};
DR.kit(stub(c1)).dot(10, 10, 3, [200, 100, 100], 0.8, 0, 0);
DR.kit(stub(c2)).dot(10, 10, 3, [200, 100, 100], 0.8, 0, 1.2);
out.calls.arcsNoRim = c1.arc || 0;
out.calls.arcsWithRim = c2.arc || 0;

/* alpha must be clamped even when a pulse pushes it over 1 */
let c3 = {};
const k3 = DR.kit(stub(c3));
k3.dot(0, 0, 2, [1, 2, 3], 1.4, 0.5, 1);
k3.dot(0, 0, 2, [1, 2, 3], -0.3, 0, 0);
out.calls.alphas = c3.alphas;

/* every primitive, including the degenerate cases that would throw */
let c4 = {};
const k4 = DR.kit(stub(c4));
k4.roundRect(0, 0, 4, 4, 99);          // radius larger than the box
k4.roundRect(0, 0, 0, 0, 3);           // zero size
k4.tracked('', 0, 0, 10, '#fff', 2, 'left');
k4.tracked('ABC', 0, 0, 10, '#fff', 2, 'center');
k4.tracked('ABC', 0, 0, 10, '#fff', 2, 'right');
k4.pill('PASS', 100, 10, [1, 2, 3], true);
k4.pill('N/A', 100, 10, [1, 2, 3], false);
k4.panel(0, 0, 200, 100, 'title', 'FAIL', [1, 2, 3], 'note', () => {});
k4.panel(0, 0, 10, 10, 'x', null, null, null, null);   // no callback, tiny
out.calls.tick = [k4.tickStep(100), k4.tickStep(1), k4.tickStep(0), k4.tickStep(-5)];
out.calls.fmt = [k4.fmtNum(0.123), k4.fmtNum(5.5), k4.fmtNum(1234), k4.fmtNum(45678),
                 k4.fmtNum(3e6)];
out.calls.primitivesRan = c4;
console.log(JSON.stringify(out));
"""

probe = PROBE.replace("PATH", json.dumps(str(HERE / "draw.js")))
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(probe)
    tmp = f.name
r = subprocess.run(["node", tmp], capture_output=True, text=True)
if r.returncode != 0:
    print("draw.js threw under node:\n" + r.stderr)
    sys.exit(1)
g = json.loads(r.stdout)
fails: list[str] = []


# ---------------------------------------------------------------- colour maths
def srgb_to_lab(rgb):
    def lin(u):
        u /= 255.0
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    r_, g_, b_ = (lin(v) for v in rgb)
    x = r_ * 0.4124564 + g_ * 0.3575761 + b_ * 0.1804375
    y = r_ * 0.2126729 + g_ * 0.7151522 + b_ * 0.0721750
    z = r_ * 0.0193339 + g_ * 0.1191920 + b_ * 0.9503041
    xn, yn, zn = 0.95047, 1.0, 1.08883

    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (841 / 108) * t + 4 / 29
    fx, fy, fz = f(x / xn), f(y / yn), f(z / zn)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def de76(a, b):
    la, lb = srgb_to_lab(a), srgb_to_lab(b)
    return math.sqrt(sum((la[i] - lb[i]) ** 2 for i in range(3)))


def chroma(rgb):
    _, a, b = srgb_to_lab(rgb)
    return math.sqrt(a * a + b * b)


# thresholds: dE 2.3 is a just-noticeable difference, so 10 for ADJACENT steps
# is "obviously different when placed side by side", which is the actual
# requirement -- a reader has to tell two grades apart in a legend.
ADJ_MIN, ANY_MIN, CHROMA_MIN = 10.0, 10.0, 18.0
print(f"grade ramp — CIE76 dE between steps (adjacent ≥ {ADJ_MIN}, any pair ≥ {ANY_MIN}, "
      f"chroma ≥ {CHROMA_MIN}):")
for n, cols in g["ramp"].items():
    adj = [de76(cols[i], cols[i + 1]) for i in range(len(cols) - 1)]
    allp = [de76(cols[i], cols[j]) for i in range(len(cols))
            for j in range(i + 1, len(cols))]
    ch = [chroma(c) for c in cols]
    ok = (min(adj) >= ADJ_MIN and min(allp) >= ANY_MIN and min(ch) >= CHROMA_MIN)
    print(f"  n={n:<2} adjacent min {min(adj):6.2f}   any-pair min {min(allp):6.2f}   "
          f"weakest chroma {min(ch):6.2f}   {'OK' if ok else 'BAD'}")
    if min(adj) < ADJ_MIN:
        fails.append(f"ramp n={n}: two adjacent grades only dE {min(adj):.2f} apart")
    if min(allp) < ANY_MIN:
        fails.append(f"ramp n={n}: two grades only dE {min(allp):.2f} apart")
    if min(ch) < CHROMA_MIN:
        fails.append(f"ramp n={n}: a step has chroma {min(ch):.1f} — washed out, "
                     f"which is the defect the ramp was replaced to fix")

# The ramp must read as an ORDERED scale, and the invariant for that is a
# monotone HUE ROTATION -- the hue angle sweeps one way without doubling back.
# An earlier version of this check tested b* (the yellow-blue axis) instead,
# which no ramp routing through yellow can satisfy: b* necessarily rises into
# the yellow and falls out of it. That was the check asserting the wrong
# property, not the ramp being disordered. Lightness is reported alongside for
# information; it is not required to be monotone.
def hue_deg(rgb):
    _, a, b = srgb_to_lab(rgb)
    return math.degrees(math.atan2(b, a))


for n, cols in g["ramp"].items():
    # Two colours cannot double back, and the unwrap direction is genuinely
    # ambiguous with no intermediate to disambiguate it, so the monotonicity
    # question is meaningless below three steps. Distinguishability is still
    # checked above, where n=2 scores dE 102.
    if len(cols) < 3:
        print(f"  n={n:<2} hue monotonicity not applicable to a two-colour scale")
        continue
    hs = [hue_deg(c) for c in cols]
    # unwrap so a sweep past 180 degrees does not read as a reversal
    unwrapped = [hs[0]]
    for h in hs[1:]:
        prev = unwrapped[-1]
        while h < prev - 180:
            h += 360
        while h > prev + 180:
            h -= 360
        unwrapped.append(h)
    mono = all(unwrapped[i + 1] >= unwrapped[i] - 1e-9 for i in range(len(unwrapped) - 1))
    span = unwrapped[-1] - unwrapped[0]
    ls = [srgb_to_lab(c)[0] for c in cols]
    print(f"  n={n:<2} hue sweeps {unwrapped[0]:6.1f}° → {unwrapped[-1]:6.1f}° "
          f"({span:+6.1f}°, monotone: {'yes' if mono else 'NO'})   "
          f"L* {min(ls):.0f}–{max(ls):.0f}   {'OK' if mono and span > 60 else 'BAD'}")
    if not mono:
        fails.append(f"ramp n={n}: the hue doubles back, so it does not read as an "
                     f"ordered scale")
    if abs(span) <= 60:
        fails.append(f"ramp n={n}: hue only sweeps {span:.1f}° — too little rotation "
                     f"to signal an ordering")

# ---------------------------------------------------------------- primitives
c = g["calls"]
print(f"\nrim draws an extra circle: {c['arcsNoRim']} arc(s) without, "
      f"{c['arcsWithRim']} with")
if c["arcsWithRim"] != c["arcsNoRim"] + 1:
    fails.append("the rim argument did not add a circle")

al = c["alphas"]
print(f"alpha values assigned: {al}  (all must be within [0,1])")
if any(v < 0 or v > 1 for v in al):
    fails.append(f"globalAlpha assigned outside [0,1]: {al}")

print(f"tickStep(100, 1, 0, -5) = {c['tick']}")
if any(v <= 0 for v in c["tick"]):
    fails.append(f"tickStep returned a non-positive step: {c['tick']}")
print(f"fmtNum samples            = {c['fmt']}")

ran = c["primitivesRan"]
need = ("arcTo", "fill", "stroke", "fillText", "beginPath")
missing = [k for k in need if not ran.get(k)]
print(f"primitives exercised without throwing: {sorted(k for k in ran if k != 'alphas')}")
if missing:
    fails.append(f"primitives never drew: {missing}")

print("\n" + "=" * 72)
if fails:
    print("FAILURES:")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("draw.js runs every primitive including degenerate boxes and empty labels,")
print("clamps alpha, adds a circle for the rim, and its grade ramp keeps every")
print("step measurably distinguishable and monotone from warm to cool.")
