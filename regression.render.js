/* ============================================================
   Regression and R-squared, on real data.
   ------------------------------------------------------------
   Fourth in the set, and the first that is genuinely hands-on:
   the line is DRAGGABLE, because "least squares" is a claim about
   an optimum and the fastest way to believe an optimum is to fail
   to beat it.

   Three things the page is built to show, in order:

     WHAT A FIT IS      drag the line, watch the threads to each
                        point lengthen and shorten, watch one
                        number add them up. Then solve it exactly
                        and find you could not have done better.

     WHAT R-SQUARED IS  the bar across the middle. Blue is what the
                        line removed from the total variation, red
                        is what is left. Drag badly and it goes
                        NEGATIVE, which is the honest meaning of
                        R-squared: better, or worse, than just
                        using the average.

     WHAT IT MISSES     the bottom panel. Both high-R-squared
                        datasets here are the untrustworthy ones --
                        the diamonds bend and fan 15-fold, the
                        geyser is two clusters wearing a trend --
                        and the lowest-R-squared one is the only
                        well-behaved fit. Measured in
                        data/build_pairs.py, not asserted.

   Restrictions, so nobody later mistakes one for a bug:

     TWO PANELS, TWO Y  the scatter's y is money (or minutes); the
                        residual panel's y is an error in those same
                        units but centred on zero. They share the x
                        axis and deliberately do NOT share y.

     SQUARES ARE VISUAL a residual "square" is drawn with its side
                        equal to the residual in PIXELS, so it looks
                        square on screen. It is not a square in data
                        space -- the axes have different units and
                        no common scale exists. Standard for this
                        illustration, but worth stating.

     SQUARES ARE CAPPED at SQ_CAP points, because 800 overlapping
                        squares is a grey wash. The error total
                        always uses every point.

     BEST IS SOLVED     the best fit is the closed-form least
                        squares solution, never a search, and
                        pairs.js carries the same numbers computed
                        in Python for cross-checking.
   ============================================================ */
