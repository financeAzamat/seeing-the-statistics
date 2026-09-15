/* ============================================================
   Confidence intervals, on real data.
   ------------------------------------------------------------
   Companion to clt.html and deliberately its inverse. That page
   showed the machinery from the outside: it knew mu and sigma and
   watched averages behave. This page takes the position you are
   actually in — one sample, no knowledge of the truth — and grades
   the answer you would have reported.

   What it is really for: the coverage failure. The textbook says a
   95% interval covers 95% of the time. On the retail order data,
   estimating the spread from a sample of 30 the way you always have
   to, it covers 86%. That is measured in data/measure_ci.py over
   40,000 samples per cell, not asserted, and the same number is
   recomputed live on screen from the intervals actually drawn.

   Restrictions, so nobody later mistakes one for a bug:

     SHARED X AXIS    the data pile and the interval bars share one
                      axis at one scale, as on the CLT page. The
                      bars have to be readable AGAINST the data they
                      came from, or the picture proves nothing.

     MU IS DRAWN      the true average is on screen, which is
                      exactly what you never have in real life. It
                      is here only so the bars can be graded. The
                      copy says so rather than letting the picture
                      imply the truth is knowable.

     BARS SCROLL      only the most recent rows are painted; the
                      statistics count every interval ever drawn.
                      The counter is the record, the bars are the
                      illustration.

     CRIT FROM FILE   z and t come from ci_crit.js, generated and
                      table-checked by the measurement script. No
                      inverse-t is approximated in the browser, and
                      no value was typed by hand.

     n >= 5           there is no n = 1 button. A spread cannot be
                      estimated from one observation (t has no df),
                      and offering a control that silently means
                      something different in one mode is worse than
                      not offering it.
   ============================================================ */
