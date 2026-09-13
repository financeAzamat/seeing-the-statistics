/* ============================================================
   Motion. The shared timing layer for the course pages.
   ------------------------------------------------------------
   Written because two of the five pages had NO animation loop at
   all -- they painted once on an event and then sat there, which
   is exactly why they read as flat next to the others.

   Three things live here and nothing else:

     Ticker   one requestAnimationFrame loop per page, with the
              frame delta clamped so a backgrounded tab does not
              come back and jump every animation to its end.

     Tween    a scalar that walks from a to b over a duration.
              Everything on screen that moves is driven by one of
              these, so nothing is animated by frame counting.

     stagger  remaps a global 0..1 progress into a per-particle
              progress, so 800 points arrive as a sweep instead of
              a single snap. This is the whole reason a morph reads
              as motion rather than as a jump cut.

   DOM-free and exported through both `window` and
   `module.exports`, so verify_motion.py can check the easings and
   the stagger algebra under node. An easing that overshoots 0..1
   where it should not, or a stagger that leaves the last particle
   short of 1, produces a visual bug that is very hard to see and
   trivial to assert.
   ============================================================ */
(function (root) {
  'use strict';

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Easings. All of them satisfy f(0)=0 and f(1)=1; the ones that
     deliberately leave [0,1] in the middle are named so, because using an
     overshooting ease on a position that must not overshoot (a bar width, an
     alpha) is a real defect rather than a taste question. */
  var ease = {
    linear:   function (t) { return t; },
    quadOut:  function (t) { return 1 - (1 - t) * (1 - t); },
    cubicOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    quintOut: function (t) { return 1 - Math.pow(1 - t, 5); },
    cubicInOut: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    expoOut:  function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    sineInOut: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    // overshoots above 1 near the end. Safe for positions, NOT for widths.
    backOut:  function (t) {
      var c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };
  var OVERSHOOTS = { backOut: true };

  /* A scalar walking from `from` to `to`. `step(dt)` advances it; `v` is the
     eased value; `done` is true once the clock has run out. Retargeting mid
     flight is the common case (a control clicked while something is already
     moving), so `to()` restarts from wherever the value currently is instead
     of snapping. */
  function Tween(from, to, dur, easing) {
    this._a = from; this._b = to;
    this._d = Math.max(1e-6, dur || 0.4);
    this._t = 0;
    this._e = easing || ease.cubicOut;
    this.done = false;
    this.v = from;
  }
  Tween.prototype.step = function (dt) {
    if (this.done) return this.v;
    this._t += dt;
    var p = clamp01(this._t / this._d);
    this.v = lerp(this._a, this._b, this._e(p));
    if (p >= 1) { this.done = true; this.v = this._b; }
    return this.v;
  };
  Tween.prototype.to = function (b, dur, easing) {
    this._a = this.v; this._b = b;
    this._d = Math.max(1e-6, dur === undefined ? this._d : dur);
    this._t = 0; this.done = false;
    if (easing) this._e = easing;
    return this;
  };
  Tween.prototype.set = function (b) {
    this._a = this._b = this.v = b; this._t = 0; this.done = true;
    return this;
  };

  /* Per-particle progress. `spread` is the share of the timeline given over to
     the arrival order: 0 means every particle moves together, 0.6 means the
     last one only starts when the global progress is 0.6.

     The invariant that matters: at p = 1 EVERY particle must read exactly 1,
     or the morph leaves points short of their destination and the scatter is
     quietly wrong. Asserted in verify_motion.py. */
  function stagger(i, n, spread, p) {
    if (n <= 1 || spread <= 0) return clamp01(p);
    var s = clamp01(spread);
    var start = s * (i / (n - 1));
    return clamp01((p - start) / (1 - s));
  }

  /* One RAF loop. dt is clamped to 50ms: a tab that was in the background for
     a minute must not deliver a 60-second delta and finish every tween at
     once. `visible` is set from outside (an IntersectionObserver on the
     canvas), because an off-screen canvas has no business burning frames. */
  function Ticker(onFrame) {
    var last = 0, raf = 0, self = this;
    this.visible = true;
    this.running = false;
    function frame(ts) {
      if (!self.running) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      if (self.visible) onFrame(dt, ts / 1000);
      raf = requestAnimationFrame(frame);
    }
    this.start = function () {
      if (self.running) return;
      self.running = true; last = 0;
      raf = requestAnimationFrame(frame);
    };
    this.stop = function () {
      self.running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
  }

  /* ---- breathe: one phase in, three correlated multipliers out.
         A particle "pulsates" when its SIZE and its HALO move, not just its
         opacity -- an alpha-only twinkle reads as noise on a static dot. The
         glow breathes hardest (0.5) against a modest radius (0.17) and a
         barely-there alpha (0.12), because the halo is what the eye reads as
         a pulse while the core stays legible as a data point.

         All three are centred on 1 and every one stays strictly positive for
         amp up to 1.9 -- a negative radius throws, and a negative glow would
         silently invert the bloom. Bounds asserted in verify_motion.py.

         Pass a per-particle `phase` AND vary `speed` per particle: a shared
         speed makes 800 dots beat like one heart, which looks mechanical. ---- */
  var BR_R = 0.17, BR_A = 0.12, BR_G = 0.50, BR_AMP_MAX = 1.9;
  function breathe(now, phase, speed, amp) {
    var a = amp === undefined ? 1 : Math.min(BR_AMP_MAX, Math.max(0, amp));
    var w = Math.sin(now * (speed === undefined ? 1 : speed) + (phase || 0));
    return { w: w, r: 1 + BR_R * a * w, a: 1 + BR_A * a * w, g: 1 + BR_G * a * w };
  }

  var API = { ease: ease, OVERSHOOTS: OVERSHOOTS, Tween: Tween,
              stagger: stagger, Ticker: Ticker, lerp: lerp, clamp01: clamp01,
              breathe: breathe,
              BREATHE: { r: BR_R, a: BR_A, g: BR_G, ampMax: BR_AMP_MAX } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.UDJ_MOTION = API;
})(typeof window !== 'undefined' ? window : null);
