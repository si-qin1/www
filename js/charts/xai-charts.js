/* ============================================================
 * 鲲鉴智策 · charts/xai-charts.js
 * 职责：可解释性图表：Canvas 绘制工具、模型效能图、SHAP 条形图、敏感度、周期效应、置信带
 * 依赖：forecast.js（fcResult）、xai.js（归因数据）
 * ============================================================ */

// ---------- canvas 绘图工具 ----------
function setupCanvas(cv, cssH) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(300, cv.parentElement.clientWidth - 4);
  cv.width = Math.round(w * dpr); cv.height = Math.round(cssH * dpr);
  cv.style.width = w + 'px'; cv.style.height = cssH + 'px';
  cv._w = w; cv._h = cssH;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: cssH };
}
function rr(ctx, x, y, w, h, r) { // 圆角矩形路径
  r = Math.min(r, h / 2, Math.abs(w) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
function animChart(cv, renderFn) {
  if (cv._anim) cancelAnimationFrame(cv._anim);
  const t0 = performance.now(), dur = 700;
  const { ctx, w, h } = setupCanvas(cv, cv._h || 260);
  (function frame(now) {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
    renderFn(ctx, w, h, e);
    if (t < 1) cv._anim = requestAnimationFrame(frame); else cv._anim = null;
  })(t0);
}
function fmtXAI(v) { return fcResult && fcResult.metric === 'qty' ? v.toFixed(0) : (v >= 10000 ? (v / 10000).toFixed(1) + '万' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(1)); }

// ---------- 模型效能图：WAPE 精度对比 + LSTM 训练收敛 ----------
function drawModelCharts() {
  if (!fcResult || !fcResult.xai || !fcResult.xai.lossHist) return;
  const models = fcResult.models, lossHist = fcResult.xai.lossHist;
  const H = models.length * 34 + 36;
  const cv1 = document.getElementById('mdl-mape');
  if (cv1) {
    cv1._h = H;
    animChart(cv1, (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const labelW = Math.min(118, w * 0.38), valW = 54;
      const maxM = Math.max(...models.map(m => m.wape), 1);
      models.forEach((m, i) => {
        const y = 6 + i * 34, bh = 20;
        ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(m.name, labelW - 6, y + bh / 2 + 3);
        const full = (w - labelW - valW) * Math.max(0.02, m.wape / maxM);
        const bw = full * t;
        const g = ctx.createLinearGradient(labelW, 0, labelW + Math.max(bw, 1), 0);
        if (m === fcResult.best) { g.addColorStop(0, '#0d9488'); g.addColorStop(1, '#38bdf8'); }
        else { g.addColorStop(0, '#cbd5e1'); g.addColorStop(1, '#e2e8f0'); }
        ctx.fillStyle = g; rr(ctx, labelW, y, Math.max(2, bw), bh, 5); ctx.fill();
        ctx.textAlign = 'left'; ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = m === fcResult.best ? '#0f766e' : '#64748b';
        ctx.fillText(m.wape.toFixed(1) + '%', labelW + Math.max(2, bw) + 6, y + bh / 2 + 3);
        if (m === fcResult.best) { ctx.font = '9px sans-serif'; ctx.fillStyle = '#f59e0b'; ctx.fillText('★', labelW + 2, y + bh / 2 + 3); }
      });
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'left';
      ctx.fillText('WAPE（加权绝对百分比误差，越低越好）', 2, h - 8);
    });
  }
  const cv2 = document.getElementById('mdl-loss');
  if (cv2) {
    cv2._h = H;
    animChart(cv2, (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const padL = 44, padR = 14, padT = 14, padB = 28;
      const iw = w - padL - padR, ih = h - padT - padB;
      const n = lossHist.length;
      const maxL = Math.max(...lossHist), minL = Math.min(...lossHist);
      const yMin = Math.max(0, minL - (maxL - minL) * 0.1), yMax = maxL;
      const X = i => padL + (n > 1 ? i * iw / (n - 1) : 0);
      const Y = v => padT + ih * (1 - (v - yMin) / Math.max(yMax - yMin, 1e-9));
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
      for (let g = 0; g <= 3; g++) { const y = padT + ih * g / 3; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); }
      const upto = Math.max(2, Math.round(n * t));
      ctx.beginPath(); ctx.moveTo(X(0), padT + ih);
      for (let i = 0; i < upto; i++) ctx.lineTo(X(i), Y(lossHist[i]));
      ctx.lineTo(X(upto - 1), padT + ih); ctx.closePath();
      const g2 = ctx.createLinearGradient(0, padT, 0, padT + ih);
      g2.addColorStop(0, 'rgba(45,212,191,.38)'); g2.addColorStop(1, 'rgba(45,212,191,.02)');
      ctx.fillStyle = g2; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < upto; i++) { const x = X(i), y = Y(lossHist[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
      ctx.fillText(maxL.toFixed(3), padL - 4, padT + 4);
      ctx.fillText(minL.toFixed(3), padL - 4, padT + ih + 3);
      ctx.textAlign = 'left'; ctx.fillText('LOSS', 4, padT + 4);
      // 子网分界线
      const bounds = (fcResult.xai && fcResult.xai.ensBounds) || [];
      bounds.slice(0, -1).forEach(b => {
        const bx = X(b - 1);
        if (bx > padL && bx < w - padR) {
          ctx.save(); ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(bx, padT); ctx.lineTo(bx, padT + ih); ctx.stroke(); ctx.restore();
          ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; ctx.font = '8px sans-serif';
          ctx.fillText('子网' + (bounds.indexOf(b) + 1) + '→' + (bounds.indexOf(b) + 2), bx, padT + 10);
        }
      });
      ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif';
      ctx.fillText('epoch ' + n + ' · 最终 ' + lossHist[n - 1].toFixed(4), padL, h - 8);
      ctx.beginPath(); ctx.arc(X(n - 1), Y(lossHist[n - 1]), 3, 0, 7); ctx.fillStyle = '#0d9488'; ctx.fill();
    });
  }
}

let _xaiResizeT = null;
window.addEventListener('resize', function () {
  clearTimeout(_xaiResizeT);
  _xaiResizeT = setTimeout(function () {
    if (!fcResult) return;
    try {
      drawFcChart();
      if (fcResult.xai && fcResult.xai.data) renderXAI();
      if (fcResult.xai && fcResult.xai.lossHist) drawModelCharts();
    } catch (e) {}
  }, 220);
});

// ---------- ① SHAP 发散条形图 ----------
function drawShapChart() {
  const d = fcResult.xai.data;
  const cv = document.getElementById('xai-shap');
  cv._h = d.dates.length * 40 + 56;
  animChart(cv, (ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const labelW = 86, valW = 76, mid = labelW + (w - labelW - valW) / 2;
    const maxAbs = Math.max(...d.sh.phi.map(Math.abs), 1) * 1.05;
    const scale = (w - labelW - valW) / 2 / maxAbs;
    // 中轴线
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mid, 6); ctx.lineTo(mid, h - 30); ctx.stroke();
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center';
    ctx.fillText('← 拉低销量', mid - scale * maxAbs * 0.55, h - 12);
    ctx.fillText('推高销量 →', mid + scale * maxAbs * 0.55, h - 12);
    d.dates.forEach((dt, i) => {
      const v = d.sh.phi[i] * t, y = 10 + i * 40, bh = 22;
      // 日期标签
      ctx.fillStyle = '#475569'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(dt, labelW - 8, y + bh / 2 + 4);
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#94a3b8';
      const dw = new Date(d.winDates[i] + 'T00:00:00Z').getUTCDay();
      ctx.fillText(DOW_NM[dw], labelW - 8, y + bh / 2 + 15);
      const bw = Math.abs(v) * scale;
      if (bw > 0.5) {
        const g = ctx.createLinearGradient(v >= 0 ? mid : mid - bw, 0, v >= 0 ? mid + bw : mid, 0);
        if (v >= 0) { g.addColorStop(0, '#fda4af'); g.addColorStop(1, '#ef4444'); }
        else { g.addColorStop(0, '#6ee7b7'); g.addColorStop(1, '#059669'); }
        ctx.fillStyle = g;
        rr(ctx, v >= 0 ? mid : mid - bw, y, bw, bh, 5); ctx.fill();
        // 顶部高光
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        rr(ctx, v >= 0 ? mid : mid - bw, y + 2, bw, 6, 3); ctx.fill();
      }
      // 数值
      const full = d.sh.phi[i];
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = full >= 0 ? '#dc2626' : '#059669';
      ctx.textAlign = full >= 0 ? 'left' : 'right';
      ctx.fillText((full >= 0 ? '+' : '−') + fmtXAI(Math.abs(full)), full >= 0 ? mid + bw + 6 : mid - bw - 6, y + bh / 2 + 4);
    });
  });
}

// ---------- ② 时间敏感度柱状图 ----------
function drawSaliencyChart() {
  const d = fcResult.xai.data, cv = document.getElementById('xai-saliency');
  cv._h = 230;
  animChart(cv, (ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const padL = 44, padR = 10, padT = 18, padB = 34;
    const iw = w - padL - padR, ih = h - padT - padB;
    const maxAbs = Math.max(...d.sal.map(Math.abs), 1e-9);
    const ymax = maxAbs * 1.15;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    [0, .5, 1].forEach(g => { const y = padT + ih * (1 - g); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); });
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
    [1, .5, 0].forEach(g => ctx.fillText(fmtXAI(ymax * g), padL - 5, padT + ih * (1 - g) + 3));
    const bw = Math.min(34, iw / 7 * 0.55);
    d.sal.forEach((v, i) => {
      const cx = padL + iw / 7 * (i + 0.5), bh = Math.abs(v) / ymax * ih * t;
      const g = ctx.createLinearGradient(0, padT + ih - bh, 0, padT + ih);
      g.addColorStop(0, '#0ea5e9'); g.addColorStop(1, '#14b8a6');
      ctx.fillStyle = g; rr(ctx, cx - bw / 2, padT + ih - bh, bw, bh, 4); ctx.fill();
      if (i === d.salMax) { ctx.font = '12px sans-serif'; ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'center'; ctx.fillText('★', cx, padT + ih - bh - 5); }
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#64748b'; ctx.textAlign = 'center';
      ctx.fillText(d.dates[i], cx, h - 18);
      ctx.fillStyle = '#94a3b8'; ctx.fillText(i === 6 ? '昨日' : (6 - i) + '天前', cx, h - 6);
    });
  });
}

// ---------- ③ 星期周期效应柱状图 ----------
function drawDowChart() {
  const d = fcResult.xai.data, cv = document.getElementById('xai-dow');
  cv._h = 230;
  animChart(cv, (ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const padL = 44, padR = 10, padT = 18, padB = 30;
    const iw = w - padL - padR, ih = h - padT - padB;
    const order = [1, 2, 3, 4, 5, 6, 0];
    const ymax = Math.max(...order.map(w2 => d.dow.avg[w2]), 1) * 1.15;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    [0, 1].forEach(g => { const y = padT + ih * (1 - g); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); });
    // 均值虚线
    const mean = order.reduce((s, w2) => s + d.dow.avg[w2], 0) / 7;
    const my = padT + ih * (1 - mean / ymax);
    ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(padL, my); ctx.lineTo(w - padR, my); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'left';
    ctx.fillText('周均 ' + fmtXAI(mean), padL + 2, my - 4);
    const bw = Math.min(38, iw / 7 * 0.56);
    order.forEach((dw, i) => {
      const v = d.dow.avg[dw] * t, cx = padL + iw / 7 * (i + 0.5), bh = v / ymax * ih;
      const we = dw === 0 || dw === 6;
      const g = ctx.createLinearGradient(0, padT + ih - bh, 0, padT + ih);
      if (we) { g.addColorStop(0, '#fb7185'); g.addColorStop(1, '#f43f5e'); }
      else { g.addColorStop(0, '#2dd4bf'); g.addColorStop(1, '#0d9488'); }
      ctx.fillStyle = g; rr(ctx, cx - bw / 2, padT + ih - bh, bw, bh, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(ctx, cx - bw / 2, padT + ih - bh, bw, Math.min(6, bh), 3); ctx.fill();
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#64748b'; ctx.textAlign = 'center';
      ctx.fillText(DOW_NM[dw], cx, h - 12);
      if (we) { ctx.font = '9px sans-serif'; ctx.fillStyle = '#f43f5e'; ctx.fillText('周末', cx, h - 2); }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = we ? '#e11d48' : '#0f766e';
      ctx.fillText(fmtXAI(d.dow.avg[dw]), cx, padT + ih - bh - 5);
    });
  });
}

// ---------- ④ 回测置信区间图 ----------
function drawBacktestChart() {
  const d = fcResult.xai.data, cv = document.getElementById('xai-backtest');
  const n = d.test.length;
  cv._h = 260;
  animChart(cv, (ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const padL = 52, padR = 14, padT = 16, padB = 34;
    const iw = w - padL - padR, ih = h - padT - padB;
    const lo = 0, ymax = Math.max(...d.test, ...d.preds.map(p => p + d.best.rmse)) * 1.1 || 1;
    const X = i => padL + (n > 1 ? i * iw / (n - 1) : iw / 2), Y = v => padT + ih * (1 - v / ymax);
    // 网格
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.font = '10px sans-serif';
    for (let g = 0; g <= 4; g++) {
      const gv = ymax * g / 4, y = Y(gv);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right'; ctx.fillText(fmtXAI(gv), padL - 6, y + 3);
    }
    const step = Math.ceil(n / 8);
    d.btDates.forEach((dt, i) => { if (i % step === 0 || i === n - 1) { ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.fillText(dt.slice(5), X(i), h - 16); } });
    // 动画：从左向右揭开
    ctx.save();
    ctx.beginPath(); ctx.rect(padL - 4, 0, (iw + 8) * t, h); ctx.clip();
    // 置信带（预测 ±1 RMSE）
    ctx.beginPath();
    d.preds.forEach((p, i) => { const y = Y(Math.min(ymax, p + d.best.rmse)); i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y); });
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(Math.max(0, d.preds[i] - d.best.rmse)));
    ctx.closePath(); ctx.fillStyle = 'rgba(13,148,136,.12)'; ctx.fill();
    // 实际
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.2; ctx.beginPath();
    d.test.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    // 预测
    ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 2.2; ctx.setLineDash([7, 4]); ctx.beginPath();
    d.preds.forEach((p, i) => { const x = X(i), y = Y(Math.max(0, p)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
    // 数据点
    d.test.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(i), Y(v), 2.6, 0, 7); ctx.fillStyle = '#0f172a'; ctx.fill(); });
    d.preds.forEach((p, i) => { ctx.beginPath(); ctx.arc(X(i), Y(Math.max(0, p)), 2.6, 0, 7); ctx.fillStyle = '#0d9488'; ctx.fill(); });
    ctx.restore();
    // 图例
    const lg = [['实际值', '#0f172a', false], ['预测值', '#0d9488', true], ['±1×RMSE 置信带', 'rgba(13,148,136,.25)', true]];
    let lx = w - padR - 210;
    lg.forEach(([nm, col, dash]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash(dash ? [5, 3] : []);
      ctx.beginPath(); ctx.moveTo(lx, padT + 6); ctx.lineTo(lx + 24, padT + 6); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#475569'; ctx.textAlign = 'left'; ctx.fillText(nm, lx + 29, padT + 9);
      lx += 105;
    });
  });
}