(() => {
  const canvas = document.getElementById('ci');
  const DATA = window.UDJ_DATA, CRIT = window.UDJ_CRIT;
  if (!canvas || !DATA || !CRIT) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COOL = [186, 214, 255];
  const CYAN = [138, 224, 244];
  const GOLD = [255, 196, 116];
  const RED  = [255, 107,  98];
  const DEEP = [ 84, 132, 196];
  const PALE = [196, 228, 255];
  const TAU = 6.283185307;

  const K = 80;          // bins for stacking the data pile only
  const ROWS = 46;       // interval bars painted at once

  let seed = 1907;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);

  const SPRITES = new Map();
  function bloom(c) {
    const key = c.join(',');
    if (SPRITES.has(key)) return SPRITES.get(key);
    const s = 64, el = document.createElement('canvas');
    el.width = el.height = s;
    const g = el.getContext('2d');
    const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0.00, `rgba(${c[0]},${c[1]},${c[2]},0.55)`);
    rg.addColorStop(0.16, `rgba(${c[0]},${c[1]},${c[2]},0.24)`);
    rg.addColorStop(0.48, `rgba(${c[0]},${c[1]},${c[2]},0.06)`);
    rg.addColorStop(1.00, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, s, s);
    SPRITES.set(key, el); return el;
  }

  /* ============ state ============ */
  let D = DATA[0], n = 30, conf = 0.95, method = 't';
  let W = 0, Hh = 0, dpr = 1, phone = false;
  let NPOP = 0, MU = 0, SD = 0, VMIN = 0, VMAX = 1;
  const M = window.UDJ_MOTION;
  let now = 0, pphase = null;
  let pval, pstack, pmag, ptemp, pflash, maxCol = 1, popSpacing = 4;

  let cnt = 0, hit = 0, missLo = 0, missHi = 0, widthSum = 0;
  // running correlation between the sample mean and the sample spread — the
  // mechanism behind the under-coverage, accumulated rather than stored
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, corrN = 0;
  let bars = [];          // the visible rows, newest last
  let lastShot = null;    // the most recent interval, for the text readout

  let flight = null, paused = false, visible = true, last = 0, acc = 0;
  const DRAW_EVERY = 0.70, FLIGHT = 1.0;
  let mx = 50, yPop = 0, laneY = 0, barTop = 0, barBot = 0, rowH = 6;

  const xOf = v => mx + (v - VMIN) / (VMAX - VMIN) * (W - 2 * mx);
  let PREFIX = true, DP = 0;

  /* Translation lookup. The KEY is the English string, so a missing entry falls
     back to correct English rather than a bare identifier — which is what lets
     the English page load this same file with no strings table at all.
     Positional slots {0}, {1} let a translation REORDER values. */
  function TR(k) {
    const m = window.UDJ_STRINGS;
    let s = (m && m[k]) || k;
    for (let i = 1; i < arguments.length; i++) {
      s = s.replace('{' + (i - 1) + '}', arguments[i]);
    }
    return s;
  }
  const UDJ_LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale) || 'en-GB';
  const grp = v => Number(v).toLocaleString(UDJ_LOC);
  /* toFixed always emits a decimal POINT whatever the locale. This page is a
     wall of percentages and multipliers, so every one of them needs it. */
  const dec = (v, dp) => (Math.abs(Number(v)) < Math.pow(10, -dp) / 2 ? 0 : Number(v)).toLocaleString(UDJ_LOC, {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  });

  function uf(v, extra = 0) {
    const d = Math.max(0, DP + extra);
    const s = dec(v, d);
    /* The unit affix comes from the data file, so it goes through TR. */
    return PREFIX ? TR(D.unit) + s : s + ' ' + TR(D.unit);
  }
  const pct = x => dec(x * 100, 1) + '%';

  /* the multiplier. z when sigma is treated as known, t on n-1 df otherwise. */
  function critVal() {
    const c = String(conf);
    return method === 'z' ? CRIT.z[c] : CRIT.t[c][String(n)];
  }

  function loadDataset(d) {
    D = d;
    NPOP = D.vals.length; MU = D.mu; SD = D.sd;
    VMIN = D.axis[0]; VMAX = D.axis[1];
    PREFIX = /^[£$€]$/.test(D.unit);
    DP = (VMAX - VMIN) > 2000 ? 0 : 1;

    pval = Float64Array.from(D.vals);
    pstack = new Int32Array(NPOP);
    pmag = new Float32Array(NPOP);
    ptemp = new Float32Array(NPOP);
    pflash = new Float32Array(NPOP);
    pphase = new Float32Array(NPOP);

    const bw = (VMAX - VMIN) / K, counts = new Int32Array(K);
    const idx = Array.from({ length: NPOP }, (_, i) => i).sort((a, b) => pval[a] - pval[b]);
    for (const i of idx) {
      let b = Math.floor((pval[i] - VMIN) / bw);
      if (b < 0) b = 0; else if (b >= K) b = K - 1;
      pstack[i] = counts[b]++;
    }
    maxCol = 1;
    for (let b = 0; b < K; b++) if (counts[b] > maxCol) maxCol = counts[b];

    seed = 1907;
    for (let i = 0; i < NPOP; i++) {
      pmag[i] = Math.pow(rnd(), 2.4); ptemp[i] = 0.25 + rnd() * 0.75;
      pphase[i] = rnd() * TAU;
    }

    resetRun();
    document.getElementById('tagtop').innerHTML =
      TR('The data — <em>{0}, {1} · {2} real records</em>',
         TR(D.label), TR(D.unit), grp(NPOP));
    document.getElementById('hint').textContent = TR(HINTS[D.id] || '');
  }

  /* Measured figures only. The per-dataset coverage numbers quoted here come
     from data/measure_ci.py at nominal 95%, n = 30, s estimated. */
  const HINTS = {
    retail: 'The hard case. Order value is badly lopsided, so a sample that misses the big orders gets both a low average and a small spread — a narrow range in the wrong place. Ask for 95% here with n = 30 and you get about 86%, and almost every miss is on the low side. Raise n to 300 and it recovers to about 94.5%.',
    geyser: 'The easy case. This data has two humps but no long tail, so nothing systematically drags the average down. Ask for 95% and you get about 94.7% even at n = 30 — the textbook promise, kept.',
    diamond: 'In between. A long tail, but not as extreme as the retail orders: 95% asked, about 93% delivered at n = 30. Enough to matter if you are pricing something, not enough to be obvious.'
  };

  function resetRun() {
    cnt = hit = missLo = missHi = 0; widthSum = 0;
    sx = sy = sxx = syy = sxy = 0; corrN = 0;
    bars = []; flight = null; lastShot = null;
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width; Hh = rect.height; phone = W < 560;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mx = phone ? 30 : 50;
    yPop = Math.round(Hh * 0.30);      // the data pile is smaller here: the
    laneY = Math.round(Hh * 0.365);    // bars are the subject on this page
    barTop = Math.round(Hh * 0.42);
    barBot = Hh - 26;
    rowH = (barBot - barTop) / ROWS;
    /* 46px of headroom above the pile, not 32. The canvas draws a "true average"
       label at the top and the HTML .tagtop caption sits at top:12px with 10px
       text, so the tagtop occupies roughly y=12..26 while the old reserve put
       the topmost dot at y=29 — a 3px gap that left nowhere for the label, and
       it printed straight over the caption in BOTH languages. */
    popSpacing = Math.max(1.1, Math.min(3.0, (yPop - 46) / maxCol));
  }

  const pick = () => (Math.random() * NPOP) | 0;

  /* one honest interval: draw n real records, average them, and build the
     range you would have reported from that sample alone */
  function makeInterval() {
    const src = [];
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) {
      const j = pick(); const v = pval[j];
      src.push(j); sum += v; sq += v * v;
    }
    const xbar = sum / n;
    // sample SD with n-1, which is what s means
    const s = Math.sqrt(Math.max(0, (sq - n * xbar * xbar) / (n - 1)));
    const spread = method === 'z' ? SD : s;
    const hw = critVal() * spread / Math.sqrt(n);
    return { src, xbar, s, hw, lo: xbar - hw, hi: xbar + hw };
  }

  function record(iv) {
    cnt++;
    widthSum += 2 * iv.hw;
    if (iv.hi < MU) missLo++;
    else if (iv.lo > MU) missHi++;
    else hit++;
    // running correlation of xbar against s
    corrN++; sx += iv.xbar; sy += iv.s;
    sxx += iv.xbar * iv.xbar; syy += iv.s * iv.s; sxy += iv.xbar * iv.s;
    lastShot = iv;
    bars.push({ lo: iv.lo, hi: iv.hi, xbar: iv.xbar, ok: iv.lo <= MU && MU <= iv.hi, age: 0 });
    if (bars.length > ROWS) bars.shift();
  }

  function corr() {
    if (corrN < 3) return NaN;
    const vx = sxx / corrN - (sx / corrN) ** 2;
    const vy = syy / corrN - (sy / corrN) ** 2;
    if (vx <= 0 || vy <= 0) return NaN;
    return (sxy / corrN - (sx / corrN) * (sy / corrN)) / Math.sqrt(vx * vy);
  }

  function fastFill(m) {
    for (let i = 0; i < m; i++) record(makeInterval());
    readouts(); paint();
  }

  /* ============ paint ============ */
  const MONO = (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace').trim();

  function tickStep(span) {
    const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p;
  }

  function axis(y) {
    ctx.strokeStyle = 'rgba(150,178,225,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, y + .5); ctx.lineTo(W - mx, y + .5); ctx.stroke();
    ctx.fillStyle = 'rgba(116,134,159,.9)'; ctx.font = `600 9px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = tickStep(VMAX - VMIN) * (phone ? 2 : 1);
    for (let v = Math.ceil(VMIN / step) * step; v <= VMAX; v += step) {
      const x = xOf(v);
      ctx.strokeStyle = 'rgba(150,178,225,.16)';
      ctx.beginPath(); ctx.moveTo(x + .5, y); ctx.lineTo(x + .5, y + 4); ctx.stroke();
      ctx.fillText(uf(v), x, y + 6);
    }
  }

  function dot(x, y, r, c, a, glow) {
    if (glow > 0) {
      const s = bloom(c), sz = r * glow * 9;
      ctx.globalAlpha = Math.min(1, a * .95);
      ctx.drawImage(s, x - sz / 2, y - sz / 2, sz, sz);
    }
    // clamped: assigning globalAlpha outside [0,1] is IGNORED per spec,
    // which would silently keep the previous alpha once a pulse lifts it > 1
    ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  const popX = i => xOf(pval[i]);
  const popY = i => yPop - 3 - pstack[i] * popSpacing;

  function paint() {
    ctx.clearRect(0, 0, W, Hh);
    const xmu = xOf(MU);

    /* --- the data, one dot per real record --- */
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NPOP; i++) {
      const f = pflash[i], t = ptemp[i];
      const c = f > 0.02 ? CYAN
        : [DEEP[0] + (PALE[0] - DEEP[0]) * t, DEEP[1] + (PALE[1] - DEEP[1]) * t, DEEP[2] + (PALE[2] - DEEP[2]) * t];
      const br = M.breathe(now, pphase[i], 0.8 + pmag[i] * 1.1, f > 0.02 ? 0.25 : 1);
      dot(popX(i), popY(i), (1.25 + pmag[i] * 1.2 + f) * br.r, c,
          (0.34 + pmag[i] * 0.4 + f * 0.5) * br.a,
          (f > 0.02 ? 0.5 + f * 0.5 : 0.22 + pmag[i] * 0.42) * br.g);
    }
    ctx.globalCompositeOperation = 'source-over';
    axis(yPop);

    /* --- the true average: the thing you never actually see --- */
    ctx.setLineDash([1, 3]);
    ctx.strokeStyle = 'rgba(255,196,116,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xmu + .5, 20); ctx.lineTo(xmu + .5, barBot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,196,116,.9)'; ctx.font = `700 9px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(TR('true average {0}', uf(MU)), xmu, 38);

    /* --- the stack of reported ranges. One row per sample, newest at the
           bottom so the eye follows the animation down into it. --- */
    const capH = Math.max(1.4, Math.min(rowH, 7));
    for (let r = 0; r < bars.length; r++) {
      const b = bars[r];
      const y = barTop + (ROWS - bars.length + r) * rowH + rowH / 2;
      const c = b.ok ? COOL : RED;
      const a = b.ok ? 0.5 : 0.95;
      const x1 = Math.max(mx - 6, xOf(b.lo)), x2 = Math.min(W - mx + 6, xOf(b.hi));
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      ctx.lineWidth = b.ok ? 1 : 1.5;
      ctx.beginPath(); ctx.moveTo(x1, y + .5); ctx.lineTo(x2, y + .5); ctx.stroke();
      // end caps, so a bar reads as a range rather than a smear
      const ch = Math.min(2.5, capH / 2);
      ctx.beginPath();
      ctx.moveTo(x1 + .5, y - ch); ctx.lineTo(x1 + .5, y + ch + 1);
      ctx.moveTo(x2 - .5, y - ch); ctx.lineTo(x2 - .5, y + ch + 1);
      ctx.stroke();
      // the sample average itself
      dot(xOf(b.xbar), y + .5, b.ok ? 1.5 : 1.9, c, b.ok ? 0.78 : 1, b.ok ? 0.22 : 0.7);
    }
    axis(barBot);

    /* --- the sample in flight: dots lift out of the data, collapse to their
           average, and the range opens out from it --- */
    if (flight) {
      const t = flight.t, iv = flight.iv, mxp = xOf(iv.xbar);
      ctx.globalCompositeOperation = 'lighter';
      if (t < 0.55) {
        const lift = ease(t / 0.28), conv = ease(clamp01((t - 0.22) / 0.33));
        const glow = n <= 100 ? 0.45 : 0;
        for (const i of iv.src) {
          const x0 = popX(i), y0 = popY(i);
          dot(x0 + (mxp - x0) * conv, y0 + (laneY - y0) * lift,
              n > 100 ? 1.3 : 1.7, CYAN, 0.5 + 0.35 * conv, glow);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (t >= 0.45) {
        // the bar opens from the centre outward: the range is BUILT from the
        // average, it is not a thing that was there all along
        const k = easeOut((t - 0.45) / 0.55);
        const x1 = xOf(iv.xbar - iv.hw * k), x2 = xOf(iv.xbar + iv.hw * k);
        const ok = iv.lo <= MU && MU <= iv.hi;
        const c = k > 0.92 ? (ok ? COOL : RED) : GOLD;
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.95)`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, laneY + .5); ctx.lineTo(x2, laneY + .5); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1 + .5, laneY - 4); ctx.lineTo(x1 + .5, laneY + 5);
        ctx.moveTo(x2 - .5, laneY - 4); ctx.lineTo(x2 - .5, laneY + 5);
        ctx.stroke();
        dot(mxp, laneY + .5, 3.0, GOLD, 1, 1.1);
      } else if (t >= 0.42) {
        dot(mxp, laneY + .5, 3.4, GOLD, 1, 1.4);
      }
    }
  }

  /* ============ readouts ============ */
  const $ = id => document.getElementById(id);
  function readouts() {
    const cov = cnt ? hit / cnt : NaN;
    const se = SD / Math.sqrt(n);
    $('v-ask').textContent = dec(conf * 100, 0) + '%';
    $('v-got').textContent = cnt >= 20 ? pct(cov) : '—';
    const gap = conf - cov;
    $('v-gap').textContent = cnt >= 20
      ? (gap >= 0 ? '−' : '+') + TR('{0} pts', dec(Math.abs(gap) * 100, 1)) : '—';
    // "bad" once the shortfall is beyond what this many draws could explain
    const noise = cnt ? 2.5 * Math.sqrt(Math.max(cov, 1e-9) * (1 - cov) / cnt) : 1;
    const bad = cnt >= 60 && gap > Math.max(noise, 0.01);
    $('v-got-c').className = 'vc got' + (bad ? ' bad' : '');
    $('v-gap-c').className = 'vc gap' + (bad ? ' bad' : '');

    $('r-cnt').textContent = grp(cnt);
    $('r-lo').textContent = cnt ? `${grp(missLo)}  ${pct(missLo / cnt)}` : '—';
    $('r-hi').textContent = cnt ? `${grp(missHi)}  ${pct(missHi / cnt)}` : '—';
    /* 'z = ' / 't = ' stay as they are: mathematical notation, not prose. */
    $('r-crit').textContent = (method === 'z' ? 'z = ' : 't = ') + dec(critVal(), 3);
    $('r-w').textContent = cnt ? uf(widthSum / cnt, 1) : '—';
    $('r-se').textContent = uf(se, 2);
    $('r-mu').textContent = uf(MU, 1);
    const c = corr();
    $('r-corr').textContent = Number.isFinite(c) ? (c >= 0 ? '+' : '') + dec(c, 2) : '—';
    $('r-corr').className = 'v ' + (Number.isFinite(c) && c > 0.5 ? 'bad' : '');

    if (lastShot) {
      const ok = lastShot.lo <= MU && MU <= lastShot.hi;
      $('r-last').textContent = TR('{0} to {1}',
                                   uf(lastShot.lo, 1), uf(lastShot.hi, 1));
      $('r-last').className = 'v ' + (ok ? 'on' : 'bad');
      $('r-last-sub').textContent = ok
        ? TR('contains the true average — you would have been right')
        : TR('does NOT contain the true average — you would have reported this '
             + 'in good faith');
    }
  }

  /* ============ loop ============ */
  function frame(ts) {
    if (!visible) { last = ts; requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts; now = ts / 1000;
    if (!paused) {
      if (flight) {
        flight.t += dt / FLIGHT;
        if (flight.t >= 1) { record(flight.iv); flight = null; readouts(); }
      } else {
        acc += dt;
        if (acc >= DRAW_EVERY) {
          acc = 0;
          const iv = makeInterval();
          for (const i of iv.src) pflash[i] = 1;
          flight = { t: 0, iv };
        }
      }
      for (let i = 0; i < NPOP; i++) if (pflash[i] > 0) pflash[i] = Math.max(0, pflash[i] - dt * 1.0);
    }
    paint();
    requestAnimationFrame(frame);
  }

  /* ============ wiring ============ */
  const press = (sel, val, attr) =>
    document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));

  function restart(msg) {
    resetRun(); readouts(); paint();
    if (reduce) fastFill(500);
    $('live').textContent = msg;
  }

  document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const d = DATA.find(x => x.id === b.dataset.set); if (!d) return;
    press('[data-set]', d.id, 'set'); loadDataset(d); layout();
    restart(TR('{0}. True average {1}.', TR(D.label), uf(MU, 1)));
  }));
  document.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
    n = +b.dataset.n; press('[data-n]', n, 'n');
    restart(TR('Sample size {0}. Multiplier {1}.', grp(n), dec(critVal(), 3)));
  }));
  document.querySelectorAll('[data-conf]').forEach(b => b.addEventListener('click', () => {
    conf = +b.dataset.conf; press('[data-conf]', conf, 'conf');
    restart(TR('Confidence level {0} percent.', dec(conf * 100, 0)));
  }));
  document.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    method = b.dataset.m; press('[data-m]', method, 'm');
    restart(method === 'z'
      ? TR('Using the true spread and z. This is the textbook ideal you never '
           + 'actually have.')
      : TR('Estimating the spread from each sample and using t. This is what '
           + 'you do in practice.'));
  }));
  $('fast').addEventListener('click', () => {
    fastFill(500);
    $('live').textContent = TR('{0} intervals drawn.', grp(cnt));
  });
  $('pause').addEventListener('click', e => {
    paused = !paused; e.target.textContent = paused ? TR('resume') : TR('pause');
    e.target.setAttribute('aria-pressed', String(paused));
  });
  $('reset').addEventListener('click', () => restart('Reset.'));
  addEventListener('resize', () => { layout(); paint(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(canvas);
  }

  loadDataset(DATA[0]);
  layout();
  readouts();

  if (reduce) {
    fastFill(500);
  } else {
    fastFill(12);
    requestAnimationFrame(ts => { last = ts; frame(ts); });
  }
})();
