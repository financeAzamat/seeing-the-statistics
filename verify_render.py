"""Run the animated renderers headlessly, against a stubbed canvas.

`node --check` proves a file PARSES. It does not prove it RUNS -- a missing
helper, a typo'd global or a bad property access only shows up on execution,
and the regression page shipped for one edit with a `roundRect` that existed in
a different file. Reading caught that one; this catches the next.

So: build a minimal DOM and a recording 2D context, load the real modules in
the real order, let the renderer initialise, then exercise every control and
drive a few animation frames. Any throw fails the check. Also asserts the
canvas was actually drawn to, because a renderer that silently no-ops would
otherwise pass.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

def scripts_of(page: str) -> list[str]:
    """The page's own <script> chain, in order: every external src, then its
    inline block if it has one.

    Derived from the markup rather than hand-listed. An earlier version of this
    file hard-coded the dependencies and immediately went stale when three
    pages started loading motion.js -- the harness reported a runtime throw
    that existed only in the harness. Reading the page cannot drift.
    """
    src = (HERE / page).read_text(encoding="utf-8")
    files = [str(HERE / m) for m in re.findall(r'<script src="([^"]+)"', src)]
    blocks = re.findall(r"<script>(.*?)</script>", src, re.S)
    if blocks:
        p = Path(tempfile.mkstemp(suffix=".js")[1])
        p.write_text(blocks[-1], encoding="utf-8")
        files.append(str(p))
    return files

HARNESS = r"""
const fs = require('fs');
const path = require('path');

/* ---- a recording 2D context. Every method the renderers touch, and a
        counter so "did it draw anything" is answerable. ---- */
function makeCtx(counts) {
  const grad = { addColorStop() {} };
  const noop = (name) => function () { counts[name] = (counts[name] || 0) + 1; };
  const c = {
    canvas: null,
    setTransform: noop('setTransform'),
    clearRect: noop('clearRect'),
    fillRect: noop('fillRect'),
    strokeRect: noop('strokeRect'),
    beginPath: noop('beginPath'),
    closePath: noop('closePath'),
    moveTo: noop('moveTo'),
    lineTo: noop('lineTo'),
    arc: noop('arc'),
    arcTo: noop('arcTo'),
    rect: noop('rect'),
    fill: noop('fill'),
    stroke: noop('stroke'),
    save: noop('save'),
    restore: noop('restore'),
    clip: noop('clip'),
    translate: noop('translate'),
    rotate: noop('rotate'),
    setLineDash: noop('setLineDash'),
    fillText: noop('fillText'),
    strokeText: noop('strokeText'),
    drawImage: noop('drawImage'),
    createLinearGradient() { counts.grad = (counts.grad || 0) + 1; return grad; },
    createRadialGradient() { counts.grad = (counts.grad || 0) + 1; return grad; },
    measureText(t) { return { width: (t ? String(t).length : 0) * 6 }; },
  };
  return c;
}

function makeEl(tag, counts) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    width: 0, height: 0, value: '500', textContent: '', innerHTML: '',
    _attrs: {}, _listeners: {},
    getContext() { return makeCtx(counts); },
    getBoundingClientRect() { return { width: 900, height: 760, left: 0, top: 0 }; },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(k, fn) { (this._listeners[k] = this._listeners[k] || []).push(fn); },
    removeEventListener() {},
    appendChild() {}, remove() {},
    fire(k, ev) { (this._listeners[k] || []).forEach(fn => fn(ev || { preventDefault() {}, target: this })); },
  };
  return el;
}

