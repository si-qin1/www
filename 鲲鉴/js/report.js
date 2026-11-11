/* ============================================================
 * 鲲鉴智策 · report.js
 * 职责：经营分析报告：趋势/畅销品/客户贡献/备货建议生成、渲染与导出
 * 依赖：store.js、utils.js、vendor/xlsx.bundle.js
 * ============================================================ */

// ================= 经营分析报告 =================
let reportData = null;
function genReport() {
  if (!db.records.length) return toast('暂无送货数据', false);
  const recs = db.records;
  const amt = r => (r.qty || 0) * (r.price || 0);
  // 月度聚合
  const monthMap = {};
  recs.forEach(r => { const m = (r.date || '').slice(0, 7); if (!m) return;
    monthMap[m] = (monthMap[m] || 0) + amt(r); });
  const months = Object.keys(monthMap).sort();
  const lastM = months[months.length - 1], prevM = months[months.length - 2];
  const cur = monthMap[lastM] || 0, prev = monthMap[prevM] || 0;
  const momPct = prev > 0 ? (cur - prev) / prev * 100 : null;
  // 近30日均额
  const ds = [...new Set(recs.map(r => r.date))].sort();
  const last30 = ds.slice(-30);
  const d30set = {}; last30.forEach(d => d30set[d] = 1);
  const amt30 = recs.filter(r => d30set[r.date]).reduce((s, r) => s + amt(r), 0);
  // TOP5 品名
  const prodMap = {};
  recs.forEach(r => prodMap[r.product] = (prodMap[r.product] || 0) + amt(r));
  const top5 = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // 客户贡献
  const custMap = {};
  recs.forEach(r => custMap[r.customer] = (custMap[r.customer] || 0) + amt(r));
  const custs = Object.entries(custMap).sort((a, b) => b[1] - a[1]);
  const total = recs.reduce((s, r) => s + amt(r), 0);
  // 星期规律
  const dowMap = {}; const dowCnt = {};
  recs.forEach(r => { const w = new Date(r.date + 'T00:00:00Z').getUTCDay();
    dowMap[w] = (dowMap[w] || 0) + amt(r); dowCnt[w] = (dowCnt[w] || 0) + 1; });
  const dowAvg = [0,1,2,3,4,5,6].map(w => dowCnt[w] ? dowMap[w] / dowCnt[w] : 0);
  const bestDow = dowAvg.indexOf(Math.max(...dowAvg));
  const dowNames = ['周日','周一','周二','周三','周四','周五','周六'];
  // 智能结论
  const tips = [];
  if (momPct !== null) tips.push(momPct >= 0
    ? `本月销售额较上月<b class="text-emerald-600">增长 ${momPct.toFixed(1)}%</b>，业务处于上升通道，建议按当前备货节奏适度扩大采购量。`
    : `本月销售额较上月<b class="text-rose-600">下降 ${Math.abs(momPct).toFixed(1)}%</b>，建议结合智能预测排查需求波动原因，优化进货计划避免积压。`);
  tips.push(`最畅销品为<b>${top5[0][0]}</b>（累计 ${(top5[0][1] / 10000).toFixed(1)} 万元），建议保持稳定货源并优先锁价。`);
  tips.push(`${custs[0][0]} 贡献了总销售额的 <b>${(custs[0][1] / total * 100).toFixed(1)}%</b>，是核心大客户，建议重点维护。`);
  tips.push(`${dowNames[bestDow]}是平均销售最高的日子，建议在<b>${dowNames[(bestDow + 6) % 7]}</b>提前完成备货与配送调度。`);
  reportData = { months, monthMap, cur, prev, momPct, amt30, top5, custs, total, dowAvg, tips, lastM };
  renderReport();
  document.getElementById('rp-export-btn').classList.remove('hidden');
  toast('分析报告已生成');
}

