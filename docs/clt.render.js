/* ============================================================
   The Central Limit Theorem, on real data.
   ------------------------------------------------------------
   Technique carried over from the Kosmion hero: one seeded point
   set, canvas 2D, bloom and nothing else, and dots that change
   ROLE rather than geometry. A dot resting in the population and
   the same dot mid-flight are one object painted two ways, which
   is why nothing pops when a sample fires.

   THE DATA IS THE POINT OF THIS VERSION. An earlier build drew
   its population from a lognormal curve and labelled it "order
   value", which is precisely the move a statistics course must
   not make. Now:

     * every dot is ONE RECORDED OBSERVATION from a cited public
       dataset, sitting at its true value on the axis;
     * a draw picks a real record at random with replacement, so
       the value averaged is a value that actually occurred;
     * mu and sigma come from data/build_datasets.py as the exact
       moments of the very values embedded here, so the readout
       cannot report a spread this page's own data lacks;
     * every filter applied upstream is printed in the provenance
       block. Nothing was dropped silently.

   Restrictions, so nobody later mistakes one for a bug:

     SHARED X AXIS   both piles are drawn on the SAME value axis
                     at the same scale. That is the entire payoff:
                     the lower pile visibly sits inside the upper
                     one and the ratio of widths is sqrt(n).
                     Rescaling the lower axis to "use the space"
                     would destroy the only thing this proves.

     WITH REPLACEMENT  a sampled dot leaves no hole. It flashes and
                     a copy flies. Draining the population would be
                     a different theorem, and it is also why no
                     finite-population correction belongs here.

     HEIGHT IS FREE  stack height is auto-scaled to fit and the
                     theoretical curve is height-matched to the
                     observed peak. The claim is about SHAPE and
                     WIDTH, never counts, so height carries no
                     information and is free to move.

     80 BINS / 700 DOTS  both chosen by data/choose_layout.py, not
                     by taste: it is the only pairing where all
                     three datasets keep the tallest column under
                     ~94 dots, keep most bins occupied, and clip
                     nothing off the right edge.
   ============================================================ */
