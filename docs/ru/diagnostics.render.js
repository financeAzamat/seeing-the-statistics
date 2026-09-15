/* ============================================================
   Regression diagnostics — animated renderer.
   ------------------------------------------------------------
   Extracted from diagnostics.html when the first version was
   judged flat: it had NO animation loop at all, painted once per
   event, and drew its scatter with glow 0, so it read as a dark
   matplotlib plot rather than as the particle field it should be.

   What carries it now:

     THE MORPH     changing transform does not repaint, it MOVES.
                   Every point is tweened in SCREEN space from its
                   old position to its new one, staggered so 800
                   points arrive as a sweep. This is the Kosmion
                   hero's trick — one particle set, two coordinate
                   systems — and here it also teaches: you watch
                   the cloud straighten and the fan close.

                   Screen space, not data space, on purpose: the
                   axis ranges change under a log, so interpolating
                   the DATA would send points through positions
                   that belong to neither picture.

     THE PANELS    the four diagnostics tween too — bar heights,
                   the shape line, the QQ cloud — so the fan
                   visibly collapses instead of cutting. Verdict
                   badges follow whichever state the picture is
                   closer to, never announcing a PASS over a
                   picture that still fails.

     AMBIENT       when nothing is being changed the field is still
                   alive: per-point twinkle on a seeded phase, a
                   highlight travelling along the fit line, and a
                   pulse on the influential-point ring. Slow and
                   small on purpose — enough that the page is not a
                   screenshot, not enough to compete with the data.

   Restrictions, so nobody later mistakes one for a bug:

     REDUCED MOTION  prefers-reduced-motion switches every tween to
                     an instant set and never starts the ticker.
                     One static frame, correct in every detail.

     OFF-SCREEN OFF  the ticker is gated by an IntersectionObserver;
                     a canvas nobody is looking at burns no frames.

     NUMBERS TWEEN   the scorecard figures interpolate between the
                     two states while the morph runs. They are
                     exact at both ends; mid-flight they are a
                     visual interpolation and the badge withholds
                     judgement until the picture has mostly landed.
   ============================================================ */
