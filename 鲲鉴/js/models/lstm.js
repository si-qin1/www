/* ============================================================
 * 鲲鉴智策 · models/lstm.js
 * 职责：LSTM：单层网络手写前向、BPTT 反向传播（含细胞状态跨步梯度）与 Adam 优化
 * 依赖：无（纯函数）
 * ============================================================ */

// ---------- LSTM（纯 JS 实现，单层 + Adam，适配 ≤1200 条小样本） ----------
function lstmRng(seed) { let a = seed | 0; return function () { a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function lstmCreate(H, seed) {
  const rr0 = seed ? lstmRng(seed) : null;
  const r = rr0 ? () => (rr0() - 0.5) * 0.4 : () => (Math.random() - 0.5) * 0.4;
  return {
    H, inDim: 1,
    Wx: [0, 1, 2, 3].map(() => Array.from({ length: H }, r)),      // 输入门/遗忘门/输出门/候选  (H)
    Wh: [0, 1, 2, 3].map(() => Array.from({ length: H }, () => Array.from({ length: H }, r))),
    b: [0, 1, 2, 3].map(() => new Array(H).fill(0)),
    Wy: Array.from({ length: H }, r), by: 0,
    mWx: [0,1,2,3].map(()=>new Array(H).fill(0)), vWx: [0,1,2,3].map(()=>new Array(H).fill(0)),
    mWh: [0,1,2,3].map(()=>Array.from({length:H},()=>new Array(H).fill(0))),
    vWh: [0,1,2,3].map(()=>Array.from({length:H},()=>new Array(H).fill(0))),
    mb: [0,1,2,3].map(()=>new Array(H).fill(0)), vb: [0,1,2,3].map(()=>new Array(H).fill(0)),
    mWy: new Array(H).fill(0), vWy: new Array(H).fill(0), mby: 0, vby: 0, t: 0
  };
}
const _sig = x => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));
const _tanh = x => Math.tanh(Math.max(-60, Math.min(60, x)));
function lstmForward(m, xs) { // xs: 标量序列；返回 {y, cache}
  const H = m.H, cache = [];
  let h = new Array(H).fill(0), c = new Array(H).fill(0);
  for (const xt of xs) {
    const pre = [[],[],[],[]], gate = [[],[],[],[]], tc = new Array(H), cn = new Array(H);
    for (let g = 0; g < 4; g++) for (let j = 0; j < H; j++) {
      let a = m.Wx[g][j] * xt + m.b[g][j];
      const Whg = m.Wh[g][j];
      for (let k = 0; k < H; k++) a += Whg[k] * h[k];
      pre[g][j] = a;
      gate[g][j] = g < 2 ? _sig(a) : (g === 2 ? _sig(a) : _tanh(a));
    }
    for (let j = 0; j < H; j++) {
      cn[j] = gate[1][j] * c[j] + gate[0][j] * gate[3][j];
      tc[j] = _tanh(cn[j]);
    }
    const hn = new Array(H);
    for (let j = 0; j < H; j++) hn[j] = gate[2][j] * tc[j];
    cache.push({ xt, h, c, pre, gate, tc, cn, hn });
    h = hn; c = cn;
  }
  let y = m.by;
  for (let j = 0; j < H; j++) y += m.Wy[j] * h[j];
  return { y, cache, hLast: h };
}
function lstmTrainStep(m, xs, target, lr) { // 单样本前向 + BPTT + Adam
  const H = m.H, fw = lstmForward(m, xs), cache = fw.cache, T = cache.length;
  const dy = fw.y - target; const loss = dy * dy;
  const dhOut = new Array(H).fill(0);
  for (let j = 0; j < H; j++) dhOut[j] = dy * m.Wy[j];
  const gWy = new Array(H).fill(0);
  for (let j = 0; j < H; j++) gWy[j] = dy * cache[T - 1].h[j];
  const gby = dy;
  const gWx = [0,1,2,3].map(() => new Array(H).fill(0));
  const gWh = [0,1,2,3].map(() => Array.from({ length: H }, () => new Array(H).fill(0)));
  const gb  = [0,1,2,3].map(() => new Array(H).fill(0));
  let dhNext = new Array(H).fill(0);  // 对 h_t 的梯度（来自未来步的门反传）
  let dcCarry = new Array(H).fill(0); // 对 c_t 的梯度（来自 c_{t+1}·f_{t+1}）
  for (let t = T - 1; t >= 0; t--) {
    const c0 = cache[t];
    const dh = new Array(H), dc = new Array(H);
    for (let j = 0; j < H; j++) {
      dh[j] = dhNext[j] + (t === T - 1 ? dhOut[j] : 0);
      // h_t = o_t · tanh(c_t)：两条路径
      dc[j] = dh[j] * c0.gate[2][j] * (1 - c0.tc[j] * c0.tc[j]) + dcCarry[j];
    }
    const dpre = [new Array(H), new Array(H), new Array(H), new Array(H)];
    const dhPrev = new Array(H).fill(0);
    for (let j = 0; j < H; j++) {
      const doj = dh[j] * c0.tc[j];                                        // 输出门
      const dij = dc[j] * c0.gate[3][j];                                   // 输入门
      const dfj = dc[j] * c0.c[j];                                         // 遗忘门
      const dgj = dc[j] * c0.gate[0][j];                                   // 候选
      dpre[0][j] = dij * c0.gate[0][j] * (1 - c0.gate[0][j]);
      dpre[1][j] = dfj * c0.gate[1][j] * (1 - c0.gate[1][j]);
      dpre[2][j] = doj * c0.gate[2][j] * (1 - c0.gate[2][j]);
      dpre[3][j] = dgj * (1 - c0.gate[3][j] * c0.gate[3][j]);
      gWx[0][j] += dpre[0][j] * c0.xt; gWx[1][j] += dpre[1][j] * c0.xt;
      gWx[2][j] += dpre[2][j] * c0.xt; gWx[3][j] += dpre[3][j] * c0.xt;
      gb[0][j] += dpre[0][j]; gb[1][j] += dpre[1][j];
      gb[2][j] += dpre[2][j]; gb[3][j] += dpre[3][j];
      for (let g = 0; g < 4; g++) for (let k = 0; k < H; k++) {
        gWh[g][j][k] += dpre[g][j] * c0.h[k];
        dhPrev[k] += dpre[g][j] * m.Wh[g][j][k];
      }
    }
    dhNext = dhPrev;
    dcCarry = dc.map((d, j) => d * c0.gate[1][j]); // dc_t·f_t 传给 c_{t-1}
  }
  // Adam 更新
  m.t++;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const upd = (pv, g, mm, vv) => {
    const m1 = b1 * mm + (1 - b1) * g, v1 = b2 * vv + (1 - b2) * g * g;
    const mh = m1 / (1 - Math.pow(b1, m.t)), vh = v1 / (1 - Math.pow(b2, m.t));
    return [pv - lr * mh / (Math.sqrt(vh) + eps), m1, v1];
  };
  for (let g = 0; g < 4; g++) for (let j = 0; j < H; j++) {
    [m.Wx[g][j], m.mWx[g][j], m.vWx[g][j]] = upd(m.Wx[g][j], gWx[g][j], m.mWx[g][j], m.vWx[g][j]);
    [m.b[g][j], m.mb[g][j], m.vb[g][j]] = upd(m.b[g][j], gb[g][j], m.mb[g][j], m.vb[g][j]);
    for (let k = 0; k < H; k++)
      [m.Wh[g][j][k], m.mWh[g][j][k], m.vWh[g][j][k]] = upd(m.Wh[g][j][k], gWh[g][j][k], m.mWh[g][j][k], m.vWh[g][j][k]);
  }
  for (let j = 0; j < H; j++)
    [m.Wy[j], m.mWy[j], m.vWy[j]] = upd(m.Wy[j], gWy[j], m.mWy[j], m.vWy[j]);
  [m.by, m.mby, m.vby] = upd(m.by, gby, m.mby, m.vby);
  return loss;
}