(() => {
  const canvas = document.getElementById('clt');
  const DATA = window.UDJ_DATA;
  if (!canvas || !DATA || !DATA.length) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- palette: the brief's, and nothing neon ---- */
  const COOL = [186, 214, 255];   // blue-white — the averages
  const CYAN = [138, 224, 244];   // soft cyan, the accent — in flight
  const GOLD = [255, 196, 116];   // the average itself. Sparing, on purpose
  const DEEP = [ 84, 132, 196];   // navy — the population at rest
  const PALE = [196, 228, 255];
  const TAU = 6.283185307;

  const K = 80;     // bins used ONLY to decide stack height; x is the true value
  const MB = 200;   // bins for the pile of averages

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
  let D = DATA[0], n = 30;
  let W = 0, Hh = 0, dpr = 1, phone = false;
  let NPOP = 0, MU = 0, SD = 0, MED = 0, VMIN = 0, VMAX = 1;
  const M = window.UDJ_MOTION;
  let now = 0, pphase = null;
  let pval, pstack, pmag, ptemp, pflash, maxCol = 1, popSpacing = 4;
  let mcount = new Int32Array(MB), mshown = new Int32Array(MB), mMax = 1;
  let cnt = 0, mMean = 0, mM2 = 0, mM3 = 0;            // Welford, extended to M3
  let flights = [], paused = false, visible = true, last = 0, acc = 0;
  const DRAW_EVERY = 0.62, FLIGHT = 1.05;
  let mx = 46, yPop = 0, laneY = 0, yBot = 0, popTop = 0, botCap = 0;

  const xOf = v => mx + (v - VMIN) / (VMAX - VMIN) * (W - 2 * mx);

  /* ---- units. Currency sits in front of the number, anything else after. ---- */
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
  /* toFixed always emits a decimal POINT whatever the locale, so the readouts
     printed "1.97" beside Russian prose written with a comma. */
  const dec = (v, dp) => Number(v).toLocaleString(UDJ_LOC, {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  });

  function uf(v, extra = 0) {
    const d = Math.max(0, DP + extra);
    const s = dec(v, d);
    /* The unit affix comes from the data file, so it goes through TR: without
       it a Russian axis read "min" beside prose saying "минуты". */
    return PREFIX ? TR(D.unit) + s : s + ' ' + TR(D.unit);
  }

  /* ---- the population IS the embedded records. Binning decides only how
         high a dot stacks; its x is its own true value, so the pile is a
         dot-histogram of real observations rather than a drawing of one. ---- */
  function loadDataset(d) {
    D = d;
    NPOP = D.vals.length; MU = D.mu; SD = D.sd;
    VMIN = D.axis[0]; VMAX = D.axis[1];
    PREFIX = /^[£$€]$/.test(D.unit);
    DP = (VMAX - VMIN) > 2000 ? 0 : 1;

    const sorted = Float64Array.from(D.vals).sort();
    const h = sorted.length >> 1;
    MED = sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;

    pval = Float64Array.from(D.vals);
    pstack = new Int32Array(NPOP);
    pmag = new Float32Array(NPOP);
    ptemp = new Float32Array(NPOP);
    pflash = new Float32Array(NPOP);
    pphase = new Float32Array(NPOP);

    // stack in value order so each column fills bottom-up tidily
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

    resetPile();
    provenance();
    document.getElementById('tagtop').innerHTML =
      TR('The data — <em>{0}, {1} · {2} real records, one dot each</em>',
         TR(D.label), TR(D.unit), grp(NPOP));
    document.getElementById('hint').textContent = TR(HINTS[D.id] || '');
  }

  /* Every figure quoted here is measured, not remembered: modes and symmetry
     thresholds come from data/measure_claims.py, means and medians from the
     embedded values themselves. */
  const HINTS = {
    retail: 'Real invoices from a UK online shop. Most orders are small and a few are huge, so the average order (£458) is much bigger than the typical one (£305) — a handful of big spenders drag the average up. This is the hard case: even 30 orders is not enough to make the averages sit evenly. Click 300 to see them finally settle.',
    geyser: 'Minutes between eruptions of a real geyser. It waits either about 54 minutes or about 80 — almost never in between, which is why the data has two separate humps. Its average of 71 minutes lands in the quiet gap between them: only about one wait in fourteen falls near it, so the average is a number that describes the geyser without describing any of its actual behaviour. Even so, just 5 eruptions per sample is enough to make the averages form one clean bell.',
    diamond: 'Prices of 53,940 real diamonds. Most are inexpensive and the dearest costs nearly eight times the middle one, so the tail is long. At 5 and even at 30 stones per sample the averages still lean right; they only even out around 66, which is why 100 works and 30 does not. This is exactly the case the course\'s "n ≈ 30" rule of thumb is really about.'
  };

  function resetPile() {
    mcount = new Int32Array(MB); mshown = new Int32Array(MB);
    mMax = 1; cnt = 0; mMean = 0; mM2 = 0; mM3 = 0; flights = [];
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width; Hh = rect.height; phone = W < 560;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mx = phone ? 30 : 50;
    popTop = 34;
    yPop = Math.round(Hh * 0.42);
    laneY = Math.round(Hh * 0.505);
    yBot = Math.round(Hh - 26);
    botCap = yBot - laneY - 26;
    popSpacing = Math.max(1.5, Math.min(4.2, (yPop - popTop) / maxCol));
  }

  /* ---- one draw: a real record, with replacement ---- */
  const pick = () => (Math.random() * NPOP) | 0;

  function commit(mean) {
    let b = Math.floor((mean - VMIN) / ((VMAX - VMIN) / MB));
    if (b < 0) b = 0; else if (b >= MB) b = MB - 1;
    const slot = mcount[b]++;
    if (mcount[b] > mMax) mMax = mcount[b];
    /* Online mean, M2 and M3 (Welford, extended). M3 must be updated with the
       OLD M2, so the order of these three lines is load-bearing. Running
       moments rather than a stored array because a long session reaches tens
       of thousands of draws and a naive two-pass sum drifts. */
    const n1 = cnt; cnt++;
    const delta = mean - mMean, dn = delta / cnt, t1 = delta * dn * n1;
    mMean += dn;
    mM3 += t1 * dn * (cnt - 2) - 3 * dn * mM2;
    mM2 += t1;
    return { b, slot };
  }

  function fire() {
    const src = []; let sum = 0;
    for (let i = 0; i < n; i++) { const j = pick(); sum += pval[j]; pflash[j] = 1; src.push(j); }
    flights.push({ t: 0, src, mean: sum / n, target: null });
  }

  function fastFill(m) {
    for (let s = 0; s < m; s++) {
      let sum = 0; for (let i = 0; i < n; i++) sum += pval[pick()];
      const { b } = commit(sum / n); mshown[b]++;
    }
    readouts(); paint();
  }

  /* ============ paint ============ */
  const MONO = (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace').trim();

  function tickStep(span) {
    const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p;
  }

  function axis(y, label) {
    ctx.strokeStyle = 'rgba(150,178,225,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, y + .5); ctx.lineTo(W - mx, y + .5); ctx.stroke();
    ctx.fillStyle = 'rgba(116,134,159,.9)';
    ctx.font = `600 9px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = tickStep(VMAX - VMIN) * (phone ? 2 : 1);
    for (let v = Math.ceil(VMIN / step) * step; v <= VMAX; v += step) {
      const x = xOf(v);
      ctx.strokeStyle = 'rgba(150,178,225,.16)';
      ctx.beginPath(); ctx.moveTo(x + .5, y); ctx.lineTo(x + .5, y + 4); ctx.stroke();
      ctx.fillText(uf(v), x, y + 6);
    }
    /* The axis caption sits on its OWN line below the tick row. Drawing it at
       the same baseline, right-aligned at the right margin, put it straight on
       top of the last tick: the English page read "£3,500 one dot£4,000ne
       record" and the Russian the same way. This is a pre-existing collision in
       both languages, not a translation artefact. */
    if (label && !phone) {
      ctx.textAlign = 'right';
      ctx.fillText(label, W - mx, y + 6 + 11);
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

    /* --- the population: one dot per real record, at its true value --- */
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NPOP; i++) {
      const f = pflash[i], t = ptemp[i];
      const c = f > 0.02 ? CYAN
        : [DEEP[0] + (PALE[0] - DEEP[0]) * t, DEEP[1] + (PALE[1] - DEEP[1]) * t, DEEP[2] + (PALE[2] - DEEP[2]) * t];
      const br = M.breathe(now, pphase[i], 0.8 + pmag[i] * 1.1, f > 0.02 ? 0.25 : 1);
      dot(popX(i), popY(i), (1.5 + pmag[i] * 1.4 + f) * br.r, c,
          (0.40 + pmag[i] * 0.42 + f * 0.5) * br.a,
          (f > 0.02 ? 0.52 + f * 0.5 : 0.26 + pmag[i] * 0.45) * br.g);
    }
    ctx.globalCompositeOperation = 'source-over';
    axis(yPop, TR('one dot = one record'));

    /* --- the averages, on the SAME axis --- */
    const spacing = Math.max(1.1, Math.min(3.6, botCap / mMax));
    const rad = spacing < 2 ? 1.0 : 1.45;
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < MB; b++) {
      const c = mshown[b]; if (!c) continue;
      const x = xOf(VMIN + (b + 0.5) * ((VMAX - VMIN) / MB));
      for (let j = 0; j < c; j++) dot(x, yBot - 3 - j * spacing, rad, COOL, 0.66, j === c - 1 ? 0.5 : 0.08);
    }
    ctx.globalCompositeOperation = 'source-over';

    /* --- the theoretical N(mu, sigma^2/n). Height-matched to the observed
           peak on purpose: the claim is shape and width, not counts. --- */
    const se = SD / Math.sqrt(n);
    if (cnt >= 12) {
      const peak = Math.min(botCap, mMax * spacing);
      ctx.beginPath();
      for (let sx = mx; sx <= W - mx; sx += 2) {
        const v = VMIN + (sx - mx) / (W - 2 * mx) * (VMAX - VMIN);
        const z = (v - MU) / se;
        const y = yBot - 3 - Math.exp(-0.5 * z * z) * peak;
        sx === mx ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y);
      }
      ctx.strokeStyle = 'rgba(138,224,244,.55)'; ctx.lineWidth = 1.25; ctx.stroke();

      // +/-1 SE and +/-2 SE. These four hairlines ARE a 68% and a 95%
      // interval, several modules before the formula turns up.
      ctx.setLineDash([2, 4]);
      for (const [k, a] of [[1, .34], [2, .2]]) {
        for (const sgn of [-1, 1]) {
          const x = xOf(MU + sgn * k * se);
          if (x < mx || x > W - mx) continue;
          ctx.strokeStyle = `rgba(138,224,244,${a})`;
          ctx.beginPath(); ctx.moveTo(x + .5, yBot - 3); ctx.lineTo(x + .5, yBot - 6 - peak); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // mu, spanning both piles, so the lower one is seen centring on it
    const xmu = xOf(MU);
    ctx.setLineDash([1, 3]);
    ctx.strokeStyle = 'rgba(255,196,116,.42)';
    ctx.beginPath(); ctx.moveTo(xmu + .5, popTop - 12); ctx.lineTo(xmu + .5, yBot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,196,116,.85)'; ctx.font = `700 9px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('μ = ' + uf(MU), xmu, popTop - 14);

    axis(yBot, '');

    /* --- flights: lift, converge, merge, drop --- */
    ctx.globalCompositeOperation = 'lighter';
    for (const f of flights) {
      const t = f.t, mxp = xOf(f.mean);
      if (t < 0.62) {
        const lift = ease(t / 0.30), conv = ease(clamp01((t - 0.26) / 0.36));
        /* At n = 300 there are 300 dots in the air per sample and two samples
           can overlap. 600 converging hairlines read as mush rather than as
           "these are being averaged", and 600 bloom blits per frame is the one
           thing here that would drop frames — so both scale back with n. The
           dots themselves always draw: they are the data. */
        const lines = n <= 30, glow = n <= 100 ? 0.5 : 0;
        for (const i of f.src) {
          const x0 = popX(i), y0 = popY(i);
          const x = x0 + (mxp - x0) * conv, y = y0 + (laneY - y0) * lift;
          if (lines && conv > 0.05) {
            ctx.strokeStyle = `rgba(138,224,244,${0.16 * (1 - conv)})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(mxp, laneY); ctx.stroke();
          }
          dot(x, y, n > 100 ? 1.5 : 1.9, CYAN, 0.55 + 0.35 * conv, glow);
        }
        if (conv > 0.55) dot(mxp, laneY, 2.2 + 2.4 * conv, GOLD, conv, 0.9 + conv * 0.6);
      } else if (f.target) {
        // the slot was reserved in the loop, not here: paint must never
        // mutate the statistics or a stray repaint would commit a sample
        const k = easeOut((t - 0.62) / 0.38);
        const sp = Math.max(1.1, Math.min(3.6, botCap / mMax));
        const ty = yBot - 3 - f.target.slot * sp;
        const tx = xOf(VMIN + (f.target.b + 0.5) * ((VMAX - VMIN) / MB));
        dot(mxp + (tx - mxp) * k, laneY + (ty - laneY) * k, 3.4 - 1.6 * k, GOLD, 1, 1.5 - 0.9 * k);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ============ readouts — text, always ============ */
  const $ = id => document.getElementById(id);
  function readouts() {
    const se = SD / Math.sqrt(n);
    const obs = cnt > 1 ? Math.sqrt(mM2 / (cnt - 1)) : NaN;
    $('r-mu').textContent  = uf(MU, 1);
    $('r-med').textContent = uf(MED, 1);
    $('r-sd').textContent  = uf(SD, 1);
    $('r-n').textContent   = String(n);
    $('r-se').textContent  = uf(se, 2);
    $('r-obs').textContent = cnt > 1 ? uf(obs, 2) : '—';
    $('r-cnt').textContent = grp(cnt);
    $('r-mm').textContent  = cnt ? uf(mMean, 2) : '—';
    /* Not routed through TR: this readout is pure mathematical notation, so an
       entry for it could only ever be identical to its key — which the
       "nothing left in English" check correctly rejects. Both numbers are
       already locale-aware. */
    $('r-ratio').textContent = cnt > 1 && obs > 0
      ? dec(SD / obs, 2) + '  ·  √n = ' + dec(Math.sqrt(n), 2) : '—';

    /* Skewness. The predicted value is the population's skewness over sqrt(n)
       — an exact rate, not an approximation, and the live observed figure is
       what lets a reader check it rather than take it on faith. */
    /* dec() supplies the minus sign itself, so English still prints "-0.12"
       exactly as toFixed did — only the decimal separator follows the locale.
       Writing an explicit U+2212 here would have silently changed the English
       readout's glyph. */
    const sgn = x => (x >= 0 ? '+' : '') + dec(x, 2);
    $('r-pskew').textContent = sgn(D.skew);
    const sk = cnt > 2 && mM2 > 0 ? Math.sqrt(cnt) * mM3 / Math.pow(mM2, 1.5) : NaN;
    $('r-oskew').textContent = Number.isFinite(sk)
      ? TR('{0}  ·  pred {1}', sgn(sk), sgn(D.skew / Math.sqrt(n))) : '—';
    $('r-nsym').textContent = D.n_symmetric + (n >= D.n_symmetric
      ? TR('  ✓ yours is enough') : TR('  ✗ yours is too small'));
    $('r-nsym').className = 'v ' + (n >= D.n_symmetric ? 'on' : 'gold');
  }

  /* ---- provenance. Content is generated by data/build_datasets.py from
         literals in that file plus measured counts — no third-party text
         reaches this markup. ---- */
  function provenance() {
    const same = D.n_pool === D.n_source;
    $('prov').innerHTML =
      `<div class="cap">${TR('Data source')}</div>
       <p><a href="${D.url}" target="_blank" rel="noopener">${TR(D.source)}</a> — ${TR(D.what)}</p>
       <ul>${D.filters.map(f => `<li>${TR(f)}</li>`).join('')}</ul>
       <p class="chk">${TR('On screen: <b>{0}</b> records, mean <b>{1}</b>, '
                          + 'spread <b>{2}</b>.',
                          grp(NPOP), uf(D.mu, 1), uf(D.sd, 1))}
        ${same
          ? TR('This is the complete dataset.')
          : TR('Drawn from <b>{0}</b> whose mean is <b>{1}</b> and spread '
               + '<b>{2}</b> — close enough that the sample on screen '
               + 'represents the pool it came from.',
               grp(D.n_pool), uf(D.pool_mu, 1), uf(D.pool_sd, 1))}</p>`;
  }

  /* ============ loop ============ */
  function frame(ts) {
    if (!visible) { last = ts; requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts; now = ts / 1000;
    if (!paused) {
      acc += dt;
      if (acc >= DRAW_EVERY) { acc = 0; fire(); }
      let landed = false;
      for (const f of flights) {
        f.t += dt / FLIGHT;
        if (f.t >= 0.62 && !f.target) { f.target = commit(f.mean); landed = true; }
        if (f.t >= 1 && f.target) mshown[f.target.b]++;
      }
      flights = flights.filter(f => f.t < 1);
      if (landed) readouts();
      for (let i = 0; i < NPOP; i++) if (pflash[i] > 0) pflash[i] = Math.max(0, pflash[i] - dt * 1.15);
    }
    paint();
    requestAnimationFrame(frame);
  }

  /* ============ wiring ============ */
  const press = (sel, val, attr) =>
    document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));

  document.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
    n = +b.dataset.n; press('[data-n]', n, 'n');
    resetPile(); readouts(); paint(); if (reduce) fastFill(600);
    $('live').textContent = TR('Sample size {0}. Predicted standard error {1}.',
                               grp(n), uf(SD / Math.sqrt(n), 2));
  }));
  document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const d = DATA.find(x => x.id === b.dataset.set); if (!d) return;
    press('[data-set]', d.id, 'set');
    loadDataset(d); layout(); readouts(); paint(); if (reduce) fastFill(600);
    $('live').textContent = TR('{0}: {1} records, mean {2}, spread {3}.',
                               TR(D.label), grp(NPOP), uf(MU, 1), uf(SD, 1));
  }));
  $('fast').addEventListener('click', () => {
    fastFill(200);
    $('live').textContent = TR('{0} averages drawn.', grp(cnt));
  });
  $('pause').addEventListener('click', e => {
    paused = !paused;
    e.target.textContent = paused ? TR('resume') : TR('pause');
    e.target.setAttribute('aria-pressed', String(paused));
  });
  $('reset').addEventListener('click', () => {
    resetPile(); readouts(); paint();
    $('live').textContent = TR('Reset.');
  });
  addEventListener('resize', () => { layout(); paint(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(canvas);
  }

  loadDataset(DATA[0]);
  layout();
  readouts();

  if (reduce) {
    // A reader who asked the OS for no animation is owed the finished
    // picture, not an empty axis.
    fastFill(600);
  } else {
    fastFill(3);
    requestAnimationFrame(ts => { last = ts; frame(ts); });
  }
})();
