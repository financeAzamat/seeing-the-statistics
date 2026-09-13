/* ============================================================
   Overfitting and adjusted R² — renderer.
   ------------------------------------------------------------
   Every point on every curve is a REAL least-squares fit, run in
   the browser. Nothing is read from a table, because the claim is
   that R-squared rises on junk and the only convincing way to show
   that is to do it.

   Fits are computed ONE CHECKPOINT PER FRAME rather than all at
   once. Two reasons: a hundred QR factorisations on 400 rows would
   block the page for a noticeable beat, and computing them
   progressively means the curves literally draw themselves, which
   is a better picture of "watch this climb" than a chart appearing
   whole.

   Restrictions, so nobody later mistakes one for a bug:

     CHECKPOINTS   the curves are measured at ~14 values of k and
                   joined by straight segments. Measured points are
                   marked; the line between them is interpolation,
                   not data. Fitting all 101 would triple the work
                   for no visible difference.

     SPLIT IS FIXED  alternate rows: even indices train, odd hold
                   back. Deterministic, balanced, and independent of
                   any ordering in the source -- which matters,
                   because two of these datasets are sorted.

     NOISE IS MINSTD  seeded per (dataset, column), so the same junk
                   appears on every reload and the curve is
                   reproducible. It stays inside 2^53 so it is
                   exactly reproducible in Python too.

     ADJ CAN GO WILD  adjusted R² is unbounded below and swings hard
                   once k approaches n. It is clipped for DRAWING
                   only; the readout always prints the real value.
   ============================================================ */
