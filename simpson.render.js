/* ============================================================
   Simpson's paradox — renderer.
   ------------------------------------------------------------
   The whole page is one gesture: pick a size band and watch the
   price bars FLIP. So the bars are tweened, never redrawn, and
   the size panel sits beside them the whole time because that
   downward slope is the mechanism rather than a footnote.

   Restrictions, so nobody later mistakes one for a bug:

     TWO PANELS, TWO UNITS  price in dollars, size in carats. They
                            share a grade axis and nothing else.

     BARS ARE FULL-SET      every bar is an average over all 53,940
                            records (or all records in the chosen
                            band). The scatter shows a random 900,
                            so a bar will not equal the eyeballed
                            centre of the dots above it -- the bars
                            are the measurement, the dots are the
                            illustration.

     EMPTY CELLS            some grade x band cells are thin (fewer
                            than 30 stones). Those bars are drawn
                            hollow and excluded from the direction
                            verdict, because an average of eleven
                            stones is not evidence of an ordering.
   ============================================================ */
(() => {
  const canvas = document.getElementById('sp');
  const S = window.UDJ_SIMPSON, DR = window.UDJ_DRAW, M = window.UDJ_MOTION;
  if (!canvas || !S || !DR || !M) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const K = DR.kit(ctx), P = DR.PAL;
  const MIN_CELL = 30;

  let gKey = 'color', band = -1;
  let W = 0, Hh = 0, dpr = 1, phone = false, now = 0, ticker = null;
  let A = null, B = null, morph = null;      // bar states
  let pmag = null, pphase = null;

  const G = () => S.gradings[gKey];

  /* a bar state: one mean price and one mean size per grade, plus how many
     stones each is averaged over so a thin cell can be drawn as thin */
  function buildState(key, b) {
    const g = S.gradings[key];
    const n = g.order.length;
    const price = [], size = [], count = [];
    for (let i = 0; i < n; i++) {
      if (b < 0) {
        price.push(g.groups[i].mean_price);
        size.push(g.groups[i].mean_carat);
        count.push(g.groups[i].n);
      } else {
        const cell = g.bands[b][i];
        price.push(cell.mean_price);
        size.push(null);                     // size is only shown for all-sizes
        count.push(cell.n);
      }
    }
    // within a band, sizes are by construction almost equal -- that is the
    // point of the band -- so the size panel keeps showing the all-sizes
    // figures, which is what explains the flip
    const allSize = g.groups.map(q => q.mean_carat);
    const shown = count.reduce((s, c) => s + c, 0);
    return { key, band: b, order: g.order, price, size: allSize, count, shown,
             label: g.label, worst: g.worst, best: g.best,
             bands_correct: g.bands_correct, bands_tested: g.bands_tested,
             agg_reversed: g.agg_reversed };
  }

  function retarget() {
    const next = buildState(gKey, band);
    if (reduce || !A) { A = next; B = null; morph = null; return; }
    if (morph && B) A = B;
    B = next;
    morph = new M.Tween(0, 1, 0.85, M.ease.cubicInOut);
  }

  function init() {
    let sd = 1907;
    const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
    pmag = new Float32Array(S.carat.length);
    pphase = new Float32Array(S.carat.length);
    for (let i = 0; i < pmag.length; i++) { pmag[i] = Math.pow(rnd(), 2.0); pphase[i] = rnd() * P.TAU; }
    A = buildState(gKey, band);
    provenance();
  }

  function layout() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; Hh = r.height; phone = W < 620;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const lerp = M.lerp;
  /* Digit grouping follows the page's locale, declared by the strings table.
     Hard-coding en-GB made the canvas print $5,324 next to Russian prose
     saying $5 324 — the same number formatted two ways on one screen. */
  const LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale) || 'en-GB';
  const money = v => '$' + Math.round(v).toLocaleString(LOC);
  /* toFixed always emits a decimal POINT regardless of locale, so carat values
     printed "1.16 ct" beside Russian prose that writes 1,16. toLocaleString with
     fixed fraction digits gets the separator and the grouping right. */
  const dec = (v, dp) => Number(v).toLocaleString(LOC, {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  });


  function paint() {
    if (!A) return;
    const p = morph ? morph.v : 1;
    const T = B || A;
    const settled = !morph || morph.done;
    ctx.clearRect(0, 0, W, Hh);

    const n = T.order.length;
    const sTop = 8, sBot = Math.round(Hh * 0.46);
    const gap = 9, bTop = sBot + gap, bBot = Hh - 8;
    const colW = (W - 16 - gap) / 2;
    const c1x0 = 8, c1x1 = 8 + colW, c2x0 = c1x1 + gap, c2x1 = W - 8;

    const lo = band < 0 ? null : S.bands[band];

    /* ---------------- the scatter ---------------- */
    K.panel(8, sTop, W - 8, sBot,
      TR('every stone · size against price · coloured by {0}', TR(T.label).toLowerCase()),
      null, P.CYAN,
      lo ? TR('showing all, highlighting {0}–{1} ct', lo.lo, lo.hi)
         : TR('showing all sizes'),
      (x0, y0, x1, y1) => {
        let xm = 0, ym = 0;
        for (let i = 0; i < S.carat.length; i++) {
          if (S.carat[i] > xm) xm = S.carat[i];
          if (S.price[i] > ym) ym = S.price[i];
        }
        xm *= 1.04; ym *= 1.05;
        const sx = v => x0 + v / xm * (x1 - x0);
        const sy = v => y1 - v / ym * (y1 - y0);
        // grid
        ctx.font = `600 9px ${K.MONO}`;
        const xs = K.tickStep(xm), ys = K.tickStep(ym);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let v = xs; v <= xm; v += xs) {
          ctx.strokeStyle = 'rgba(150,178,225,.07)';
          ctx.beginPath(); ctx.moveTo(sx(v) + .5, y0); ctx.lineTo(sx(v) + .5, y1); ctx.stroke();
          ctx.fillStyle = 'rgba(143,162,196,.8)';
          ctx.fillText(dec(v, 1) + ' ct', sx(v), y1 + 5);
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let v = ys; v <= ym; v += ys) {
          ctx.strokeStyle = 'rgba(150,178,225,.07)';
          ctx.beginPath(); ctx.moveTo(x0, sy(v) + .5); ctx.lineTo(x1, sy(v) + .5); ctx.stroke();
          ctx.fillStyle = 'rgba(143,162,196,.8)';
          ctx.fillText(K.fmtNum(v), x0 - 5, sy(v));
        }
        // the band, as a lit column behind the points
        if (lo) {
          const bx0 = sx(lo.lo), bx1 = sx(lo.hi);
          ctx.fillStyle = 'rgba(255,196,116,.07)';
          ctx.fillRect(bx0, y0, bx1 - bx0, y1 - y0);
          ctx.strokeStyle = 'rgba(255,196,116,.4)'; ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(bx0 + .5, y0); ctx.lineTo(bx0 + .5, y1);
          ctx.moveTo(bx1 - .5, y0); ctx.lineTo(bx1 - .5, y1);
          ctx.stroke(); ctx.setLineDash([]);
        }
        /* Deliberately NOT additive. 'lighter' is right for a sparse
           particle field, but here 900 points overlap and additively sum to
           white, which erases both the grade colour and every dot edge. Normal
           compositing plus a dark rim keeps each stone a distinct object, and
           the highlighted band is separated by opacity rather than by glow. */
        const grade = G().grade;
        const order = [];
        for (let i = 0; i < S.carat.length; i++) order.push(i);
        // dimmed stones first, so highlighted ones are never buried under them
        if (lo) order.sort((a2, b2) => {
          const ia = (S.carat[a2] >= lo.lo && S.carat[a2] < lo.hi) ? 1 : 0;
          const ib = (S.carat[b2] >= lo.lo && S.carat[b2] < lo.hi) ? 1 : 0;
          return ia - ib;
        });
        /* Round dots at FULL colour: solid fill, no halo, and a dark rim so
           overlapping stones still read as separate objects. The three things
           that actually caused the earlier mud are all still fixed -- the
           saturated ramp, normal (not additive) compositing, and near-opaque
           alpha -- because none of those were about the shape. */
        for (const i of order) {
          const inBand = !lo || (S.carat[i] >= lo.lo && S.carat[i] < lo.hi);
          const m = pmag[i];
          const br = M.breathe(now, pphase[i], 0.8 + m * 1.1, inBand ? 0.55 : 0.15);
          const c = K.gradeColour(grade[i], n);
          const a = (inBand ? 0.96 : 0.22) * br.a;
          const r = (2.5 + m * 1.1) * br.r * (inBand ? 1 : 0.72);
          K.dot(sx(S.carat[i]), sy(S.price[i]), r, c, a, 0, inBand ? 1.1 : 0.6);
        }
        // the grade legend, worst → best
        let lx = x0 + 2;
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        for (let i = 0; i < n; i++) {
          const c = K.gradeColour(i, n);
          K.dot(lx + 4, y0 + 8, 3.6, c, 1, 0, 1.2);
          const w = K.tracked(T.order[i], lx + 11, y0 + 11, 9, K.rgba(c, .95), 1.2, 'left');
          lx += 11 + w + 12;
        }
        K.tracked(TR('WORST → BEST'), x1 - 2, y0 + 11, 9, 'rgba(116,134,159,.8)', 1.6, 'right');
      });

    /* ---------------- mean price by grade: the flip ---------------- */
    const dirNow = (() => {
      const q = T.price, cs = T.count;
      const idx = [];
      for (let i = 0; i < n; i++) if (q[i] !== null && cs[i] >= MIN_CELL) idx.push(i);
      if (idx.length < 2) return 0;
      return q[idx[idx.length - 1]] - q[idx[0]];
    })();
    K.panel(c1x0, bTop, c1x1, bBot,
      lo ? TR('mean price · {0}–{1} ct only', lo.lo, lo.hi) : TR('mean price · all sizes'),
      dirNow >= 0 ? TR('AS EXPECTED') : TR('REVERSED'), dirNow >= 0 ? P.CYAN : P.RED,
      dirNow >= 0 ? TR('better grade costs more') : TR('better grade costs LESS'),
      (x0, y0, x1, y1) => bars(x0, y0, x1, y1, A.price, T.price, T.count, p, n, T.order,
                              money, dirNow >= 0 ? null : P.RED));

    /* ---------------- mean size by grade: the mechanism ---------------- */
    K.panel(c2x0, bTop, c2x1, bBot, TR('mean size · all sizes'), TR('THE CONFOUND'), P.GOLD,
      TR('top grades are small stones'),
      (x0, y0, x1, y1) => bars(x0, y0, x1, y1, A.size, T.size, T.count, p, n, T.order,
                               v => dec(v, 2) + ' ct', P.GOLD));

    readouts(T, dirNow);
  }

  /* one bar group. `from`/`to` are tweened, a thin cell is drawn hollow. */
  function bars(x0, y0, x1, y1, from, to, count, p, n, names, fmt, forceCol) {
    let mx = 0;
    for (let i = 0; i < n; i++) {
      const a = from[i], b = to[i];
      if (a !== null) mx = Math.max(mx, a);
      if (b !== null) mx = Math.max(mx, b);
    }
    mx = (mx || 1) * 1.18;
    const bw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = from[i] === null ? 0 : from[i];
      const b = to[i] === null ? 0 : to[i];
      const v = lerp(a, b, p);
      const thin = count[i] < MIN_CELL || to[i] === null;
      const col = forceCol || K.gradeColour(i, n);
      const h = (v / mx) * (y1 - y0 - 4);
      const bx = x0 + i * bw + 2, bwid = bw - 4;
      if (thin) {
        ctx.strokeStyle = K.rgba(col, .4); ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        K.roundRect(bx + .5, y1 - h + .5, bwid - 1, Math.max(1, h - 1), 2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const gr = ctx.createLinearGradient(0, y1 - h, 0, y1);
        gr.addColorStop(0, K.rgba(col, .85));
        gr.addColorStop(1, K.rgba(col, .2));
        ctx.fillStyle = gr;
        K.roundRect(bx, y1 - h, bwid, h, Math.min(3, bwid / 2)); ctx.fill();
        const pu = 0.75 + 0.25 * Math.sin(now * 1.4 + i * 0.6);
        ctx.globalAlpha = 0.45 * pu;
        ctx.drawImage(K.bloom(col), bx - 7, y1 - h - 8, bwid + 14, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = K.rgba(col, .95);
        ctx.fillRect(bx, y1 - h, bwid, 2);
      }
      // value above, grade below
      ctx.font = `700 9px ${K.MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = thin ? 'rgba(116,134,159,.75)' : 'rgba(230,240,255,.92)';
      ctx.fillText(to[i] === null ? '—' : fmt(v), bx + bwid / 2, y1 - h - 5);
      ctx.textBaseline = 'top';
      ctx.fillStyle = K.rgba(K.gradeColour(i, n), .9);
      ctx.fillText(names[i], bx + bwid / 2, y1 + 4);
      if (thin && to[i] !== null) {
        ctx.fillStyle = 'rgba(116,134,159,.7)'; ctx.font = `600 8px ${K.MONO}`;
        ctx.fillText(`n=${count[i]}`, bx + bwid / 2, y1 + 15);
      }
    }
    // the trend, drawn as an arrow across the tops
    const pts = [];
    for (let i = 0; i < n; i++) {
      if (to[i] === null || count[i] < MIN_CELL) continue;
      const v = lerp(from[i] === null ? 0 : from[i], to[i], p);
      pts.push([x0 + i * ((x1 - x0) / n) + ((x1 - x0) / n) / 2, y1 - (v / mx) * (y1 - y0 - 4)]);
    }
    if (pts.length > 1) {
      ctx.strokeStyle = 'rgba(230,240,255,.35)'; ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = 'rgba(150,178,225,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y1 + .5); ctx.lineTo(x1, y1 + .5); ctx.stroke();
  }

  /* ---------------- text ---------------- */
  const $ = id => document.getElementById(id);

  /* ---- TR: translation lookup with positional slots.
     Named TR because `T` is the current grading object in this file. The KEY is
     the English format string, so a page with no strings file falls back to
     correct English instead of showing a key. */
  function TR(k) {
    const m = window.UDJ_STRINGS;
    let s = (m && m[k]) || k;
    for (let i = 1; i < arguments.length; i++) {
      s = s.replace('{' + (i - 1) + '}', arguments[i]);
    }
    return s;
  }

  function readouts(T, dir) {
    const g = G();
    const lo = band < 0 ? null : S.bands[band];
    const idx = [];
    for (let i = 0; i < T.order.length; i++)
      if (T.price[i] !== null && T.count[i] >= MIN_CELL) idx.push(i);
    const wi = idx.length ? idx[0] : 0, bi = idx.length ? idx[idx.length - 1] : 0;
    const wv = T.price[wi], bv = T.price[bi];

    $('v-worst').textContent = wv === null ? '—' : money(wv);
    $('v-worst-s').textContent = TR('grade {0}', T.order[wi]);
    $('v-best').textContent = bv === null ? '—' : money(bv);
    $('v-best-s').textContent = TR('grade {0}', T.order[bi]);
    $('v-best-c').className = 'vc ' + (dir >= 0 ? 'good' : 'bad');
    $('v-dir').textContent = dir >= 0 ? TR('more expensive') : TR('CHEAPER');
    $('v-dir-s').textContent = dir >= 0 ? TR('as it should be') : TR('the average is backwards');
    $('v-dir-c').className = 'vc ' + (dir >= 0 ? 'good' : 'bad');

    $('r-scope').textContent = lo ? TR('{0}–{1} ct', lo.lo, lo.hi) : TR('all sizes');
    $('r-n').textContent = T.shown.toLocaleString(LOC);
    $('r-cw').textContent = dec(g.groups[0].mean_carat, 3) + ' ct';
    $('r-cb').textContent = dec(g.groups[g.groups.length - 1].mean_carat, 3) + ' ct';
    $('r-bands').textContent = TR('{0} of {1}', g.bands_correct, g.bands_tested);
    $('r-bands').className = 'v ' + (g.bands_correct === g.bands_tested ? 'on' : 'gold');
    $('r-agg').textContent = g.agg_reversed ? TR('REVERSED') : TR('as expected');
    $('r-agg').className = 'v ' + (g.agg_reversed ? 'bad' : 'on');
    $('hint').textContent = lo
      ? TR('Within {0}–{1} ct the better {2} grade costs {3} Across all sizes it '
           + 'does not: the aggregate is {4}.',
           lo.lo, lo.hi, TR(g.label).toLowerCase(),
           dir >= 0 ? TR('more, as it should.') : TR('less.'),
           g.agg_reversed ? TR('reversed') : TR('fine'))
      : TR('Across all sizes, the best {0} grade averages {1} against {2} for the '
           + 'worst — and it is {3} ct against {4} ct. Pick a size band to hold '
           + 'that still.',
           TR(g.label).toLowerCase(),
           money(g.groups[g.groups.length - 1].mean_price),
           money(g.groups[0].mean_price),
           dec(g.groups[g.groups.length - 1].mean_carat, 2),
           dec(g.groups[0].mean_carat, 2));
  }

  function provenance() {
    $('prov').innerHTML =
      `<div class="cap">${TR('Data source')}</div>
       <p><a href="${S.url}" target="_blank" rel="noopener">${S.source}</a> — ${TR(S.what)}</p>
       <ul>${S.filters.map(f => `<li>${TR(f)}</li>`).join('')}</ul>
       <p style="font-size:var(--micro);color:var(--muted-2);font-family:var(--font-mono)">
         Bars are averages over every matching record. The scatter shows
         ${S.n_embed.toLocaleString(LOC)} drawn at random, so a bar will not equal the
         eyeballed centre of the dots. Cells with fewer than ${MIN_CELL} stones are drawn
         hollow and excluded from the direction verdict.</p>`;
  }

  /* ---------------- wiring ---------------- */
  const press = (sel, val, attr) =>
    document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));

  document.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
    gKey = b.dataset.g; press('[data-g]', gKey, 'g'); retarget();
    if (reduce) paint();
    $('live').textContent = `${G().label}: aggregate ${G().agg_reversed ? 'reversed' : 'as expected'}, `
      + `${G().bands_correct} of ${G().bands_tested} size bands agree.`;
  }));
  document.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => {
    band = +b.dataset.b; press('[data-b]', band, 'b'); retarget();
    if (reduce) paint();
    $('live').textContent = band < 0 ? TR('Comparing across all sizes.')
      : `Comparing within ${S.bands[band].lo} to ${S.bands[band].hi} carats only.`;
  }));
  addEventListener('resize', () => { layout(); paint(); });

  init();
  layout();
  paint();
  if (!reduce) {
    ticker = new M.Ticker((dt, t) => {
      now = t;
      if (morph) { morph.step(dt); if (morph.done) { A = B; B = null; morph = null; } }
      paint();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { ticker.visible = es[0].isIntersecting; },
                               { threshold: 0.01 }).observe(canvas);
    }
    ticker.start();
  }
})();
