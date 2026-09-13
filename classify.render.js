/* ============================================================
   Accuracy and the confusion matrix — renderer.
   ------------------------------------------------------------
   The idea the page rests on: a confusion matrix IS the four
   quadrants of a scatter, once you draw both the truth line and
   the decision line. So there is one picture, not a chart plus a
   table that the reader has to marry up.

     horizontal line   the truth: $10,000. Fixed.
     vertical line     your decision rule. Draggable.
     four quadrants    TP, FP, FN, TN -- labelled in place.

   Restrictions, so nobody later mistakes one for a bug:

     RATES ARE FULL-SET  every rate comes from the precomputed
                         sweep over all 53,940 records. The scatter
                         shows a random 900, so counting dots in a
                         quadrant will not reproduce the cell
                         counts -- the sweep is the measurement and
                         the dots are the illustration. Both numbers
                         are shown so the difference is visible
                         rather than confusing.

     CUT-OFFS ARE A GRID  the slider walks the 136 cut-offs the
                         sweep measured, at 0.02 ct spacing. It
                         cannot land between them, so no figure on
                         screen is ever interpolated.

     Y IS LOG-ISH        price is drawn on a square-root scale, or
                         the cheap stones pile into a line at the
                         bottom and the quadrant structure is
                         invisible. The axis is labelled with real
                         prices, and the truth line sits where
                         $10,000 actually falls.
   ============================================================ */
