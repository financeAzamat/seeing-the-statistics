/* ============================================================
   Hypothesis tests and p-values, on real data.
   ------------------------------------------------------------
   Third in the set. clt.html showed averages behaving; ci.html
   turned that into a range and graded it; this page turns it into
   a yes/no decision and grades THAT.

   The subject is the p-value histogram, because one picture carries
   three lessons that are hard in words:

     flat under the null   every p is equally likely when nothing is
                           happening, so a twentieth of them fall
                           under 0.05 by construction. The false
                           alarm rate is the definition, not a bug.
     piled at zero         a real effect drags the whole
                           distribution left. How far left is power.
     barely moved          on retail order value a real +5% lift at
                           n = 500 barely dents it -- 8.8% power.
                           "Not significant" is usually a statement
                           about the test, not the world.

   Measured in data/measure_test.py over 20,000 tests per cell, and
   recomputed live here from the tests actually run.

   Restrictions, so nobody later mistakes one for a bug:

     TWO AXES        the data pile is in pounds; the histogram below
                     is in probability, 0 to 1. This is the ONE page
                     in the set where the two halves do NOT share an
                     axis, so the divider and the label say so
                     loudly. Reading the histogram as money would
                     make nonsense of it.

     EFFECT IS REAL  group B's values are multiplied by (1 + effect)
                     -- a proportional lift, which is how a business
                     change behaves. So the null is genuinely true at
                     0% and genuinely false above it, and every
                     verdict can be graded.

     DOTS ARE CAPPED at n = 2000 there are 4000 sampled values and
                     only 700 records to draw them from. The flight
                     draws at most FLY_CAP dots per group and says so
                     on screen; the TEST always uses all n.

     REAL t          p-values come from stats.js, an incomplete-beta
                     t distribution checked against scipy, not a
                     normal approximation. At n = 30 the difference
                     is not cosmetic.
   ============================================================ */
