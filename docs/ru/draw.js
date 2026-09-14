/* ============================================================
   The drawing kit. Shared canvas primitives and the palette.
   ------------------------------------------------------------
   Pulled out when a third and fourth page needed the same bloom
   sprites, pills and tracked captions that had already been
   written twice. Triplicating them would have guaranteed they
   drifted.

   `UDJ_DRAW.kit(ctx)` returns the primitives bound to one 2D
   context. The palette is the brief's and nothing neon:
   deep black ground, blue-white starlight, soft cyan as the one
   accent, warm gold for the object under discussion, coral only
   for a genuine failure.

   Deliberately DOM-light -- it touches `document.createElement`
   only to bake bloom sprites -- so verify_draw.py can exercise
   every primitive under node against a stub context.
   ============================================================ */
(function (root) {
  'use strict';

  var PAL = {
    COOL:  [186, 214, 255],   // blue-white starlight
    CYAN:  [138, 224, 244],   // the accent
    GOLD:  [255, 196, 116],   // the object under discussion
    RED:   [255, 107,  98],   // a real failure, never decoration
    VIO:   [150, 142, 224],
    DEEP:  [ 84, 132, 196],
    PALE:  [196, 228, 255],
    GREY:  [116, 134, 159],
    TAU:   6.283185307,
  };

  function kit(ctx) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    try {
      var v = getComputedStyle(document.body).getPropertyValue('--font-mono');
      if (v) MONO = v.trim();
    } catch (e) { /* no DOM: keep the default stack */ }

    /* Built up front and returned at the end, so the primitives can refer to
       the kit itself if they need to. */
    var api = {};

    var SPR = new Map();
    /* A bloom sprite per colour, baked once. A per-particle
       createRadialGradient costs more than every dot in the frame combined --
       this is the one optimisation these pages genuinely need. */
    function bloom(c) {
      var k = c.join(',');
      if (SPR.has(k)) return SPR.get(k);
      var s = 64, el = document.createElement('canvas');
      el.width = el.height = s;
      var g = el.getContext('2d');
      var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      rg.addColorStop(0.00, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.55)');
      rg.addColorStop(0.16, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.24)');
      rg.addColorStop(0.48, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.06)');
      rg.addColorStop(1.00, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      g.fillStyle = rg; g.fillRect(0, 0, s, s);
      SPR.set(k, el);
      return el;
    }

    /* alpha is CLAMPED: assigning globalAlpha outside [0,1] is ignored per
       spec, which silently keeps the previous value once a pulse lifts it
       past 1. That defect shipped once already.

       `rim` draws a dark ring under the dot before the core goes down. In a
       dense scatter that ring is what makes 900 overlapping points read as
       900 objects instead of one pale smear -- far more effective than making
       the dots smaller, and it costs one extra arc. Leave it at 0 for a
       sparse particle field, where there is nothing to separate and the ring
       only eats the glow. */
    function dot(x, y, r, c, a, glow, rim) {
      var rr = Math.max(0.1, r);
      if (glow > 0) {
        var s = bloom(c), sz = rr * glow * 9;
        ctx.globalAlpha = Math.min(1, Math.max(0, a * 0.95));
        ctx.drawImage(s, x - sz / 2, y - sz / 2, sz, sz);
      }
      if (rim > 0) {
        ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
        ctx.fillStyle = 'rgba(4,6,11,0.88)';
        ctx.beginPath(); ctx.arc(x, y, rr + rim, 0, PAL.TAU); ctx.fill();
      }
      ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      ctx.beginPath(); ctx.arc(x, y, rr, 0, PAL.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

    function roundRect(x, y, w, h, r) {
      var rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    /* Canvas has no letter-spacing, and the caption tier in this design IS its
       tracking, so it is drawn a glyph at a time. Returns the width so a
       caller can lay something out after it. */
    function tracked(text, x, y, px, colour, track, align) {
      ctx.font = '700 ' + px + 'px ' + MONO;
      var chars = String(text).split(''), w = 0, i;
      for (i = 0; i < chars.length; i++) w += ctx.measureText(chars[i]).width + track;
      w -= track;
      var cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      ctx.fillStyle = colour; ctx.textAlign = 'left';
      for (i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], cx, y);
        cx += ctx.measureText(chars[i]).width + track;
      }
      return w;
    }

    /* A verdict pill. `rx` is its RIGHT edge, so a caller can pin it to a
       panel's right margin without measuring first. */
    function pill(text, rx, ry, c, filled) {
      ctx.font = '700 9px ' + MONO;
      var tw = ctx.measureText(String(text)).width + 3 * (String(text).length - 1);
      var w = tw + 14, h = 15, x = rx - w, y = ry;
      if (filled) {
        ctx.globalAlpha = 0.22;
        ctx.drawImage(bloom(c), x - 10, y - 10, w + 20, h + 20);
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(c, 1);
        roundRect(x, y, w, h, 7.5); ctx.fill();
        tracked(text, x + 7, y + h / 2 + 3.5, 9, 'rgba(5,7,13,.92)', 3, 'left');
      } else {
        ctx.strokeStyle = rgba(c, 0.45); ctx.lineWidth = 1;
        roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 7.5); ctx.stroke();
        tracked(text, x + 7, y + h / 2 + 3.5, 9, rgba(c, 0.95), 3, 'left');
      }
      return w;
    }

    /* A framed panel with a tracked title, an optional pill and a subtitle.
       The plot rect is handed to the callback, so a page never computes its
       own insets and they stay consistent across pages. */
    function panel(x0, y0, x1, y1, title, verdict, vcolour, note, draw) {
      var g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(150,190,255,.045)');
      g.addColorStop(1, 'rgba(150,190,255,.012)');
      ctx.fillStyle = g;
      roundRect(x0, y0, x1 - x0, y1 - y0, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(150,178,225,.2)'; ctx.lineWidth = 1;
      roundRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1, 3); ctx.stroke();
      ctx.textBaseline = 'alphabetic';
      tracked(String(title).toUpperCase(), x0 + 12, y0 + 19, 10,
              'rgba(210,225,250,.95)', 1.6, 'left');
      if (verdict) pill(verdict, x1 - 12, y0 + 9, vcolour || PAL.CYAN, verdict !== 'N/A');
      if (note) {
        ctx.font = '600 10px ' + MONO;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(143,162,196,.85)';
        ctx.fillText(note, x0 + 12, y0 + 34);
      }
      if (draw) draw(x0 + 40, y0 + 46, x1 - 14, y1 - 24);
    }

    /* A round tick step: 1, 2 or 5 times a power of ten. */
    function tickStep(span, want) {
      var raw = span / (want || 4);
      if (!(raw > 0)) return 1;
      var p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
      return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p;
    }

    /* Axis and gridline labels. This is SHARED by every page, so it reads the
       locale from the strings table and falls back to en-GB when no table is
       loaded -- which is what leaves the English pages unchanged.
       toFixed always emits a decimal POINT whatever the locale, so on a Russian
       page the geyser axis printed "50.0 min" beside prose written "50,0".
       useGrouping is OFF deliberately: toFixed(0) never grouped, so turning it
       on here would silently reformat every English axis label from 1000 to
       1,000. Only the decimal SEPARATOR was ever wrong. */
    function fmtLoc(v, dp) {
      var m = root && root.UDJ_STRINGS;
      var loc = (m && m.__locale) || 'en-GB';
      return Number(v).toLocaleString(loc, {
        minimumFractionDigits: dp, maximumFractionDigits: dp,
        useGrouping: false,
      });
    }
    /* The magnitude suffixes are an internal detail of THIS formatter, so their
       keys are namespaced. A bare 'k'/'m' key collides with page text -- corr
       abbreviates minutes as "m" on its eruption-length axis, and with a shared
       'm' key that axis rendered "2,0 млн" instead of minutes. The English
       fallback is passed explicitly because the key is no longer the English. */
    function fmtUnit(k, fallback) {
      var m = root && root.UDJ_STRINGS;
      return (m && m[k]) || fallback;
    }

    function fmtNum(v) {
      var a = Math.abs(v);
      if (a >= 1e6) return fmtLoc(v / 1e6, 1) + fmtUnit('__mag_m', 'm');
      if (a >= 1e4) return fmtLoc(v / 1e3, 0) + fmtUnit('__mag_k', 'k');
      if (a >= 100) return fmtLoc(v, 0);
      if (a >= 1) return fmtLoc(v, 1);
      return fmtLoc(v, 2);
    }

    /* An ordered colour ramp across a grade scale: warm = worse, cool = better.
       NOT a straight lerp from coral to cyan -- that path runs through
       desaturated pink-grey, so the middle grades of a 7-step scale came out
       indistinguishable from each other and from a white highlight. This goes
       coral → orange → yellow → green → cyan, keeping saturation up the whole
       way, so every step is separable.

       verify_draw.py measures the minimum pairwise CIE76 distance across the
       longest scale in use (8 grades) and fails if any two steps are closer
       than a threshold, because "are these two colours different enough" is a
       measurable question and was previously answered by guessing. */
    var RAMP = [
      [0.00, [247,  84,  92]],   // coral
      [0.26, [255, 152,  74]],   // orange
      [0.50, [240, 208,  88]],   // yellow
      [0.74, [122, 214, 142]],   // green
      [1.00, [104, 206, 246]],   // cyan
    ];
    function gradeColour(i, n) {
      var t = n <= 1 ? 0 : i / (n - 1);
      for (var s = 1; s < RAMP.length; s++) {
        if (t <= RAMP[s][0] || s === RAMP.length - 1) {
          var a = RAMP[s - 1], b = RAMP[s];
          var u = (t - a[0]) / (b[0] - a[0]);
          if (u < 0) u = 0; else if (u > 1) u = 1;
          return [a[1][0] + (b[1][0] - a[1][0]) * u,
                  a[1][1] + (b[1][1] - a[1][1]) * u,
                  a[1][2] + (b[1][2] - a[1][2]) * u];
        }
      }
      return RAMP[RAMP.length - 1][1].slice();
    }

    api.bloom = bloom; api.dot = dot; api.rgba = rgba;
    api.roundRect = roundRect; api.tracked = tracked; api.pill = pill;
    api.panel = panel; api.tickStep = tickStep; api.fmtNum = fmtNum;
    api.gradeColour = gradeColour; api.MONO = MONO; api.PAL = PAL;
    return api;
  }

  var API = { kit: kit, PAL: PAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.UDJ_DRAW = API;
})(typeof window !== 'undefined' ? window : null);