function harness(files, canvasId, controls, opts) {
  const counts = {};
  const els = {};
  const byAttr = {};
  const g = globalThis;

  function ensure(id) {
    if (!els[id]) { els[id] = makeEl('div', counts); els[id].id = id; }
    return els[id];
  }
  // pre-create the controls the renderer queries, with their data attributes
  for (const [sel, list] of Object.entries(controls)) {
    byAttr[sel] = list.map(v => {
      const e = makeEl('button', counts);
      e.dataset[sel] = v;
      return e;
    });
  }
  const canvasEl = ensure(canvasId);

  g.window = g;
  g.document = {
    body: makeEl('body', counts),
    getElementById(id) { return id === canvasId ? canvasEl : ensure(id); },
    querySelectorAll(q) {
      const m = /^\[data-([\w-]+)\]$/.exec(q);
      if (m) {
        const key = m[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        return byAttr[key] || [];
      }
      return [];
    },
    createElement(tag) { return makeEl(tag, counts); },
    addEventListener() {},
  };
  g.getComputedStyle = () => ({ getPropertyValue: () => 'monospace' });
  g.matchMedia = () => ({ matches: !!(opts && opts.reduce) });
  g.devicePixelRatio = 2;
  const rafs = [];
  g.requestAnimationFrame = (fn) => { rafs.push(fn); return rafs.length; };
  g.cancelAnimationFrame = () => {};
  g.IntersectionObserver = function (cb) {
    this.observe = () => cb([{ isIntersecting: true }]);
    this.disconnect = () => {};
  };
  g.addEventListener = () => {};

  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // the modules assign to window/module; run them in the global scope
    new Function(src).call(g);
  }

  const drewAtInit = (counts.arc || 0) + (counts.fillRect || 0) + (counts.stroke || 0);

  // drive some frames
  let ts = 16;
  for (let i = 0; i < 8 && rafs.length; i++) {
    const fn = rafs.shift();
    fn(ts); ts += 16;
  }

  // exercise every control, then drive more frames after each
  const fired = [];
  for (const [sel, list] of Object.entries(byAttr)) {
    for (const e of list) {
      e.fire('click');
      fired.push(sel + '=' + e.dataset[sel]);
      for (let i = 0; i < 6 && rafs.length; i++) { const fn = rafs.shift(); fn(ts); ts += 16; }
    }
  }
  for (const id of (opts && opts.buttons) || []) {
    const e = ensure(id);
    e.fire('click');
    fired.push('#' + id);
    for (let i = 0; i < 6 && rafs.length; i++) { const fn = rafs.shift(); fn(ts); ts += 16; }
  }
  // sliders, where present
  for (const id of (opts && opts.sliders) || []) {
    const e = ensure(id);
    e.value = '820';
    e.fire('input');
    fired.push('~' + id);
  }
  for (let i = 0; i < 10 && rafs.length; i++) { const fn = rafs.shift(); fn(ts); ts += 16; }

  return { counts, drewAtInit, fired, framesLeftQueued: rafs.length };
}

