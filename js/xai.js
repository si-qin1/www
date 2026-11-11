/* ============================================================
 * 鲲鉴智策 · xai.js
 * 职责：可解释性引擎：精确 Shapley 归因、时间敏感度、星期效应、解读文字与导出
 * 依赖：charts/xai-charts.js、forecast.js
 * ============================================================ */

// ================= 预测解释与归因（SHAP 精确 Shapley / 敏感度 / 周期效应 / 置信带） =================
const FACT8 = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
const DOW_NM = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 精确 Shapley 值：特征=最近 7 天销量，基线=窗口均值；对被推荐模型做统一归因 */
function shapCompute(pf, winRaw) {
  const W = winRaw.length;
  const base = winRaw.reduce((a, b) => a + b, 0) / W;
  const f = set => {
    const xs = winRaw.slice();
    for (let i = 0; i < W; i++) if (!set.has(i)) xs[i] = base;
    return pf(xs);
  };
  const phi = new Array(W).fill(0);
  for (let i = 0; i < W; i++) {
    const others = [];
    for (let j = 0; j < W; j++) if (j !== i) others.push(j);
    for (let mask = 0; mask < (1 << (W - 1)); mask++) {
      const S = new Set();
      for (let k = 0; k < W - 1; k++) if (mask & (1 << k)) S.add(others[k]);
      const wgt = FACT8[S.size] * FACT8[W - S.size - 1] / FACT8[W];
      const S2 = new Set(S); S2.add(i);
      phi[i] += wgt * (f(S2) - f(S));
    }
  }
  const full = new Set(); for (let i = 0; i < W; i++) full.add(i);
  return { phi, base: f(new Set()), out: f(full) };
}

/** 时间敏感度：中心差分梯度（∂y/∂x），对被推荐模型统一计算 */
function saliencyCompute(pf, winRaw) {
  const W = winRaw.length, out = [];
  for (let i = 0; i < W; i++) {
    const eps = Math.max(1, Math.abs(winRaw[i]) * 0.03);
    const a = winRaw.slice(), b = winRaw.slice();
    a[i] += eps; b[i] -= eps;
    out.push((pf(a) - pf(b)) / (2 * eps));
  }
  return out;
}

function dowEffect(series) {
  const sum = {}, cnt = {};
  series.forEach(r => { const w = new Date(r.date + 'T00:00:00Z').getUTCDay(); sum[w] = (sum[w] || 0) + r.v; cnt[w] = (cnt[w] || 0) + 1; });
  const avg = [0, 1, 2, 3, 4, 5, 6].map(w => cnt[w] ? sum[w] / cnt[w] : 0);
  const wd = [1, 2, 3, 4, 5].map(w => avg[w]).filter(v => v > 0);
  const we = [0, 6].map(w => avg[w]).filter(v => v > 0);
  const wdA = wd.length ? wd.reduce((a, b) => a + b, 0) / wd.length : 0;
  const weA = we.length ? we.reduce((a, b) => a + b, 0) / we.length : 0;
  return { avg, weekendFactor: wdA > 0 ? weA / wdA : 1 };
}

