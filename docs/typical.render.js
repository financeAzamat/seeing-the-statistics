/* Renderer for typical.html — "the average is not typical".
 *
 * Three panels, one concept, one shared x-axis between the top two:
 *   1. the distribution, with the average and the middle value marked, and every
 *      bar below the average shaded so the reader can SEE the proportion;
 *   2. a hundred-square block, one square per percent, so that proportion is
 *      readable as a count rather than a number;
 *   3. how often the average actually happens, against how often the commonest
 *      value does.
 *
 * Panel 1 is the only one on the data axis. Panels 2 and 3 are deliberately
 * NOT: panel 2 restates the same proportion as a count of 100, and panel 3 is a
 * pair of proportions. They share panel 1's left and right margins so the three
 * read as one column, which is an alignment choice, not a shared scale.
 *
 * Animation: bars grow from the baseline with a stagger, the two markers glide
 * to their new positions on a dataset change (never jump), and the square block
 * fills in order. All easings and tweens come from the shared, verified motion
 * layer -- nothing here rolls its own.
 */
(function () {
  'use strict';
  var DATA = window.UDJ_TYPICAL, DR = window.UDJ_DRAW, M = window.UDJ_MOTION;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var K = DR.kit(ctx), P = DR.PAL;
  var prov = document.getElementById('prov'), live = document.getElementById('live');

  var reduce = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Translation lookup. The KEY is the English string, so a missing entry
     falls back to correct English rather than to a bare identifier -- which is
     what keeps the English page working with no strings table loaded at all.
     Positional slots {0}, {1} let a translation REORDER the values, which a
     plain key lookup cannot express. */
  function TR(k) {
    var m = window.UDJ_STRINGS;
    var s = (m && m[k]) || k;
    for (var i = 1; i < arguments.length; i++) {
      s = s.replace('{' + (i - 1) + '}', arguments[i]);
    }
    return s;
  }

  /* Digit grouping follows the page's locale, declared by the strings table.
     Hard-coding en-GB printed 19,773 beside Russian prose that writes 19 773. */
  var UDJ_LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale) || 'en-GB';

  /* toFixed always emits a decimal POINT whatever the locale, so the canvas
     printed "77.3%" beside Russian prose that writes 77,3. toLocaleString with
     fixed fraction digits gets the separator AND the grouping right. */
  function dec(v, dp) {
    return Number(v).toLocaleString(UDJ_LOC, {
      minimumFractionDigits: dp, maximumFractionDigits: dp,
    });
  }
  function grp(v) { return Number(v).toLocaleString(UDJ_LOC); }

  var W = 0, H = 0, dpr = 1, phone = false, now = 0, ticker = null;
  var cur = 'retail', mode = 'both';

  /* one tween per animated quantity, so a mid-flight dataset change retargets
     from wherever the marker currently is instead of snapping */
  /* Durations are SECONDS -- the motion layer's own unit. Passing milliseconds
     here silently makes every tween instant, because the default duration is
     0.4s and the second constructor argument is the TARGET, not the duration. */
  var tMean = new M.Tween(0, 0, 0.52), tMed = new M.Tween(0, 0, 0.52);
  var tGrow = new M.Tween(0, 1, 0.62);      // 0..1 bar growth
  var tShade = new M.Tween(0, 1, 0.42);     // 0..1 how much shading shows

  function D() {
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === cur) return DATA[i];
    return DATA[0];
  }

  /* The unit affixes live in the DATA file, so they need TR as well: the geyser
     axis printed "50,0 min" beside Russian prose that says "минуты". A currency
     symbol has no entry and falls through unchanged, and an empty unitAfter
     returns empty, so only the units that need translating get one. */
  function fmt(d, v, places) {
    var s = K.fmtNum(v);
    if (places !== undefined) {
      s = v >= 1000 ? grp(Math.round(v)) : dec(v, places);
    }
    return TR(d.unit) + s + TR(d.unitAfter);
  }

  function layout() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    phone = W < 640;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ------------------------------------------------------------------ panels
  function draw() {
    var d = D();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);

    var pad = phone ? 12 : 18;
    var gap = phone ? 10 : 14;
    // panel 1 takes half, panels 2 and 3 split the rest
    var h1 = Math.round((H - pad * 2 - gap * 2) * 0.54);
    var h2 = Math.round((H - pad * 2 - gap * 2 - h1) * 0.44);
    var h3 = H - pad * 2 - gap * 2 - h1 - h2;

    var y1 = pad, y2 = y1 + h1 + gap, y3 = y2 + h2 + gap;

    // the x mapping panels 1 and 2 SHARE
    var plotL = pad + (phone ? 44 : 62), plotR = W - pad - 14;
    var nb = d.counts.length;
    var xLo = d.binLo, xHi = d.binLo + d.binW * nb;
    var sx = function (v) {
      return plotL + (v - xLo) / (xHi - xLo) * (plotR - plotL);
    };

    panelHist(d, pad, y1, W - pad * 2, h1, plotL, plotR, sx, xLo, xHi);
    panelBlock(d, pad, y2, W - pad * 2, h2, plotL, plotR);
    panelCommon(d, pad, y3, W - pad * 2, h3, plotL, plotR);
  }

  /* ---- panel 1: the distribution itself */
  function panelHist(d, x, y, w, h, plotL, plotR, sx, xLo, xHi) {
    /* The dataset label lives in the data file, so it goes through TR too --
       otherwise the panel title would read half-Russian. Uppercasing happens
       AFTER translation, because uppercasing the English key would miss. */
    var LBL = TR(d.label).toUpperCase();
    var title = d.id === 'geyser'
      ? TR('EVERY WAIT · {0} · {1} REAL RECORDS', LBL, grp(d.n))
      : TR('EVERY ONE · {0} · {1} REAL RECORDS', LBL, grp(d.n));
    var counter = TR('{0} of {1} — {2}% — are BELOW the average',
                     grp(d.below), grp(d.n), dec(d.pctBelow, 1)) +
                  (d.beyond > 0
                    ? TR('   (+{0} beyond {1}, off the right of this chart)',
                         grp(d.beyond), fmt(d, d.cap))
                    : '');
    K.panel(x, y, w, h, title, null, null, counter, null);

    /* PILL_BAND is headroom reserved above the plot purely for the two marker
       labels. Drawing them inside the plot put them on top of the highest
       gridline label and, when the mean and median are close, on top of each
       other. */
    var PILL_BAND = phone ? 20 : 26;
    var top = y + (phone ? 44 : 52) + PILL_BAND, bot = y + h - (phone ? 30 : 34);
    var mx = 0, i;
    for (i = 0; i < d.counts.length; i++) if (d.counts[i] > mx) mx = d.counts[i];
    var sy = function (c) { return bot - (c / mx) * (bot - top); };

    // y gridlines
    var step = K.tickStep(mx);
    ctx.strokeStyle = 'rgba(140,170,210,0.09)';
    ctx.lineWidth = 1;
    ctx.font = '500 ' + (phone ? 9 : 10) + 'px ' + K.MONO;
    ctx.fillStyle = 'rgba(150,180,220,0.5)';
    ctx.textAlign = 'right';
    for (var g = 0; g <= mx; g += step) {
      var gy = Math.round(sy(g)) + 0.5;
      ctx.beginPath(); ctx.moveTo(plotL, gy); ctx.lineTo(plotR, gy); ctx.stroke();
      if (g > 0) ctx.fillText(K.fmtNum(g), plotL - 8, gy + 3);
    }

    var muX = sx(d.mu), medX = sx(d.median);
    var grow = tGrow.v, shade = tShade.v;

    // bars. Below the average shaded warm, above cool -- the proportion the
    // page is about is a VISIBLE area, not just a percentage in the prose.
    var bw = (plotR - plotL) / d.counts.length;
    for (i = 0; i < d.counts.length; i++) {
      var c = d.counts[i];
      if (!c) continue;
      var st = M.stagger(i, d.counts.length, 0.55, grow);
      var bx = plotL + i * bw;
      var centre = xLo + (i + 0.5) * d.binW;
      var below = centre < d.mu;
      var pulse = M.breathe(now, i * 0.21, 0.9, 0.35);
      var full = sy(c), hh = (bot - full) * M.ease.cubicOut(st);
      var col = below ? P.RED : P.CYAN;
      var a = (below ? 0.30 + 0.42 * shade : 0.26) * pulse.a;
      ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      ctx.fillRect(bx + 0.6, bot - hh, Math.max(1, bw - 1.2), hh);
      // a brighter cap so each bar reads as a discrete bar
      ctx.globalAlpha = Math.min(1, (below ? 0.85 : 0.6) * pulse.a);
      ctx.fillRect(bx + 0.6, bot - hh, Math.max(1, bw - 1.2), Math.min(2, hh));
      ctx.globalAlpha = 1;
    }

    // baseline
    ctx.strokeStyle = 'rgba(150,180,220,0.30)';
    ctx.beginPath(); ctx.moveTo(plotL, bot + 0.5); ctx.lineTo(plotR, bot + 0.5);
    ctx.stroke();

    // x labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(150,180,220,0.55)';
    var xs = K.tickStep(xHi - xLo);
    var first = Math.ceil(xLo / xs) * xs;
    for (var v = first; v <= xHi; v += xs) {
      ctx.fillText(fmt(d, v), sx(v), bot + (phone ? 14 : 17));
    }

    /* The two markers. The LINES carry the position; the labels live in the
       reserved band as a left-aligned legend rather than hanging off each line.
       Anchoring a label to its own line cannot work here: on the order data the
       mean and median are only ~30px apart, so a 155px label had nowhere to go
       and was clipped against the panel edge. */
    var mvMean = tMean.v, mvMed = tMed.v;
    if (mode === 'both') markerLine(mvMed, top, bot, P.CYAN, true);
    markerLine(mvMean, top, bot, P.GOLD, false);

    /* pill() takes the pill's RIGHT edge and RETURNS its width -- it applies
       its own font and letter-spacing, so the caller cannot measure it in
       advance without duplicating that. So lay the legend out right-to-left
       from plotR, using each returned width to step left. The most important
       label (the average) goes flush right and is therefore the one that
       survives if the band runs out of room. */
    var bandY = top - PILL_BAND / 2 - 1;
    var legend = [[TR('AVERAGE {0}', fmt(d, d.mu, 2)), P.GOLD]];
    if (mode === 'both') legend.push([TR('MIDDLE {0}', fmt(d, d.median, 2)), P.CYAN]);
    var rx = plotR;
    for (var q = 0; q < legend.length; q++) {
      if (rx <= plotL + 40) break;          // no room left; drop the rest
      rx -= K.pill(legend[q][0], rx, bandY, legend[q][1], true) + 9;
    }

  }

  function markerLine(px, top, bot, col, dashed) {
    var pulse = M.breathe(now, dashed ? 2.1 : 0, 0.7, 0.5);
    ctx.save();
    ctx.setLineDash(dashed ? [5, 4] : []);
    /* K.rgba rather than a hand-built string with .toFixed(3): a CSS alpha must
       use a decimal POINT, so a locale-aware formatter would be wrong here, and
       a bare .toFixed() is what the translation check forbids. Using the shared
       helper sidesteps both -- this is a colour, not displayed text. */
    ctx.strokeStyle = K.rgba(col, 0.85 * pulse.a);
    ctx.lineWidth = dashed ? 1.4 : 2;
    ctx.beginPath(); ctx.moveTo(px, top - 4); ctx.lineTo(px, bot); ctx.stroke();
    ctx.restore();
    // a soft bloom along the line so it reads over the bars
    K.dot(px, (top + bot) / 2, 1.5, col, 0.5 * pulse.a, 0.9 * pulse.g, 0);
  }

  /* ---- panel 2: one square per percent */
  function panelBlock(d, x, y, w, h, plotL, plotR) {
    K.panel(x, y, w, h, TR('THE SAME FACT AS A COUNT OF 100'),
            TR('{0}% BELOW', dec(d.pctBelow, 1)), P.RED,
            TR('{0} of every 100 records are below the average — one square ' +
               'is one percent of {1}',
               grp(Math.round(d.pctBelow)), grp(d.n)), null);

    var top = y + (phone ? 42 : 50), bot = y + h - (phone ? 8 : 10);
    var cols = 25, rows = 4;
    var availW = plotR - plotL, availH = bot - top;
    var cell = Math.max(4, Math.min(availW / cols, availH / rows) - 2);
    var gapx = (availW - cell * cols) / (cols - 1);
    var gapy = rows > 1 ? Math.min(6, (availH - cell * rows) / (rows - 1)) : 0;
    var startY = top + Math.max(0, (availH - (cell * rows + gapy * (rows - 1))) / 2);

    var filled = d.pctBelow;                 // squares that are "below average"
    var grow = tGrow.v;
    for (var i = 0; i < 100; i++) {
      var r = Math.floor(i / cols), c = i % cols;
      var bx = plotL + c * (cell + gapx), by = startY + r * (cell + gapy);
      var below = i < filled;
      var appear = M.stagger(i, 100, 0.7, grow);
      if (appear <= 0) continue;
      var pulse = M.breathe(now, i * 0.13, 0.85, below ? 0.55 : 0.25);
      var col = below ? P.RED : P.CYAN;
      var a = (below ? 0.95 : 0.62) * pulse.a * M.ease.cubicOut(appear);
      var sz = cell * (0.7 + 0.3 * M.ease.cubicOut(appear));
      var off = (cell - sz) / 2;
      ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      K.roundRect(bx + off, by + off, sz, sz, Math.min(3, sz * 0.28));
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---- panel 3: how often does the average actually happen */
  function panelCommon(d, x, y, w, h, plotL, plotR) {
    var pm = 100 * d.nearMean / d.n, pb = 100 * d.nearBusiest / d.n;
    K.panel(x, y, w, h, TR('HOW OFTEN THE AVERAGE ACTUALLY HAPPENS'),
            d.bimodal ? TR('NO TYPICAL CASE') : null, P.GOLD,
            TR('within ±{0} of each value', fmt(d, d.window)), null);

    var top = y + (phone ? 40 : 48), bot = y + h - (phone ? 12 : 16);
    var rowH = Math.min(26, (bot - top) / 2.4);
    var maxP = Math.max(pm, pb, 1);
    var grow = M.ease.cubicOut(tGrow.v);
    var items = [
      [TR('NEAR THE AVERAGE  {0}', fmt(d, d.mu, 2)), pm, d.nearMean, P.GOLD],
      [TR('NEAR THE COMMONEST  {0}', fmt(d, d.busiest, 2)), pb, d.nearBusiest, P.CYAN],
    ];
    /* Gutter for the label on the left, and RESERVED room for the value label
       on the right. Without the reservation the longest bar pushed its own
       "37.1% (7,335)" label clean off the canvas. */
    var gutter = phone ? 118 : 190, reserve = phone ? 74 : 104;
    var barMax = Math.max(20, (plotR - plotL) - gutter - reserve);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var by = top + i * (rowH + 12);
      var barW = barMax * (it[1] / maxP) * grow;
      var pulse = M.breathe(now, i * 1.7, 0.75, 0.5);
      K.tracked(it[0], plotL, by + rowH * 0.62, phone ? 8 : 9,
                'rgba(200,220,245,0.85)', 0.7, 'left');
      var bx = plotL + gutter;
      ctx.globalAlpha = Math.min(1, 0.85 * pulse.a);
      ctx.fillStyle = 'rgb(' + it[3][0] + ',' + it[3][1] + ',' + it[3][2] + ')';
      K.roundRect(bx, by + 2, Math.max(1, barW), rowH - 6, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      /* Not routed through TR: this label is purely numeric, so there is
         nothing to translate -- and forcing an entry for it would mean writing
         a fake "translation" to satisfy the identical-to-key check. The two
         numbers are already locale-aware. */
      K.tracked(dec(it[1], 1) + '%  (' + grp(it[2]) + ')',
                bx + Math.max(1, barW) + 8, by + rowH * 0.62, phone ? 8 : 9.5,
                'rgba(' + it[3][0] + ',' + it[3][1] + ',' + it[3][2] + ',0.95)',
                0.7, 'left');
    }
    if (d.bimodal) {
      K.tracked(TR('two clusters at {0} and {1} — the average sits in the gap',
                   fmt(d, d.modes[0], 1), fmt(d, d.modes[1], 1)),
                plotL, bot - 2, phone ? 8.5 : 9.5, 'rgba(255,190,120,0.85)',
                0.6, 'left');
    }
  }

  // ------------------------------------------------------------------ state
  function retarget(immediate) {
    var d = D();
    var pad = phone ? 12 : 18;
    var plotL = pad + (phone ? 44 : 62), plotR = W - pad - 14;
    var nb = d.counts.length;
    var xLo = d.binLo, xHi = d.binLo + d.binW * nb;
    var toX = function (v) {
      return plotL + (v - xLo) / (xHi - xLo) * (plotR - plotL);
    };
    if (immediate) {
      tMean.set(toX(d.mu)); tMed.set(toX(d.median));
      tGrow.set(1); tShade.set(1);
    } else {
      tMean.to(toX(d.mu)); tMed.to(toX(d.median));
      tGrow.set(0); tGrow.to(1, 0.62);
      tShade.set(0); tShade.to(1, 0.42);
    }
  }

  function describe() {
    var d = D();
    /* Every one of these strings lives in the DATA file, not the page, so the
       provenance line would stay English unless it goes through TR as well.
       filters is an array, so each entry is looked up individually. */
    var flt = [];
    for (var i = 0; i < d.filters.length; i++) flt.push(TR(d.filters[i]));
    prov.innerHTML =
      '<b>' + TR(d.label) + '</b> — ' + TR(d.what) +
      ' <span class="src">' + TR(d.source) +
      ' · <a href="' + d.url + '" target="_blank" rel="noopener">' +
      TR('source') + '</a></span>' +
      '<span class="flt">' + flt.join(' · ') + '</span>';

    var pm = dec(100 * d.nearMean / d.n, 1);
    live.textContent =
      TR('{0}: average {1}, middle value {2}. {3} percent of {4} records are ' +
         'below the average.',
         TR(d.label), fmt(d, d.mu, 2), fmt(d, d.median, 2),
         dec(d.pctBelow, 1), grp(d.n)) + ' ' +
      (d.bimodal
        ? TR('This data has two clusters, at {0} and {1}; the average falls ' +
             'between them and only {2} percent of values are near it.',
             dec(d.modes[0], 2), dec(d.modes[1], 2), pm)
        : TR('Only {0} percent of values are near the average, against {1} ' +
             'percent near the commonest value.',
             pm, dec(100 * d.nearBusiest / d.n, 1)));
  }

  /* One step per tween per frame, then draw. `t` is SECONDS, which is what
     breathe() expects -- feeding it milliseconds makes every pulse run about a
     thousand times too fast and read as a flicker. */
  function frame(dt, t) {
    now = t;
    tMean.step(dt); tMed.step(dt); tGrow.step(dt); tShade.step(dt);
    draw();
  }

  function start() {
    layout();
    now = performance.now() / 1000;
    retarget(true);              // one correct static frame first
    describe();
    if (reduce) { draw(); return; }   // reduced motion: never start a ticker
    retarget(false);
    /* Paint one frame SYNCHRONOUSLY before the ticker starts. Without this the
       canvas is empty until the first requestAnimationFrame fires -- a blank
       panel on load, and the defect verify_render.py reports as
       "drew nothing on init". */
    draw();
    ticker = new M.Ticker(frame);
    ticker.start();
  }

  // ------------------------------------------------------------------ wiring
  function wire(attr, apply) {
    var btns = document.querySelectorAll('[data-' + attr + ']');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          for (var j = 0; j < btns.length; j++)
            btns[j].setAttribute('aria-pressed', btns[j] === b ? 'true' : 'false');
          apply(b.getAttribute('data-' + attr));
          describe();
          if (reduce) { retarget(true); draw(); } else { retarget(false); }
        });
      })(btns[i]);
    }
  }
  wire('d', function (v) { cur = v; });
  wire('m', function (v) { mode = v; });

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      layout(); retarget(true); draw();
    }, 120);
  });

  start();
})();