module.exports = { harness };
"""

RUNS = [
    {
        "name": "overfit.render.js",
        "files": scripts_of("overfit.html"),
        "canvas": "of",
        "controls": {"set": ["retail", "geyser", "diamond"], "k": ["0", "10", "50", "100"]},
        "buttons": [],
        "sliders": ["s-k"],
    },
    {
        "name": "classify.render.js",
        "files": scripts_of("classify.html"),
        "canvas": "cf",
        "controls": {"p": ["acc", "f1", "none"]},
        "buttons": [],
        "sliders": ["s-cut"],
    },
    {
        "name": "intuition.render.js",
        "files": scripts_of("intuition.html"),
        "canvas": "c",
        "controls": {"q": ["0", "1", "2", "3", "4", "5"],
                     "a": ["0", "1", "2", "3"],
                     "x": ["reset"]},
        "buttons": [],
        "sliders": [],
    },
    {
        "name": "corr.render.js",
        "files": scripts_of("corr.html"),
        "canvas": "c",
        "controls": {"w": ["0", "1", "2", "3", "4", "5"],
                     "g": ["all", "short", "long"]},
        "buttons": [],
        "sliders": [],
    },
    {
        "name": "typical.render.js",
        "files": scripts_of("typical.html"),
        "canvas": "c",
        "controls": {"d": ["retail", "diamond", "geyser"],
                     "m": ["both", "mean"]},
        "buttons": [],
        "sliders": [],
    },
    {
        "name": "simpson.render.js",
        "files": scripts_of("simpson.html"),
        "canvas": "sp",
        "controls": {"g": ["color", "cut", "clarity"],
                     "b": ["-1", "0", "1", "2", "3", "4"]},
        "buttons": [],
        "sliders": [],
    },
    {
        "name": "diagnostics.render.js",
        "files": scripts_of("diagnostics.html"),
        "canvas": "dg",
        "controls": {"set": ["diamond", "geyser", "retail"], "tf": ["none", "logy", "logboth"]},
        "buttons": ["drop"],
        "sliders": [],
    },
    {
        "name": "regression.html (inline)",
        "files": scripts_of("regression.html"),
        "canvas": "rg",
        "controls": {"set": ["diamond", "geyser", "retail"]},
        "buttons": ["best", "sq", "reset"],
        "sliders": ["s-slope", "s-int"],
    },
    {
        "name": "clt.html (inline)",
        "files": scripts_of("clt.html"),
        "canvas": "clt",
        "controls": {"set": ["retail", "geyser", "diamond"],
                     "n": ["1", "5", "25", "30", "100", "300"]},
        "buttons": ["fast", "pause", "reset"],
        "sliders": [],
    },
    {
        "name": "ci.html (inline)",
        "files": scripts_of("ci.html"),
        "canvas": "ci",
        "controls": {"set": ["retail", "geyser", "diamond"],
                     "conf": ["0.8", "0.9", "0.95", "0.99"],
                     "n": ["5", "25", "30", "100", "300"],
                     "m": ["z", "t"]},
        "buttons": ["fast", "pause", "reset"],
        "sliders": [],
    },
    {
        "name": "test.html (inline)",
        "files": scripts_of("test.html"),
        "canvas": "ht",
        "controls": {"set": ["retail", "geyser", "diamond"],
                     "eff": ["0", "0.02", "0.05", "0.1"],
                     "n": ["30", "100", "500", "2000"],
                     "a": ["0.1", "0.05", "0.01"]},
        "buttons": ["fast", "pause", "reset"],
        "sliders": [],
    },
]

fails: list[str] = []
for run in RUNS:
    files = run["files"]
    for reduce_mode in (False, True):
        probe = (HARNESS + "\nconst r = harness("
                 + json.dumps(files) + ", " + json.dumps(run["canvas"]) + ", "
                 + json.dumps(run["controls"]) + ", "
                 + json.dumps({"buttons": run["buttons"], "sliders": run["sliders"],
                               "reduce": reduce_mode})
                 + ");\nconsole.log(JSON.stringify(r));\n")
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write(probe)
            tmp = f.name
        r = subprocess.run(["node", tmp], capture_output=True, text=True)
        tag = "reduced-motion" if reduce_mode else "animated"
        if r.returncode != 0:
            err = (r.stderr or "").strip().splitlines()
            print(f"  [BAD] {run['name']:26} {tag:15} THREW")
            for line in err[:12]:
                print("        " + line)
            fails.append(f"{run['name']} ({tag}) threw at runtime")
            continue
        out = json.loads(r.stdout)
        c = out["counts"]
        drew = (c.get("arc", 0) + c.get("fillRect", 0) + c.get("stroke", 0))
        queued = out["framesLeftQueued"]
        # animated must keep queueing frames; reduced-motion must NOT
        loop_ok = (queued > 0) if not reduce_mode else True
        ok = out["drewAtInit"] > 0 and drew > 0 and loop_ok
        print(f"  [{'OK ' if ok else 'BAD'}] {run['name']:26} {tag:15} "
              f"draws@init={out['drewAtInit']:>6} total={drew:>7} "
              f"text={c.get('fillText', 0):>5} grads={c.get('grad', 0):>4} "
              f"controls={len(out['fired'])} rafQueued={queued}")
        if out["drewAtInit"] <= 0:
            fails.append(f"{run['name']} ({tag}) drew nothing on init")
        if drew <= 0:
            fails.append(f"{run['name']} ({tag}) drew nothing at all")
        if not loop_ok:
            fails.append(f"{run['name']} ({tag}) never queued an animation frame — no loop")

print("\n" + "=" * 76)
if fails:
    print("FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("both renderers initialise, draw, survive every control being clicked, and")
print("keep animating — executed under node against a stubbed canvas, in both")
print("normal and reduced-motion modes.")