// ---------- 解读文字 + 建议报告 ----------
function renderXAI() {
  const X = fcResult; if (!X || !X.xai) return;
  const { pred1, h, test } = X.xai;
  const W = 7;
  const winRaw = X.series.slice(-W).map(r => r.v);
  const dates = X.series.slice(-W).map(r => r.date.slice(5));
  const winDates = X.series.slice(-W).map(r => r.date);
  const sh = shapCompute(pred1, winRaw);
  const sal = saliencyCompute(pred1, winRaw);
  const dow = dowEffect(X.series);
  const btDates = X.series.slice(-h).map(r => r.date);
  X.xai.data = { sh, sal, dow, winRaw, dates, winDates, test, preds: X.best.preds, best: X.best, btDates, salMax: sal.reduce((mi, v, i, a) => Math.abs(v) > Math.abs(a[mi]) ? i : mi, 0) };
  const isQty = X.metric === 'qty';
  const fmtV = v => isQty ? v.toFixed(0) : fmt(v) + ' 元';
  // 可加性校验
  const addErr = Math.abs(sh.base + sh.phi.reduce((a, b) => a + b, 0) - sh.out) / Math.max(Math.abs(sh.out), 1e-9) * 100;
  // 趋势
  const futMean = X.best.fut.reduce((a, b) => a + b, 0) / X.best.fut.length;
  const last7Mean = winRaw.reduce((a, b) => a + b, 0) / W;
  const trendPct = last7Mean > 0 ? (futMean - last7Mean) / last7Mean * 100 : 0;
  // SHAP 排序
  const phiIdx = sh.phi.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  const pos = phiIdx.filter(o => o.p > 0), neg = phiIdx.filter(o => o.p < 0).reverse();
  const totalAbs = sh.phi.reduce((s, p) => s + Math.abs(p), 0) || 1;
  // 建议列表（纯文本，供导出复用）
  const advice = [];
  advice.push('【核心结论】推荐模型「' + X.best.name + '」（回测 WAPE ' + X.best.wape.toFixed(1) + '%）预测未来 ' + X.horizon + ' 天日均 ' + fmtV(futMean) + '，较近 7 天实际均值' + (trendPct >= 0 ? '上升 ' : '下降 ') + Math.abs(trendPct).toFixed(1) + '%。');
  if (pos.length) advice.push('【主要驱动】' + pos.slice(0, 2).map(o => dates[o.i] + '（' + DOW_NM[new Date(winDates[o.i] + 'T00:00:00Z').getUTCDay()] + '）销量贡献 +' + fmtV(o.p)).join('；') + '，合计解释 ' + (pos.slice(0, 2).reduce((s, o) => s + o.p, 0) / totalAbs * 100).toFixed(0) + '% 的预测偏离。');
  if (neg.length) advice.push('【抑制因素】' + dates[neg[0].i] + ' 的低销量拉低预测 −' + fmtV(Math.abs(neg[0].p)) + '。');
  advice.push('【模型依赖】' + (() => {
    const i = X.xai.data.salMax;
    const when = i === 6 ? '昨日（' + dates[i] + '）' : (6 - i) + ' 天前（' + dates[i] + '）';
    return '模型对 ' + when + ' 的销量最敏感，' + (i >= 4 ? '近因效应强，请及时录入最新送货单以保持预测精度。' : '长记忆特征明显，历史规律权重较高。');
  })());
  advice.push('【周期效应】' + (dow.weekendFactor >= 1.1 ? '周末日均约为工作日的 ' + dow.weekendFactor.toFixed(2) + ' 倍，周末效应显著，建议周五前完成周末备货。' : dow.weekendFactor <= 0.9 ? '工作日销量反而高于周末（周末/工作日 = ' + dow.weekendFactor.toFixed(2) + '），属 B 端送货型业务特征。' : '各星期销量分布均衡，无明显周末效应。'));
  if (trendPct >= 5) advice.push('【备货建议】预测呈上升态势，建议提前 1-2 天向供应商加单，优先保障近期贡献度高的品名库存。');
  else if (trendPct <= -5) advice.push('【备货建议】预测呈回落态势，建议控制采购节奏、降低易腐水产库存积压风险，同时跟进客户回流。');
  else advice.push('【备货建议】预测整体平稳，按现有补货节奏即可，关注周末窗口的临时加单需求。');
  advice.push('【精度提示】' + (X.best.wape <= 10 ? '推荐模型回测 WAPE 为 ' + X.best.wape.toFixed(1) + '%，精度较高，可直接用于订货决策。' : X.best.wape <= 20 ? '推荐模型回测 WAPE 为 ' + X.best.wape.toFixed(1) + '%，属可接受水平，建议结合经验微调。' : '当前数据波动较大（回测 WAPE ' + X.best.wape.toFixed(1) + '%），预测仅供趋势参考，请谨慎用于大额订货。'));
  advice.push('【归因校验】SHAP 可加性校验误差 ' + addErr.toFixed(2) + '%（基线 ' + fmtV(sh.base) + ' + 各日贡献之和 = 预测值 ' + fmtV(sh.out) + '），分解结果可信。');
  X.xai.data.advice = advice;
  // 渲染摘要卡
  const icons = ['💡', '🚀', '⬇️', '🧩', '📆', '📦', '⚠️', '✅'];
  document.getElementById('xai-summary').innerHTML =
    '<div class="rounded-xl p-4" style="background:linear-gradient(135deg,#f0fdfa 0%,#eff6ff 100%);border:1px solid #99f6e4;">' +
    '<div class="flex items-center gap-2 mb-2"><span class="text-lg">🧠</span><b class="text-sm text-teal-800">AI 预测解读报告</b>' +
    '<span class="text-xs px-2 py-0.5 rounded-full bg-teal-600 text-white">SHAP 精确归因</span>' +
    '<span class="text-xs text-slate-400">基线 = 近7天均值 · 特征窗口 7 日</span></div>' +
    '<ul class="space-y-1.5 text-xs leading-relaxed text-slate-700">' +
    advice.map((a, i) => '<li class="flex gap-2"><span>' + (icons[i] || '•') + '</span><span>' + a.replace(/\【(.*?)\】/, '<b class="text-teal-700">【$1】</b>') + '</span></li>').join('') +
    '</ul></div>';
  // 置信带注释
  document.getElementById('xai-bt-note').textContent = '推荐模型「' + X.best.name + '」· RMSE ' + X.best.rmse.toFixed(2) + ' · 阴影带 = 预测 ±1×RMSE';
  // 四张图
  drawShapChart(); drawSaliencyChart(); drawDowChart(); drawBacktestChart();
}

