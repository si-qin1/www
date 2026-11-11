/* ============================================================
 * 鲲鉴智策 · charts/forecast-chart.js
 * 职责：预测可视化：回测验证双面板 SVG、完整预测走势断轴放大、图例联动
 * 依赖：forecast.js（fcResult）
 * ============================================================ */

// ---------- SVG 折线图 ----------
const FC_COLORS = { 'DLinear 分解线性': '#0ea5e9', 'NLinear 归一线性': '#f59e0b', '轻量 TCN': '#8b5cf6', 'LSTM 集成模型': '#0d9488' };
function drawFcChart() {
  const { models, best, series, horizon, metric } = fcResult;
  const n = series.length;
  const h = (fcResult.xai && fcResult.xai.data) ? fcResult.xai.data.h : Math.max(5, Math.round(n * 0.2));
  const isQty = metric === 'qty';
  const fc0 = document.getElementById('fc-chart');
  const CW = Math.max(980, fc0.clientWidth || 1150);
  const svgWrap = (W, H, inner) => '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="display:block;min-width:' + W + 'px">' + inner + '</svg>';

  // ================= ① 回测验证：真实销量 vs 各模型回测预测 =================
  const K = Math.min(n, Math.max(46, h + 16));
  const hist = series.slice(-K);
  const b0 = K - h;                       // 回测段起点
  const H1 = 300, pL = 58, pR = 18, pT = 30, pB = 36;
  const iw1 = CW - pL - pR, ih1 = H1 - pT - pB;
  const vals1 = hist.map(r => r.v);
  models.forEach(m => m.preds.forEach(v => vals1.push(Math.max(0, v))));
  const ymax1 = Math.max(...vals1) * 1.14 || 1;
  const x1 = i => pL + (K > 1 ? i * iw1 / (K - 1) : iw1 / 2);
  const y1 = v => pT + ih1 * (1 - v / ymax1);
  let s1 = '';
  s1 += '<rect x="' + x1(b0) + '" y="' + pT + '" width="' + Math.max(0, CW - pR - x1(b0)) + '" height="' + ih1 + '" fill="#f0fdfa"/>';
  for (let g = 0; g <= 4; g++) {
    const gv = ymax1 * g / 4, y = y1(gv);
    s1 += '<line x1="' + pL + '" y1="' + y + '" x2="' + (CW - pR) + '" y2="' + y + '" stroke="#eef2f7"/>' +
          '<text x="' + (pL - 8) + '" y="' + (y + 4) + '" font-size="11" fill="#94a3b8" text-anchor="end">' + fmtShort(gv) + '</text>';
  }
  const step1 = Math.ceil(K / 9);
  hist.forEach((r, i) => { if (i % step1 === 0 || i === K - 1) s1 += '<text x="' + x1(i) + '" y="' + (H1 - 12) + '" font-size="10" fill="#94a3b8" text-anchor="middle">' + r.date.slice(5) + '</text>'; });
  s1 += '<line x1="' + x1(b0) + '" y1="' + (pT - 6) + '" x2="' + x1(b0) + '" y2="' + (pT + ih1) + '" stroke="#14b8a6" stroke-dasharray="4,4"/>' +
        '<text x="' + (x1(b0) + 7) + '" y="' + (pT - 12) + '" font-size="10" fill="#0f766e" font-weight="bold">留出回测段（后 20%，' + h + ' 天）</text>';
  models.forEach(m => {
    const pts = m.preds.map((v, i) => x1(b0 + i) + ',' + y1(Math.max(0, v)));
    if (!pts.length) return;
    const isBest = (m === best);
    s1 += '<path class="fc-line" data-name="' + m.name + '" d="M' + pts.join(' L') + '" fill="none" stroke="' + (FC_COLORS[m.name] || '#333') + '" stroke-width="' + (isBest ? 2.8 : 1.5) + '"' + (isBest ? '' : ' stroke-dasharray="5,4" opacity="0.5"') + ' stroke-linejoin="round"/>';
  });
  s1 += '<path d="M' + hist.map((r, i) => x1(i) + ',' + y1(r.v)).join(' L') + '" fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round"/>';
  hist.forEach((r, i) => { if (i >= b0) s1 += '<circle cx="' + x1(i) + '" cy="' + y1(r.v) + '" r="2.2" fill="#0f172a"/>'; });
  s1 += '<text x="' + (CW - pR) + '" y="' + (pT - 12) + '" font-size="11" fill="#0f766e" text-anchor="end" font-weight="bold">' + best.name + ' · 回测 WAPE ' + best.wape.toFixed(1) + '%</text>';

  // ================= ② 完整预测走势：断轴放大未来段 =================
  const H2 = 330, qL = 58, qR = 18, qT = 34, qB = 40;
  const hist2 = series.slice(-Math.min(28, n));
  const futD = futureDates(series[n - 1].date, horizon);
  const gap = 34, innerW = CW - qL - qR;
  const wHist = (innerW - gap) * 0.56, wFut = (innerW - gap) * 0.44;
  const xh = i => qL + (hist2.length > 1 ? i * wHist / (hist2.length - 1) : wHist / 2);
  const xf = j => qL + wHist + gap + (horizon > 1 ? j * wFut / (horizon - 1) : wFut / 2);
  const vals2 = hist2.map(r => r.v);
  models.forEach(m => m.fut.forEach(v => vals2.push(Math.max(0, v))));
  const ymax2 = Math.max(...vals2) * 1.14 || 1;
  const ih2 = H2 - qT - qB, y2 = v => qT + ih2 * (1 - v / ymax2);
  let s2 = '';
  s2 += '<rect x="' + (xf(0) - 14) + '" y="' + (qT - 8) + '" width="' + Math.max(0, CW - qR - xf(0) + 14) + '" height="' + (ih2 + 8) + '" rx="8" fill="#f0fdfa"/>';
  for (let g = 0; g <= 4; g++) {
    const gv = ymax2 * g / 4, y = y2(gv);
    s2 += '<line x1="' + qL + '" y1="' + y + '" x2="' + (CW - qR) + '" y2="' + y + '" stroke="#eef2f7"/>' +
          '<text x="' + (qL - 8) + '" y="' + (y + 4) + '" font-size="11" fill="#94a3b8" text-anchor="end">' + fmtShort(gv) + '</text>';
  }
  const xToday = qL + wHist + gap / 2;
  s2 += '<line x1="' + xToday + '" y1="' + (qT - 4) + '" x2="' + xToday + '" y2="' + (qT + ih2) + '" stroke="#94a3b8" stroke-dasharray="3,3"/>' +
        '<text x="' + xToday + '" y="' + (qT - 14) + '" font-size="10" fill="#64748b" text-anchor="middle">今天</text>' +
        '<text x="' + (xf(0) + wFut / 2) + '" y="' + (qT - 14) + '" font-size="10" fill="#0f766e" text-anchor="middle" font-weight="bold">未来 ' + horizon + ' 天逐日预测</text>';
  const step2 = Math.ceil(hist2.length / 6);
  hist2.forEach((r, i) => { if (i % step2 === 0) s2 += '<text x="' + xh(i) + '" y="' + (H2 - 14) + '" font-size="10" fill="#94a3b8" text-anchor="middle">' + r.date.slice(5) + '</text>'; });
  const stepF = horizon <= 8 ? 1 : Math.ceil(horizon / 8);
  futD.forEach((d, j) => { if (j % stepF === 0 || j === horizon - 1) s2 += '<text x="' + xf(j) + '" y="' + (H2 - 14) + '" font-size="10" fill="#0f766e" text-anchor="middle">' + d.slice(5) + '</text>'; });
  const lastHistX = xh(hist2.length - 1), lastHistY = y2(hist2[hist2.length - 1].v);
  s2 += '<path d="M' + lastHistX + ',' + lastHistY + ' L' + best.fut.map((v, j) => xf(j) + ',' + y2(Math.max(0, v))).join(' L') + ' L' + xf(horizon - 1) + ',' + (qT + ih2) + ' L' + lastHistX + ',' + (qT + ih2) + ' Z" fill="rgba(13,148,136,0.08)"/>';
  models.forEach(m => {
    const pts = [lastHistX + ',' + lastHistY].concat(m.fut.map((v, j) => xf(j) + ',' + y2(Math.max(0, v))));
    const isBest = (m === best);
    s2 += '<path class="fc-line" data-name="' + m.name + '" d="M' + pts.join(' L') + '" fill="none" stroke="' + (FC_COLORS[m.name] || '#333') + '" stroke-width="' + (isBest ? 3 : 1.5) + '"' + (isBest ? '' : ' stroke-dasharray="5,4" opacity="0.48"') + ' stroke-linejoin="round"/>';
  });
  s2 += '<path d="M' + hist2.map((r, i) => xh(i) + ',' + y2(r.v)).join(' L') + '" fill="none" stroke="#0f172a" stroke-width="2.2"/>';
  best.fut.forEach((v, j) => {
    s2 += '<circle cx="' + xf(j) + '" cy="' + y2(Math.max(0, v)) + '" r="3" fill="#fff" stroke="#0d9488" stroke-width="2"/>';
    if (horizon <= 10 || j % stepF === 0) s2 += '<text x="' + xf(j) + '" y="' + (y2(Math.max(0, v)) - 9) + '" font-size="10" fill="#0f766e" text-anchor="middle" font-weight="bold">' + (isQty ? Math.round(v) : fmtShort(v)) + '</text>';
  });

  const legend = '<div class="flex flex-wrap gap-2 mt-1">' +
    '<span class="text-xs flex items-center gap-1"><span class="inline-block w-6 h-0.5 bg-slate-800"></span>历史真实</span>' +
    models.map(m => '<button onclick="toggleFcLine(this,\'' + m.name + '\')" class="text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ' + (m === best ? 'border-teal-600 text-teal-700 font-bold' : 'border-slate-200 text-slate-500') + '"><span class="inline-block w-4 border-t-2 ' + (m === best ? '' : 'border-dashed') + '" style="border-color:' + (FC_COLORS[m.name] || '#333') + '"></span>' + m.name + '<span class="text-[10px] text-slate-400">' + m.wape.toFixed(1) + '%</span></button>').join('') + '</div>';

  fc0.innerHTML =
    '<div class="flex items-center gap-2 mb-1 mt-1"><span class="text-sm font-bold text-slate-700">① 回测验证</span><span class="text-[11px] text-slate-400">黑线为真实销量，越贴合的模型曲线越可靠</span></div>' +
    svgWrap(CW, H1, s1) +
    '<div class="flex items-center gap-2 mb-1 mt-5"><span class="text-sm font-bold text-slate-700">② 完整预测走势</span><span class="text-[11px] text-slate-400">未来 ' + horizon + ' 天逐日展开，粗实线为推荐模型</span></div>' +
    svgWrap(CW, H2, s2) + legend;
}
function toggleFcLine(btn, name) {
  const els = document.querySelectorAll('.fc-line[data-name="' + name + '"]');
  if (!els.length) return;
  const off = els[0].style.display === 'none';
  els.forEach(el => { el.style.display = off ? '' : 'none'; });
  btn.classList.toggle('opacity-40', !off);
}
function fmtShort(v) { return v >= 10000 ? (v / 10000).toFixed(1) + '万' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0); }
function futureDates(lastDate, n) {
  const out = [], d = new Date(lastDate);
  for (let i = 1; i <= n; i++) { d.setDate(d.getDate() + 1); out.push(d.toISOString().slice(0, 10)); }
  return out;
}