function renderReport() {
  const R = reportData, fmtW = v => (v / 10000).toFixed(1);
  const momHtml = R.momPct === null ? '<span class="text-slate-400">—</span>' :
    `<span class="${R.momPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${R.momPct >= 0 ? '▲' : '▼'} ${Math.abs(R.momPct).toFixed(1)}%</span>`;
  // 月度柱状图
  const maxY = Math.max(...R.months.map(m => R.monthMap[m])) || 1;
  const bars = R.months.map((m, i) => {
    const v = R.monthMap[m], hh = Math.max(4, v / maxY * 130);
    const col = i === R.months.length - 1 ? 'url(#gradBar)' : '#99f6e4';
    return `<div class="flex flex-col items-center gap-1 flex-1 min-w-[52px]">
      <span class="text-[10px] text-slate-500">${fmtW(v)}万</span>
      <div style="height:${hh}px;width:70%;background:${col};border-radius:6px 6px 2px 2px" class="shadow-sm"></div>
      <span class="text-[10px] text-slate-400">${m.slice(5)}月</span></div>`;
  }).join('');
  const maxTop = R.top5[0][1] || 1;
  const topHtml = R.top5.map(([n, v], i) => `<div class="flex items-center gap-2 mb-2">
      <span class="w-5 h-5 rounded-full text-[11px] flex items-center justify-center text-white flex-shrink-0" style="background:${['#0d9488','#14b8a6','#2dd4bf','#5eead4','#99f6e4'][i]}">${i + 1}</span>
      <span class="text-xs w-24 flex-shrink-0 truncate" title="${esc(n)}">${esc(n)}</span>
      <div class="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden"><div style="width:${v / maxTop * 100}%;height:100%;background:linear-gradient(90deg,#14b8a6,#38bdf8);border-radius:9999px"></div></div>
      <span class="text-xs text-slate-600 w-16 text-right">${fmtW(v)}万</span></div>`).join('');
  const custHtml = R.custs.map(([n, v]) => `<div class="flex items-center gap-2 mb-2">
      <span class="text-xs w-40 flex-shrink-0 truncate" title="${esc(n)}">${esc(n)}</span>
      <div class="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden"><div style="width:${v / R.total * 100}%;height:100%;background:linear-gradient(90deg,#0ea5e9,#818cf8);border-radius:9999px"></div></div>
      <span class="text-xs text-slate-600 w-14 text-right">${(v / R.total * 100).toFixed(1)}%</span></div>`).join('');
  const dowMax = Math.max(...R.dowAvg) || 1;
  const dowHtml = ['周日','周一','周二','周三','周四','周五','周六'].map((n, w) => {
    const v = R.dowAvg[w], hh = Math.max(3, v / dowMax * 70);
    return `<div class="flex flex-col items-center gap-1 flex-1">
      <div style="height:${hh}px;width:60%;background:${w === R.dowAvg.indexOf(Math.max(...R.dowAvg)) ? '#0ea5e9' : '#bae6fd'};border-radius:5px 5px 2px 2px"></div>
      <span class="text-[10px] text-slate-400">${n}</span></div>`;
  }).join('');
  document.getElementById('report-content').innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    <div class="bg-white rounded-xl p-4 shadow-sm"><p class="text-xs text-slate-400 mb-1">${R.lastM} 销售额</p>
      <p class="text-xl font-bold text-teal-600">${fmt(R.cur)}</p><p class="text-xs mt-1">环比 ${momHtml}</p></div>
    <div class="bg-white rounded-xl p-4 shadow-sm"><p class="text-xs text-slate-400 mb-1">上月销售额</p>
      <p class="text-xl font-bold text-slate-700">${fmt(R.prev)}</p><p class="text-xs mt-1 text-slate-400">${R.prevM || '—'}</p></div>
    <div class="bg-white rounded-xl p-4 shadow-sm"><p class="text-xs text-slate-400 mb-1">近 30 天日均</p>
      <p class="text-xl font-bold text-sky-600">${fmt(R.amt30 / 30)}</p><p class="text-xs mt-1 text-slate-400">按有记录日分布</p></div>
    <div class="bg-white rounded-xl p-4 shadow-sm"><p class="text-xs text-slate-400 mb-1">累计总销售额</p>
      <p class="text-xl font-bold text-slate-700">${fmtW(R.total)} 万</p><p class="text-xs mt-1 text-slate-400">全部 ${db.records.length} 笔</p></div>
  </div>
  <div class="grid md:grid-cols-2 gap-4 mb-4">
    <div class="bg-white rounded-xl p-5 shadow-sm">
      <h4 class="font-bold text-sm mb-3">📅 月度销售趋势（万元）</h4>
      <div class="flex items-end gap-2 h-48">${bars}</div>
    </div>
    <div class="bg-white rounded-xl p-5 shadow-sm">
      <h4 class="font-bold text-sm mb-3">🔥 畅销品名 TOP5（销售额）</h4>
      ${topHtml}
      <h4 class="font-bold text-sm mt-5 mb-3">🗓 星期销售规律（日均）</h4>
      <div class="flex items-end gap-2 h-24">${dowHtml}</div>
    </div>
  </div>
  <div class="grid md:grid-cols-2 gap-4 mb-4">
    <div class="bg-white rounded-xl p-5 shadow-sm">
      <h4 class="font-bold text-sm mb-3">🤝 客户贡献度</h4>${custHtml}
    </div>
    <div class="bg-white rounded-xl p-5 shadow-sm" style="background:linear-gradient(135deg,#ffffff,#f0fdfa)">
      <h4 class="font-bold text-sm mb-3">💡 智能经营建议</h4>
      <ul class="space-y-2.5 text-sm text-slate-600 leading-relaxed">
        ${R.tips.map(t => '<li class="flex gap-2"><span class="text-teal-500">◆</span><span>' + t + '</span></li>').join('')}
      </ul>
    </div>
  </div>`;
}

function exportReport() {
  if (!reportData) return;
  const R = reportData;
  const aoa = [
    ['鲲鉴智策 · 智慧水产 经营分析报告'], ['生成时间：' + new Date().toLocaleString('zh-CN')], [],
    ['月份', '销售额(元)'], ...R.months.map(m => [m, +R.monthMap[m].toFixed(2)]), [],
    ['畅销品名 TOP5', '销售额(元)'], ...R.top5.map(([n, v]) => [n, +v.toFixed(2)]), [],
    ['客户', '销售额(元)', '占比(%)'], ...R.custs.map(([n, v]) => [n, +v.toFixed(2), +(v / R.total * 100).toFixed(1)]), [],
    ['智能建议'], ...R.tips.map(t => [t.replace(/<[^>]+>/g, '')])
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, '经营分析报告');
  downloadBlob(writeWorkbook(wb), '经营分析报告_' + new Date().toISOString().slice(0, 10) + '.xlsx', (m, bad) => toast(m, !bad));
}