// ---------- 导出解读报告 Excel ----------
function exportXAI() {
  if (!fcResult || !fcResult.xai || !fcResult.xai.data) return toast('请先完成一次预测', false);
  const d = fcResult.xai.data, X = fcResult;
  const isQty = X.metric === 'qty';
  const wb = XLSX.utils.book_new();
  const used = new Set();
  const totalAbs = d.sh.phi.reduce((s, p) => s + Math.abs(p), 0) || 1;
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['SHAP 特征贡献（精确 Shapley 值）'],
    ['推荐模型', X.best.name, '回测WAPE(%)', +X.best.wape.toFixed(2)],
    ['基线值(均值)', +d.sh.base.toFixed(2), '归因后预测值', +d.sh.out.toFixed(2)],
    [],
    ['日期', '星期', '当日' + (isQty ? '销量' : '金额'), 'SHAP贡献', '占总贡献%'],
    ...d.winDates.map((dt, i) => [dt, DOW_NM[new Date(dt + 'T00:00:00Z').getUTCDay()], +d.winRaw[i].toFixed(2), +d.sh.phi[i].toFixed(2), +(Math.abs(d.sh.phi[i]) / totalAbs * 100).toFixed(1)])
  ]);
  ws1['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, safeSheetName('SHAP归因', used));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['时间敏感度（梯度）'], ['相对天数', '日期', '敏感度'],
    ...d.sal.map((v, i) => [6 - i, d.winDates[i], +v.toFixed(3)]),
    [], ['星期周期效应'], ['星期', '日均' + (isQty ? '销量' : '金额')],
    ...order.map(dw => [DOW_NM[dw], +d.dow.avg[dw].toFixed(2)]),
    [], ['周末/工作日系数', +d.dow.weekendFactor.toFixed(2)]
  ]);
  ws2['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, safeSheetName('敏感度与周期', used));
  const ws3 = XLSX.utils.aoa_to_sheet([
    ['回测对比（留出后 20% 数据）'], ['日期', '实际值', '预测值', '误差', '误差率%'],
    ...d.test.map((v, i) => [d.btDates[i], +v.toFixed(2), +d.preds[i].toFixed(2), +(v - d.preds[i]).toFixed(2), v > 0 ? +(((v - d.preds[i]) / v) * 100).toFixed(1) : 0])
  ]);
  ws3['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, safeSheetName('回测对比', used));
  const ws4 = XLSX.utils.aoa_to_sheet([['AI 预测解读与建议', ''], [], ...d.advice.map(a => [a])]);
  ws4['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, ws4, safeSheetName('解读与建议', used));
  downloadBlob(writeWorkbook(wb), '预测解读报告_' + new Date().toISOString().slice(0, 10) + '.xlsx', (m, bad) => toast(m, !bad));
}

// ---------- 保存归因长图 PNG ----------
function saveXAIPng() {
  if (!fcResult || !fcResult.xai || !fcResult.xai.data) return toast('请先完成一次预测', false);
  const items = [
    { cv: document.getElementById('xai-shap'), cap: '① SHAP 特征贡献分解（红=推高 / 绿=拉低）' },
    { cv: document.getElementById('xai-saliency'), cap: '② 时间敏感度（★为模型最依赖的历史日）' },
    { cv: document.getElementById('xai-dow'), cap: '③ 星期周期效应' },
    { cv: document.getElementById('xai-backtest'), cap: '④ 回测置信区间' }
  ];
  if (items.some(it => !it.cv._w)) return toast('图表尚未渲染完成，请稍候', false);
  const pad = 26, headH = 118, capH = 30, gap = 16, footH = 64;
  const W2 = Math.max(...items.map(it => it.cv._w)) + pad * 2;
  const H2 = headH + items.reduce((s, it) => s + capH + it.cv._h + gap, 0) + footH;
  const out = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  out.width = W2 * dpr; out.height = H2 * dpr;
  const ctx = out.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W2, H2);
  // 头部
  const hg = ctx.createLinearGradient(0, 0, W2, headH);
  hg.addColorStop(0, '#02182b'); hg.addColorStop(0.55, '#0b4f6c'); hg.addColorStop(1, '#0d9488');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W2, headH);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('鲲鉴智策 · 预测解读与 SHAP 归因报告', pad, 44);
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#99f6e4';
  ctx.fillText('推荐模型：' + fcResult.best.name + '　·　预测指标：' + (fcResult.metric === 'qty' ? '销售数量' : '销售金额') + '　·　预测未来 ' + fcResult.horizon + ' 天　·　回测 WAPE ' + fcResult.best.wape.toFixed(1) + '%', pad, 70);
  ctx.fillText('生成时间：' + new Date().toLocaleString('zh-CN'), pad, 92);
  let y = headH;
  items.forEach(it => {
    ctx.fillStyle = '#0f766e'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(it.cap, pad, y + 20); y += capH;
    ctx.drawImage(it.cv, pad, y, it.cv._w, it.cv._h); y += it.cv._h + gap;
  });
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif';
  ctx.fillText('由鲲鉴智策·可解释时序预测与决策平台自动生成　|　SHAP（SHapley Additive exPlanations）博弈论归因 · 精确 Shapley 值', pad, H2 - 24);
  out.toBlob(function (blob) {
    downloadBlob(blob, '预测解读归因图_' + new Date().toISOString().slice(0, 10) + '.png', (m, bad) => toast(m, !bad));
  }, 'image/png');
}

// 导出预测 Excel