(() => {
  const canvas = document.getElementById('rg');
  const PAIRS = window.UDJ_PAIRS, M = window.UDJ_MOTION;
  if (!canvas || !PAIRS || !M) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- motion state ----
     The first version of this page had no animation loop: it painted once per
     event and sat there, which is why it read as flat. Now a Ticker runs
     continuously, `best fit` and `reset` GLIDE the line instead of snapping
     it (watching the line swing into the optimum is most of the lesson), and
     the R-squared bar chases its target rather than jumping.

     Dragging cancels any glide in progress -- a control the user is holding
     must never fight an animation. */
  let slTw = null, icTw = null;      // line glide, null when not gliding
  let r2Disp = 0;                    // smoothed bar fill
  let now = 0, ticker = null;
  let pphase = null;                 // per-point twinkle phase

  function glideTo(s, i, dur) {
    if (reduce) { slope = s; intercept = i; syncSliders(); return; }
    slTw = new M.Tween(slope, s, dur, M.ease.cubicOut);
    icTw = new M.Tween(intercept, i, dur, M.ease.cubicOut);
  }
  function cancelGlide() { slTw = null; icTw = null; }

  const COOL = [186, 214, 255];
  const CYAN = [138, 224, 244];
  const GOLD = [255, 196, 116];
  const RED  = [255, 107,  98];
  const DEEP = [ 84, 132, 196];
  const PALE = [196, 228, 255];
  const TAU = 6.283185307;
  const SQ_CAP = 70;

  let seed = 1907;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

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
  let D = PAIRS[0];
  let X = null, Y = null, N = 0;
  let X0 = 0, X1 = 1, Y0 = 0, Y1 = 1;          // axis ranges
  let slope = 0, intercept = 0;                 // the user's line
  let bSlope = 0, bIntercept = 0, SST = 1, bSSE = 1, MY = 0;
  let showSq = false, drag = null, hoverH = -1;
  let pmag = null;
  let W = 0, Hh = 0, dpr = 1, phone = false;
  let mx = 58, pTop = 0, pBot = 0, barY = 0, rTop = 0, rBot = 0;
  let hx0 = 0, hx1 = 0;                         // handle x positions, in data units

  const sx = v => mx + (v - X0) / (X1 - X0) * (W - 2 * mx);
  const sy = v => pBot - (v - Y0) / (Y1 - Y0) * (pBot - pTop);
  const invY = py => Y0 + (pBot - py) / (pBot - pTop) * (Y1 - Y0);

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
  /* Namespaced keys need an explicit English fallback, because the key is no
     longer the English text. A bare 'm'/'k' key would collide with page text
     elsewhere in the table ('m' already means minutes on another page). */
  function unit(k, fallback) {
    const m = window.UDJ_STRINGS;
    return (m && m[k]) || fallback;
  }
  const UDJ_LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale) || 'en-GB';
  const grp = v => Number(v).toLocaleString(UDJ_LOC);
  /* toFixed always emits a decimal POINT whatever the locale — and this page is
     R², slopes and percentages throughout. */
  const dec = (v, dp) => (Math.abs(Number(v)) < Math.pow(10, -dp) / 2 ? 0 : Number(v)).toLocaleString(UDJ_LOC, {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  });

  function fmt(v, u, dp) {
    const s = dec(v, dp);
    /* The unit comes from the data file, so it goes through TR. The regex is a
       TEST of the unit, not a display of it, so it uses the raw value. */
    return /^[£$€]$/.test(u) ? TR(u) + s : s + ' ' + TR(u);
  }
  let XDP = 2, YDP = 0;
  const fx = v => fmt(v, D.xunit, XDP);
  const fy = v => fmt(v, D.yunit, YDP);
  /* Sums of squares run to 1e11 on the diamonds, which no reader parses. Shown
     in scientific-ish shorthand instead of 12 digits of false precision. */
  function big(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return dec(v / 1e9, 2) + unit('__mag_bn', 'bn');
    if (a >= 1e6) return dec(v / 1e6, 2) + unit('__mag_m', 'm');
    if (a >= 1e3) return dec(v / 1e3, 1) + unit('__mag_k', 'k');
    return dec(v, 1);
  }

  function sse(sl, ic) {
    let s = 0;
    for (let i = 0; i < N; i++) { const d = Y[i] - (ic + sl * X[i]); s += d * d; }
    return s;
  }

  function load(d) {
    D = d;
    X = Float64Array.from(D.x); Y = Float64Array.from(D.y); N = X.length;
    X0 = D.xaxis[0]; X1 = D.xaxis[1]; Y0 = D.yaxis[0]; Y1 = D.yaxis[1];
    XDP = (X1 - X0) > 60 ? 0 : 2;
    YDP = (Y1 - Y0) > 200 ? 0 : 1;
    bSlope = D.slope; bIntercept = D.intercept; SST = D.sst; bSSE = D.sse; MY = D.mean_y;
    // handles sit a little inside the axis so they never fall off the edge
    hx0 = X0 + (X1 - X0) * 0.10;
    hx1 = X0 + (X1 - X0) * 0.90;
    seed = 1907;
    pmag = new Float32Array(N);
    pphase = new Float32Array(N);
    for (let i = 0; i < N; i++) { pmag[i] = Math.pow(rnd(), 2.0); pphase[i] = rnd() * TAU; }
    resetLine();
    r2Disp = 0;
    provenance();
    document.getElementById('tagtop').innerHTML =
      TR('{0} — <em>{1} ({2}) against {3} ({4}) · {5} real records</em>',
         TR(D.label), TR(D.xlab), TR(D.xunit), TR(D.ylab), TR(D.yunit), grp(N));
    document.getElementById('hint').textContent = TR(D.note);
  }

  /* A deliberately WRONG starting line: flat, through the mean. That is the
     "no model" position, so the first drag is visibly an improvement and the
     R-squared bar starts at zero rather than near the answer. */
  function resetLine() {
    slope = 0; intercept = MY;
    syncSliders();
  }

  /* ---- sliders. Ranges are derived from the data so every dataset gets a
         usable travel: centred on the best fit, two full "natural slopes"
         either side, where a natural slope is the y span over the x span. ---- */
  function slopeRange() {
    const nat = (Y1 - Y0) / (X1 - X0);
    const half = Math.max(Math.abs(bSlope), nat) * 2;
    return [bSlope - half, bSlope + half];
  }
  function syncSliders() {
    const [lo, hi] = slopeRange();
    document.getElementById('s-slope').value = String(Math.round(clamp01((slope - lo) / (hi - lo)) * 1000));
    const yAtLeft = intercept + slope * X0;
    document.getElementById('s-int').value = String(Math.round(clamp01((yAtLeft - Y0) / (Y1 - Y0)) * 1000));
  }
  function fromSliders() {
    const [lo, hi] = slopeRange();
    slope = lo + (+document.getElementById('s-slope').value / 1000) * (hi - lo);
    const yAtLeft = Y0 + (+document.getElementById('s-int').value / 1000) * (Y1 - Y0);
    intercept = yAtLeft - slope * X0;
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width; Hh = rect.height; phone = W < 560;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mx = phone ? 42 : 58;
    pTop = 34;
    pBot = Math.round(Hh * 0.58);
    barY = Math.round(Hh * 0.635);
    rTop = Math.round(Hh * 0.71);
    rBot = Hh - 26;
  }

  /* ============ paint ============ */
  const MONO = (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace').trim();
  function tickStep(span) {
    const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p;
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


  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function paint() {
    ctx.clearRect(0, 0, W, Hh);
    const mySSE = sse(slope, intercept);
    const myR2 = 1 - mySSE / SST;

    /* ---- x axis, shared by both panels ---- */
    const xs = tickStep(X1 - X0) * (phone ? 2 : 1);
    ctx.font = `600 9px ${MONO}`; ctx.textAlign = 'center';
    for (let v = Math.ceil(X0 / xs) * xs; v <= X1; v += xs) {
      const x = sx(v);
      ctx.strokeStyle = 'rgba(150,178,225,.09)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + .5, pTop); ctx.lineTo(x + .5, pBot); ctx.stroke();
      ctx.fillStyle = 'rgba(116,134,159,.9)'; ctx.textBaseline = 'top';
      ctx.fillText(fx(v), x, rBot + 6);
    }
    /* ---- y axis of the scatter ---- */
    const ys = tickStep(Y1 - Y0);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(Y0 / ys) * ys; v <= Y1; v += ys) {
      const y = sy(v);
      ctx.strokeStyle = 'rgba(150,178,225,.09)';
      ctx.beginPath(); ctx.moveTo(mx, y + .5); ctx.lineTo(W - mx, y + .5); ctx.stroke();
      ctx.fillStyle = 'rgba(116,134,159,.9)';
      ctx.fillText(fy(v), mx - 5, y);
    }
    // axis titles
    ctx.save();
    ctx.fillStyle = 'rgba(116,134,159,.85)'; ctx.font = `600 9px ${MONO}`;
    ctx.translate(12, (pTop + pBot) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(TR(D.ylab).toUpperCase(), 0, 0);
    ctx.restore();
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(116,134,159,.85)';
    ctx.fillText(TR(D.xlab).toUpperCase(), W - mx, rBot + 20);

    /* ---- the no-model baseline: guessing the average every time ---- */
    const ymy = sy(MY);
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255,196,116,.42)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, ymy + .5); ctx.lineTo(W - mx, ymy + .5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,196,116,.7)'; ctx.font = `600 9px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(TR('no line at all: always guess the average'), mx + 4, ymy - 3);

    /* ---- error threads, then the points on top of them ---- */
    const yl = v => sy(intercept + slope * v);
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const px = sx(X[i]), py = sy(Y[i]), ly = yl(X[i]);
      const over = Y[i] > intercept + slope * X[i];
      ctx.strokeStyle = over ? 'rgba(138,224,244,.22)' : 'rgba(255,107,98,.22)';
      ctx.beginPath(); ctx.moveTo(px + .5, py); ctx.lineTo(px + .5, ly); ctx.stroke();
    }
    // squares: side = the residual in PIXELS, so it reads square on screen.
    // Not a square in data space; no common scale between the axes exists.
    if (showSq) {
      const step = Math.max(1, Math.floor(N / SQ_CAP));
      for (let i = 0; i < N; i += step) {
        const px = sx(X[i]), py = sy(Y[i]), ly = yl(X[i]);
        const s = ly - py;                    // signed pixel residual
        const over = s > 0;
        ctx.strokeStyle = over ? 'rgba(138,224,244,.5)' : 'rgba(255,107,98,.5)';
        ctx.fillStyle = over ? 'rgba(138,224,244,.09)' : 'rgba(255,107,98,.09)';
        const side = Math.abs(s);
        const ry = over ? py : py - side;
        ctx.beginPath(); ctx.rect(px + .5, ry + .5, side, side); ctx.fill(); ctx.stroke();
      }
    }
    /* The points. Bloom is the whole difference between this reading as a
       particle field and reading as a scatter plot in a dark stylesheet: the
       first version passed glow 0 for everything below the 80th percentile of
       brightness, so almost nothing glowed. Every point gets some now, and a
       slow twinkle on a seeded phase keeps the field alive between edits. */
    for (let i = 0; i < N; i++) {
      const t = pmag[i];
      const br = M.breathe(now, pphase ? pphase[i] : 0, 0.8 + t * 1.1, 0.5);
      dot(sx(X[i]), sy(Y[i]), (2.5 + t * 1.1) * br.r,
          [DEEP[0] + (PALE[0] - DEEP[0]) * t, DEEP[1] + (PALE[1] - DEEP[1]) * t,
           DEEP[2] + (PALE[2] - DEEP[2]) * t],
          (0.93 + t * 0.07) * br.a, 0, 1.1);
    }

    /* ---- the best fit, faint, always available as a reference ---- */
    ctx.strokeStyle = 'rgba(138,224,244,.35)'; ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(X0), sy(bIntercept + bSlope * X0));
    ctx.lineTo(sx(X1), sy(bIntercept + bSlope * X1));
    ctx.stroke();
    ctx.setLineDash([]);

    /* ---- the user's line, with its two handles ---- */
    const ly0 = sy(intercept + slope * X0), ly1 = sy(intercept + slope * X1);
    // a wide soft pass under the crisp one, so the line sits in the field
    // rather than on top of it
    ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},.22)`;
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx(X0), ly0); ctx.lineTo(sx(X1), ly1); ctx.stroke();
    ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},.95)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx(X0), ly0); ctx.lineTo(sx(X1), ly1); ctx.stroke();
    // a highlight sliding along it: the cheapest possible signal that the line
    // is the live object on the page
    const shp = (now * 0.2) % 1.7;
    if (shp < 1) {
      const a0 = Math.max(0, shp - 0.1), a1 = Math.min(1, shp + 0.1);
      const gx = t2 => sx(X0) + (sx(X1) - sx(X0)) * t2;
      const gy = t2 => ly0 + (ly1 - ly0) * t2;
      const gr = ctx.createLinearGradient(gx(a0), gy(a0), gx(a1), gy(a1));
      gr.addColorStop(0, 'rgba(255,244,220,0)');
      gr.addColorStop(0.5, 'rgba(255,250,236,.92)');
      gr.addColorStop(1, 'rgba(255,244,220,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(gx(a0), gy(a0)); ctx.lineTo(gx(a1), gy(a1)); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    for (let h = 0; h < 2; h++) {
      const hx = h ? hx1 : hx0;
      const px = sx(hx), py = sy(intercept + slope * hx);
      const active = drag === h || hoverH === h;
      // an idle handle breathes, so it reads as grabbable before it is grabbed
      const breathe = active ? 1 : 1 + 0.09 * Math.sin(now * 1.9 + h * 1.4);
      dot(px, py, (active ? 7.5 : 6) * breathe, GOLD, 1, active ? 1.7 : 1.15);
      ctx.strokeStyle = 'rgba(5,7,13,.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, (active ? 7.5 : 6) * breathe, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,196,116,.9)'; ctx.font = `700 9px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    /* +26, not +8. The reset position puts the fitted line exactly ON the mean
       line, so at 9px text an 11px offset had this label overlapping the "no
       line at all" caption above it — in both languages, and in the very first
       state a reader sees. */
    ctx.fillText(TR('drag either handle'), sx(hx0) + 10, sy(intercept + slope * hx0) + 26);

    /* ---- the R-squared bar: what the line removed, what is left.
           The fill CHASES the true value rather than tracking it exactly, so a
           drag reads as the bar being pushed. r2Disp is display only; every
           number in the readout is the real one. ---- */
    const bw = W - 2 * mx, bh = 15;
    const expl = clamp01(r2Disp);
    ctx.fillStyle = 'rgba(255,107,98,.26)';
    roundRect(mx, barY, bw, bh, 2.5); ctx.fill();
    const gr2 = ctx.createLinearGradient(mx, 0, mx + bw * Math.max(expl, .001), 0);
    gr2.addColorStop(0, `rgba(${CYAN[0]},${CYAN[1]},${CYAN[2]},.35)`);
    gr2.addColorStop(1, `rgba(${CYAN[0]},${CYAN[1]},${CYAN[2]},.75)`);
    ctx.save();
    roundRect(mx, barY, bw, bh, 2.5); ctx.clip();
    ctx.fillStyle = gr2; ctx.fillRect(mx, barY, bw * expl, bh);
    ctx.restore();
    // a lit edge at the fill front
    if (expl > 0.004) {
      const fx = mx + bw * expl;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bloom(CYAN), fx - 12, barY - 8, 24, bh + 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${CYAN[0]},${CYAN[1]},${CYAN[2]},.95)`;
      ctx.fillRect(fx - 1, barY, 2, bh);
    }
    ctx.strokeStyle = 'rgba(150,178,225,.28)'; ctx.lineWidth = 1;
    roundRect(mx + .5, barY + .5, bw - 1, bh - 1, 2.5); ctx.stroke();
    // where the best fit would reach, so the gap to the optimum is visible
    const bx = mx + bw * clamp01(1 - bSSE / SST);
    ctx.strokeStyle = 'rgba(138,224,244,.95)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx + .5, barY - 3); ctx.lineTo(bx + .5, barY + bh + 3); ctx.stroke();
    ctx.font = `700 9px ${MONO}`; ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(230,240,255,.9)';
    ctx.fillText(myR2 < 0
      ? TR('R² = {0} — worse than no line at all', dec(myR2, 2))
      : TR('explained {0}%', dec(expl * 100, 0)), mx + 6, barY + bh / 2);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,107,98,.9)';
    if (myR2 >= 0) ctx.fillText(TR('left over {0}%', dec((1 - expl) * 100, 0)), W - mx - 6, barY + bh / 2);

    /* ---- the residual panel: the thing R-squared cannot see ---- */
    let amax = 1e-9;
    for (let i = 0; i < N; i++) amax = Math.max(amax, Math.abs(Y[i] - (intercept + slope * X[i])));
    const rMid = (rTop + rBot) / 2, rHalf = (rBot - rTop) / 2 - 2;
    const ry = r => rMid - (r / amax) * rHalf;
    ctx.strokeStyle = 'rgba(255,196,116,.5)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(mx, rMid + .5); ctx.lineTo(W - mx, rMid + .5); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < N; i++) {
      const r = Y[i] - (intercept + slope * X[i]);
      const br = M.breathe(now, pphase ? pphase[i] : 0, 1.05 + pmag[i] * 0.9, 0.5);
      dot(sx(X[i]), ry(r), 2.3 * br.r, r >= 0 ? CYAN : RED, 0.94 * br.a, 0, 1.0);
    }
    ctx.globalCompositeOperation = 'source-over';
    // a binned mean line: a bend is far easier to see as a path than as a cloud
    const NB = 14, bs = new Float64Array(NB), bc = new Int32Array(NB);
    for (let i = 0; i < N; i++) {
      let b = Math.floor((X[i] - X0) / (X1 - X0) * NB);
      if (b < 0) b = 0; else if (b >= NB) b = NB - 1;
      bs[b] += Y[i] - (intercept + slope * X[i]); bc[b]++;
    }
    ctx.strokeStyle = 'rgba(255,196,116,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let b = 0; b < NB; b++) {
      if (!bc[b]) continue;
      const x = mx + (b + 0.5) / NB * (W - 2 * mx), y = ry(bs[b] / bc[b]);
      started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), started = true);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,196,116,.8)'; ctx.font = `600 9px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(TR('average error in each slice — a flat line here means the shape is right'), mx + 4, rTop + 2);
    ctx.strokeStyle = 'rgba(150,178,225,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, rBot + .5); ctx.lineTo(W - mx, rBot + .5); ctx.stroke();

    readouts(mySSE, myR2);
  }

  /* ============ readouts ============ */
  const $ = id => document.getElementById(id);
  function readouts(mySSE, myR2) {
    $('v-mine').textContent = big(mySSE);
    $('v-best').textContent = big(bSSE);
    const worse = bSSE > 0 ? (mySSE - bSSE) / bSSE : 0;
    const atBest = worse < 1e-9;
    $('v-gap').textContent = atBest
      ? TR('nothing — this IS the best') : '+' + dec(worse * 100, 0) + '%';
    $('v-gap-c').className = 'vc gap ' + (atBest ? 'win' : (worse > 0.15 ? 'bad' : ''));

    $('r-r2').textContent = dec(myR2, 3);
    $('r-r2').className = 'v ' + (myR2 < 0 ? 'bad' : 'gold');
    $('r-r2b').textContent = dec(D.r2, 3);
    $('r-slope').textContent = dec(slope, Math.abs(slope) > 100 ? 0 : 2);
    $('r-slopeb').textContent = dec(bSlope, Math.abs(bSlope) > 100 ? 0 : 2);
    $('r-slope-sub').textContent = TR('{0} per {1}', TR(D.yunit), TR(D.xunit));
    /* Not routed through TR: the frame is "+1 <unit> → <value>", pure notation
       whose two substituted parts are already localised, so an entry could only
       ever equal its key — which the "nothing left in English" check rejects. */
    $('r-words').textContent =
      '+1 ' + TR(D.xunit) + ' → ' + (bSlope >= 0 ? '+' : '') + fy(bSlope);
    $('r-r').textContent = (D.r >= 0 ? '+' : '') + dec(D.r, 3);
    const fanR = D.diag && D.diag.sd_ratio ? D.diag.sd_ratio : 1;
    $('r-fan').textContent = dec(fanR, 1) + '×';
    $('r-fan').className = 'v ' + (fanR > 3 ? 'bad' : 'on');
    $('r-n').textContent = grp(N);
  }

  /* provenance content is generated by data/build_pairs.py from literals in
     that script plus measured counts; no third-party text reaches this markup */
  function provenance() {
    $('prov').innerHTML =
      `<div class="cap">${TR('Data source')}</div>
       <p><a href="${D.url}" target="_blank" rel="noopener">${TR(D.source)}</a> — ${TR(D.what)}</p>
       <ul>${D.filters.map(f => `<li>${TR(f)}</li>`).join('')}</ul>
       <p style="font-size:var(--micro);color:var(--muted-2);font-family:var(--font-mono)">
         ${TR('On screen: {0} points, R² {1}, slope {2}. Whole source: {3} '
            + 'records, R² {4}, slope {5}.',
            grp(N), dec(D.r2, 3),
            dec(D.slope, Math.abs(D.slope) > 100 ? 0 : 3),
            grp(D.n_source), dec(D.full_r2, 3),
            dec(D.full_slope, Math.abs(D.full_slope) > 100 ? 0 : 3))}</p>`;
  }

  /* ============ interaction ============ */
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function hitHandle(p) {
    for (let h = 0; h < 2; h++) {
      const hx = h ? hx1 : hx0;
      const dx = p.x - sx(hx), dy = p.y - sy(intercept + slope * hx);
      if (dx * dx + dy * dy < 400) return h;      // 20px grab radius
    }
    return -1;
  }
  function down(e) {
    const p = pos(e); const h = hitHandle(p);
    if (h < 0) return;
    drag = h; canvas.classList.add('drag');
    cancelGlide();                 // never fight a control the user is holding
    e.preventDefault();
  }
  function move(e) {
    const p = pos(e);
    if (drag === null) {
      const h = hitHandle(p);
      if (h !== hoverH) { hoverH = h; paint(); }
      return;
    }
    /* Dragging one handle pivots the line about the OTHER one, which is what
       makes two handles feel like a ruler rather than two disconnected
       controls. */
    const yNew = invY(p.y);
    const other = drag ? hx0 : hx1;
    const yOther = intercept + slope * other;
    const hx = drag ? hx1 : hx0;
    if (Math.abs(hx - other) > 1e-12) {
      slope = (yNew - yOther) / (hx - other);
      intercept = yOther - slope * other;
      syncSliders(); paint();
    }
    e.preventDefault();
  }
  function up() { if (drag !== null) { drag = null; canvas.classList.remove('drag'); paint(); } }

  canvas.addEventListener('mousedown', down);
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', up);

  for (const id of ['s-slope', 's-int']) {
    $(id).addEventListener('input', () => { cancelGlide(); fromSliders(); paint(); });
  }

  const press = (sel, val, attr) =>
    document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));

  document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const d = PAIRS.find(x => x.id === b.dataset.set); if (!d) return;
    press('[data-set]', d.id, 'set'); cancelGlide(); load(d); layout(); paint();
    $('live').textContent = TR('{0}. Best R² {1}, best slope {2}.', TR(D.label), dec(D.r2, 3), dec(D.slope, 2));
  }));
  $('best').addEventListener('click', () => {
    // glide rather than snap: watching the line swing into the optimum is the
    // lesson, and a jump cut skips it
    glideTo(bSlope, bIntercept, 0.85);
    $('live').textContent = TR('Best fit applied. R² {0}. No line can do better.', dec(D.r2, 3));
  });
  $('sq').addEventListener('click', e => {
    showSq = !showSq; e.target.setAttribute('aria-pressed', String(showSq)); paint();
  });
  $('reset').addEventListener('click', () => {
    cancelGlide();
    glideTo(0, MY, 0.7);
    $('live').textContent = TR('Line reset to flat through the average — the no-model position.');
  });
  addEventListener('resize', () => { layout(); paint(); });

  /* ---------- the loop ----------
     Runs continuously so the shimmer, the twinkle and the breathing handles
     keep the page alive between interactions, and so a glide has frames to
     happen in. Gated off-screen; never started under reduced motion. */
  function frame(dt, t) {
    now = t;
    if (slTw && icTw) {
      slope = slTw.step(dt); intercept = icTw.step(dt);
      syncSliders();
      if (slTw.done && icTw.done) cancelGlide();
    }
    const target = 1 - sse(slope, intercept) / SST;
    r2Disp += (target - r2Disp) * Math.min(1, dt * 7);
    paint();
  }

  load(PAIRS[0]);
  layout();
  if (reduce) {
    slope = bSlope; intercept = bIntercept; syncSliders();
    r2Disp = 1 - sse(slope, intercept) / SST;
  }
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