(() => {
  const canvas = document.getElementById('ht');
  const DATA = window.UDJ_DATA, S = window.UDJ_STATS;
  if (!canvas || !DATA || !S) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COOL = [186, 214, 255];
  const CYAN = [138, 224, 244];   // group A
  const VIO  = [150, 142, 224];   // group B, after the change
  const GOLD = [255, 196, 116];
  const RED  = [255, 107,  98];
  const DEEP = [ 84, 132, 196];
  const PALE = [196, 228, 255];
  const TAU = 6.283185307;

  const K = 80;        // bins for stacking the data pile
  const PB = 100;      // p-value histogram bins: 0.01 wide, so every alpha
                       // the page offers (0.01 / 0.05 / 0.10) lands on a
                       // bin edge exactly and the red zone is never a lie
  const FLY_CAP = 70;  // dots drawn per group in the flight

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
  let D = DATA[0], n = 500, effect = 0, alpha = 0.05;
  let W = 0, Hh = 0, dpr = 1, phone = false;
  let NPOP = 0, MU = 0, SD = 0, VMIN = 0, VMAX = 1;
  const M = window.UDJ_MOTION;
  let now = 0, pphase = null;
  let pval, pstack, pmag, ptemp, pflashA, pflashB, maxCol = 1, popSpacing = 3;

  let hist = new Int32Array(PB), hMax = 1;
  let cnt = 0, sig = 0, last = null;
  let flight = null, paused = false, visible = true, tPrev = 0, acc = 0;
  const DRAW_EVERY = 0.75, FLIGHT = 1.15;
  let mx = 50, yPop = 0, laneY = 0, pTop = 0, pBot = 0;

  const xOf = v => mx + (v - VMIN) / (VMAX - VMIN) * (W - 2 * mx);
  const xOfP = p => mx + clamp01(p) * (W - 2 * mx);

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
  /* toFixed always emits a decimal POINT whatever the locale. This page is p-values
     and percentages end to end, so every one of them needs a locale formatter. */
  const dec = (v, dp) => Number(v).toLocaleString(UDJ_LOC, {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  });

  function uf(v, extra = 0) {
    const d = Math.max(0, DP + extra);
    const s = dec(v, d);
    /* The unit affix comes from the data file, so it goes through TR. */
    return PREFIX ? TR(D.unit) + s : s + ' ' + TR(D.unit);
  }
  const pctf = x => dec(x * 100, 1) + '%';
  const effLabel = () => effect === 0 ? TR('none') : '+' + dec(effect * 100, 0) + '%';
  /* The locale's decimal separator, derived from the formatter rather than
     hard-coded: a very small p-value is printed with toExponential(), which
     always emits a POINT, and that one readout would otherwise have shown
     "1.23e-7" beside Russian numbers written with a comma. */
  const DECSEP = dec(1.5, 1).replace(/\d/g, '');
  const expo = (v, dp) => v.toExponential(dp).replace('.', DECSEP);

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
    pflashA = new Float32Array(NPOP);
    pflashB = new Float32Array(NPOP);
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
      TR('The data — <em>{0}, {1} · two samples of {2} drawn from {3} real records</em>',
         TR(D.label), TR(D.unit), grp(n), grp(NPOP));
    document.getElementById('hint').textContent = TR(HINTS[D.id] || '');
  }

  /* Figures quoted here are from data/measure_test.py at alpha = 0.05. */
  const HINTS = {
    retail: 'The expensive case. Order value is so noisy relative to its own average (1.28) that a real 5% lift needs enormous samples: 9.3% power at 500 per group, still only 23% at 2,000. Set the change to none and the histogram goes flat — that flatness is where the 5% false-alarm rate comes from.',
    geyser: 'The cheap case. Eruption waits are tightly clustered (noise ÷ average = 0.19), so a 5% shift is easy to see: 43% power at 100 per group and 98% at 500. Same test, same α, forty-five times less data needed — because the metric is quieter.',
    diamond: 'In between, and closer to retail than you would guess: noise ÷ average is 1.00, so a real 5% lift is caught 12% of the time at 500 per group. Prices look like a well-behaved number and behave like a badly-behaved one.'
  };

  function resetRun() {
    hist = new Int32Array(PB); hMax = 1; cnt = 0; sig = 0; last = null; flight = null;
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width; Hh = rect.height; phone = W < 560;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mx = phone ? 30 : 50;
    yPop = Math.round(Hh * 0.32);
    laneY = Math.round(Hh * 0.395);
    pTop = Math.round(Hh * 0.51);
    pBot = Hh - 26;
    /* 46px of headroom above the pile, not 32. During a flight the canvas draws
       a "showing N of M per group" note at the top, and the HTML .tagtop caption
       sits at top:12px with 10px text — occupying roughly y=12..26 — while the
       old reserve put the topmost dot at y=29. That left no band for the note,
       so it printed over the caption in BOTH languages. The note is transient,
       which is why an English screenshot taken between flights looks clean. */
    popSpacing = Math.max(1.0, Math.min(2.8, (yPop - 46) / maxCol));
  }

  const pick = () => (Math.random() * NPOP) | 0;

  /* one honest A/B test: two independent samples of real records, group B
     scaled by the lift, then Welch on the summary statistics */
  function runTest() {
    const ia = [], ib = [];
    let sa = 0, sqa = 0, sb = 0, sqb = 0;
    for (let i = 0; i < n; i++) {
      const j = pick(); const v = pval[j];
      ia.push(j); sa += v; sqa += v * v;
    }
    const k = 1 + effect;
    for (let i = 0; i < n; i++) {
      const j = pick(); const v = pval[j] * k;
      ib.push(j); sb += v; sqb += v * v;
    }
    const mA = sa / n, mB = sb / n;
    const vA = Math.max(0, (sqa - n * mA * mA) / (n - 1));
    const vB = Math.max(0, (sqb - n * mB * mB) / (n - 1));
    const w = S.welch(mA, vA, n, mB, vB, n);
    return { ia, ib, mA, mB, p: w.p, t: w.t, df: w.df };
  }

  function record(r) {
    cnt++;
    if (r.p < alpha) sig++;
    let b = Math.floor(r.p * PB);
    if (b < 0) b = 0; else if (b >= PB) b = PB - 1;
    hist[b]++;
    if (hist[b] > hMax) hMax = hist[b];
    last = r;
  }

  function fastFill(m) {
    for (let i = 0; i < m; i++) record(runTest());
    readouts(); paint();
  }

  /* ============ paint ============ */
  const MONO = (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace').trim();

  function tickStep(span) {
    const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p;
  }

  function moneyAxis(y) {
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

  /* the p axis is a DIFFERENT quantity from the money axis above it, so it is
     drawn differently on purpose: heavier rule, 0..1 ticks, its own label */
  function pAxis(y) {
    ctx.strokeStyle = 'rgba(150,178,225,.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, y + .5); ctx.lineTo(W - mx, y + .5); ctx.stroke();
    ctx.fillStyle = 'rgba(116,134,159,.95)'; ctx.font = `600 9px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const x = xOfP(v);
      ctx.strokeStyle = 'rgba(150,178,225,.3)';
      ctx.beginPath(); ctx.moveTo(x + .5, y); ctx.lineTo(x + .5, y + 5); ctx.stroke();
      /* 'p = ' and 'α = ' are not routed through TR: they are mathematical
         notation, identical in both languages, so an entry could only ever
         equal its key — which the "nothing left in English" check rejects.
         Only the NUMBER needs the locale. */
      ctx.fillText('p = ' + dec(v, 2), x, y + 7);
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

    /* --- the data. A dot flashes cyan when group A used it, violet when
           group B did; both when both did. --- */
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NPOP; i++) {
      const fa = pflashA[i], fb = pflashB[i], f = Math.max(fa, fb), t = ptemp[i];
      let c;
      if (f > 0.02) c = fa >= fb ? CYAN : VIO;
      else c = [DEEP[0] + (PALE[0] - DEEP[0]) * t, DEEP[1] + (PALE[1] - DEEP[1]) * t,
                DEEP[2] + (PALE[2] - DEEP[2]) * t];
      const br = M.breathe(now, pphase[i], 0.8 + pmag[i] * 1.1, f > 0.02 ? 0.25 : 1);
      dot(popX(i), popY(i), (1.2 + pmag[i] * 1.15 + f) * br.r, c,
          (0.32 + pmag[i] * 0.38 + f * 0.5) * br.a,
          (f > 0.02 ? 0.48 + f * 0.45 : 0.2 + pmag[i] * 0.4) * br.g);
    }
    ctx.globalCompositeOperation = 'source-over';
    moneyAxis(yPop);

    /* --- the two group averages, and the gap between them --- */
    if (last) {
      const xa = xOf(last.mA), xb = xOf(last.mB);
      ctx.strokeStyle = 'rgba(150,178,225,.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xa, laneY + .5); ctx.lineTo(xb, laneY + .5); ctx.stroke();
      dot(xa, laneY + .5, 3.2, CYAN, 1, 1.0);
      dot(xb, laneY + .5, 3.2, VIO, 1, 1.0);
      ctx.font = `700 9px ${MONO}`; ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(138,224,244,.95)'; ctx.fillText('A', xa, laneY - 6);
      ctx.fillStyle = 'rgba(150,142,224,.95)'; ctx.fillText('B', xb, laneY - 6);
      const sigNow = last.p < alpha;
      ctx.fillStyle = sigNow ? 'rgba(255,107,98,.95)' : 'rgba(143,158,180,.9)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('p = ' + (last.p < 0.0001 ? expo(last.p, 1) : dec(last.p, 4))
                   + (sigNow ? TR('  → "significant"') : TR('  → not significant')),
                   mx, laneY + 8);
    }

    /* --- the divider. This is where the axis changes meaning, and it has to
           be impossible to miss. --- */
    const dy = Math.round((laneY + pTop) / 2);
    ctx.strokeStyle = 'rgba(150,178,225,.22)'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(14, dy + .5); ctx.lineTo(W - 14, dy + .5); ctx.stroke();
    ctx.setLineDash([]);

    /* --- the p-value histogram. Flat means nothing is going on. --- */
    const bw = (W - 2 * mx) / PB, avail = pBot - pTop;
    const aX = xOfP(alpha);
    // the rejection zone, drawn as a field so the eye reads it as one region
    ctx.fillStyle = 'rgba(255,107,98,.07)';
    ctx.fillRect(mx, pTop, aX - mx, avail);
    for (let b = 0; b < PB; b++) {
      const c0 = hist[b]; if (!c0) continue;
      const h = (c0 / hMax) * avail;
      const x = mx + b * bw;
      const inRed = (b + 1) / PB <= alpha + 1e-12;
      const col = inRed ? RED : COOL;
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${inRed ? 0.9 : 0.55})`;
      ctx.fillRect(x + 0.35, pBot - h, Math.max(1, bw - 0.7), h);
    }
    // the cut-off itself
    ctx.strokeStyle = 'rgba(255,107,98,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(aX + .5, pTop - 4); ctx.lineTo(aX + .5, pBot); ctx.stroke();
    ctx.fillStyle = 'rgba(255,107,98,.95)'; ctx.font = `700 9px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('α = ' + dec(alpha, 2), aX + 4, pTop - 5);
    // what flat would look like, so "flat" is a comparison and not a vibe
    if (cnt >= 60) {
      const flat = (cnt / PB / hMax) * avail;
      ctx.strokeStyle = 'rgba(255,196,116,.5)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(mx, pBot - flat); ctx.lineTo(W - mx, pBot - flat); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,196,116,.75)'; ctx.textAlign = 'right';
      ctx.fillText(TR('level if nothing were going on'), W - mx, pBot - flat - 3);
    }
    pAxis(pBot);

    /* --- the flight: dots lift, group B slides right by the lift, the two
           averages settle. --- */
    if (flight) {
      const t = flight.t, r = flight.r;
      const lift = ease(t / 0.34), conv = ease(clamp01((t - 0.26) / 0.4));
      const xa = xOf(r.mA), xb = xOf(r.mB);
      const glow = n <= 500 ? 0.42 : 0;
      ctx.globalCompositeOperation = 'lighter';
      if (t < 0.72) {
        const na = Math.min(r.ia.length, FLY_CAP);
        for (let q = 0; q < na; q++) {
          const i = r.ia[q], x0 = popX(i), y0 = popY(i);
          dot(x0 + (xa - x0) * conv, y0 + (laneY - y0) * lift, 1.6, CYAN, 0.5 + 0.35 * conv, glow);
        }
        const nb = Math.min(r.ib.length, FLY_CAP);
        for (let q = 0; q < nb; q++) {
          const i = r.ib[q];
          // group B's dot slides to its CHANGED value as it lifts: the
          // treatment is visibly applied rather than assumed
          const x0 = popX(i), xs = xOf(pval[i] * (1 + effect)), y0 = popY(i);
          const xm = x0 + (xs - x0) * lift;
          dot(xm + (xb - xm) * conv, y0 + (laneY - y0) * lift, 1.6, VIO, 0.5 + 0.35 * conv, glow);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (r.ia.length > FLY_CAP) {
        ctx.fillStyle = 'rgba(116,134,159,.8)'; ctx.font = `600 9px ${MONO}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(TR('showing {0} of {1} per group — the test uses all {2}',
                        grp(FLY_CAP), grp(n), grp(n)), W - mx, 30);
      }
      // the new p-value drops into its bin
      if (t >= 0.72) {
        const k = easeOut((t - 0.72) / 0.28);
        const x = xOfP(r.p);
        const y = laneY + (pBot - laneY) * k;
        dot(x, y, 3.4 - 1.4 * k, r.p < alpha ? RED : GOLD, 1, 1.3 - 0.7 * k);
      }
    }
  }

  /* ============ readouts ============ */
  const $ = id => document.getElementById(id);
  function readouts() {
    const rate = cnt ? sig / cnt : NaN;
    const nul = effect === 0;

    $('v-truth').textContent = nul
      ? TR('Nothing changed') : TR('B really is {0} higher', effLabel());
    $('v-truth-s').textContent = nul
      ? TR('the two groups are identical')
      : TR('a real gap of {0}', uf(MU * effect, 1));
    $('v-found').textContent = cnt >= 20 ? pctf(rate) : '—';
    $('v-found-s').textContent = cnt
      ? TR('{0} of {1} tests', grp(sig), grp(cnt))
      : TR('of all tests run');

    if (nul) {
      $('v-mean').textContent = cnt >= 20 ? TR('every one a false alarm') : '—';
      $('v-mean-s').textContent = TR('should be α = {0}', dec(alpha, 2));
      $('v-found-c').className = 'vc found bad';
      $('v-mean-c').className = 'vc meaning bad';
    } else {
      $('v-mean').textContent = cnt >= 20
        ? TR('missed it {0} of the time', pctf(1 - rate)) : '—';
      $('v-mean-s').textContent = TR('this share is the power');
      const weak = cnt >= 60 && rate < 0.8;
      $('v-found-c').className = 'vc found ' + (weak ? 'bad' : 'good');
      $('v-mean-c').className = 'vc meaning ' + (weak ? 'bad' : '');
    }

    if (last) {
      const s = last.p < alpha;
      $('r-p').textContent = last.p < 0.0001 ? expo(last.p, 2) : dec(last.p, 4);
      $('r-p').className = 'v ' + (s ? 'bad' : '');
      $('r-p-sub').textContent = s
        ? TR('below α = {0}', dec(alpha, 2)) : TR('above α = {0}', dec(alpha, 2));
      $('r-verdict').textContent = s ? TR('SIGNIFICANT') : TR('not significant');
      $('r-verdict').className = 'v ' + (s ? 'bad' : 'on');
      // grade it: we know the truth, so we can name the error type
      $('r-verdict-sub').textContent = nul
        ? (s ? TR('wrong — a Type I error') : TR('correct — nothing to find'))
        : (s ? TR('correct — the effect is real')
             : TR('wrong — a Type II error, effect missed'));
      $('r-ma').textContent = uf(last.mA, 1);
      $('r-mb').textContent = uf(last.mB, 1);
      $('r-gap').textContent = (last.mB - last.mA >= 0 ? '+' : '') + uf(last.mB - last.mA, 1);
    }
    $('r-cnt').textContent = grp(cnt);
    $('r-real').textContent = nul ? TR('zero') : '+' + uf(MU * effect, 1);
    const cv = SD / MU;
    $('r-cv').textContent = dec(cv, 2);
    $('r-cv').className = 'v ' + (cv > 0.8 ? 'bad' : 'on');
    $('r-mult').textContent = pctf(1 - Math.pow(1 - alpha, 20));
  }

  /* ============ loop ============ */
  function frame(ts) {
    if (!visible) { tPrev = ts; requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (ts - tPrev) / 1000 || 0); tPrev = ts; now = ts / 1000;
    if (!paused) {
      if (flight) {
        flight.t += dt / FLIGHT;
        if (flight.t >= 1) { record(flight.r); flight = null; readouts(); }
      } else {
        acc += dt;
        if (acc >= DRAW_EVERY) {
          acc = 0;
          const r = runTest();
          for (const i of r.ia) pflashA[i] = 1;
          for (const i of r.ib) pflashB[i] = 1;
          flight = { t: 0, r };
          last = r;          // show the averages immediately; recorded on landing
        }
      }
      for (let i = 0; i < NPOP; i++) {
        if (pflashA[i] > 0) pflashA[i] = Math.max(0, pflashA[i] - dt * 0.95);
        if (pflashB[i] > 0) pflashB[i] = Math.max(0, pflashB[i] - dt * 0.95);
      }
    }
    paint();
    requestAnimationFrame(frame);
  }

  /* ============ wiring ============ */
  const press = (sel, val, attr) =>
    document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));

  function restart(msg) {
    resetRun(); readouts(); paint();
    if (reduce) fastFill(600);
    $('live').textContent = msg;
  }
  function retitle() {
    document.getElementById('tagtop').innerHTML =
      TR('The data — <em>{0}, {1} · two samples of {2} drawn from {3} real records</em>',
         TR(D.label), TR(D.unit), grp(n), grp(NPOP));
  }

  document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const d = DATA.find(x => x.id === b.dataset.set); if (!d) return;
    press('[data-set]', d.id, 'set'); loadDataset(d); layout(); retitle();
    restart(TR('{0}. Noise divided by average is {1}.',
               TR(D.label), dec(SD / MU, 2)));
  }));
  document.querySelectorAll('[data-eff]').forEach(b => b.addEventListener('click', () => {
    effect = +b.dataset.eff; press('[data-eff]', effect, 'eff');
    restart(effect === 0
      ? TR('The two groups are now identical. Every significant result from '
           + 'here is a false alarm.')
      : TR('Group B really is {0} higher. The share of tests that notice is '
           + 'the power.', effLabel()));
  }));
  document.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
    n = +b.dataset.n; press('[data-n]', n, 'n'); retitle();
    restart(TR('{0} per group.', grp(n)));
  }));
  document.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
    alpha = +b.dataset.a; press('[data-a]', alpha, 'a');
    restart(TR('Cut-off {0}. Chance of a fake winner across 20 tests: {1}.',
               dec(alpha, 2), pctf(1 - Math.pow(1 - alpha, 20))));
  }));
  $('fast').addEventListener('click', () => {
    fastFill(500);
    $('live').textContent = TR('{0} tests run.', grp(cnt));
  });
  $('pause').addEventListener('click', e => {
    paused = !paused;
    e.target.textContent = paused ? TR('resume') : TR('pause');
    e.target.setAttribute('aria-pressed', String(paused));
  });
  $('reset').addEventListener('click', () => restart(TR('Reset.')));
  addEventListener('resize', () => { layout(); paint(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(canvas);
  }

  loadDataset(DATA[0]);
  layout();
  readouts();

  if (reduce) {
    fastFill(600);
  } else {
    fastFill(25);
    requestAnimationFrame(ts => { tPrev = ts; frame(ts); });
  }
})();