(() => {
  const canvas = document.getElementById('of');
  const PAIRS = window.UDJ_PAIRS, S = window.UDJ_STATS;
  const DR = window.UDJ_DRAW, M = window.UDJ_MOTION;
  if (!canvas || !PAIRS || !S || !DR || !M) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const K = DR.kit(ctx), P = DR.PAL;

  const CHECKS = [0, 1, 2, 3, 5, 8, 12, 18, 26, 36, 50, 68, 85, 100];
  const KMAX = CHECKS[CHECKS.length - 1];

  let D = PAIRS[0], kSel = 0;
  let W = 0, Hh = 0, dpr = 1, now = 0, ticker = null;
  let train = null, test = null, noise = null;
  let results = [];          // one entry per computed checkpoint
  let nextCheck = 0;         // how far the progressive computation has got
  let kTw = null;            // the marker glides rather than jumps

  /* MINSTD: stays inside 2^53 so the sequence is reproducible in Python as
     well as in any JS engine. The pages' other generator does not. */
  function minstd(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => { s = (s * 48271) % 2147483647; return (s - 1) / 2147483646; };
  }

  function load(d) {
    D = d;
    // alternate rows: deterministic, balanced, and immune to any ordering in
    // the source -- which matters, because two of these datasets are sorted
    const tx = [], ty = [], ex = [], ey = [];
    for (let i = 0; i < d.x.length; i++) {
      (i % 2 === 0 ? tx : ex).push(d.x[i]);
      (i % 2 === 0 ? ty : ey).push(d.y[i]);
    }
    train = { x: tx, y: ty, n: tx.length };
    test = { x: ex, y: ey, n: ex.length };
    // one noise column per predictor slot, for both halves, seeded per column
    noise = { train: [], test: [] };
    for (let j = 0; j < KMAX; j++) {
      const r = minstd(9001 + j * 7919 + d.id.length * 131);
      const a = [], b = [];
      for (let i = 0; i < train.n; i++) a.push(r() * 2 - 1);
      for (let i = 0; i < test.n; i++) b.push(r() * 2 - 1);
      noise.train.push(a); noise.test.push(b);
    }
    results = [];
    nextCheck = 0;
    kSel = 0;
    document.getElementById('s-k').value = '0';
    kTw = new M.Tween(0, 0, 0.01, M.ease.cubicOut);
    // Seed the first few synchronously so the panel is never briefly empty --
    // these are the cheap fits (k = 0, 1, 2), and the expensive tail is what
    // gets spread across frames.
    const SEED_N = reduce ? CHECKS.length : 3;
    while (nextCheck < SEED_N) computeNext();
  }

  /* one checkpoint: fit on the training half, score on the held-back half */
  function computeNext() {
    if (nextCheck >= CHECKS.length) return false;
    const k = CHECKS[nextCheck];
    const ctr = [new Array(train.n).fill(1), train.x];
    const cte = [new Array(test.n).fill(1), test.x];
    for (let j = 0; j < k; j++) { ctr.push(noise.train[j]); cte.push(noise.test[j]); }
    const f = S.lstsq(ctr, train.y);
    const t = S.scoreR2(cte, test.y, f.beta);
    results.push({ k, r2: f.r2, adj: f.adj, test: t, dof: f.dof });
    nextCheck++;
    return true;
  }

  /* the values shown for an arbitrary k: exact at a checkpoint, interpolated
     between two, and labelled as such in the readout */
  function at(k) {
    if (!results.length) return null;
    if (k <= results[0].k) return results[0];
    for (let i = 1; i < results.length; i++) {
      if (results[i].k >= k) {
        const a = results[i - 1], b = results[i];
        const t = (k - a.k) / (b.k - a.k);
        return { k, r2: M.lerp(a.r2, b.r2, t), adj: M.lerp(a.adj, b.adj, t),
                 test: M.lerp(a.test, b.test, t),
                 dof: Math.round(M.lerp(a.dof, b.dof, t)),
                 exact: false };
      }
    }
    return results[results.length - 1];
  }
  const isCheckpoint = k => CHECKS.indexOf(k) >= 0;

  function layout() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; Hh = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const CLIP_LO = -1.0;      // drawing floor; the readout always prints the truth

  function paint() {
    ctx.clearRect(0, 0, W, Hh);
    const kNow = kTw ? kTw.v : kSel;         // read, never advance, inside paint
    const cur = at(Math.round(kNow));

    K.panel(8, 8, W - 8, Hh - 8,
      `${D.xlab} → ${D.ylab}   ·   plus pure noise`,
      results.length < CHECKS.length ? 'FITTING…' : null,
      results.length < CHECKS.length ? P.GOLD : P.CYAN,
      `each point is a real least-squares fit · ${train.n} rows to fit on, ${test.n} held back`,
      (x0, y0, x1, y1) => {
        const sx = k => x0 + (k / KMAX) * (x1 - x0);
        const sy = v => y1 - (M.clamp01((v - CLIP_LO) / (1 - CLIP_LO))) * (y1 - y0);

        // grid + axes
        ctx.font = `600 9px ${K.MONO}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (const k of [0, 20, 40, 60, 80, 100]) {
          ctx.strokeStyle = 'rgba(150,178,225,.07)';
          ctx.beginPath(); ctx.moveTo(sx(k) + .5, y0); ctx.lineTo(sx(k) + .5, y1); ctx.stroke();
          ctx.fillStyle = 'rgba(143,162,196,.8)';
          ctx.fillText(String(k), sx(k), y1 + 5);
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (const v of [1, 0.75, 0.5, 0.25, 0, -0.5, -1]) {
          const yy = sy(v);
          const zero = v === 0;
          ctx.strokeStyle = zero ? 'rgba(255,196,116,.35)' : 'rgba(150,178,225,.07)';
          if (zero) ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(x0, yy + .5); ctx.lineTo(x1, yy + .5); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = zero ? 'rgba(255,196,116,.85)' : 'rgba(143,162,196,.8)';
          ctx.fillText(v.toFixed(2), x0 - 5, yy);
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        K.tracked('NOISE PREDICTORS ADDED', (x0 + x1) / 2, y1 + 26, 9,
                  'rgba(143,162,196,.8)', 1.6, 'center');
        ctx.textAlign = 'left';
        K.tracked('WORSE THAN GUESSING THE AVERAGE', x0 + 6, sy(0) + 13, 9,
                  'rgba(255,196,116,.55)', 1.4, 'left');

        // the three curves
        const SERIES = [
          { key: 'r2', c: P.CYAN, name: 'R² ON DATA IT SAW' },
          { key: 'adj', c: P.GOLD, name: 'ADJUSTED R²' },
          { key: 'test', c: P.RED, name: 'R² ON HELD-BACK DATA' },
        ];
        for (const s of SERIES) {
          if (results.length < 2) continue;
          // a soft wide pass under the crisp line, so three curves stay apart
          for (const pass of [{ w: 5, a: 0.14 }, { w: 2, a: 0.95 }]) {
            ctx.strokeStyle = K.rgba(s.c, pass.a);
            ctx.lineWidth = pass.w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.beginPath();
            results.forEach((r, i) => {
              const px = sx(r.k), py = sy(r[s.key]);
              i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            });
            ctx.stroke();
          }
          ctx.lineCap = 'butt';
          // measured points, pulsing so the field is never static
          results.forEach((r, i) => {
            const pu = 0.8 + 0.2 * Math.sin(now * 1.5 + i * 0.5);
            K.dot(sx(r.k), sy(r[s.key]), 2.8 * pu, s.c, 1, 0.7);
          });
          // the label rides the end of its own curve
          const last = results[results.length - 1];
          K.tracked(s.name, sx(last.k) - 4, sy(last[s.key]) - 9, 9,
                    K.rgba(s.c, .95), 1.4, 'right');
        }

        // the marker at the selected k
        const mx2 = sx(kNow);
        ctx.strokeStyle = 'rgba(230,240,255,.3)'; ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(mx2 + .5, y0); ctx.lineTo(mx2 + .5, y1); ctx.stroke();
        ctx.setLineDash([]);
        if (cur) {
          for (const s of SERIES) {
            const pu = 0.9 + 0.35 * Math.sin(now * 2.2);
            K.dot(mx2, sy(cur[s.key]), 4.6 * pu, s.c, 1, 1.5);
          }
        }
      });

    readouts(cur, kNow);
  }

  const $ = id => document.getElementById(id);
  const pc = v => (v >= 0 ? '' : '−') + Math.abs(v).toFixed(3);
  function readouts(cur, kNow) {
    const k = Math.round(kNow);
    $('r-k').textContent = String(k);
    $('r-real').textContent = D.xlab;
    $('r-ntrain').textContent = train ? train.n.toLocaleString('en-GB') : '—';
    $('r-ntest').textContent = test ? test.n.toLocaleString('en-GB') : '—';
    if (!cur) return;
    $('v-train').textContent = pc(cur.r2);
    $('v-adj').textContent = pc(cur.adj);
    $('v-test').textContent = pc(cur.test);
    $('r-dof').textContent = String(cur.dof);
    $('r-dof').className = 'v ' + (cur.dof < 40 ? 'bad' : 'on');
    const base = results.length ? results[0] : null;
    const gain = base ? cur.r2 - base.r2 : 0;
    $('r-gain').textContent = (gain >= 0 ? '+' : '') + gain.toFixed(3);
    $('r-gain').className = 'v ' + (gain > 0.02 ? 'bad' : 'on');
    const exact = isCheckpoint(k) ? '' : ' (interpolated between measured points)';
    $('hint').textContent = results.length < CHECKS.length
      ? `Fitting ${CHECKS.length} models… ${results.length} done.`
      : `With ${k} noise column${k === 1 ? '' : 's'}: R² ${cur.r2.toFixed(3)} on the rows it `
        + `was fitted to, adjusted ${cur.adj.toFixed(3)}, and ${cur.test.toFixed(3)} on the `
        + `${test.n} rows held back`
        + (cur.test < 0 ? ' — negative, so worse than guessing the average.' : '.')
        + exact;
  }

  /* ---------------- wiring ---------------- */
  const press = (sel, val, attr) =>
    document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));

  function setK(k, glide) {
    kSel = Math.max(0, Math.min(KMAX, k));
    $('s-k').value = String(kSel);
    if (reduce || !glide) kTw = new M.Tween(kSel, kSel, 0.01, M.ease.cubicOut);
    else kTw.to(kSel, 0.5, M.ease.cubicOut);
    if (reduce) paint();
  }

  document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const d = PAIRS.find(x => x.id === b.dataset.set); if (!d) return;
    press('[data-set]', d.id, 'set'); load(d); layout(); paint();
    $('live').textContent = `${d.label}. ${train.n} rows to fit on, ${test.n} held back.`;
  }));
  document.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
    setK(+b.dataset.k, true);
    $('live').textContent = `${kSel} noise predictors.`;
  }));
  $('s-k').addEventListener('input', e => setK(+e.target.value, false));
  addEventListener('resize', () => { layout(); paint(); });

  load(PAIRS[0]);
  layout();
  paint();
  if (!reduce) {
    ticker = new M.Ticker((dt, t) => {
      now = t;
      // one fit per frame: the curves draw themselves and nothing blocks
      if (nextCheck < CHECKS.length) computeNext();
      if (kTw) kTw.step(dt);
      paint();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { ticker.visible = es[0].isIntersecting; },
                               { threshold: 0.01 }).observe(canvas);
    }
    ticker.start();
  }
})();
