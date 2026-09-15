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

  /* ---- translation ------------------------------------------------------
     TR's key IS the English string, so a missing entry falls back to correct
     English and the English page needs no strings table. {0}/{1} are
     positional so a translation may reorder them. Pure notation is never
     wrapped: its translation would equal its key.                        */
  function TR(k) {
    const m = window.UDJ_STRINGS;
    let s = (m && m[k]) || k;
    for (let i = 1; i < arguments.length; i++) s = s.replace('{' + (i - 1) + '}', arguments[i]);
    return s;
  }
  const UDJ_LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale) || 'en-GB';
  const grp = v => Number(v).toLocaleString(UDJ_LOC);
  const dec = (v, dp) => (Math.abs(Number(v)) < Math.pow(10, -dp) / 2 ? 0 : Number(v))
    .toLocaleString(UDJ_LOC, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  /* Namespaced so the carat abbreviation cannot collide with a bare unit
     elsewhere in the course; the fallback keeps the English page correct. */
  const unit = (k, fb) => { const m = window.UDJ_STRINGS; return (m && m[k]) || fb; };
  const CT = () => unit('__unit_ct', 'ct');

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
  const pct = v => dec(v * 100, 2) + '%';
  const pct1 = v => dec(v * 100, 1) + '%';

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
      TR(C.question), null, P.CYAN,
      TR('truth line at {0} · decision line at {1} · drag it',
         '$' + grp(C.threshold), dec(cutNow, 2) + ' ' + CT()),
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
          /* n and s are TR KEYS, resolved where they are drawn below. */
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
          ctx.fillText(dec(v, 1) + ' ' + CT(), sx(v), y1 + 5);
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
        K.tracked(TR('THE TRUTH') + ' · $' + grp(C.threshold), x0 + 4, ty - 4, 9,
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
          /* Vertical budget, measured rather than guessed. The name is drawn
             with baseline 'top' (set above) at ly+8, so it occupies ly+8..ly+17
             — the count used to start at ly+14 and overlapped it by 3px in BOTH
             locales. The count now clears the name, and the guard matches the
             space the three lines actually need (name + 15px count + 9px gloss
             ≈ 43px below ly, itself q.y+7). */
          if (q.w < 84 || q.h < 56) return;
          const lx = q.x + 8, ly = q.y + 7;
          const nm = TR(q.n), cnt = grp(Math.round(cNow[i]));
          const gloss = TR(q.s) + ' · ' + TR('{0} shown', grp(shown[i]));

          /* A backing plate under the label group. The dots are drawn before
             this and the text after, so the text is already on top — but in
             the two FLAGGED quadrants the dot field is dense enough to read
             THROUGH the gaps between glyphs: the thousands space in '4 388'
             took a dot and read as '4•388', and the leading '2' of '2 847'
             was lost in the gold mass. Both locales, both pre-existing. The
             plate is opaque enough to stop a bright dot bleeding through: at
             .72 a full-brightness dot still showed at ~28% and the thousands
             gap in '4 388' kept reading as '4•388'. */
          ctx.font = `600 9px ${K.MONO}`;
          const wName = ctx.measureText(nm).width + nm.length * 1.5;  // tracking
          const wGloss = ctx.measureText(gloss).width;
          ctx.font = `700 15px ${K.MONO}`;
          const wCount = ctx.measureText(cnt).width;
          const plate = Math.min(Math.max(wName, wGloss, wCount) + 11, q.w - 9);
          ctx.fillStyle = 'rgba(9,12,20,.93)';
          K.roundRect(lx - 5, ly + 2, plate, 45, 3); ctx.fill();

          K.tracked(nm, lx, ly + 8, 9, K.rgba(q.c, .95), 1.5, 'left');
          ctx.font = `700 15px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillStyle = K.rgba(q.c, .95);
          ctx.fillText(cnt, lx, ly + 19);
          ctx.font = `600 9px ${K.MONO}`;
          ctx.fillStyle = 'rgba(143,162,196,.85)';
          ctx.fillText(gloss, lx, ly + 36);
        });
      });

    /* ---------------- the four metrics as bars ---------------- */
    const gap = 9, colW = (W - 16 - gap) / 2;
    const m1x0 = 8, m1x1 = 8 + colW, m2x0 = m1x1 + gap, m2x1 = W - 8;
    const beats = s.acc - C.trivial_accuracy;
    /* The title and the verdict pill share one row in a half-width panel, so
       both are kept short: 'BEATS DOING NOTHING' pushed the pill over the last
       word of the title in BOTH locales. */
    K.panel(m1x0, mTop, m1x1, mBot, TR('the score everyone quotes'),
      beats > 0.005 ? TR('REAL GAIN') : TR('NO GAIN'),
      beats > 0.005 ? P.CYAN : P.RED,
      TR('accuracy {0} · doing nothing scores {1}',
         pct(s.acc), pct(C.trivial_accuracy)),
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
        K.tracked(TR('DOING NOTHING'), tvx, y0 + 6, 9, K.rgba(P.RED, .9), 1.4, 'center');
        ctx.font = `700 13px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(240,248,255,.95)';
        ctx.fillText(pct(s.acc), x0 + 8, y0 + 27);
        ctx.font = `600 10px ${K.MONO}`;
        ctx.fillStyle = 'rgba(143,162,196,.85)'; ctx.textBaseline = 'top';
        ctx.fillText(TR('scale starts at {0} — both numbers live up here',
                        dec(lo * 100, 0) + '%'), x0, y0 + 50);
        ctx.fillStyle = beats > 0.005 ? K.rgba(P.CYAN, .95) : K.rgba(P.RED, .95);
        /* Two whole keys rather than a glued comparative: Russian needs its
           own word order, which a spliced 'better'/'worse' cannot give. Kept
           short because at 10px mono this line ran past the panel's right
           edge on the English page. */
        const lift = (beats >= 0 ? '+' : '−') + dec(Math.abs(beats * 100), 2);
        ctx.fillText(beats >= 0
                     ? TR('{0} points better than always predicting "no"', lift)
                     : TR('{0} points worse than always predicting "no"', lift),
                     x0, y0 + 66);
      });

    K.panel(m2x0, mTop, m2x1, mBot, TR('the two that cannot be gamed'), null, P.CYAN,
      TR('precision {0} · recall {1} · F1 {2}',
         s.prec === null ? '—' : pct1(s.prec), pct1(s.rec),
         s.f1 === null ? '—' : pct1(s.f1)),
      (x0, y0, x1, y1) => {
        const rows = [
          /* n and s are TR keys, resolved at draw time. 'F1' is notation and
             deliberately has NO table entry: it falls through unchanged. */
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
          K.tracked(TR(r.n), x0 + 90, yy + h / 2 + 3, 9, K.rgba(r.c, .95), 1.5, 'right');
          ctx.font = `700 11px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(240,248,255,.95)';
          ctx.fillText(r.v === null ? '—' : pct1(r.v), x1 - 48, yy + h / 2);
        });
        ctx.font = `600 9px ${K.MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(143,162,196,.8)';
        ctx.fillText(TR('drag the line: precision and recall trade against each other'),
                     x0, y1 - 12);
      });

    readouts(s, cutNow, beats);
  }

  const $ = id => document.getElementById(id);
  function readouts(s, cutNow, beats) {
    $('v-acc').textContent = pct(s.acc);
    $('v-acc-s').textContent = TR('at {0}', dec(cutNow, 2) + ' ' + CT());
    $('v-triv').textContent = pct(C.trivial_accuracy);
    $('v-rec').textContent = pct1(s.rec);
    $('r-cut').textContent = dec(cutNow, 2) + ' ' + CT();
    $('r-prec').textContent = s.prec === null ? '—' : pct1(s.prec);
    $('r-f1').textContent = s.f1 === null ? '—' : pct1(s.f1);
    $('r-base').textContent = pct(C.base_rate);
    $('r-fn').textContent = grp(s.fn);
    $('r-fp').textContent = grp(s.fp);
    $('r-lift').textContent = (beats >= 0 ? '+' : '−') + dec(Math.abs(beats * 100), 2);
    $('r-lift').className = 'v ' + (beats > 0.005 ? 'on' : 'bad');
    $('r-n').textContent = grp(C.n_source);
    const gain = beats > 0.005
      ? TR('{0} points of real gain.', dec(beats * 100, 2))
      : TR('no real gain at all.');
    $('hint').textContent =
      TR('At {0} you flag {1} stones, {2} of them correctly, and miss {3} expensive ones.',
         dec(cutNow, 2) + ' ' + CT(), grp(s.tp + s.fp), grp(s.tp), grp(s.fn))
      + ' '
      + TR('Accuracy {0} against {1} for predicting "no" every time — {2}',
           pct(s.acc), pct(C.trivial_accuracy), gain);
  }

  function provenance() {
    $('prov').innerHTML =
      `<div class="cap">${TR('Data source')}</div>
       <p><a href="${C.url}" target="_blank" rel="noopener">${TR(C.source)}</a> — ${TR(C.what)}</p>
       <ul>${C.filters.map(f => `<li>${TR(f)}</li>`).join('')}</ul>
       <p style="font-size:var(--micro);color:var(--muted-2);font-family:var(--font-mono)">
         ${TR('Every rate is measured over all {0} records across {1} candidate cut-offs, '
              + 'so nothing on screen is interpolated. The scatter shows {2} drawn at '
              + 'random, and each quadrant prints both its full-set count and how many '
              + 'dots are visible in it.',
              grp(C.n_source), grp(C.cuts.length), grp(C.n_embed))}</p>`;
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
    const at = dec(cutOf(target), 2) + ' ' + CT();
    $('live').textContent = p === 'none'
      ? TR('Cut-off pushed to {0}: accuracy {1}, recall {2}.', at, pct(s.acc), pct1(s.rec))
      : p === 'acc'
        ? TR('Best accuracy at {0}: accuracy {1}, recall {2}.', at, pct(s.acc), pct1(s.rec))
        : TR('Best F1 at {0}: accuracy {1}, recall {2}.', at, pct(s.acc), pct1(s.rec));
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
