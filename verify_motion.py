"""Verify motion.js -- the timing layer both animated pages depend on.

Animation bugs are the hardest kind to see and the easiest kind to assert, so
the invariants are checked rather than eyeballed:

  * every easing satisfies f(0) = 0 and f(1) = 1 exactly;
  * every easing NOT declared as overshooting stays inside [0, 1] -- using one
    that leaves the range on a bar width or an alpha is a real defect;
  * every easing is monotone (except the declared overshooters), so nothing
    visibly reverses direction mid-move;
  * a Tween lands exactly on its target and stops;
  * retargeting a Tween mid-flight starts from where it actually is, rather
    than snapping back;
  * stagger reaches EXACTLY 1.0 for every particle at global progress 1. If
    the last particle stops at 0.999 the morph leaves points short of their
    destination and the scatter is quietly wrong.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

probe = f"""
const M = require({str(HERE / 'motion.js')!r});
const N = 401;
const out = {{ easings: {{}}, overshoots: Object.keys(M.OVERSHOOTS) }};
for (const [name, fn] of Object.entries(M.ease)) {{
  const ys = [];
  for (let i = 0; i < N; i++) ys.push(fn(i / (N - 1)));
  out.easings[name] = ys;
}}

// a tween must land exactly and stop
const t = new M.Tween(10, 20, 0.5, M.ease.cubicOut);
const trace = [];
for (let i = 0; i < 40; i++) {{ t.step(0.02); trace.push(t.v); }}
out.tween = {{ final: t.v, done: t.done, monotone: trace.every((v, i) => i === 0 || v >= trace[i-1] - 1e-12) }};

// retargeting mid-flight must continue from the current value
const r = new M.Tween(0, 100, 1.0, M.ease.linear);
r.step(0.5);
const mid = r.v;
r.to(0, 1.0);
r.step(0.0);
out.retarget = {{ mid: mid, afterRetargetStart: r.v }};
for (let i = 0; i < 60; i++) r.step(0.02);
out.retarget.final = r.v;