(() => {
  const canvas = document.getElementById('cf');
  const C = window.UDJ_CLASSIFY, DR = window.UDJ_DRAW, M = window.UDJ_MOTION;
  if (!canvas || !C || !DR || !M) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const K = DR.kit(ctx), P = DR.PAL;

  let ci = C.cuts.indexOf(1.5);
  if (ci < 0) ci = Math.floor(C.cuts.length / 2);
  let W = 0, Hh = 0, dpr = 1, now = 0, ticker = null, dragging = false;
  let cutTw = null, pmag = null, pphase = null;
  let cellTw = null, cellFrom = null;      // the four cells animate between states

  const S = () => C.sweep[ci];
  const cutOf = i => C.cuts[Math.max(0, Math.min(C.cuts.length - 1, i))];

  function init() {
    let sd = 1907;
    const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
    pmag = new Float32Array(C.carat.length);
    pphase = new Float32Array(C.carat.length);
    for (let i = 0; i < pmag.length; i++) { pmag[i] = Math.pow(rnd(), 2.0); pphase[i] = rnd() * P.TAU; }
    cutTw = new M.Tween(cutOf(ci), cutOf(ci), 0.01, M.ease.cubicOut);
    cellFrom = cells(S());
    provenance();
    document.getElementById('s-cut').value = String(ci);
  }
  const cells = s => [s.tp, s.fp, s.fn, s.tn];

  function setCut(i, glide) {
    const prev = cells(S());
    ci = Math.max(0, Math.min(C.cuts.length - 1, i));
    document.getElementById('s-cut').value = String(ci);
    if (reduce || !glide) {
      cutTw.set(cutOf(ci)); cellFrom = cells(S()); cellTw = null;
    } else {
      cutTw.to(cutOf(ci), 0.28, M.ease.cubicOut);
      cellFrom = prev;
      cellTw = new M.Tween(0, 1, 0.4, M.ease.cubicOut);
    }
    if (reduce) paint();
  }

  function layout() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; Hh = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* price on a square-root scale: without it every cheap stone lands on the
     axis and the quadrants cannot be seen. Ticks carry real prices. */
  const YMAX = 19000;
  const yScale = v => Math.sqrt(Math.max(0, v) / YMAX);
  const XMAX = Math.min(3.2, C.carat_max);
  const pct = v => (v * 100).toFixed(2) + '%';
  const pct1 = v => (v * 100).toFixed(1) + '%';

  let plot = null;      // remembered so the pointer can hit-test the cut line

  function paint() {
    ctx.clearRect(0, 0, W, Hh);
    const s = S();
    const cutNow = cutTw ? cutTw.v : cutOf(ci);
    const cw = cellTw ? cellTw.v : 1;
    const cNow = cells(s).map((v, i) => M.lerp(cellFrom[i], v, cw));

    const sTop = 8, sBot = Math.round(Hh * 0.62);
    const mTop = sBot + 9, mBot = Hh - 8;

    /* ---------------- the scatter, cut into four quadrants ---------------- */
    K.panel(8, sTop, W - 8, sBot,
      C.question, null, P.CYAN,
      `truth line at $${C.threshold.toLocaleString('en-GB')} · decision line at ${cutNow.toFixed(2)} ct · drag it`,
      (x0, y0, x1, y1) => {
        plot = { x0, y0, x1, y1 };
        const sx = v => x0 + Math.min(1, v / XMAX) * (x1 - x0);
        const sy = v => y1 - yScale(v) * (y1 - y0);
        const ty = sy(C.threshold), tx = sx(cutNow);

        // the four quadrants, tinted by what they mean
        const Q = [
          { x: tx, y: y0, w: x1 - tx, h: ty - y0, c: P.CYAN, n: 'TRUE POSITIVE', s: 'flagged, and it was' },
          { x: tx, y: ty, w: x1 - tx, h: y1 - ty, c: P.GOLD, n: 'FALSE POSITIVE', s: 'flagged, but cheap' },
          { x: x0, y: y0, w: tx - x0, h: ty - y0, c: P.RED, n: 'FALSE NEGATIVE', s: 'missed' },
          { x: x0, y: ty, w: tx - x0, h: y1 - ty, c: P.GREY, n: 'TRUE NEGATIVE', s: 'correctly ignored' },
        ];
        for (const q of Q) {
          if (q.w <= 1 || q.h <= 1) continue;
          ctx.fillStyle = K.rgba(q.c, q.c === P.GREY ? 0.03 : 0.06);
          ctx.fillRect(q.x, q.y, q.w, q.h);
        }
        // gridlines
        ctx.font = `600 9px ${K.MONO}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let v = 0.5; v <= XMAX; v += 0.5) {
          ctx.strokeStyle = 'rgba(150,178,225,.06)';
          ctx.beginPath(); ctx.moveTo(sx(v) + .5, y0); ctx.lineTo(sx(v) + .5, y1); ctx.stroke();
          ctx.fillStyle = 'rgba(143,162,196,.8)';
          ctx.fillText(v.toFixed(1) + ' ct', sx(v), y1 + 5);
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (const v of [500, 2000, 5000, 10000, 15000]) {
          ctx.strokeStyle = v === C.threshold ? 'rgba(255,196,116,.0)' : 'rgba(150,178,225,.06)';
          ctx.beginPath(); ctx.moveTo(x0, sy(v) + .5); ctx.lineTo(x1, sy(v) + .5); ctx.stroke();
          ctx.fillStyle = 'rgba(143,162,196,.8)';
          ctx.fillText('$' + K.fmtNum(v), x0 - 5, sy(v));
        }
        // the stones
        /* Normal compositing plus a rim, not 'lighter': the cheap stones
           pile up densely at the bottom left and additive blending turned that
           whole corner into one white mass, hiding the quadrant boundary that
           the page is about. Mistakes are drawn LAST so they sit on top. */
        const ord = [];
        for (let i = 0; i < C.carat.length; i++) ord.push(i);
        ord.sort((a2, b2) => {
          const wa = (C.label[a2] === (C.carat[a2] >= cutNow)) ? 0 : 1;
          const wb = (C.label[b2] === (C.carat[b2] >= cutNow)) ? 0 : 1;
          return wa - wb;
        });
        /* Round dots at full colour, no halo. Mistakes are larger and carry
           a heavier rim so they stand out of the correct mass on contrast and
           size rather than on a glow. Mistakes draw last, so they sit on top. */
        for (const i of ord) {
          const m = pmag[i], hot = C.label[i];
          const flagged = C.carat[i] >= cutNow;
          const right = hot === flagged;
          const c = hot ? (flagged ? P.CYAN : P.RED) : (flagged ? P.GOLD : P.DEEP);
          const br = M.breathe(now, pphase[i], 0.8 + m * 1.1, right ? 0.3 : 0.6);
          K.dot(sx(C.carat[i]), sy(C.price[i]),
                (right ? 2.4 : 3.0) * br.r, c,
                (right ? 0.82 : 1) * br.a, 0, right ? 1.0 : 1.4);
        }

        // the truth line: fixed, and not yours to move
        ctx.strokeStyle = K.rgba(P.GOLD, .55); ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(x0, ty + .5); ctx.lineTo(x1, ty + .5); ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        K.tracked(`THE TRUTH · $${C.threshold.toLocaleString('en-GB')}`, x0 + 4, ty - 4, 9,
                  K.rgba(P.GOLD, .9), 1.5, 'left');

        // the decision line: yours, and glowing so it reads as the handle
        const pu = 0.85 + 0.15 * Math.sin(now * 2.1);
        ctx.strokeStyle = K.rgba(P.PALE, .25); ctx.lineWidth = 7 * pu;
        ctx.beginPath(); ctx.moveTo(tx, y0); ctx.lineTo(tx, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,248,255,.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(tx + .5, y0); ctx.lineTo(tx + .5, y1); ctx.stroke();
        K.dot(tx, y0 - 1, 5 * pu, P.PALE, 1, 1.3);
        K.dot(tx, y1 + 1, 5 * pu, P.PALE, 1, 1.3);

        // quadrant labels, with both the full-set count and the dots on screen
        ctx.textBaseline = 'top';
        const shown = [0, 0, 0, 0];
        for (let i = 0; i < C.carat.length; i++) {
          const hot = C.label[i], flg = C.carat[i] >= cutNow;
          shown[hot ? (flg ? 0 : 2) : (flg ? 1 : 3)]++;
        }
        Q.forEach((q, i) => {
          if (q.w < 84 || q.h < 40) return;
          const lx = q.x + 8, ly = q.y + 7;
          K.tracked(q.n, lx, ly + 8, 9, K.rgba(q.c, .95), 1.5, 'left');
          ctx.font = `700 15px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillStyle = K.rgba(q.c, .95);
          ctx.fillText(Math.round(cNow[i]).toLocaleString('en-GB'), lx, ly + 14);
          ctx.font = `600 9px ${K.MONO}`;
          ctx.fillStyle = 'rgba(143,162,196,.8)';
          ctx.fillText(`${q.s} · ${shown[i]} shown`, lx, ly + 33);
        });
      });

    /* ---------------- the four metrics as bars ---------------- */
    const gap = 9, colW = (W - 16 - gap) / 2;
    const m1x0 = 8, m1x1 = 8 + colW, m2x0 = m1x1 + gap, m2x1 = W - 8;
    const beats = s.acc - C.trivial_accuracy;
    K.panel(m1x0, mTop, m1x1, mBot, 'the score everyone quotes',
      beats > 0.005 ? 'BEATS DOING NOTHING' : 'NO BETTER THAN NOTHING',
      beats > 0.005 ? P.CYAN : P.RED,
      `accuracy ${pct(s.acc)} · doing nothing scores ${pct(C.trivial_accuracy)}`,
      (x0, y0, x1, y1) => {
        // accuracy against the do-nothing baseline, on a zoomed scale, because
        // both numbers live in the top 10% and a 0..1 axis hides the gap
        const lo = 0.85, hi = 1.0;
        const bx = v => x0 + M.clamp01((v - lo) / (hi - lo)) * (x1 - x0);
        ctx.fillStyle = 'rgba(150,178,225,.07)';
        K.roundRect(x0, y0 + 14, x1 - x0, 26, 3); ctx.fill();
        const w = bx(s.acc) - x0;
        const gr = ctx.createLinearGradient(x0, 0, x0 + Math.max(w, 1), 0);
        gr.addColorStop(0, K.rgba(P.CYAN, .3));
        gr.addColorStop(1, K.rgba(P.CYAN, .8));
        ctx.fillStyle = gr;
        K.roundRect(x0, y0 + 14, Math.max(1, w), 26, 3); ctx.fill();
        // the do-nothing line
        const tvx = bx(C.trivial_accuracy);
        ctx.strokeStyle = K.rgba(P.RED, .9); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(tvx, y0 + 8); ctx.lineTo(tvx, y0 + 46); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        K.tracked('DOING NOTHING', tvx, y0 + 6, 9, K.rgba(P.RED, .9), 1.4, 'center');
        ctx.font = `700 13px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(240,248,255,.95)';
        ctx.fillText(pct(s.acc), x0 + 8, y0 + 27);
        ctx.font = `600 10px ${K.MONO}`;
        ctx.fillStyle = 'rgba(143,162,196,.85)'; ctx.textBaseline = 'top';
        ctx.fillText(`scale starts at ${(lo * 100).toFixed(0)}% — both numbers live up here`,
                     x0, y0 + 50);
        ctx.fillStyle = beats > 0.005 ? K.rgba(P.CYAN, .95) : K.rgba(P.RED, .95);
        ctx.fillText(`${beats >= 0 ? '+' : '−'}${Math.abs(beats * 100).toFixed(2)} points `
                     + `${beats >= 0 ? 'better' : 'worse'} than predicting "no" every time`,
                     x0, y0 + 66);
      });

    K.panel(m2x0, mTop, m2x1, mBot, 'the two that cannot be gamed', null, P.CYAN,
      `precision ${s.prec === null ? '—' : pct1(s.prec)} · recall ${pct1(s.rec)} · F1 ${s.f1 === null ? '—' : pct1(s.f1)}`,
      (x0, y0, x1, y1) => {
        const rows = [
          { n: 'PRECISION', v: s.prec, c: P.GOLD, s: 'of those flagged, right' },
          { n: 'RECALL', v: s.rec, c: P.CYAN, s: 'of what mattered, caught' },
          { n: 'F1', v: s.f1, c: P.VIO, s: 'both at once' },
        ];
        const h = 20, step = Math.min(30, (y1 - y0 - 6) / rows.length);
        rows.forEach((r, i) => {
          const yy = y0 + 6 + i * step;
          ctx.fillStyle = 'rgba(150,178,225,.07)';
          K.roundRect(x0 + 96, yy, x1 - x0 - 150, h, 3); ctx.fill();
          const wmax = x1 - x0 - 150;
          const w = (r.v || 0) * wmax;
          const gr = ctx.createLinearGradient(x0 + 96, 0, x0 + 96 + Math.max(w, 1), 0);
          gr.addColorStop(0, K.rgba(r.c, .28));
          gr.addColorStop(1, K.rgba(r.c, .85));
          ctx.fillStyle = gr;
          K.roundRect(x0 + 96, yy, Math.max(1, w), h, 3); ctx.fill();
          if (w > 3) {
            const pu2 = 0.7 + 0.3 * Math.sin(now * 1.6 + i * 0.8);
            ctx.globalAlpha = 0.4 * pu2;
            ctx.drawImage(K.bloom(r.c), x0 + 96 + w - 10, yy - 6, 20, h + 12);
            ctx.globalAlpha = 1;
          }
          ctx.textBaseline = 'middle';
          K.tracked(r.n, x0 + 90, yy + h / 2 + 3, 9, K.rgba(r.c, .95), 1.5, 'right');
          ctx.font = `700 11px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(240,248,255,.95)';
          ctx.fillText(r.v === null ? '—' : pct1(r.v), x1 - 48, yy + h / 2);
        });
        ctx.font = `600 9px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(143,162,196,.8)';
        ctx.fillText('drag the line: precision and recall trade against each other',
                     x0, y1 - 12);
      });

    readouts(s, cutNow, beats);
  }

  const $ = id => document.getElementById(id);
  function readouts(s, cutNow, beats) {
    $('v-acc').textContent = pct(s.acc);
    $('v-acc-s').textContent = `at ${cutNow.toFixed(2)} ct`;
    $('v-triv').textContent = pct(C.trivial_accuracy);
    $('v-rec').textContent = pct1(s.rec);
    $('r-cut').textContent = cutNow.toFixed(2) + ' ct';
    $('r-prec').textContent = s.prec === null ? '—' : pct1(s.prec);
    $('r-f1').textContent = s.f1 === null ? '—' : pct1(s.f1);
    $('r-base').textContent = pct(C.base_rate);
    $('r-fn').textContent = s.fn.toLocaleString('en-GB');
    $('r-fp').textContent = s.fp.toLocaleString('en-GB');
    $('r-lift').textContent = (beats >= 0 ? '+' : '−') + Math.abs(beats * 100).toFixed(2);
    $('r-lift').className = 'v ' + (beats > 0.005 ? 'on' : 'bad');
    $('r-n').textContent = C.n_source.toLocaleString('en-GB');
    $('hint').textContent =
      `At ${cutNow.toFixed(2)} ct you flag ${(s.tp + s.fp).toLocaleString('en-GB')} stones, `
      + `${s.tp.toLocaleString('en-GB')} of them correctly, and miss `
      + `${s.fn.toLocaleString('en-GB')} expensive ones. Accuracy ${pct(s.acc)} against `
      + `${pct(C.trivial_accuracy)} for predicting "no" every time — `
      + (beats > 0.005 ? `${(beats * 100).toFixed(2)} points of real gain.`
                       : 'no real gain at all.');
  }

  function provenance() {
    $('prov').innerHTML =
      `<div class="cap">Data source</div>
       <p><a href="${C.url}" target="_blank" rel="noopener">${C.source}</a> — ${C.what}</p>
       <ul>${C.filters.map(f => `<li>${f}</li>`).join('')}</ul>
       <p style="font-size:var(--micro);color:var(--muted-2);font-family:var(--font-mono)">
         Every rate is measured over all ${C.n_source.toLocaleString('en-GB')} records across
         ${C.cuts.length} candidate cut-offs, so nothing on screen is interpolated. The
         scatter shows ${C.n_embed.toLocaleString('en-GB')} drawn at random, and each
         quadrant prints both its full-set count and how many dots are visible in it.</p>`;
  }

  /* ---------------- interaction ---------------- */
  function xToIndex(px) {
    if (!plot) return ci;
    const t = (px - plot.x0) / (plot.x1 - plot.x0);
    const carat = M.clamp01(t) * XMAX;
    // snap to the nearest measured cut-off: no figure is ever interpolated
    let best = 0, bd = Infinity;
    for (let i = 0; i < C.cuts.length; i++) {
      const d = Math.abs(C.cuts[i] - carat);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function down(e) {
    const p = pos(e);
    if (!plot || p.y < plot.y0 - 20 || p.y > plot.y1 + 20) return;
    dragging = true;
    setCut(xToIndex(p.x), false);
    e.preventDefault();
  }
  function move(e) {
    if (!dragging) return;
    setCut(xToIndex(pos(e).x), false);
    e.preventDefault();
  }
  function up() { dragging = false; }
  canvas.addEventListener('mousedown', down);
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', up);

  $('s-cut').addEventListener('input', e => setCut(+e.target.value, false));
  document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.p;
    let target = ci;
    if (p === 'acc') target = C.cuts.indexOf(C.best_acc_cut);
    else if (p === 'f1') target = C.cuts.indexOf(C.best_f1_cut);
    else target = C.cuts.length - 1;          // the highest cut-off: flag almost nothing
    if (target < 0) target = ci;
    setCut(target, true);
    const s = C.sweep[target];
    $('live').textContent = p === 'none'
      ? `Cut-off pushed to ${cutOf(target).toFixed(2)} carats: accuracy ${pct(s.acc)}, recall ${pct1(s.rec)}.`
      : `Best ${p === 'acc' ? 'accuracy' : 'F1'} at ${cutOf(target).toFixed(2)} carats: `
        + `accuracy ${pct(s.acc)}, recall ${pct1(s.rec)}.`;
  }));
  addEventListener('resize', () => { layout(); paint(); });

  init();
  layout();
  paint();
  if (!reduce) {
    ticker = new M.Ticker((dt, t) => {
      now = t;
      if (cutTw) cutTw.step(dt);
      if (cellTw) { cellTw.step(dt); if (cellTw.done) cellTw = null; }
      paint();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { ticker.visible = es[0].isIntersecting; },
                               { threshold: 0.01 }).observe(canvas);
    }
    ticker.start();
  }
})();