function renderFcFuture() {
  const { models, best, horizon, metric } = fcResult;
  const dates = futureDates(fcResult.series[fcResult.series.length - 1].date, horizon);
  const unit = metric === 'qty' ? '数量' : '金额(元)';
  document.getElementById('fc-future-head').innerHTML = '<tr><th class="px-3 py-2 text-left">日期</th>' +
    models.map(m => '<th class="px-3 py-2 text-right">' + m.name + '</th>').join('') +
    '<th class="px-3 py-2 text-right bg-teal-50">推荐(' + best.name + ')</th></tr>';
  document.getElementById('fc-future-body').innerHTML = dates.map((d, i) =>
    '<tr class="border-t"><td class="px-3 py-1.5">' + d + '</td>' +
    models.map(m => '<td class="px-3 py-1.5 text-right text-slate-600">' + (metric === 'qty' ? m.fut[i].toFixed(0) : fmt(m.fut[i])) + '</td>').join('') +
    '<td class="px-3 py-1.5 text-right font-bold bg-teal-50">' + (metric === 'qty' ? best.fut[i].toFixed(0) : fmt(best.fut[i])) + (metric === 'qty' ? '' : ' 元') + '</td></tr>'
  ).join('') +
  '<tr class="border-t-2 bg-teal-50"><td class="px-3 py-2 font-bold">合计(' + unit + ')</td>' +
  models.map(m => '<td class="px-3 py-2 text-right font-medium">' + (metric === 'qty' ? m.fut.reduce((a, b) => a + b, 0).toFixed(0) : fmt(m.fut.reduce((a, b) => a + b, 0))) + '</td>').join('') +
  '<td class="px-3 py-2 text-right font-bold text-teal-700">' + (metric === 'qty' ? best.fut.reduce((a, b) => a + b, 0).toFixed(0) : fmt(best.fut.reduce((a, b) => a + b, 0))) + '</td></tr>';
}
