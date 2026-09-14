/* Renderer for intuition.html — the Module 1 self-test.
 *
 * Three panels:
 *   1. the current question as a NUMBER LINE. The four choices sit at their real
 *      positions on the scale, so the reader can see how far apart the options
 *      are before committing. Once answered, the truth is revealed on the same
 *      line and the gap between the two is drawn and labelled -- the size of the
 *      error is the lesson, not merely being wrong.
 *   2. the scorecard: all six questions as small lines, each showing this
 *      reader's answer against the truth. Its purpose is to expose a DIRECTION:
 *      several misses on the same side is a systematic bias, which is the kind
 *      you can correct for.
 *   3. the explanation for the current question, once answered, and the module
 *      that works the measurement through.
 *
 * The panels share left and right margins but no scale -- each question has its
 * own units, and pretending otherwise would be the exact error the course warns
 * about. Panel 2's little lines are each normalised to their OWN question.
 *
 * This page reports nothing about other people. There is no survey data behind
 * it, so it shows only the reader's own answer against the measured one.
 */
(function () {
  'use strict';
  var Q = window.UDJ_INTUITION, DR = window.UDJ_DRAW, M = window.UDJ_MOTION;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var K = DR.kit(ctx), P = DR.PAL;
  var prov = document.getElementById('prov'), live = document.getElementById('live');

  /* ---- TR: translation lookup with positional slots. The KEY is the English
     format string, so a page with no strings file falls back to correct English
     instead of showing a key. */
  function TR(k) {
    var m = window.UDJ_STRINGS;
    var s = (m && m[k]) || k;
    for (var i = 1; i < arguments.length; i++) {
      s = s.replace('{' + (i - 1) + '}', arguments[i]);
    }
    return s;
  }

  var reduce = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var W = 0, H = 0, dpr = 1, phone = false, now = 0, ticker = null;
  var qi = 0;
  var given = [];                       // given[i] = chosen index, or -1
  for (var z = 0; z < Q.length; z++) given.push(-1);

  /* one tween per animated quantity (durations are SECONDS) */
  var tReveal = new M.Tween(0, 0, 0.75);   // 0 = unanswered, 1 = fully revealed
  var tIn = new M.Tween(0, 1, 0.55);       // per-question entrance

  /* Digit grouping follows the page's locale, declared by the strings
     table. Hard-coding en-GB printed 19,773 beside Russian prose. */
  var UDJ_LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale)
                || 'en-GB';

  function q() { return Q[qi] || Q[0]; }
  function answered(i) { return given[i] >= 0; }
  function correct(i) { return given[i] === Q[i].answer; }

  /* toFixed always emits a decimal POINT, whatever the locale, so the canvas
     printed "27.3%" beside Russian prose that writes 27,3 %. toLocaleString with
     fixed fraction digits gets both the separator and the grouping right. */
  function dec(v, dp) {
    return Number(v).toLocaleString(UDJ_LOC, {
      minimumFractionDigits: dp, maximumFractionDigits: dp,
    });
  }

  function fmtV(qq, v) {
    var s = qq.dp === 0 ? Math.round(v).toLocaleString(UDJ_LOC) : dec(v, qq.dp);
    /* Units come from the data file, so they need TR too. Here they happen to
       be symbols ($, +, %) that need no translation and fall through unchanged,
       but wrapping them is what stops a future unit like " min" from silently
       staying English -- which is exactly what happened on the geyser axis. */
    return TR(qq.unit) + s + TR(qq.after);
  }

  function layout() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    phone = W < 640;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function bounds() {
    var pad = phone ? 12 : 18, gap = phone ? 10 : 14;
    var h1 = Math.round((H - pad * 2 - gap * 2) * 0.42);
    var h2 = Math.round((H - pad * 2 - gap * 2) * 0.34);
    return {
      pad: pad, L: pad + (phone ? 14 : 22), R: W - pad - (phone ? 14 : 22),
      y1: pad, h1: h1,
      y2: pad + h1 + gap, h2: h2,
      y3: pad + h1 + gap + h2 + gap,
      h3: H - pad * 2 - gap * 2 - h1 - h2,
    };
  }

  // -------------------------------------------------------------- panel 1
  function panelQuestion(b) {
    var qq = q(), done = answered(qi);
    K.panel(b.pad, b.y1, W - b.pad * 2, b.h1,
            TR('QUESTION {0} OF {1}', qi + 1, Q.length),
            done ? (correct(qi) ? TR('RIGHT') : TR('MISSED')) : TR('YOUR CALL'),
            done ? (correct(qi) ? P.CYAN : P.RED) : P.GOLD,
            null, null);

    var top = b.y1 + (phone ? 40 : 48);
    var wrapW = (b.R - b.L);
    var ly = wrapText(TR(qq.prompt), b.L, top, wrapW, phone ? 12 : 14.5,
                      'rgba(226,238,252,0.96)', 600);
    ly = wrapText(TR(qq.hint), b.L, ly + 4, wrapW, phone ? 10 : 11.5,
                  'rgba(150,180,220,0.72)', 400);

    // the number line
    var lineY = b.y1 + b.h1 - (phone ? 44 : 56);
    var sx = function (v) {
      return b.L + (v - qq.lo) / (qq.hi - qq.lo) * (b.R - b.L);
    };
    ctx.strokeStyle = 'rgba(150,180,220,0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.L, lineY + 0.5); ctx.lineTo(b.R, lineY + 0.5); ctx.stroke();
    // endpoints
    K.tracked(fmtV(qq, qq.lo), b.L, lineY + (phone ? 16 : 19), phone ? 8 : 9,
              'rgba(150,180,220,0.5)', 0.6, 'left');
    K.tracked(fmtV(qq, qq.hi), b.R, lineY + (phone ? 16 : 19), phone ? 8 : 9,
              'rgba(150,180,220,0.5)', 0.6, 'right');

    var rev = tReveal.v, appear = M.ease.cubicOut(tIn.v);

    // the four choices at their real positions
    for (var i = 0; i < qq.choices.length; i++) {
      var cx = sx(qq.choices[i]);
      var mine = given[qi] === i;
      var isAns = i === qq.answer;
      var st = M.stagger(i, qq.choices.length, 0.45, appear);
      if (st <= 0) continue;
      var pulse = M.breathe(now, i * 1.4, 0.8, mine || (done && isAns) ? 0.6 : 0.2);
      var col = !done ? (mine ? P.GOLD : P.DEEP)
              : isAns ? P.CYAN : (mine ? P.RED : P.DEEP);
      var a = (!done ? (mine ? 0.95 : 0.5)
                     : (isAns || mine ? 0.95 : 0.22)) * pulse.a *
              M.ease.cubicOut(st);
      var rr = (mine || (done && isAns)) ? 5.5 : 3.6;
      K.dot(cx, lineY, rr * pulse.r, col, a, 0, 1.2);
      // tick down to the axis
      ctx.globalAlpha = Math.min(1, a * 0.55);
      ctx.strokeStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      ctx.beginPath();
      ctx.moveTo(cx, lineY - 9); ctx.lineTo(cx, lineY + 9); ctx.stroke();
      ctx.globalAlpha = 1;
      K.tracked(String.fromCharCode(65 + i) + '  ' + fmtV(qq, qq.choices[i]),
                cx, lineY - (phone ? 16 : 20), phone ? 8.5 : 10,
                !done ? (mine ? 'rgba(255,205,140,0.98)' : 'rgba(180,205,235,0.7)')
                      : isAns ? 'rgba(140,225,245,0.98)'
                      : mine ? 'rgba(255,140,135,0.95)' : 'rgba(150,180,220,0.35)',
                0.7, 'center');
    }

    // once answered: mark the truth and draw the gap
    if (done && rev > 0.05) {
      var tx = sx(qq.truth), mx = sx(qq.choices[given[qi]]);
      var gapEnd = mx + (tx - mx) * M.ease.cubicOut(Math.min(1, rev * 1.2));
      /* The gap goes BELOW the axis. Above it sits the band of choice labels,
         and the dashed line ran straight through them. */
      var gy = lineY + (phone ? 11 : 13);
      if (Math.abs(tx - mx) > 1.5) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,140,135,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx, gy); ctx.lineTo(gapEnd, gy); ctx.stroke();
        ctx.restore();
        var off = Math.abs(qq.truth - qq.choices[given[qi]]);
        K.tracked(TR('out by {0}', fmtV(qq, off)), (mx + gapEnd) / 2,
                  gy + (phone ? 12 : 14), phone ? 8 : 9.5,
                  'rgba(255,160,150,0.95)', 0.6, 'center');
      }
      /* pill() takes the RIGHT edge and applies its own tracking, so measuring
         with measureText alone under-reports the width; leave room for it. */
      var lab = TR('MEASURED  {0}', fmtV(qq, qq.truth));
      ctx.font = '700 9px ' + K.MONO;
      var pw = ctx.measureText(lab).width + 3 * (lab.length - 1) + 14;
      K.pill(lab, Math.max(b.L + pw, Math.min(b.R, tx + pw / 2)),
             lineY + (phone ? 30 : 36), P.CYAN, true);
    }
  }

  // -------------------------------------------------------------- panel 2
  function panelScore(b) {
    var nDone = 0, nRight = 0;
    for (var i = 0; i < Q.length; i++) {
      if (answered(i)) { nDone++; if (correct(i)) nRight++; }
    }
    K.panel(b.pad, b.y2, W - b.pad * 2, b.h2, TR('YOUR SCORECARD'),
            nDone ? nRight + ' / ' + nDone : null,
            nRight * 2 >= nDone ? P.CYAN : P.RED,
            nDone < Q.length
              ? TR('answer all six, then look for a pattern — several misses on '
                   + 'the same side is a bias, not bad luck')
              : TR('misses on the same side of the truth are systematic, and a '
                   + 'systematic error is one you can correct for'),
            null);

    var top = b.y2 + (phone ? 42 : 52), bot = b.y2 + b.h2 - (phone ? 10 : 14);
    var rows = Q.length;
    var rowH = (bot - top) / rows;
    for (i = 0; i < rows; i++) {
      var qq = Q[i];
      var y = top + rowH * (i + 0.5);
      var lx = b.L, rx = b.R - (phone ? 52 : 96);
      var sx = function (v) {
        return lx + 26 + (v - qq.lo) / (qq.hi - qq.lo) * (rx - lx - 26);
      };
      K.tracked('Q' + (i + 1), lx, y + 3, phone ? 8 : 9.5,
                i === qi ? 'rgba(255,205,140,0.95)' : 'rgba(150,180,220,0.55)',
                0.7, 'left');
      ctx.strokeStyle = i === qi ? 'rgba(255,190,120,0.28)'
                                 : 'rgba(150,180,220,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx + 26, y + 0.5); ctx.lineTo(rx, y + 0.5); ctx.stroke();

      // the truth, always shown once this question has been answered
      if (answered(i)) {
        var tx = sx(qq.truth), mx = sx(qq.choices[given[i]]);
        ctx.strokeStyle = 'rgba(255,140,135,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(tx, y); ctx.stroke();
        var pb = M.breathe(now, i * 0.8, 0.7, 0.45);
        K.dot(mx, y, 4.2 * pb.r, correct(i) ? P.CYAN : P.RED, 0.95 * pb.a, 0, 1.2);
        K.dot(tx, y, 3.4 * pb.r, P.CYAN, 0.9 * pb.a, 0, 1.0);
        K.tracked(fmtV(qq, qq.choices[given[i]]) + '  \u2192  ' + fmtV(qq, qq.truth),
                  b.R, y + 3, phone ? 7.5 : 9,
                  correct(i) ? 'rgba(140,225,245,0.85)' : 'rgba(255,160,150,0.9)',
                  0.6, 'right');
      } else {
        K.tracked(TR('not answered'), b.R, y + 3, phone ? 7.5 : 9,
                  'rgba(150,180,220,0.32)', 0.6, 'right');
      }
    }
  }

  // -------------------------------------------------------------- panel 3
  function panelWhy(b) {
    var qq = q(), done = answered(qi);
    K.panel(b.pad, b.y3, W - b.pad * 2, b.h3,
            done ? TR('WHY') : TR('WHY — ANSWER FIRST'), null, null, null, null);
    var top = b.y3 + (phone ? 38 : 46);
    if (!done) {
      wrapText(TR('Commit to an answer above before reading this. An intuition '
                  + 'you never stated is an intuition you can always claim you '
                  + 'never had.'),
               b.L, top, b.R - b.L, phone ? 10.5 : 12,
               'rgba(150,180,220,0.55)', 400);
      return;
    }
    var y = wrapText(TR(qq.bias), b.L, top, b.R - b.L, phone ? 11 : 12.5,
                     'rgba(255,205,140,0.95)', 600);
    y = wrapText(TR(qq.why), b.L, y + 3, b.R - b.L, phone ? 10.5 : 12,
                 'rgba(210,226,245,0.88)', 400);
    wrapText(TR('Worked through in {0}.', TR(qq.moduleLabel)), b.L, y + 3,
             b.R - b.L, phone ? 10 : 11, 'rgba(140,225,245,0.8)', 500);
  }

  /* Word wrap. Returns the y after the last line drawn. Canvas has no text
     layout, so a long prompt would otherwise run off the panel.

     TRACK must match the letter-spacing passed to K.tracked below, and must be
     included in the width test: tracked() inserts that many pixels between
     every glyph, so measuring with measureText alone under-reports a 70-glyph
     line by ~28px and the text ran to the panel edge. */
  var TRACK = 0.4;
  function wrapText(text, x, y, maxW, size, colour, weight) {
    ctx.font = weight + ' ' + size + 'px ' + K.MONO;
    var words = String(text).split(' ');
    var line = '', lh = size * 1.5, yy = y + size;
    function wide(t) {
      return ctx.measureText(t).width + TRACK * Math.max(0, t.length - 1);
    }
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (wide(test) > maxW && line) {
        K.tracked(line, x, yy, size, colour, TRACK, 'left');
        line = words[i]; yy += lh;
      } else {
        line = test;
      }
    }
    if (line) { K.tracked(line, x, yy, size, colour, TRACK, 'left'); }
    return yy;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    var b = bounds();
    panelQuestion(b);
    panelScore(b);
    panelWhy(b);
  }

  // -------------------------------------------------------------- state
  function labelButtons() {
    var qq = q();
    for (var i = 0; i < 4; i++) {
      var el = document.getElementById('a' + i);
      if (!el) continue;
      if (i < qq.choices.length) {
        el.textContent = String.fromCharCode(65 + i) + '  ' + fmtV(qq, qq.choices[i]);
        el.style.display = '';
        el.setAttribute('aria-pressed', given[qi] === i ? 'true' : 'false');
        el.disabled = answered(qi);
      } else {
        el.style.display = 'none';
      }
    }
  }

  function describe() {
    var qq = q(), done = answered(qi);
    /* This whole block was raw English and stayed English on the Russian page:
       it is built here rather than living in the markup, so nothing in the
       translated HTML could cover it. qq.source.split(' ')[0] is a FILE NAME
       (typical.js), so it is deliberately not translated. */
    prov.innerHTML =
      TR('<b>Question {0}</b> — the measured answer comes from <code>{1}</code>, '
         + 'which has its own verification script. ',
         qi + 1, qq.source.split(' ')[0]) +
      '<span class="src">' +
      TR('Worked through in {0}', TR(qq.moduleLabel)) +
      ' · <a href="' + qq.module + '">' + TR('open that page') + '</a></span>' +
      '<span class="flt">' +
      TR('This page reports no figure for what other people guess — there is '
         + 'no survey data behind it, only your own answer against the '
         + 'measurement.') + '</span>';
    live.textContent =
      TR('Question {0} of {1}.', qi + 1, Q.length) + ' ' +
      TR(qq.prompt) + ' ' +
      (done
        ? TR('You answered {0}. The measured answer is {1}.',
             fmtV(qq, qq.choices[given[qi]]), fmtV(qq, qq.truth)) + ' ' +
          (correct(qi) ? TR('Correct.') : TR('Not correct.'))
        : TR('Choices: {0}.',
             qq.choices.map(function (c) { return fmtV(qq, c); }).join(', ')));
  }

  function frame(dt, t) {
    now = t;
    tReveal.step(dt); tIn.step(dt);
    draw();
  }

  function restage(immediate) {
    var target = answered(qi) ? 1 : 0;
    if (immediate) { tReveal.set(target); tIn.set(1); }
    else { tReveal.to(target); tIn.set(0); tIn.to(1, 0.55); }
    labelButtons();
    describe();
    if (reduce) draw();
  }

  function start() {
    layout();
    now = performance.now() / 1000;
    tReveal.set(0); tIn.set(1);
    labelButtons();
    describe();
    if (reduce) { draw(); return; }   // one static frame, never a ticker
    tIn.set(0); tIn.to(1, 0.55);
    draw();                            // paint before the first raf
    ticker = new M.Ticker(frame);
    ticker.start();
  }

  // -------------------------------------------------------------- wiring
  var qb = document.querySelectorAll('[data-q]');
  for (var i = 0; i < qb.length; i++) {
    (function (bn) {
      bn.addEventListener('click', function () {
        var k = parseInt(bn.getAttribute('data-q'), 10);
        if (!isFinite(k) || k < 0 || k >= Q.length) return;
        qi = k;
        for (var j = 0; j < qb.length; j++)
          qb[j].setAttribute('aria-pressed', qb[j] === bn ? 'true' : 'false');
        restage(reduce);
      });
    })(qb[i]);
  }

  var ab = document.querySelectorAll('[data-a]');
  for (i = 0; i < ab.length; i++) {
    (function (bn) {
      bn.addEventListener('click', function () {
        var k = parseInt(bn.getAttribute('data-a'), 10);
        var qq = q();
        // an answer is final: changing it after seeing the truth would defeat
        // the entire point of committing to one
        if (!isFinite(k) || k < 0 || k >= qq.choices.length) return;
        if (answered(qi)) return;
        given[qi] = k;
        restage(reduce);
      });
    })(ab[i]);
  }

  var xb = document.querySelectorAll('[data-x]');
  for (i = 0; i < xb.length; i++) {
    xb[i].addEventListener('click', function () {
      for (var j = 0; j < given.length; j++) given[j] = -1;
      qi = 0;
      for (j = 0; j < qb.length; j++)
        qb[j].setAttribute('aria-pressed', j === 0 ? 'true' : 'false');
      restage(reduce);
    });
  }

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { layout(); draw(); }, 120);
  });

  start();
})();
