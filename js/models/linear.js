/* ============================================================
 * 鲲鉴智策 · models/linear.js
 * 职责：线性时序模型：DLinear（趋势/季节分解）与 NLinear（末值差分归一），岭回归闭式解
 * 依赖：无（纯函数）
 * ============================================================ */

// ---------- 轻量深度时序模型（纯 JS）：TCN / DLinear / NLinear ----------
const SEQ_L = 14;        // 回看窗口长度（小样本下 14 天最稳）
const TREND_K = 7;       // DLinear 趋势分解的因果移动平均核宽

function winStats(w) {
  const mu = w.reduce((a, b) => a + b, 0) / (w.length || 1);
  let s = 0; for (const v of w) s += (v - mu) * (v - mu);
  return { mu, sd: Math.sqrt(s / (w.length || 1)) || 1e-6 };
}
function maCausal(a, k) {            // 因果移动平均：只用当前与过去，避免未来信息泄漏
  const o = new Array(a.length); let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i]; if (i >= k) s -= a[i - k];
    o[i] = s / Math.min(i + 1, k);
  }
  return o;
}
function paddedWin(win, L) {
  const w = win.slice(-L);
  while (w.length < L) w.unshift(w.length ? w[0] : 0);
  return w;
}
// 岭回归：特征标准化 + 尺度化正则，避免共线特征导致正规方程病态
function fitRidge(X, Y, lam) {
  const n = X.length, p = X[0].length, H = Y[0].length;
  const mu = new Array(p).fill(0), sd = new Array(p).fill(1);
  for (let a = 0; a < p; a++) {
    let s = 0; for (const xi of X) s += xi[a];
    mu[a] = s / n;
  }
  for (let a = 0; a < p; a++) {
    let s = 0; for (const xi of X) { const d = xi[a] - mu[a]; s += d * d; }
    sd[a] = Math.sqrt(s / n) || 1;
  }
  const A = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0));
  const B = Array.from({ length: p + 1 }, () => new Array(H).fill(0));
  const z = new Array(p + 1);
  for (let i = 0; i < n; i++) {
    const xi = X[i], yi = Y[i];
    for (let a = 0; a < p; a++) z[a] = (xi[a] - mu[a]) / sd[a];
    z[p] = 1;
    for (let a = 0; a <= p; a++) {
      const za = z[a];
      for (let b = a; b <= p; b++) A[a][b] += za * z[b];
      for (let h = 0; h < H; h++) B[a][h] += za * yi[h];
    }
  }
  for (let a = 0; a <= p; a++) {
    for (let b = a + 1; b <= p; b++) A[b][a] = A[a][b];
    if (a < p) A[a][a] += lam * n;
  }
  const M = A.map((row, i) => row.concat(B[i]));
  const D = p + 1;
  for (let c = 0; c < D; c++) {
    let piv = c;
    for (let r = c + 1; r < D; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t; }
    const d = M[c][c] || 1e-12;
    for (let j = c; j < D + H; j++) M[c][j] /= d;
    for (let r = 0; r < D; r++) {
      if (r === c) continue;
      const f = M[r][c]; if (!f) continue;
      for (let j = c; j < D + H; j++) M[r][j] -= f * M[c][j];
    }
  }
  const W = Array.from({ length: D }, () => new Array(H).fill(0));
  for (let a = 0; a < D; a++) for (let h = 0; h < H; h++) W[a][h] = M[a][D + h] || 0;
  return { mu, sd, W, p };
}
function applyRidge(mdl, f, H) {
  const p = mdl.p, z = new Array(p + 1);
  for (let a = 0; a < p; a++) z[a] = (f[a] - mdl.mu[a]) / mdl.sd[a];
  z[p] = 1;
  const out = new Array(H).fill(0);
  for (let h = 0; h < H; h++) {
    let y = 0; for (let a = 0; a <= p; a++) y += z[a] * mdl.W[a][h];
    out[h] = y;
  }
  return out;
}

// ---------- DLinear：趋势/季节分解 + 双线性层（AAAI 2023） ----------
function dlinearFit(data, L, H, k, lam) {
  k = k || TREND_K; lam = (lam == null ? 1e-2 : lam);
  const X = [], Y = [];
  for (let s = L; s + H <= data.length; s += 2) {
    const w = data.slice(s - L, s), y = data.slice(s, s + H);
    const st = winStats(w), wn = w.map(v => (v - st.mu) / st.sd);
    const tr = maCausal(wn, k), se = wn.map((v, i) => v - tr[i]);
    X.push(tr.concat(se));
    Y.push(y.map(v => (v - st.mu) / st.sd));
  }
  if (X.length < 12) return null;
  const M = fitRidge(X, Y, lam);
  return {
    L, H, kind: 'dlinear',
    predict(win) {
      const w = paddedWin(win, L), st = winStats(w);
      const wn = w.map(v => (v - st.mu) / st.sd);
      const tr = maCausal(wn, k), se = wn.map((v, i) => v - tr[i]);
      const yv = applyRidge(M, tr.concat(se), H);
      return yv.map(y => Math.max(0, y * st.sd + st.mu));
    }
  };
}

// ---------- NLinear：末值差分归一 + 单线性层（AAAI 2023） ----------
function nlinearFit(data, L, H, lam) {
  lam = (lam == null ? 1e-2 : lam);
  const X = [], Y = [];
  for (let s = L; s + H <= data.length; s += 2) {
    const w = data.slice(s - L, s), y = data.slice(s, s + H);
    const st = winStats(w), wn = w.map(v => (v - st.mu) / st.sd);
    const last = wn[L - 1];
    X.push(wn.map(v => v - last));
    Y.push(y.map(v => (v - st.mu) / st.sd - last));
  }
  if (X.length < 12) return null;
  const M = fitRidge(X, Y, lam);
  return {
    L, H, kind: 'nlinear',
    predict(win) {
      const w = paddedWin(win, L), st = winStats(w);
      const wn = w.map(v => (v - st.mu) / st.sd), last = wn[L - 1];
      const yv = applyRidge(M, wn.map(v => v - last), H);
      return yv.map(y => Math.max(0, (y + last) * st.sd + st.mu));
    }
  };
}
