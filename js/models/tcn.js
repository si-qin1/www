/* ============================================================
 * 鲲鉴智策 · models/tcn.js
 * 职责：轻量 TCN：3 层因果膨胀卷积 + 残差，手写前向/反向传播与 Adam 优化
 * 依赖：无（纯函数）
 * ============================================================ */

// ---------- 轻量 TCN：3 层因果膨胀卷积 + 残差，直出多步 ----------
function tcnCreate(seed, C, L, H) {
  const rnd = lstmRng(seed), rand = () => (rnd() * 2 - 1) * 0.22;
  const cfg = [{ k: 3, d: 1 }, { k: 3, d: 2 }, { k: 3, d: 4 }];
  const layers = []; let cin = 1;
  for (const c of cfg) {
    layers.push({
      cin, cout: C, k: c.k, d: c.d,
      W: Array.from({ length: C }, () => Array.from({ length: cin }, () => Array.from({ length: c.k }, rand))),
      b: new Array(C).fill(0),
      mW: Array.from({ length: C }, () => Array.from({ length: cin }, () => new Array(c.k).fill(0))),
      vW: Array.from({ length: C }, () => Array.from({ length: cin }, () => new Array(c.k).fill(0))),
      mb: new Array(C).fill(0), vb: new Array(C).fill(0)
    });
    cin = C;
  }
  return {
    C, L, H, layers, t: 0,
    Wo: Array.from({ length: H }, () => Array.from({ length: C }, rand)),
    bo: new Array(H).fill(0),
    mWo: Array.from({ length: H }, () => new Array(C).fill(0)),
    vWo: Array.from({ length: H }, () => new Array(C).fill(0)),
    mbo: new Array(H).fill(0), vbo: new Array(H).fill(0)
  };
}
function tcnForward(net, xs) {
  let inp = [xs.slice()];
  const caches = [];
  for (const ly of net.layers) {
    const T = inp[0].length, pre = [], out = [];
    for (let o = 0; o < ly.cout; o++) {
      const po = new Array(T).fill(0), Wo = ly.W[o], b = ly.b[o];
      for (let t = 0; t < T; t++) {
        let a = b;
        for (let ci = 0; ci < ly.cin; ci++) {
          const row = Wo[ci], ic = inp[ci];
          for (let k = 0; k < ly.k; k++) { const tt = t - ly.d * k; if (tt >= 0) a += row[k] * ic[tt]; }
        }
        po[t] = a;
      }
      pre.push(po);
      const oo = po.slice();
      for (let t = 0; t < T; t++) if (oo[t] < 0) oo[t] = 0;
      if (ly.cin === ly.cout) { const src = inp[o]; for (let t = 0; t < T; t++) oo[t] += src[t]; }
      out.push(oo);
    }
    caches.push({ inp, pre, out, ly });
    inp = out;
  }
  const T = xs.length, last = new Array(net.C);
  for (let c = 0; c < net.C; c++) last[c] = inp[c][T - 1];
  const y = new Array(net.H).fill(0);
  for (let h = 0; h < net.H; h++) {
    let s = net.bo[h];
    for (let c = 0; c < net.C; c++) s += net.Wo[h][c] * last[c];
    y[h] = s;
  }
  return { y, caches, last, T };
}
function adamApply(p, g, m, v, lr, t) {
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const m1 = b1 * m + (1 - b1) * g, v1 = b2 * v + (1 - b2) * g * g;
  const mh = m1 / (1 - Math.pow(b1, t)), vh = v1 / (1 - Math.pow(b2, t));
  return [p - lr * mh / (Math.sqrt(vh) + eps), m1, v1];
}
function tcnTrainStep(net, xraw, yraw, lr) {
  const st = winStats(xraw);
  const xs = xraw.map(v => (v - st.mu) / st.sd), ys = yraw.map(v => (v - st.mu) / st.sd);
  const fw = tcnForward(net, xs), T = fw.T, H = net.H;
  let loss = 0;
  const dy = new Array(H);
  for (let h = 0; h < H; h++) { const e = fw.y[h] - ys[h]; loss += e * e; dy[h] = 2 * e / H; }
  loss /= H;
  net.t++;
  const t = net.t;
  for (let h = 0; h < H; h++) {
    for (let c = 0; c < net.C; c++) {
      const [np, nm, nv] = adamApply(net.Wo[h][c], dy[h] * fw.last[c], net.mWo[h][c], net.vWo[h][c], lr, t);
      net.Wo[h][c] = np; net.mWo[h][c] = nm; net.vWo[h][c] = nv;
    }
    const [nb, nmb, nvb] = adamApply(net.bo[h], dy[h], net.mbo[h], net.vbo[h], lr, t);
    net.bo[h] = nb; net.mbo[h] = nmb; net.vbo[h] = nvb;
  }
  let dOut = Array.from({ length: net.C }, () => new Array(T).fill(0));
  for (let c = 0; c < net.C; c++) {
    let s = 0; for (let h = 0; h < H; h++) s += dy[h] * net.Wo[h][c];
    dOut[c][T - 1] = s;
  }
  for (let li = net.layers.length - 1; li >= 0; li--) {
    const ly = net.layers[li], ca = fw.caches[li];
    const dinp = Array.from({ length: ly.cin }, () => new Array(T).fill(0));
    if (ly.cin === ly.cout) for (let o = 0; o < ly.cout; o++) { const row = dOut[o]; for (let tt = 0; tt < T; tt++) dinp[o][tt] += row[tt]; }
    const gW = Array.from({ length: ly.cout }, () => Array.from({ length: ly.cin }, () => new Array(ly.k).fill(0)));
    const gb = new Array(ly.cout).fill(0);
    for (let o = 0; o < ly.cout; o++) {
      const drow = dOut[o];
      for (let tt = 0; tt < T; tt++) {
        const d = ca.pre[o][tt] > 0 ? drow[tt] : 0;
        if (!d) continue;
        gb[o] += d;
        for (let ci = 0; ci < ly.cin; ci++) {
          const ic = ca.inp[ci], g = gW[o][ci], wrow = ly.W[o][ci];
          for (let k = 0; k < ly.k; k++) {
            const tt2 = tt - ly.d * k;
            if (tt2 >= 0) { g[k] += d * ic[tt2]; dinp[ci][tt2] += d * wrow[k]; }
          }
        }
      }
    }
    for (let o = 0; o < ly.cout; o++) {
      for (let ci = 0; ci < ly.cin; ci++) for (let k = 0; k < ly.k; k++) {
        const [np, nm, nv] = adamApply(ly.W[o][ci][k], gW[o][ci][k], ly.mW[o][ci][k], ly.vW[o][ci][k], lr, t);
        ly.W[o][ci][k] = np; ly.mW[o][ci][k] = nm; ly.vW[o][ci][k] = nv;
      }
      const [nb, nmb, nvb] = adamApply(ly.b[o], gb[o], ly.mb[o], ly.vb[o], lr, t);
      ly.b[o] = nb; ly.mb[o] = nmb; ly.vb[o] = nvb;
    }
    dOut = dinp;
  }
  return loss;
}
function tcnPredict(net, win) {
  const w = paddedWin(win, net.L), st = winStats(w);
  const fw = tcnForward(net, w.map(v => (v - st.mu) / st.sd));
  return fw.y.map(v => Math.max(0, v * st.sd + st.mu));
}

function trainTcnAsync(net, samples, epochs, lr, onEp, done) {
  let ep = 0;
  (function loop() {
    const t0 = performance.now();
    while (ep < epochs && performance.now() - t0 < 40) {
      const lrNow = lr * (1 - ep / epochs * 0.8);
      let ls = 0;
      for (const smp of samples) ls += tcnTrainStep(net, smp.x, smp.y, lrNow);
      ep++; onEp(ep, ls / samples.length);
    }
    if (ep < epochs) setTimeout(loop, 0); else done();
  })();
}