// stagger: at p = 1 every particle must be exactly 1
const n = 800, spreads = [0, 0.25, 0.6, 0.9];
out.stagger = {{}};
for (const s of spreads) {{
  let minAtOne = 1, maxAtZero = 0, anyOutside = false, nonMono = 0;
  for (let i = 0; i < n; i++) {{
    const at1 = M.stagger(i, n, s, 1.0);
    const at0 = M.stagger(i, n, s, 0.0);
    if (at1 < minAtOne) minAtOne = at1;
    if (at0 > maxAtZero) maxAtZero = at0;
    let prev = -1;
    for (let k = 0; k <= 20; k++) {{
      const v = M.stagger(i, n, s, k / 20);
      if (v < -1e-12 || v > 1 + 1e-12) anyOutside = true;
      if (v < prev - 1e-12) nonMono++;
      prev = v;
    }}
  }}
  out.stagger[s] = {{ minAtOne, maxAtZero, anyOutside, nonMono }};
}}
// the last particle must not finish before the global progress does
out.staggerOrder = {{
  firstAtHalf: M.stagger(0, n, 0.6, 0.5),
  lastAtHalf: M.stagger(n - 1, n, 0.6, 0.5),
}};
out.clamp = [M.clamp01(-5), M.clamp01(0.3), M.clamp01(9)];
out.lerp = [M.lerp(0, 10, 0), M.lerp(0, 10, 0.25), M.lerp(0, 10, 1)];
// breathe: three multipliers from one phase. All must stay strictly positive
// (a negative radius throws; a negative glow silently inverts the bloom) and
// average to 1 over a full period, or the field drifts brighter or dimmer.
out.breathe = {{}};
for (const amp of [0, 0.5, 1, 1.9]) {{
  const rs = [], as = [], gs = [];
  const STEPS = 2000;
  for (let i = 0; i < STEPS; i++) {{
    const b = M.breathe(i * (2 * Math.PI / STEPS), 0.7, 1, amp);
    rs.push(b.r); as.push(b.a); gs.push(b.g);
  }}
  const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
  out.breathe[amp] = {{
    rMin: Math.min(...rs), rMax: Math.max(...rs), rMean: mean(rs),
    aMin: Math.min(...as), aMax: Math.max(...as), aMean: mean(as),
    gMin: Math.min(...gs), gMax: Math.max(...gs), gMean: mean(gs),
  }};
}}
// amp is clamped, so an out-of-range request must not produce a negative glow
out.breatheClamped = M.breathe(Math.PI * 1.5, 0, 1, 99).g;
out.BREATHE = M.BREATHE;
console.log(JSON.stringify(out));
"""

with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
    f.write(probe)
    tmp = f.name
r = subprocess.run(["node", tmp], capture_output=True, text=True)
if r.returncode != 0:
    print("node failed:\n" + r.stderr)
    sys.exit(1)
g = json.loads(r.stdout)
fails: list[str] = []

print("easings — endpoints, range and monotonicity:")
over = set(g["overshoots"])
for name, ys in g["easings"].items():
    f0, f1 = ys[0], ys[-1]
    lo, hi = min(ys), max(ys)
    mono = all(ys[i] >= ys[i - 1] - 1e-12 for i in range(1, len(ys)))
    inrange = lo >= -1e-12 and hi <= 1 + 1e-12
    if name in over:
        # An overshooting ease goes ABOVE 1 and comes back, so it is not
        # monotone by definition -- requiring that of it was this test being
        # wrong about the spec, not the code being wrong. What it must still
        # guarantee: exact endpoints, no dip below the start, and a bounded
        # overshoot, because an unbounded one throws a particle off screen.
        ok = abs(f0) < 1e-12 and abs(f1 - 1) < 1e-12 and lo >= -1e-12 and hi <= 1.25
        tag = f" (overshoots to {hi:.3f}, monotonicity not required)"
    else:
        ok = abs(f0) < 1e-12 and abs(f1 - 1) < 1e-12 and inrange and mono
        tag = ""
    print(f"  {name:12} f(0)={f0:+.1e} f(1)={f1:.12f} range=[{lo:+.4f},{hi:+.4f}] "
          f"mono={mono}{tag}  {'OK' if ok else 'BAD'}")
    if abs(f0) > 1e-12:
        fails.append(f"ease.{name}(0) = {f0}, must be 0")
    if abs(f1 - 1) > 1e-12:
        fails.append(f"ease.{name}(1) = {f1}, must be 1")
    if lo < -1e-12:
        fails.append(f"ease.{name} dips below 0 (min {lo})")
    if name in over:
        if hi > 1.25:
            fails.append(f"ease.{name} overshoots to {hi}, beyond the 1.25 bound")
    else:
        if not mono:
            fails.append(f"ease.{name} is not monotone but is not declared overshooting")
        if not inrange:
            fails.append(f"ease.{name} leaves [0,1] but is not declared overshooting")

print("\ntween:")
t = g["tween"]
print(f"  lands on target: {t['final']} (want 20)   done={t['done']}   monotone={t['monotone']}")
if abs(t["final"] - 20) > 1e-12:
    fails.append(f"tween finished at {t['final']}, not its target")
if not t["done"]:
    fails.append("tween did not report done after its duration")
if not t["monotone"]:
    fails.append("tween reversed direction with a monotone easing")

rt = g["retarget"]
print(f"  retarget: mid={rt['mid']:.3f} restarts from {rt['afterRetargetStart']:.3f} "
      f"then reaches {rt['final']:.3f}")
if abs(rt["afterRetargetStart"] - rt["mid"]) > 1e-9:
    fails.append("retargeting a tween snapped instead of continuing from its value")
if abs(rt["final"]) > 1e-9:
    fails.append(f"retargeted tween finished at {rt['final']}, not 0")

print("\nstagger — every particle must reach exactly 1 at global progress 1:")
for s, d in g["stagger"].items():
    ok = abs(d["minAtOne"] - 1) < 1e-12 and d["maxAtZero"] < 1e-12 \
         and not d["anyOutside"] and d["nonMono"] == 0
    print(f"  spread={s:<5} min at p=1: {d['minAtOne']:.12f}   max at p=0: "
          f"{d['maxAtZero']:.1e}   outside range: {d['anyOutside']}   "
          f"reversals: {d['nonMono']}   {'OK' if ok else 'BAD'}")
    if abs(d["minAtOne"] - 1) > 1e-12:
        fails.append(f"stagger spread={s}: a particle only reaches {d['minAtOne']} at p=1")
    if d["maxAtZero"] > 1e-12:
        fails.append(f"stagger spread={s}: a particle starts above 0 at p=0")
    if d["anyOutside"]:
        fails.append(f"stagger spread={s} leaves [0,1]")
    if d["nonMono"]:
        fails.append(f"stagger spread={s} reverses {d['nonMono']} times")

o = g["staggerOrder"]
print(f"  ordering at p=0.5 with spread 0.6: first={o['firstAtHalf']:.3f} "
      f"last={o['lastAtHalf']:.3f} (first must lead)")
if not o["firstAtHalf"] > o["lastAtHalf"]:
    fails.append("stagger does not actually stagger: the first particle is not ahead")

print(f"\nclamp01(-5, 0.3, 9) = {g['clamp']}   lerp(0,10, 0/.25/1) = {g['lerp']}")
if g["clamp"] != [0, 0.3, 1]:
    fails.append(f"clamp01 wrong: {g['clamp']}")
if g["lerp"] != [0, 2.5, 10]:
    fails.append(f"lerp wrong: {g['lerp']}")

print("\nbreathe — pulse multipliers must stay positive and average to 1:")
for amp, d in g["breathe"].items():
    ok = (d["rMin"] > 0 and d["aMin"] > 0 and d["gMin"] > 0
          and abs(d["rMean"] - 1) < 2e-3 and abs(d["aMean"] - 1) < 2e-3
          and abs(d["gMean"] - 1) < 2e-3)
    print(f"  amp={amp:<4} radius [{d['rMin']:.3f},{d['rMax']:.3f}] mean {d['rMean']:.4f}   "
          f"alpha [{d['aMin']:.3f},{d['aMax']:.3f}]   glow [{d['gMin']:.3f},{d['gMax']:.3f}]"
          f"   {'OK' if ok else 'BAD'}")
    for name, key in (("radius", "r"), ("alpha", "a"), ("glow", "g")):
        if d[key + "Min"] <= 0:
            fails.append(f"breathe amp={amp}: {name} reaches {d[key + 'Min']}, must stay > 0")
        if abs(d[key + "Mean"] - 1) >= 2e-3:
            fails.append(f"breathe amp={amp}: {name} averages {d[key + 'Mean']}, must be 1")
# the glow must breathe harder than the radius, which is what reads as a pulse
b = g["BREATHE"]
print(f"  amplitudes: glow {b['g']} > radius {b['r']} > alpha {b['a']}  "
      f"(glow must lead)")
if not (b["g"] > b["r"] > b["a"]):
    fails.append("breathe amplitudes are not ordered glow > radius > alpha")
print(f"  amp clamping: breathe(..., amp=99).g = {g['breatheClamped']:.4f} (must be > 0)")
if g["breatheClamped"] <= 0:
    fails.append("breathe does not clamp amp: an extreme request produced a non-positive glow")

print("\n" + "=" * 68)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("motion.js: every easing is well-formed and monotone, overshooting ones are")
print("declared, tweens land exactly and retarget from their current value, and")
print("stagger reaches exactly 1 for all 800 particles at every spread tested.")
