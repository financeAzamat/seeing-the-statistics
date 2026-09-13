/* ============================================================
   Statistics the pages need and the browser does not provide.
   ------------------------------------------------------------
   A p-value needs the Student t distribution function, which is
   the regularized incomplete beta function, which needs log-gamma.
   None of the three exists in JavaScript, so all three are here.

   This file is deliberately DOM-free and exports through both
   `window` and `module.exports`, so verify_test.py can run these
   exact functions under node and compare them against scipy.
   Verifying a reimplementation instead of the shipped code would
   prove nothing.

   Accuracy target: agreement with scipy to 1e-10 on p-values over
   the whole (t, df) range the pages use. Checked, not assumed --
   see verify_test.py.
   ============================================================ */
(function (root) {
  'use strict';

  /* ---- log-gamma, Lanczos approximation (g = 7, n = 9).
         Good to ~15 significant figures for x > 0, which is all we
         feed it (degrees of freedom and halves of them). ---- */
  var LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  function lgamma(x) {
    if (x < 0.5) {
      // reflection, so the approximation is only ever used above 0.5
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    }
    x -= 1;
    var a = LANCZOS[0], t = x + 7.5;
    for (var i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /* ---- continued fraction for the incomplete beta (Lentz's method).
         Converges in well under 300 iterations for our arguments; the
         loop bound is a safety rail, not the expected cost. ---- */
  function betacf(a, b, x) {
    var TINY = 1e-30;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    var h = d, m, m2, aa, del;
    for (m = 1; m <= 300; m++) {
      m2 = 2 * m;
      aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c;  if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c;  if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-16) break;
    }
    return h;
  }

  /* ---- regularized incomplete beta I_x(a,b).
         The swap below the crossover keeps the continued fraction in
         its fast-converging region; without it the tail is slow and
         loses digits. ---- */
  function betainc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var lb = lgamma(a + b) - lgamma(a) - lgamma(b)
           + a * Math.log(x) + b * Math.log1p(-x);
    if (x < (a + 1) / (a + b + 2)) return Math.exp(lb) * betacf(a, b, x) / a;
    return 1 - Math.exp(lb) * betacf(b, a, 1 - x) / b;
  }

  /* ---- P(T <= t) for Student t with df degrees of freedom ---- */
  function tCdf(t, df) {
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    var x = df / (df + t * t);
    var half = 0.5 * betainc(df / 2, 0.5, x);
    return t > 0 ? 1 - half : half;
  }

  /* ---- two-sided p-value for a t statistic.
         Written as 2 * betainc(...) directly rather than
         2*(1 - tCdf(|t|)) because the subtraction throws away
         significant digits exactly where it matters most: a tiny
         p-value from a large |t|. ---- */
  function tTwoSided(t, df) {
    if (!isFinite(t)) return 0;
    var x = df / (df + t * t);
    var p = betainc(df / 2, 0.5, x);
    return p > 1 ? 1 : p;
  }

  /* ---- Welch's two-sample t-test (unequal variances).
         Welch rather than the pooled version because the pages scale
         one group by (1 + effect), which scales its spread too, so
         equal variances is false by construction. It is also the
         honest default when you do not know they are equal.

         Takes summary statistics, not arrays: the caller already has
         a running mean and variance and there is no reason to keep
         the samples alive. ---- */
  function welch(mA, vA, nA, mB, vB, nB) {
    var sa = vA / nA, sb = vB / nB, se2 = sa + sb;
    if (!(se2 > 0)) return { t: 0, df: 1, p: 1, se: 0 };
    var se = Math.sqrt(se2);
    var t = (mA - mB) / se;
    // Welch-Satterthwaite degrees of freedom
    var df = (se2 * se2) / (sa * sa / (nA - 1) + sb * sb / (nB - 1));
    if (!(df > 0)) df = 1;
    return { t: t, df: df, p: tTwoSided(Math.abs(t), df), se: se };
  }

  /* ---- sample mean and variance (n-1), one pass, from a value list ---- */
  function meanVar(vals) {
    var n = vals.length, m = 0, m2 = 0, i, d;
    for (i = 0; i < n; i++) { d = vals[i] - m; m += d / (i + 1); m2 += d * (vals[i] - m); }
    return { mean: m, var: n > 1 ? m2 / (n - 1) : 0, n: n };
  }

  /* ---- inverse standard normal CDF, for a QQ plot's theoretical quantiles.
         Acklam's rational approximation, plus ONE Halley refinement step using
         an erfc built from the same incomplete beta already in this file
         (the normal is a limiting t, so tCdf at large df is not accurate
         enough -- erfc is computed directly instead).

         Without the refinement the raw approximation is good to ~1e-9 in the
         middle and noticeably worse past |z| = 4, which is exactly where a QQ
         plot's most interesting points sit. Accuracy is asserted by
         verify_stats_js.py against scipy rather than claimed here. ---- */
  var A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
            1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  var B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
            6.680131188771972e+01, -1.328068155288572e+01];
  var C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
           -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  var Dd = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
            3.754408661907416e+00];

  /* erfc via the complementary incomplete gamma, expressed with betainc's
     sibling series. Implemented as a continued fraction for the upper
     incomplete gamma Q(1/2, x^2), which equals erfc(x) for x >= 0. */
  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    if (x === 0) return 1;
    var xx = x * x;
    // Lentz continued fraction for Q(a, z) with a = 0.5, z = x^2
    var a = 0.5, z = xx, TINY = 1e-300;
    var b = z + 1 - a, c = 1 / TINY, d = 1 / b, h = d, i, an, del;
    for (i = 1; i <= 300; i++) {
      an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c;  if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-16) break;
    }
    return Math.exp(-z + a * Math.log(z) - lgamma(a)) * h;
  }

  function normCdf(z) { return 0.5 * erfc(-z / Math.SQRT2); }

  function normPpf(p) {
    if (!(p > 0) || !(p < 1)) return p <= 0 ? -Infinity : Infinity;
    var q, r, z;
    if (p < 0.02425) {
      q = Math.sqrt(-2 * Math.log(p));
      z = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
          ((((Dd[0] * q + Dd[1]) * q + Dd[2]) * q + Dd[3]) * q + 1);
    } else if (p > 1 - 0.02425) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      z = -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
           ((((Dd[0] * q + Dd[1]) * q + Dd[2]) * q + Dd[3]) * q + 1);
    } else {
      q = p - 0.5; r = q * q;
      z = (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q /
          (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
    }
    // one Halley step against the true CDF
    var e = normCdf(z) - p;
    var u = e * Math.sqrt(2 * Math.PI) * Math.exp(z * z / 2);
    return z - u / (1 + z * u / 2);
  }

  /* ---- ordinary least squares on paired arrays, with the pieces the
         diagnostics need. Returns the fit plus its residuals. ---- */
  function ols(x, y) {
    var n = x.length, i, mx = 0, my = 0;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    var sxx = 0, sxy = 0, dx;
    for (i = 0; i < n; i++) { dx = x[i] - mx; sxx += dx * dx; sxy += dx * (y[i] - my); }
    var b = sxx ? sxy / sxx : 0, a = my - b * mx;
    var resid = new Float64Array(n), sse = 0, sst = 0, d;
    for (i = 0; i < n; i++) {
      d = y[i] - (a + b * x[i]); resid[i] = d; sse += d * d;
      sst += (y[i] - my) * (y[i] - my);
    }
    return { a: a, b: b, resid: resid, sse: sse, sst: sst,
             r2: sst ? 1 - sse / sst : 0, mx: mx, my: my, sxx: sxx, n: n };
  }

  /* ---- numpy's default ("linear") quantile, so the JS diagnostics agree
         with the Python measurement to the last digit rather than to the
         nearest plausible value. ---- */
  function quantileSorted(a, q) {
    var n = a.length;
    if (n === 0) return NaN;
    if (n === 1) return a[0];
    var pos = q * (n - 1), lo = Math.floor(pos), frac = pos - lo;
    if (lo >= n - 1) return a[n - 1];
    return a[lo] + frac * (a[lo + 1] - a[lo]);
  }

  function sdSample(v) {
    var n = v.length, i, m = 0, s = 0;
    if (n < 2) return 0;
    for (i = 0; i < n; i++) m += v[i];
    m /= n;
    for (i = 0; i < n; i++) s += (v[i] - m) * (v[i] - m);
    return Math.sqrt(s / (n - 1));
  }

  /* ---- the four assumptions, as numbers.
         Deliberately the SAME formulas as data/measure_diagnostics.py, and
         verify_diagnostics.py checks the two agree, because a page that
         computes its own verdicts is only trustworthy if those verdicts can
         be reproduced outside it.

         `bend` and `fan` are expressed as ratios so they compare across
         datasets whose units differ by six orders of magnitude. `lag1` and
         `dw` are meaningless unless the rows have a real order -- the caller
         decides whether to show them, this function just reports. ---- */
  function diagnose(x, y, nb) {
    nb = nb || 8;
    var f = ols(x, y), r = f.resid, n = x.length, i, b;

    var xs = Array.prototype.slice.call(x).sort(function (p, q) { return p - q; });
    var qs = [];
    for (i = 0; i <= nb; i++) qs.push(quantileSorted(xs, i / nb));

    var means = [], sds = [];
    for (b = 0; b < nb; b++) {
      var bucket = [];
      for (i = 0; i < n; i++) {
        var inB = b === nb - 1 ? (x[i] >= qs[b] && x[i] <= qs[b + 1])
                               : (x[i] >= qs[b] && x[i] < qs[b + 1]);
        if (inB) bucket.push(r[i]);
      }
      if (bucket.length >= 3) {
        var mm = 0;
        for (i = 0; i < bucket.length; i++) mm += bucket[i];
        means.push(mm / bucket.length);
        sds.push(sdSample(bucket));
      }
    }
    var rsd = sdSample(r);
    var bend = rsd ? (Math.max.apply(null, means) - Math.min.apply(null, means)) / rsd : 0;
    var mnSd = Math.min.apply(null, sds), mxSd = Math.max.apply(null, sds);
    var fan = mnSd > 0 ? mxSd / mnSd : Infinity;

    // independence, in whatever order the caller supplied
    var lag1 = 0, dw = 0;
    if (n > 3) {
      var ra = [], rb = [];
      for (i = 0; i < n - 1; i++) { ra.push(r[i]); rb.push(r[i + 1]); }
      lag1 = corr(ra, rb);
      var num = 0, den = 0;
      for (i = 0; i < n - 1; i++) num += (r[i + 1] - r[i]) * (r[i + 1] - r[i]);
      for (i = 0; i < n; i++) den += r[i] * r[i];
      dw = den ? num / den : 0;
    }

    // normality: biased moment estimators, matching scipy's defaults
    var m2 = 0, m3 = 0, m4 = 0, mr = 0;
    for (i = 0; i < n; i++) mr += r[i];
    mr /= n;
    for (i = 0; i < n; i++) {
      var d = r[i] - mr;
      m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
    }
    m2 /= n; m3 /= n; m4 /= n;
    var skew = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
    var kurt = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;

    // influence: leverage and Cook's distance, p = 2 for a simple regression
    var s2 = n > 2 ? f.sse / (n - 2) : 0, worst = -1, wmax = -1;
    var cook = new Float64Array(n), lev = new Float64Array(n);
    for (i = 0; i < n; i++) {
      var h = 1 / n + (x[i] - f.mx) * (x[i] - f.mx) / f.sxx;
      lev[i] = h;
      var c = s2 > 0 ? (r[i] * r[i] / (2 * s2)) * (h / ((1 - h) * (1 - h))) : 0;
      cook[i] = c;
      if (c > wmax) { wmax = c; worst = i; }
    }
    return { fit: f, r2: f.r2, slope: f.b, intercept: f.a, resid: r, residSd: rsd,
             bend: bend, fan: fan, lag1: lag1, dw: dw, skew: skew, kurt: kurt,
             cook: cook, lev: lev, worst: worst, maxCook: wmax,
             sliceMeans: means, sliceSds: sds, edges: qs };
  }

  function corr(a, b) {
    var n = a.length, i, ma = 0, mb = 0;
    for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var sa = 0, sb = 0, sab = 0, da, db;
    for (i = 0; i < n; i++) {
      da = a[i] - ma; db = b[i] - mb;
      sa += da * da; sb += db * db; sab += da * db;
    }
    return (sa > 0 && sb > 0) ? sab / Math.sqrt(sa * sb) : 0;
  }

  /* ---- least squares with MANY predictors, for the overfitting page.
         Modified Gram-Schmidt QR with a second orthogonalisation pass, then
         back-substitution. NOT the normal equations: with 100 near-collinear
         noise columns on 272 rows, X'X squares the condition number and the
         answer quietly turns to mush. QR keeps it.

         `cols` is column-major and the caller supplies its own intercept
         column, because whether there is one changes the degrees of freedom
         and that should be the caller's explicit decision.

         Returns beta, the fitted values, and the two numbers the page is
         about: r2, which cannot fall when a column is added, and adj, which
         can. Rank-deficient columns get a zero coefficient rather than an
         Infinity. ---- */
  function lstsq(cols, y) {
    var p = cols.length, n = y.length, i, j, k;
    var Q = [], R = [];
    for (j = 0; j < p; j++) {
      Q.push(Float64Array.from(cols[j]));
      R.push(new Float64Array(p));
    }
    for (j = 0; j < p; j++) {
      for (var pass = 0; pass < 2; pass++) {
        for (i = 0; i < j; i++) {
          var d = 0;
          for (k = 0; k < n; k++) d += Q[i][k] * Q[j][k];
          R[i][j] += d;
          for (k = 0; k < n; k++) Q[j][k] -= d * Q[i][k];
        }
      }
      var nr = 0;
      for (k = 0; k < n; k++) nr += Q[j][k] * Q[j][k];
      nr = Math.sqrt(nr);
      R[j][j] = nr;
      if (nr > 1e-10) { for (k = 0; k < n; k++) Q[j][k] /= nr; }
      else { for (k = 0; k < n; k++) Q[j][k] = 0; }
    }
    var qty = new Float64Array(p);
    for (j = 0; j < p; j++) {
      var s = 0;
      for (k = 0; k < n; k++) s += Q[j][k] * y[k];
      qty[j] = s;
    }
    var beta = new Float64Array(p);
    for (j = p - 1; j >= 0; j--) {
      var t = qty[j];
      for (i = j + 1; i < p; i++) t -= R[j][i] * beta[i];
      beta[j] = Math.abs(R[j][j]) > 1e-10 ? t / R[j][j] : 0;
    }
    var fit = new Float64Array(n), my = 0;
    for (k = 0; k < n; k++) my += y[k];
    my /= n;
    var sse = 0, sst = 0;
    for (k = 0; k < n; k++) {
      var f = 0;
      for (j = 0; j < p; j++) f += beta[j] * cols[j][k];
      fit[k] = f;
      sse += (y[k] - f) * (y[k] - f);
      sst += (y[k] - my) * (y[k] - my);
    }
    var r2 = sst > 0 ? 1 - sse / sst : 0;
    // k predictors excluding the intercept, so the denominator is n - p
    var dof = n - p;
    var adj = dof > 0 && sst > 0 ? 1 - (1 - r2) * (n - 1) / dof : NaN;
    return { beta: beta, fitted: fit, sse: sse, sst: sst, r2: r2, adj: adj,
             n: n, p: p, dof: dof };
  }

  /* Out-of-sample R-squared: a model fitted elsewhere, scored here against
     THIS set's own mean. It can go negative, and that is the whole point --
     negative means the model is worse than guessing the average. */
  function scoreR2(cols, y, beta) {
    var n = y.length, p = beta.length, k, j, my = 0;
    for (k = 0; k < n; k++) my += y[k];
    my /= n;
    var sse = 0, sst = 0;
    for (k = 0; k < n; k++) {
      var f = 0;
      for (j = 0; j < p; j++) f += beta[j] * cols[j][k];
      sse += (y[k] - f) * (y[k] - f);
      sst += (y[k] - my) * (y[k] - my);
    }
    return sst > 0 ? 1 - sse / sst : 0;
  }

  var API = { lgamma: lgamma, betainc: betainc, tCdf: tCdf,
              tTwoSided: tTwoSided, welch: welch, meanVar: meanVar,
              erfc: erfc, normCdf: normCdf, normPpf: normPpf, ols: ols,
              diagnose: diagnose, corr: corr, quantileSorted: quantileSorted,
              lstsq: lstsq, scoreR2: scoreR2 };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.UDJ_STATS = API;
})(typeof window !== 'undefined' ? window : null);