(() => {
  const canvas = document.getElementById('dg');
  const PAIRS = window.UDJ_PAIRS, S = window.UDJ_STATS, M = window.UDJ_MOTION;
  if (!canvas || !PAIRS || !S || !M) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COOL = [186, 214, 255];
  const CYAN = [138, 224, 244];
  const GOLD = [255, 196, 116];
  const RED  = [255, 107,  98];
  const DEEP = [ 84, 132, 196];
  const PALE = [196, 228, 255];
  const TAU = 6.283185307;

  /* Translation lookup. The KEY is the English string, so a missing entry falls
     back to correct English rather than a bare identifier — which is what lets
     the English page load this same file with no strings table at all. */
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
  /* toFixed always emits a decimal POINT whatever the locale. The zero-snap
     stops a value that rounds to zero printing as "-0". */
  const dec = (v, dp) => (Math.abs(Number(v)) < Math.pow(10, -dp) / 2 ? 0 : Number(v))
    .toLocaleString(UDJ_LOC, {
      minimumFractionDigits: dp, maximumFractionDigits: dp,
    });
  const sgn = (v, dp) => (v >= 0 ? '+' : '') + dec(v, dp);

  /* thresholds, matching data/measure_diagnostics.py */
  const T_BEND = 0.5, T_FAN = 2.0, T_LAG = 0.15, T_SKEW = 1.0, T_KURT = 2.0;

  const MORPH_DUR = 1.05, MORPH_SPREAD = 0.55;

  const TF = {
    none:    { x: v => v, y: v => v, xl: '', yl: '' },
    logy:    { x: v => v, y: v => Math.log(v), xl: '', yl: 'log ' },
    logboth: { x: v => Math.log(v), y: v => Math.log(v), xl: 'log ', yl: 'log ' },
  };

  let D = PAIRS[0], tf = 'none', dropWorst = false;
  let W = 0, Hh = 0, dpr = 1, phone = false;
  let A = null, B = null, morph = null;
  let pmag = null, pphase = null;
  let ticker = null, now = 0;

  /* ---------- a render state: the transformed data plus its diagnostics ---------- */
  function buildState(tfName, drop) {
    const t = TF[tfName];
    const xs = [], ys = [];
    for (let i = 0; i < D.x.length; i++) { xs.push(t.x(D.x[i])); ys.push(t.y(D.y[i])); }
    const full = S.diagnose(xs, ys);
    const kx = [], ky = [];
    for (let i = 0; i < xs.length; i++) if (i !== full.worst) { kx.push(xs[i]); ky.push(ys[i]); }
    const without = S.ols(kx, ky);
    const shift = full.slope ? Math.abs(without.b - full.slope) / Math.abs(full.slope) : 0;

    let X, Y, g, keptIdx;
    if (drop && full.worst >= 0) {
      X = kx; Y = ky; g = S.diagnose(kx, ky);
      keptIdx = [];
      for (let i = 0; i < xs.length; i++) if (i !== full.worst) keptIdx.push(i);
    } else {
      X = xs; Y = ys; g = full;
      keptIdx = null;
    }
    // data ranges, padded, for this state's own axis
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < X.length; i++) {
      if (X[i] < x0) x0 = X[i]; if (X[i] > x1) x1 = X[i];
      if (Y[i] < y0) y0 = Y[i]; if (Y[i] > y1) y1 = Y[i];
    }
    const px = (x1 - x0) * 0.05, py = (y1 - y0) * 0.07;
    // sorted standardised residuals, for the QQ panel
    const rs = Array.from(g.resid).sort((a, b) => a - b);
    const sd = g.residSd || 1;
    const qq = rs.map(v => v / sd);
    return {
      tf: tfName, drop: !!drop, X, Y, g, keptIdx,
      x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py,
      worstX: (!drop && full.worst >= 0) ? xs[full.worst] : null,
      worstY: (!drop && full.worst >= 0) ? ys[full.worst] : null,
      maxCookFull: full.maxCook, shift, qq,
      /* The transform prefix ('', 'log ') is a function name, identical in both
         languages, so only the DATA label goes through TR. Wrapping the prefix
         would need a table entry equal to its own key, which the "nothing left
         in English" check rejects. */
      xl: t.xl + TR(D.xlab), yl: t.yl + TR(D.ylab), xlp: t.xl, ylp: t.yl,
    };
  }

  function retarget(tfName, drop) {
    const next = buildState(tfName, drop);
    if (reduce || !A) { A = next; B = null; morph = null; return; }
    // if a morph is already running, freeze what is on screen as the new origin
    if (morph && B) A = sampleFrozen();
    B = next;
    morph = new M.Tween(0, 1, MORPH_DUR, M.ease.cubicInOut);
  }

  /* When retargeting mid-morph we would otherwise jump. Rather than carry a
     synthetic half-state through every draw path, snap A to B: the visual cost
     is one frame, and the alternative is a state whose diagnostics belong to no
     real transform. Honest and cheap. */
  function sampleFrozen() { return B; }

  function load(d) {
    D = d; dropWorst = false; A = null; B = null; morph = null;
    document.getElementById('drop').setAttribute('aria-pressed', 'false');
    document.getElementById('drop').textContent = TR('drop the worst point');
    // seeded per-point brightness and twinkle phase, so the field looks
    // identical on every reload
    let sd = 1907;
    const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
    pmag = new Float32Array(D.x.length);
    pphase = new Float32Array(D.x.length);
    for (let i = 0; i < pmag.length; i++) { pmag[i] = Math.pow(rnd(), 2.0); pphase[i] = rnd() * TAU; }
    A = buildState(tf, false);
    document.getElementById('hint').textContent = TR(D.order_note);
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width; Hh = rect.height; phone = W < 620;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- drawing kit ---------- */
  const MONO = (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace').trim();

  const SPR = new Map();
  function bloom(c) {
    const k = c.join(',');
    if (SPR.has(k)) return SPR.get(k);
    const s = 64, el = document.createElement('canvas');
    el.width = el.height = s;
    const g = el.getContext('2d');
    const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0.00, `rgba(${c[0]},${c[1]},${c[2]},0.55)`);
    rg.addColorStop(0.16, `rgba(${c[0]},${c[1]},${c[2]},0.24)`);
    rg.addColorStop(0.48, `rgba(${c[0]},${c[1]},${c[2]},0.06)`);
    rg.addColorStop(1.00, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, s, s);
    SPR.set(k, el); return el;
  }
  /* `rim` draws a dark ring under the dot. In a dense scatter that ring is what
     makes overlapping points read as separate objects instead of one pale
     smear; leave it at 0 for a sparse field, where it only eats the glow. */
  function dot(x, y, r, c, a, glow, rim) {
    const rr = Math.max(0.1, r);
    if (glow > 0) {
      const s = bloom(c), sz = rr * glow * 9;
      ctx.globalAlpha = Math.min(1, Math.max(0, a * .95));
      ctx.drawImage(s, x - sz / 2, y - sz / 2, sz, sz);
    }
    // clamped: assigning globalAlpha outside [0,1] is IGNORED per spec,
    // which would silently keep the previous alpha once a pulse lifts it > 1
    const ca = a < 0 ? 0 : a > 1 ? 1 : a;
    if (rim > 0) {
      ctx.globalAlpha = ca;
      ctx.fillStyle = 'rgba(4,6,11,0.88)';
      ctx.beginPath(); ctx.arc(x, y, rr + rim, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = ca;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  /* canvas has no letter-spacing, and the caption tier is defined by its
     tracking, so it is drawn a glyph at a time */
  function tracked(text, x, y, px, colour, track, align) {
    ctx.font = `700 ${px}px ${MONO}`;
    const chars = text.split('');
    let w = 0;
    for (const ch of chars) w += ctx.measureText(ch).width + track;
    w -= track;
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = colour; ctx.textAlign = 'left';
    for (const ch of chars) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + track;
    }
    return w;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function pill(text, rx, ry, c, filled) {
    ctx.font = `700 9px ${MONO}`;
    const tw = ctx.measureText(text).width + 3 * (text.length - 1);
    const w = tw + 14, h = 15, x = rx - w, y = ry;
    if (filled) {
      ctx.globalAlpha = 0.22;
      ctx.drawImage(bloom(c), x - 10, y - 10, w + 20, h + 20);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      roundRect(x, y, w, h, 7.5); ctx.fill();
      tracked(text, x + 7, y + h / 2 + 3.5, 9, 'rgba(5,7,13,.92)', 3, 'left');
    } else {
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},.45)`; ctx.lineWidth = 1;
      roundRect(x + .5, y + .5, w - 1, h - 1, 7.5); ctx.stroke();
      tracked(text, x + 7, y + h / 2 + 3.5, 9, `rgba(${c[0]},${c[1]},${c[2]},.95)`, 3, 'left');
    }
  }
  function tickStep(span) {
    const raw = span / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p;
  }
  function fmtNum(v) {
    const a = Math.abs(v);
    const u = k => (window.UDJ_STRINGS && window.UDJ_STRINGS[k[0]]) || k[1];
    if (a >= 1e6) return dec(v / 1e6, 1) + u(['__mag_m', 'm']);
    if (a >= 1e4) return dec(v / 1e3, 0) + u(['__mag_k', 'k']);
    if (a >= 100) return dec(v, 0);
    if (a >= 1) return dec(v, 1);
    return dec(v, 2);
  }
  /* a panel: hairline box, tracked title, verdict pill, subtitle, plot rect */
  function panel(x0, y0, x1, y1, title, verdict, vcolour, note, draw) {
    // a faint inner lift so a panel reads as a surface rather than an outline
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(150,190,255,.045)');
    g.addColorStop(1, 'rgba(150,190,255,.012)');
    ctx.fillStyle = g;
    roundRect(x0, y0, x1 - x0, y1 - y0, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(150,178,225,.2)'; ctx.lineWidth = 1;
    roundRect(x0 + .5, y0 + .5, x1 - x0 - 1, y1 - y0 - 1, 3); ctx.stroke();

    ctx.textBaseline = 'alphabetic';
    tracked(title.toUpperCase(), x0 + 12, y0 + 19, 10, 'rgba(210,225,250,.95)', 1.6, 'left');
    if (verdict) pill(verdict, x1 - 12, y0 + 9, vcolour, verdict !== TR('N/A'));
    if (note) {
      ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(143,162,196,.85)';
      ctx.fillText(note, x0 + 12, y0 + 34);
    }
    draw(x0 + 40, y0 + 46, x1 - 14, y1 - 24);
  }

  /* ---------- geometry helpers shared by the morph ---------- */
  function mapper(st, px0, py0, px1, py1) {
    return {
      x: v => px0 + (v - st.x0) / (st.x1 - st.x0) * (px1 - px0),
      y: v => py1 - (v - st.y0) / (st.y1 - st.y0) * (py1 - py0),
    };
  }
  const lerp = M.lerp;

  /* ---------- paint ---------- */
  function paint() {
    if (!A) return;
    const p = morph ? morph.v : 1;
    const T = B || A;                 // the state we are heading for
    const settled = !morph || morph.done;

    ctx.clearRect(0, 0, W, Hh);

    const sTop = 8, sBot = Math.round(Hh * 0.335);
    const gap = 9, midY = Math.round(Hh * 0.665);
    const colW = (W - 16 - gap) / 2;
    const p1x0 = 8, p1x1 = 8 + colW, p2x0 = p1x1 + gap, p2x1 = W - 8;
    const rTop = sBot + gap, rBot = midY, r2Top = midY + gap, r2Bot = Hh - 8;

    // metrics shown are interpolated while the morph runs
    const gA = A.g, gB = T.g;
    const mv = k => lerp(gA[k], gB[k], p);
    const bend = mv('bend'), fan = mv('fan'), lag1 = mv('lag1');
    const skew = mv('skew'), kurt = mv('kurt'), r2 = mv('r2'), slope = mv('slope');
    // the badge follows whichever picture is mostly on screen
    const V = p < 0.5 ? gA : gB;
    const bendOk = V.bend < T_BEND, fanOk = V.fan < T_FAN;
    const lagOk = Math.abs(V.lag1) < T_LAG;
    const normOk = Math.abs(V.skew) < T_SKEW && V.kurt < T_KURT;

    /* ================= the scatter ================= */
    panel(8, sTop, W - 8, sBot,
      /* Not routed through TR: an arrow between two already-translated labels
         is notation, so an entry could only equal its key. */
      T.xl + ' → ' + T.yl, null, CYAN,
      TR('R² {0}   ·   slope {1}', dec(r2, 3), dec(slope, Math.abs(slope) > 100 ? 0 : 3))
        + (T.drop ? TR('   ·   worst point dropped') : ''),
      (px0, py0, px1, py1) => {
        const mA = mapper(A, px0, py0, px1, py1);
        const mB = mapper(T, px0, py0, px1, py1);
        // grid from the target state, fading in
        ctx.font = `600 9px ${MONO}`;
        const xs2 = tickStep(T.x1 - T.x0);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let v = Math.ceil(T.x0 / xs2) * xs2; v <= T.x1; v += xs2) {
          const gx = mB.x(v);
          ctx.strokeStyle = `rgba(150,178,225,${0.05 + 0.05 * p})`;
          ctx.beginPath(); ctx.moveTo(gx + .5, py0); ctx.lineTo(gx + .5, py1); ctx.stroke();
          ctx.fillStyle = `rgba(143,162,196,${0.35 + 0.5 * p})`;
          ctx.fillText(fmtNum(v), gx, py1 + 5);
        }
        const ys2 = tickStep(T.y1 - T.y0);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let v = Math.ceil(T.y0 / ys2) * ys2; v <= T.y1; v += ys2) {
          const gy = mB.y(v);
          ctx.strokeStyle = `rgba(150,178,225,${0.05 + 0.05 * p})`;
          ctx.beginPath(); ctx.moveTo(px0, gy + .5); ctx.lineTo(px1, gy + .5); ctx.stroke();
          ctx.fillStyle = `rgba(143,162,196,${0.35 + 0.5 * p})`;
          ctx.fillText(fmtNum(v), px0 - 5, gy);
        }

        /* the point cloud. Indices line up between states unless one of them
           dropped a point, in which case the shorter list drives and the
           dropped point fades rather than teleporting. */
        /* Normal compositing plus a rim. Additive blending made the dense
           low-carat corner a single white mass; the morph then looked like a
           smear moving rather than 800 points travelling. */
        const n = Math.min(A.X.length, T.X.length);
        for (let i = 0; i < n; i++) {
          const q = M.stagger(i, n, MORPH_SPREAD, p);
          const x = lerp(mA.x(A.X[i]), mB.x(T.X[i]), q);
          const y = lerp(mA.y(A.Y[i]), mB.y(T.Y[i]), q);
          const m = pmag[i] || 0.4;
          // ambient twinkle, and a brightening while in flight
          const br = M.breathe(now, pphase[i] || 0, 0.8 + m * 1.1);
          const fly = settled ? 0 : Math.sin(Math.PI * q) * 0.55;
          const c = fly > 0.02
            ? [lerp(DEEP[0], CYAN[0], fly), lerp(DEEP[1], CYAN[1], fly), lerp(DEEP[2], CYAN[2], fly)]
            : [lerp(DEEP[0], PALE[0], m), lerp(DEEP[1], PALE[1], m), lerp(DEEP[2], PALE[2], m)];
          // Round, solid, no halo; a rim keeps the dense corner separable.
          // In flight a point grows slightly and takes a heavier rim rather
          // than lighting up, so the morph reads without a glow.
          dot(x, y, (2.5 + m * 1.1) * (1 + fly * 0.28) * br.r, c,
              (0.92 + m * 0.08) * br.a, 0, fly > 0.25 ? 1.6 : 1.1);
        }

        /* the fit, with a highlight travelling along it */
        const lx0 = px0, lx1 = px1;
        const ax0 = mA.y(gA.intercept + gA.slope * A.x0), ax1 = mA.y(gA.intercept + gA.slope * A.x1);
        const bx0 = mB.y(gB.intercept + gB.slope * T.x0), bx1 = mB.y(gB.intercept + gB.slope * T.x1);
        const y0l = lerp(ax0, bx0, p), y1l = lerp(ax1, bx1, p);
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},.5)`;
        ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(lx0, y0l); ctx.lineTo(lx1, y1l); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},.95)`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx0, y0l); ctx.lineTo(lx1, y1l); ctx.stroke();
        // the shimmer: a short bright run sliding along the line on a loop
        const sh = (now * 0.22) % 1.6;
        if (sh < 1) {
          const a = Math.max(0, sh - 0.09), b2 = Math.min(1, sh + 0.09);
          const gx = (t2) => lerp(lx0, lx1, t2), gy = (t2) => lerp(y0l, y1l, t2);
          const grad = ctx.createLinearGradient(gx(a), gy(a), gx(b2), gy(b2));
          grad.addColorStop(0, 'rgba(255,244,220,0)');
          grad.addColorStop(0.5, 'rgba(255,248,232,.9)');
          grad.addColorStop(1, 'rgba(255,244,220,0)');
          ctx.strokeStyle = grad; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(gx(a), gy(a)); ctx.lineTo(gx(b2), gy(b2)); ctx.stroke();
        }
        ctx.lineCap = 'butt';

        /* the most influential point, ringed with a pulse */
        if (T.worstX !== null && settled) {
          const cx = mB.x(T.worstX), cy = mB.y(T.worstY);
          const pu = 0.5 + 0.5 * Math.sin(now * 2.0);
          ctx.globalAlpha = 0.5 + 0.4 * pu;
          ctx.strokeStyle = `rgba(${RED[0]},${RED[1]},${RED[2]},.95)`; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(cx, cy, 8 + pu * 3.5, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(cx, cy, 7.5, 0, TAU); ctx.stroke();
          tracked(TR('MOST INFLUENTIAL'), cx + 14, cy + 3.5, 9,
                  `rgba(${RED[0]},${RED[1]},${RED[2]},.95)`, 1.4, 'left');
        }
      });

    /* ================= shape ================= */
    panel(p1x0, rTop, p1x1, rBot, TR('shape · average error along x'),
      bendOk ? TR('PASS') : TR('FAIL'), bendOk ? CYAN : RED,
      TR('bend {0}   want < {1}', dec(bend, 2), dec(T_BEND, 1)),
      (x0, y0, x1, y1) => {
        const a = gA.sliceMeans, b = gB.sliceMeans;
        const n = Math.min(a.length, b.length);
        let amp = 0;
        for (let i = 0; i < n; i++) amp = Math.max(amp, Math.abs(a[i] / (gA.residSd || 1)),
                                                        Math.abs(b[i] / (gB.residSd || 1)));
        amp = Math.max(amp, 0.6) * 1.15;
        const yy = v => (y0 + y1) / 2 - (v / amp) * ((y1 - y0) / 2 - 3);
        ctx.strokeStyle = 'rgba(255,196,116,.4)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, yy(0) + .5); ctx.lineTo(x1, yy(0) + .5); ctx.stroke();
        ctx.setLineDash([]);
        const col = bendOk ? CYAN : RED;
        const pts = [];
        for (let i = 0; i < n; i++) {
          const v = lerp(a[i] / (gA.residSd || 1), b[i] / (gB.residSd || 1), p);
          pts.push([x0 + (i + 0.5) / n * (x1 - x0), yy(v)]);
        }
        // a soft band under the line, so the shape reads as a form not a wire
        ctx.beginPath();
        ctx.moveTo(pts[0][0], yy(0));
        for (const q of pts) ctx.lineTo(q[0], q[1]);
        ctx.lineTo(pts[pts.length - 1][0], yy(0));
        ctx.closePath();
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},.10)`; ctx.fill();
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},.95)`; ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
        ctx.stroke();
        for (let i = 0; i < pts.length; i++) {
          const pulse = settled ? 1 + 0.1 * Math.sin(now * 1.6 + i * 0.7) : 1;
          dot(pts[i][0], pts[i][1], 3 * pulse, col, 1, 0.75);
        }
        ctx.font = `600 9px ${MONO}`; ctx.fillStyle = 'rgba(143,162,196,.7)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(TR('flat = the shape is right'), x0, y1 + 15);
      });

    /* ================= spread ================= */
    panel(p2x0, rTop, p2x1, rBot, TR('spread · error size along x'),
      fanOk ? TR('PASS') : TR('FAIL'), fanOk ? CYAN : RED,
      TR('fan {0}×   want < {1}', isFinite(fan) ? dec(fan, 2) : '∞', dec(T_FAN, 1)),
      (x0, y0, x1, y1) => {
        const a = gA.sliceSds, b = gB.sliceSds;
        const n = Math.min(a.length, b.length);
        // normalise each state by its own largest bar, so the SHAPE of the
        // fan is what moves rather than the absolute units
        let ma = 0, mb = 0;
        for (let i = 0; i < n; i++) { ma = Math.max(ma, a[i]); mb = Math.max(mb, b[i]); }
        ma = ma || 1; mb = mb || 1;
        const bw = (x1 - x0) / n, col = fanOk ? CYAN : RED;
        for (let i = 0; i < n; i++) {
          const v = lerp(a[i] / ma, b[i] / mb, p);
          const h = v * (y1 - y0 - 6);
          const bx = x0 + i * bw + 1.5, bwid = bw - 3;
          const gr = ctx.createLinearGradient(0, y1 - h, 0, y1);
          gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},.8)`);
          gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},.18)`);
          ctx.fillStyle = gr;
          roundRect(bx, y1 - h, bwid, h, Math.min(2.5, bwid / 2)); ctx.fill();
          // a lit cap, pulsing gently when settled
          const pu = settled ? 0.75 + 0.25 * Math.sin(now * 1.5 + i * 0.55) : 1;
          ctx.globalAlpha = 0.5 * pu;
          ctx.drawImage(bloom(col), bx - 6, y1 - h - 7, bwid + 12, 14);
          ctx.globalAlpha = 1;
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},.95)`;
          ctx.fillRect(bx, y1 - h, bwid, 2);
        }
        ctx.strokeStyle = 'rgba(150,178,225,.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y1 + .5); ctx.lineTo(x1, y1 + .5); ctx.stroke();
        ctx.font = `600 9px ${MONO}`; ctx.fillStyle = 'rgba(143,162,196,.7)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(TR('equal heights = even accuracy'), x0, y1 + 15);
      });

    /* ================= independence, or a refusal ================= */
    panel(p1x0, r2Top, p1x1, r2Bot, TR('independence · error vs order'),
      D.ordered ? (lagOk ? TR('PASS') : TR('FAIL')) : TR('N/A'),
      D.ordered ? (lagOk ? CYAN : RED) : [116, 134, 159],
      D.ordered
        /* Not routed through TR: 'lag-1' and 'DW' are technical abbreviations
           kept in Latin in Russian too, so an entry could only equal its key. */
        ? 'lag-1 ' + sgn(lag1, 3) + '   ·   DW ' + dec(mv('dw'), 2)
        : TR('cannot be tested on this data'),
      (x0, y0, x1, y1) => {
        if (!D.ordered) {
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(143,162,196,.9)';
          /* The translation owns its own line breaks: Russian does not wrap
             at the same three points, so hard-coding four fillText calls at
             fixed offsets would have run the text past the panel. The block is
             centred for whatever number of lines comes back.
             Lines are separated by '|', not '\n': an escape sequence in a key
             reads as a real newline at runtime but as a literal backslash-n in
             the source, so the key the checker extracts would never match the
             key the table holds. */
          const grey = TR('these rows have no real order,'
                        + '|so consecutive errors cannot be'
                        + '|related. Scoring this would be').split('|');
          const gold = TR('measuring a file, not the world.');
          const top = cy - (grey.length * 15) / 2;
          grey.forEach((ln, i) => ctx.fillText(ln, cx, top + i * 15));
          ctx.fillStyle = 'rgba(255,196,116,.95)';
          ctx.fillText(gold, cx, top + grey.length * 15);
          return;
        }
        const ra = gA.resid, rb = gB.resid;
        const n = Math.min(ra.length, rb.length);
        let amp = 0;
        for (let i = 0; i < n; i++) amp = Math.max(amp, Math.abs(ra[i] / (gA.residSd || 1)),
                                                        Math.abs(rb[i] / (gB.residSd || 1)));
        amp = (amp || 1) * 1.1;
        const yy = v => (y0 + y1) / 2 - (v / amp) * ((y1 - y0) / 2 - 3);
        ctx.strokeStyle = 'rgba(255,196,116,.4)'; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x0, yy(0) + .5); ctx.lineTo(x1, yy(0) + .5); ctx.stroke();
        ctx.setLineDash([]);
        const col = lagOk ? CYAN : RED;
        // a travelling read-head, so the sequence reads as a sequence
        const head = settled ? ((now * 0.16) % 1.35) : 1;
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},.55)`; ctx.lineWidth = 1.4;
        ctx.lineJoin = 'round'; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const v = lerp(ra[i] / (gA.residSd || 1), rb[i] / (gB.residSd || 1), p);
          const px = x0 + i / (n - 1) * (x1 - x0);
          i ? ctx.lineTo(px, yy(v)) : ctx.moveTo(px, yy(v));
        }
        ctx.stroke();
        if (head < 1) {
          const hx = x0 + head * (x1 - x0);
          const gr = ctx.createLinearGradient(hx - 46, 0, hx, 0);
          gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`);
          gr.addColorStop(1, `rgba(255,255,255,.85)`);
          ctx.strokeStyle = gr; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const px = x0 + i / (n - 1) * (x1 - x0);
            if (px < hx - 46 || px > hx) continue;
            const v = lerp(ra[i] / (gA.residSd || 1), rb[i] / (gB.residSd || 1), p);
            ctx.lineTo(px, yy(v));
          }
          ctx.stroke();
        }
        ctx.font = `600 9px ${MONO}`; ctx.fillStyle = 'rgba(143,162,196,.7)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(V.lag1 < -T_LAG ? TR('zig-zag = alternating, not independent')
                   : V.lag1 > T_LAG ? TR('runs = drifting, not independent')
                   : TR('no pattern = independent'), x0, y1 + 15);
      });

    /* ================= normality ================= */
    panel(p2x0, r2Top, p2x1, r2Bot, TR('normality · errors vs a bell curve'),
      normOk ? TR('PASS') : TR('FAIL'), normOk ? CYAN : RED,
      TR('skew {0}   ·   kurtosis {1}', sgn(skew, 2), sgn(kurt, 2)),
      (x0, y0, x1, y1) => {
        const qa = A.qq, qb = T.qq;
        const n = Math.min(qa.length, qb.length);
        let lim = 0;
        for (let i = 0; i < n; i++) lim = Math.max(lim, Math.abs(qa[i]), Math.abs(qb[i]));
        const q0 = S.normPpf(0.5 / n), q1 = S.normPpf(1 - 0.5 / n);
        lim = Math.max(lim, Math.abs(q0), Math.abs(q1), 1) * 1.05;
        const sx = v => (x0 + x1) / 2 + (v / lim) * ((x1 - x0) / 2 - 3);
        const sy = v => (y0 + y1) / 2 - (v / lim) * ((y1 - y0) / 2 - 3);
        ctx.strokeStyle = 'rgba(255,196,116,.5)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sx(-lim), sy(-lim)); ctx.lineTo(sx(lim), sy(lim)); ctx.stroke();
        ctx.setLineDash([]);
        const col = normOk ? CYAN : RED;
        const step = Math.max(1, Math.floor(n / 300));
        for (let i = 0; i < n; i += step) {
          const q = S.normPpf((i + 0.5) / n);
          const v = lerp(qa[i], qb[i], M.stagger(i, n, MORPH_SPREAD * 0.6, p));
          const br = M.breathe(now, i * 0.09, 1.15);
          dot(sx(q), sy(v), 2.4 * br.r, col, 0.94 * br.a, 0, 1.0);
        }
        ctx.font = `600 9px ${MONO}`; ctx.fillStyle = 'rgba(143,162,196,.7)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(TR('on the dashed line = bell-shaped'), x0, y1 + 15);
      });

    scorecard(bendOk, fanOk, lagOk, normOk, {
      bend, fan, lag1, skew, kurt, r2, slope, dw: mv('dw'),
      maxCook: lerp(A.maxCookFull, T.maxCookFull, p),
      shift: lerp(A.shift, T.shift, p),
      n: T.X.length,
    });
  }

  /* ---------- the text scorecard ---------- */
  const $ = id => document.getElementById(id);
  function badge(el, vEl, bEl, state, value, label) {
    $(el).className = 'sc ' + state;
    $(vEl).textContent = value;
    $(bEl).textContent = label;
  }
  function scorecard(bendOk, fanOk, lagOk, normOk, m) {
    badge('sc-shape', 'v-bend', 'b-bend', bendOk ? 'pass' : 'fail',
          dec(m.bend, 2), bendOk ? TR('pass') : TR('fail'));
    badge('sc-spread', 'v-fan', 'b-fan', fanOk ? 'pass' : 'fail',
          (isFinite(m.fan) ? dec(m.fan, 2) : '∞') + '×', fanOk ? TR('pass') : TR('fail'));
    if (D.ordered) {
      badge('sc-indep', 'v-lag', 'b-lag', lagOk ? 'pass' : 'fail',
            sgn(m.lag1, 3), lagOk ? TR('pass') : TR('fail'));
      $('t-lag').textContent = TR('lag-1, want |r| < {0}', dec(T_LAG, 2));
    } else {
      badge('sc-indep', 'v-lag', 'b-lag', 'na', '—', TR('not testable'));
      $('t-lag').textContent = TR('no meaningful row order');
    }
    badge('sc-norm', 'v-norm', 'b-norm', normOk ? 'pass' : 'fail',
          `${sgn(m.skew, 1)} / ${sgn(m.kurt, 1)}`,
          normOk ? TR('pass') : TR('fail'));

    $('r-r2').textContent = dec(m.r2, 3);
    $('r-slope').textContent = dec(m.slope, Math.abs(m.slope) > 100 ? 0 : 3);
    const t = TF[tf];
    $('r-slope-sub').textContent = TR('{0} per {1}',
      t.yl + TR(D.yunit), t.xl + TR(D.xunit));
    const runnable = D.ordered ? 4 : 3;
    const passed = (bendOk ? 1 : 0) + (fanOk ? 1 : 0) + (normOk ? 1 : 0)
                 + (D.ordered && lagOk ? 1 : 0);
    $('r-pass').textContent = TR('{0} of {1}', grp(passed), grp(runnable));
    $('r-pass').className = 'v ' + (passed === runnable ? 'on' : (passed <= 1 ? 'bad' : 'gold'));
    $('r-dw').textContent = D.ordered ? dec(m.dw, 2) : '—';
    $('r-cook').textContent = dec(m.maxCook, 3);
    $('r-cook').className = 'v ' + (m.maxCook > 0.2 ? 'bad' : 'on');
    $('r-shift').textContent = dec(m.shift * 100, 1) + '%';
    $('r-shift').className = 'v ' + (m.shift > 0.03 ? 'bad' : 'on');
    $('r-n').textContent = grp(m.n);
    $('r-ord').textContent = D.ordered ? TR('yes') : TR('no');
    $('r-ord').className = 'v ' + (D.ordered ? 'on' : 'gold');
  }

  /* ---------- loop ---------- */
  function frame(dt, t) {
    now = t;
    if (morph) {
      morph.step(dt);
      if (morph.done) { A = B; B = null; morph = null; }
    }
    paint();
  }

  /* ---------- wiring ---------- */
  const press = (sel, val, attr) =>
    document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));

  document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const d = PAIRS.find(x => x.id === b.dataset.set); if (!d) return;
    press('[data-set]', d.id, 'set'); load(d); layout(); paint();
    $('live').textContent = TR(D.label) + '. ' + (D.ordered
      ? TR('Order is meaningful, so all four checks run.')
      : TR('No row order, so independence cannot be tested.'));
  }));
  document.querySelectorAll('[data-tf]').forEach(b => b.addEventListener('click', () => {
    tf = b.dataset.tf; press('[data-tf]', tf, 'tf');
    retarget(tf, dropWorst);
    if (reduce) paint();
    const g = (B || A).g;
    $('live').textContent = TR('Transform {0}. R² {1}, fan {2}, kurtosis {3}.',
      tf, dec(g.r2, 3), isFinite(g.fan) ? dec(g.fan, 2) : TR('infinite'),
      dec(g.kurt, 2));
  }));
  $('drop').addEventListener('click', e => {
    dropWorst = !dropWorst;
    e.target.setAttribute('aria-pressed', String(dropWorst));
    e.target.textContent = dropWorst ? TR('put it back') : TR('drop the worst point');
    retarget(tf, dropWorst);
    if (reduce) paint();
    const st = B || A;
    $('live').textContent = dropWorst
      ? TR('Most influential point removed. Slope moved {0} percent.',
           dec(st.shift * 100, 1))
      : TR('Point restored.');
  });
  addEventListener('resize', () => { layout(); paint(); });

  load(PAIRS[0]);
  layout();
  paint();

  if (!reduce) {
    ticker = new M.Ticker(frame);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { ticker.visible = es[0].isIntersecting; },
                               { threshold: 0.01 }).observe(canvas);
    }
    ticker.start();
  }
})();
