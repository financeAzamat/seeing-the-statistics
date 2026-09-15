/* Renderer for corr.html — "r measures the relationship AND your window".
 *
 * Three panels:
 *   1. diamonds carat -> price. The active carat window is shaded and its stones
 *      are bright; everything outside dims to context. This is where the reader
 *      sees that narrowing the window removes the SLOPE from view while leaving
 *      the vertical scatter intact.
 *   2. r for every window, as bars. The collapse from +0.922 to +0.088 is the
 *      whole lesson, and it only reads as a collapse when all six sit together.
 *   3. the geyser, same mechanism in reverse: r is high across two clusters and
 *      low inside either one.
 *
 * No two panels share an axis and none pretends to: panel 1 is carat against
 * price, panel 2 is window against r, panel 3 is eruption length against wait.
 * They share left and right margins so the column reads as one figure.
 *
 * POPULATION vs DRAWN. Every r comes from the full population inside its window.
 * The scatter is a seeded sample. Each panel prints both counts, because a
 * statistic measured on 53,940 rows beside a picture of 1,200 is precisely the
 * mismatch that produced a wrong figure earlier in this project.
 */
(function () {
  'use strict';
  var C = window.UDJ_CORR, DR = window.UDJ_DRAW, M = window.UDJ_MOTION;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var K = DR.kit(ctx), P = DR.PAL;
  var prov = document.getElementById('prov'), live = document.getElementById('live');

  var reduce = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Translation lookup. The KEY is the English string, so a missing entry falls
     back to correct English rather than a bare identifier — which is what keeps
     the English page working with no strings table loaded at all. Positional
     slots {0}, {1} let a translation REORDER values. */
  function TR(k) {
    var m = window.UDJ_STRINGS;
    var s = (m && m[k]) || k;
    for (var i = 1; i < arguments.length; i++) {
      s = s.replace('{' + (i - 1) + '}', arguments[i]);
    }
    return s;
  }

  /* Digit grouping follows the locale declared by the strings table. */
  var UDJ_LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale) || 'en-GB';

  /* toFixed always emits a decimal POINT whatever the locale, and this page is
     almost entirely decimals — every r, every carat tick. Formatting them with
     toFixed printed "+0.922" and "0.5" beside Russian prose written with a
     comma. */
  function dec(v, dp) {
    return (Math.abs(Number(v)) < Math.pow(10, -dp) / 2 ? 0 : Number(v)).toLocaleString(UDJ_LOC, {
      minimumFractionDigits: dp, maximumFractionDigits: dp,
    });
  }
  function grp(v) { return Number(v).toLocaleString(UDJ_LOC); }

  var W = 0, H = 0, dpr = 1, phone = false, now = 0, ticker = null;
  var wi = 0;                 // active carat window index
  var gsel = 'all';           // geyser selection

  var D = C.diamond, G = C.geyser;

  /* one tween per animated quantity; a mid-flight change retargets from the
     current value instead of snapping (durations are SECONDS) */
  var tLo = new M.Tween(0, 0, 0.55), tHi = new M.Tween(0, 0, 0.55);
  var tR = new M.Tween(0, 0, 0.60);      // the highlighted bar's height
  var tIn = new M.Tween(0, 1, 0.70);     // entrance / restage progress

  /* stable per-point pulse phases and magnitudes. Seeded so the twinkle is the
     same on every load rather than reshuffling on each restage. */
  var dPhase = new Float32Array(D.pts.length), dMag = new Float32Array(D.pts.length);
  var gPhase = new Float32Array(G.pts.length), gMag = new Float32Array(G.pts.length);
  (function seed() {
    var s = 20260913 % 2147483647;
    function nx() { s = (s * 48271) % 2147483647; return s / 2147483647; }
    var i;
    for (i = 0; i < dPhase.length; i++) { dPhase[i] = nx() * 6.283; dMag[i] = nx(); }
    for (i = 0; i < gPhase.length; i++) { gPhase[i] = nx() * 6.283; gMag[i] = nx(); }
  })();

  /* Never returns undefined. A clamp alone is not enough: Math.max(0,
     Math.min(n, NaN)) is NaN, not 0, so one malformed control value used to
     produce an undefined window and a blank panel. */
  function win() { return D.windows[wi] || D.windows[0]; }

  function layout() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    phone = W < 640;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------------------------------------------------------------- geometry
  function bounds() {
    var pad = phone ? 12 : 18, gap = phone ? 10 : 14;
    var h1 = Math.round((H - pad * 2 - gap * 2) * 0.46);
    var h2 = Math.round((H - pad * 2 - gap * 2) * 0.22);
    var h3 = H - pad * 2 - gap * 2 - h1 - h2;
    return {
      pad: pad, gap: gap,
      L: pad + (phone ? 46 : 64), R: W - pad - 16,
      y1: pad, h1: h1,
      y2: pad + h1 + gap, h2: h2,
      y3: pad + h1 + gap + h2 + gap, h3: h3,
    };
  }

  // ---------------------------------------------------------------- panel 1
  function panelScatter(b) {
    var w = win();
    var note = TR('r = {0} on all {1} stones in this window   ·   {2} of {3} '
                  + 'drawn here fall inside',
                  fmtR(w.r), grp(w.n), grp(w.drawn), grp(D.nDrawn));
    K.panel(b.pad, b.y1, W - b.pad * 2, b.h1,
            TR('SIZE AGAINST PRICE · {0}', TR(w.label).toUpperCase()),
            null, null, note, null);

    var top = b.y1 + (phone ? 44 : 52), bot = b.y1 + b.h1 - (phone ? 26 : 30);
    var xMax = 3.0, yMax = 19000;
    var sx = function (v) { return b.L + Math.min(v, xMax) / xMax * (b.R - b.L); };
    var sy = function (v) { return bot - Math.min(v, yMax) / yMax * (bot - top); };

    /* '$' is not routed through TR: a currency symbol is the same in both
       languages, so an entry for it could only ever be identical to its key —
       which is exactly what the "nothing left in English" check rejects. */
    grid(b, top, bot, sx, sy, xMax, yMax, function (v) { return dec(v, 1); },
         function (v) { return '$' + K.fmtNum(v); });

    // the shaded window, tweened so a change slides rather than jumps
    var lo = tLo.v, hi = tHi.v;
    if (lo > 0 || hi < xMax) {
      var xa = sx(lo), xb = sx(hi);
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = 'rgb(' + P.GOLD[0] + ',' + P.GOLD[1] + ',' + P.GOLD[2] + ')';
      ctx.fillRect(xa, top, Math.max(1, xb - xa), bot - top);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(' + P.GOLD.join(',') + ',0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xa, top); ctx.lineTo(xa, bot);
      ctx.moveTo(xb, top); ctx.lineTo(xb, bot); ctx.stroke();
      ctx.restore();
    }

    // stones: inside the window bright, outside dimmed to context. Inside is
    // drawn LAST so it is never buried under the dimmed mass.
    var appear = M.ease.cubicOut(tIn.v);
    var pass, i;
    for (pass = 0; pass < 2; pass++) {
      for (i = 0; i < D.pts.length; i++) {
        var cx = D.pts[i][0], cy = D.pts[i][1];
        var inside = cx >= lo - 1e-9 && cx <= hi + 1e-9;
        if ((pass === 1) !== inside) continue;
        var st = M.stagger(i, D.pts.length, 0.5, appear);
        if (st <= 0) continue;
        var m = dMag[i];
        var br = M.breathe(now, dPhase[i], 0.8 + m * 1.1, inside ? 0.5 : 0.15);
        var col = inside ? P.CYAN : P.DEEP;
        var a = (inside ? 0.95 : 0.20) * br.a * M.ease.cubicOut(st);
        K.dot(sx(cx), sy(cy), (2.4 + m * 1.0) * br.r * (inside ? 1 : 0.75),
              col, a, 0, inside ? 1.1 : 0.6);
      }
    }
  }

  // ---------------------------------------------------------------- panel 2
  function panelBars(b) {
    K.panel(b.pad, b.y2, W - b.pad * 2, b.h2,
            TR('WHAT r SAYS, WINDOW BY WINDOW'),
            fmtR(win().r), win().r > 0.6 ? P.CYAN : P.RED,
            TR('same stones, same prices — only the range of sizes differs'), null);

    var top = b.y2 + (phone ? 40 : 48), bot = b.y2 + b.h2 - (phone ? 26 : 32);
    var n = D.windows.length;
    var slot = (b.R - b.L) / n;
    var bw = Math.min(slot - 12, phone ? 34 : 62);
    var appear = M.ease.cubicOut(tIn.v);

    // a faint reference line at the full-range r, so the fall is measured
    // against something rather than eyeballed
    var full = D.windows[0].r;
    var refY = bot - Math.abs(full) * (bot - top);
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(140,170,210,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(b.L, refY); ctx.lineTo(b.R, refY); ctx.stroke();
    ctx.restore();
    K.tracked(TR('r = {0} at full range', fmtR(full)), b.R, refY - 5,
              phone ? 8 : 9, 'rgba(150,180,220,0.55)', 0.6, 'right');

    for (var i = 0; i < n; i++) {
      var wd = D.windows[i];
      var cx = b.L + slot * (i + 0.5);
      var act = i === wi;
      var st = M.stagger(i, n, 0.45, appear);
      var hh = Math.abs(wd.r) * (bot - top) * M.ease.cubicOut(st);
      var pulse = M.breathe(now, i * 1.3, 0.8, act ? 0.6 : 0.2);
      var col = act ? P.GOLD : (wd.r > 0.6 ? P.CYAN : P.RED);
      ctx.globalAlpha = Math.min(1, (act ? 0.95 : 0.5) * pulse.a);
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      K.roundRect(cx - bw / 2, bot - hh, bw, hh, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (st > 0.4) {
        K.tracked(fmtR(wd.r), cx, bot - hh - 6, phone ? 8 : 9.5,
                  act ? 'rgba(255,205,140,0.98)' : 'rgba(200,220,245,0.75)',
                  0.7, 'center');
      }
      /* Translate first, THEN strip the unit: the bar row is narrow so the
         label drops " ct" to fit, and stripping before translation would leave
         the Russian "кар" in place. `n=` stays as it is — mathematical
         notation, not prose. */
      K.tracked(TR(wd.label).replace(/\s+(?:ct|кар)\.?$/, ''),
                cx, bot + (phone ? 11 : 14),
                phone ? 7.5 : 8.5,
                act ? 'rgba(255,205,140,0.9)' : 'rgba(150,180,220,0.5)',
                0.6, 'center');
      K.tracked('n=' + K.fmtNum(wd.n), cx, bot + (phone ? 20 : 25),
                phone ? 7 : 8, 'rgba(150,180,220,0.38)', 0.5, 'center');
    }
    ctx.strokeStyle = 'rgba(150,180,220,0.30)';
    ctx.beginPath(); ctx.moveTo(b.L, bot + 0.5); ctx.lineTo(b.R, bot + 0.5);
    ctx.stroke();
  }

  // ---------------------------------------------------------------- panel 3
  function panelGeyser(b) {
    var shown = gsel === 'all' ? null : gsel;
    var rNow = gsel === 'all' ? G.r
             : gsel === 'short' ? G.groups[0].r : G.groups[1].r;
    var nNow = gsel === 'all' ? G.nAll
             : gsel === 'short' ? G.groups[0].n : G.groups[1].n;
    K.panel(b.pad, b.y3, W - b.pad * 2, b.h3,
            TR('THE SAME TRAP IN REVERSE · OLD FAITHFUL'),
            fmtR(rNow), Math.abs(rNow) > 0.6 ? P.CYAN : P.RED,
            TR('r = {0} on {1} eruptions   ·   high across the two clusters, '
               + 'low inside either one', fmtR(rNow), grp(nNow)), null);

    var top = b.y3 + (phone ? 44 : 52), bot = b.y3 + b.h3 - (phone ? 26 : 30);
    var xLo = 1.5, xHi = 5.2, yLo = 40, yHi = 100;
    var sx = function (v) { return b.L + (v - xLo) / (xHi - xLo) * (b.R - b.L); };
    var sy = function (v) { return bot - (v - yLo) / (yHi - yLo) * (bot - top); };

    grid(b, top, bot, sx, sy, null, null, null, null, xLo, xHi, yLo, yHi,
         function (v) { return dec(v, 1) + TR('m'); },
         function (v) { return dec(v, 0) + TR(' min'); });

    var appear = M.ease.cubicOut(tIn.v);
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < G.pts.length; i++) {
        var d0 = G.pts[i][0], w0 = G.pts[i][1];
        var isShort = d0 < G.split;
        var on = shown === null || (shown === 'short') === isShort;
        if ((pass === 1) !== on) continue;
        var st = M.stagger(i, G.pts.length, 0.5, appear);
        if (st <= 0) continue;
        var m = gMag[i];
        var br = M.breathe(now, gPhase[i], 0.8 + m * 1.1, on ? 0.5 : 0.15);
        var col = isShort ? P.GOLD : P.CYAN;
        var a = (on ? 0.95 : 0.16) * br.a * M.ease.cubicOut(st);
        K.dot(sx(d0), sy(w0), (2.6 + m * 1.0) * br.r * (on ? 1 : 0.7),
              col, a, 0, on ? 1.1 : 0.5);
      }
    }

    // the split, and a label for each habit
    if (gsel === 'all') {
      var xs = sx(G.split);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(150,180,220,0.35)';
      ctx.beginPath(); ctx.moveTo(xs, top); ctx.lineTo(xs, bot); ctx.stroke();
      ctx.restore();
      K.tracked(TR('SHORT  r = {0}', fmtR(G.groups[0].r)), b.L + 8, top + 12,
                phone ? 8 : 9, 'rgba(' + P.GOLD.join(',') + ',0.9)', 0.7, 'left');
      K.tracked(TR('LONG  r = {0}', fmtR(G.groups[1].r)), b.R - 20, top + 12,
                phone ? 8 : 9, 'rgba(' + P.CYAN.join(',') + ',0.9)', 0.7, 'right');
    }
  }

  // ---------------------------------------------------------------- helpers
  function fmtR(r) {
    /* dec(), not toFixed(): every r on this page is displayed, and toFixed
       always emits a decimal point. The minus sign stays U+2212. */
    return (r >= 0 ? '+' : '\u2212') + dec(Math.abs(r), 3);
  }

  /* Shared gridlines. Two calling shapes because panel 1 is anchored at zero
     and panel 3 is not; passing explicit bounds keeps one implementation. */
  function grid(b, top, bot, sx, sy, xMax, yMax, fx, fy,
                xLo, xHi, yLo, yHi, fx2, fy2) {
    var ax0 = xLo === undefined ? 0 : xLo, ax1 = xHi === undefined ? xMax : xHi;
    var ay0 = yLo === undefined ? 0 : yLo, ay1 = yHi === undefined ? yMax : yHi;
    var labX = fx2 || fx, labY = fy2 || fy;
    ctx.strokeStyle = 'rgba(140,170,210,0.09)';
    ctx.lineWidth = 1;
    ctx.font = '500 ' + (phone ? 9 : 10) + 'px ' + K.MONO;
    ctx.fillStyle = 'rgba(150,180,220,0.5)';

    var ys = K.tickStep(ay1 - ay0);
    ctx.textAlign = 'right';
    for (var v = Math.ceil(ay0 / ys) * ys; v <= ay1; v += ys) {
      var gy = Math.round(sy(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(b.L, gy); ctx.lineTo(b.R, gy); ctx.stroke();
      ctx.fillText(labY ? labY(v) : String(v), b.L - 8, gy + 3);
    }
    var xs = K.tickStep(ax1 - ax0);
    ctx.textAlign = 'center';
    for (var u = Math.ceil(ax0 / xs) * xs; u <= ax1; u += xs) {
      ctx.fillText(labX ? labX(u) : String(u), sx(u), bot + (phone ? 14 : 17));
    }
    ctx.strokeStyle = 'rgba(150,180,220,0.30)';
    ctx.beginPath(); ctx.moveTo(b.L, bot + 0.5); ctx.lineTo(b.R, bot + 0.5);
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    var b = bounds();
    panelScatter(b);
    panelBars(b);
    panelGeyser(b);
  }

  // ---------------------------------------------------------------- state
  function retarget(immediate) {
    var w = win();
    var lo = w.lo === null ? 0 : w.lo;
    var hi = w.hi === null ? 3.0 : w.hi;
    if (immediate) {
      tLo.set(lo); tHi.set(hi); tR.set(Math.abs(w.r)); tIn.set(1);
    } else {
      tLo.to(lo); tHi.to(hi); tR.to(Math.abs(w.r));
      tIn.set(0); tIn.to(1, 0.70);
    }
  }

  function describe() {
    var w = win();
    /* Both filter lists and every axis label live in the DATA file, so they all
       go through TR — this is the block that stayed English on the first two
       Russian pages until a check went looking for it. */
    var dFlt = [], gFlt = [], i;
    for (i = 0; i < D.filters.length; i++) dFlt.push(TR(D.filters[i]));
    for (i = 0; i < G.filters.length; i++) gFlt.push(TR(G.filters[i]));
    prov.innerHTML =
      '<b>' + TR(D.xLabel) + ' → ' + TR(D.yLabel) + '</b> — ' + TR(D.what) +
      ' <span class="src">' + TR(D.source) +
      ' · <a href="' + D.url + '" target="_blank" rel="noopener">' +
      TR('source') + '</a></span>' +
      '<span class="flt">' + dFlt.join(' · ') + '</span>' +
      '<span class="flt">' + TR('Geyser: {0}', gFlt.join(' · ')) + '</span>';
    live.textContent = TR(
      'Diamonds, {0}: correlation {1} on {2} stones, against {3} across all '
      + 'sizes. Geyser: {4} overall, {5} within short eruptions and {6} within '
      + 'long ones.',
      TR(w.label), dec(w.r, 3), grp(w.n), dec(D.windows[0].r, 3),
      dec(G.r, 3), dec(G.groups[0].r, 3), dec(G.groups[1].r, 3));
  }

  function frame(dt, t) {
    now = t;
    tLo.step(dt); tHi.step(dt); tR.step(dt); tIn.step(dt);
    draw();
  }

  function start() {
    layout();
    now = performance.now() / 1000;
    retarget(true);
    describe();
    if (reduce) { draw(); return; }   // one static frame, never a ticker
    retarget(false);
    draw();                            // paint before the first raf
    ticker = new M.Ticker(frame);
    ticker.start();
  }

  // ---------------------------------------------------------------- wiring
  function wire(attr, apply) {
    var btns = document.querySelectorAll('[data-' + attr + ']');
    for (var i = 0; i < btns.length; i++) {
      (function (bn) {
        bn.addEventListener('click', function () {
          for (var j = 0; j < btns.length; j++)
            btns[j].setAttribute('aria-pressed', btns[j] === bn ? 'true' : 'false');
          apply(bn.getAttribute('data-' + attr));
          describe();
          if (reduce) { retarget(true); draw(); } else { retarget(false); }
        });
      })(btns[i]);
    }
  }
  wire('w', function (v) {
    var k = parseInt(v, 10);
    if (!isFinite(k)) return;          // ignore a malformed control value
    wi = Math.max(0, Math.min(D.windows.length - 1, k));
  });
  wire('g', function (v) {
    if (v === 'all' || v === 'short' || v === 'long') gsel = v;
  });

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { layout(); retarget(true); draw(); }, 120);
  });

  start();
})();
