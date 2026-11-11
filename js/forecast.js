/* ============================================================
 * 鲲鉴智策 · forecast.js
 * 职责：预测编排：序列构建、四模型分片训练与回测、最优模型推荐、未来预测明细
 * 依赖：models/*.js、metrics.js、charts/forecast-chart.js
 * ============================================================ */

// ================= 智能预测引擎 =================
function refreshFcSelects() {
  const names = [...new Set(db.records.map(r => r.customer).filter(Boolean))].sort();
  const prods = [...new Set(db.records.map(r => r.product).filter(Boolean))].sort();
  const fc = document.getElementById('fc-customer');
  const fp = document.getElementById('fc-product');
  if (fc) fc.innerHTML = '<option value="">全部客户</option>' + names.map(n => '<option>' + esc(n) + '</option>').join('');
  if (fp) fp.innerHTML = '<option value="">全部品名</option>' + prods.map(n => '<option>' + esc(n) + '</option>').join('');
}

// 构建按日聚合的时间序列（缺失日期补 0）
function buildFcSeries(metric, customer, product) {
  const map = {};
  db.records.forEach(r => {
    if (!r.date) return;
    if (customer && r.customer !== customer) return;
    if (product && r.product !== product) return;
    const v = metric === 'qty' ? (+r.qty || 0) : (r.qty || 0) * (r.price || 0);
    map[r.date] = (map[r.date] || 0) + v;
  });
  const keys = Object.keys(map).sort();
  if (keys.length < 2) return [];
  const out = [];
  let d = new Date(keys[0]), last = new Date(keys[keys.length - 1]);
  while (d <= last) {
    const ds = d.toISOString().slice(0, 10);
    out.push({ date: ds, v: +(map[ds] || 0) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ---------- 预测主流程 ----------
let fcResult = null;
function runForecast() {
  const metric = document.getElementById('fc-metric').value;
  const customer = document.getElementById('fc-customer').value;
  const product = document.getElementById('fc-product').value;
  const horizon = +document.getElementById('fc-horizon').value;
  const series = buildFcSeries(metric, customer, product);
  if (series.length < 20) return toast('历史数据不足（按日聚合不足 20 天），请先录入更多送货记录', false);
  const n = series.length, h = Math.max(5, Math.round(n * 0.2));
  const train = series.slice(0, n - h).map(r => r.v);
  const test = series.slice(n - h).map(r => r.v);
  const all = series.map(r => r.v);
  document.getElementById('fc-status').textContent = '样本 ' + n + ' 天（训练 ' + train.length + ' / 回测 ' + h + '）';
  document.getElementById('fc-result').classList.add('hidden');

  const models = [];
  const L = Math.min(SEQ_L, Math.max(14, train.length - 8));

  // ----- 1) DLinear / NLinear：闭式解，瞬时完成 -----
  function addDirect(name, cat, fit) {
    try {
      const m1 = fit(train); if (!m1) return;
      const preds = blockBacktest(m1, all, train.length, h, horizon, L);
      const m2 = fit(all);
      const fut = m2 ? m2.predict(all.slice(-L)).slice(0, horizon) : [];
      const mm = { name, cat, preds, fut, ...errMetrics(test, preds) };
      mm.p1 = w => (m2 ? m2.predict(w)[0] : 0);
      models.push(mm);
    } catch (e) { console.warn(name, e); }
  }
  addDirect('DLinear 分解线性', '深度时序 · 线性', t => dlinearFit(t, L, horizon, TREND_K, 1.0));
  addDirect('NLinear 归一线性', '深度时序 · 线性', t => nlinearFit(t, L, horizon, 1.0));

  // ----- 2) 轻量 TCN 训练（分片执行，UI 不冻结） -----
  const prog = document.getElementById('fc-progress-wrap'), bar = document.getElementById('fc-progress'),
        ptext = document.getElementById('fc-progress-text'), btn = document.getElementById('fc-run');
  prog.classList.remove('hidden'); btn.disabled = true; btn.classList.add('opacity-60');
  const TCN_EP = 70, TCN_N = 3, TCN_C = 8, LSTM_EP = 920;
  const totalEp = TCN_EP * TCN_N + LSTM_EP;
  let doneEp = 0;
  const setProg = txt => { bar.style.width = (doneEp / totalEp * 100).toFixed(0) + '%'; ptext.textContent = txt; };

  const tcnSamples = makeSamples(train, L, horizon, 1);
  const tcnNets = [];
  const tcnEnsPredict = w => {
    let out = null;
    for (const net of tcnNets) {
      const p = tcnPredict(net, w);
      out = out ? out.map((v, i) => v + p[i]) : p;
    }
    return out ? out.map(v => v / tcnNets.length) : [];
  };
  function trainNextTcn() {
    if (tcnNets.length >= TCN_N) {
      try {
        const preds = blockBacktest({ predict: tcnEnsPredict }, all, train.length, h, horizon, L);
        const fut = tcnEnsPredict(all.slice(-L)).slice(0, horizon);
        const mm = { name: '轻量 TCN', cat: '深度时序 · 3 膨胀子网', preds, fut, ...errMetrics(test, preds) };
        mm.p1 = w => tcnEnsPredict(w)[0];
        models.push(mm);
      } catch (e) { console.warn('TCN', e); }
      trainLstm();
      return;
    }
    const k = tcnNets.length;
    const net = tcnCreate(20250601 + k * 7919, TCN_C, L, horizon);
    setProg('轻量 TCN 训练 ' + (k + 1) + '/' + TCN_N + ' ...');
    trainTcnAsync(net, tcnSamples, TCN_EP, 0.03, (ep, loss) => {
      doneEp++;
      setProg('轻量 TCN 训练 ' + (k + 1) + '/' + TCN_N + ' · epoch ' + ep + '/' + TCN_EP + ' · loss=' + loss.toFixed(4));
    }, () => { tcnNets.push(net); trainNextTcn(); });
  }
  trainNextTcn();

  // ----- 3) LSTM 三子网集成 -----
  function trainLstm() {
    const W = 7;
    const lo = Math.min(...train), hi = Math.max(...train), span = (hi - lo) || 1;
    const norm = v => (v - lo) / span;
    const win = train.map(norm);
    let samples = [];
    for (let i = W; i < win.length; i++) samples.push([win.slice(i - W, i), win[i]]);
    if (samples.length > 800) samples = samples.filter((_, i) => i % Math.ceil(samples.length / 800) === 0);
    const ENS = [{ H: 10, ep: 300, lr: 0.015 }, { H: 12, ep: 320, lr: 0.013 }, { H: 8, ep: 300, lr: 0.022 }];
    const nets = [], lossHist = [];
    let ci = 0, ep = 0, cur = null;
    (function trainLoop() {
      if (ci >= ENS.length) {
        prog.classList.add('hidden'); btn.disabled = false; btn.classList.remove('opacity-60');
        const seqs = nets.map(() => train.slice(-W).map(norm)), lp = [];
        for (let i = 0; i < h; i++) {
          let ysum = 0;
          nets.forEach((m, mi) => {
            const yhat = lstmForward(m, seqs[mi].slice(-W)).y;
            ysum += yhat; seqs[mi].push(Math.max(0, Math.min(1, yhat)));
          });
          lp.push(Math.max(0, (ysum / nets.length) * span + lo));
        }
        const futSeqs = nets.map(() => all.slice(-W).map(norm)), fut = [];
        for (let i = 0; i < horizon; i++) {
          let ysum = 0;
          nets.forEach((m, mi) => {
            const yhat = lstmForward(m, futSeqs[mi].slice(-W)).y;
            ysum += yhat; futSeqs[mi].push(Math.max(0, Math.min(1, yhat)));
          });
          fut.push(Math.max(0, (ysum / nets.length) * span + lo));
        }
        const lstmModel = { name: 'LSTM 集成模型', cat: '深度时序 · 3 子网', preds: lp, fut, ...errMetrics(test, lp) };
        lstmModel.p1 = w => {
          const xs = w.slice(-W).map(norm);
          let s = 0; for (const m of nets) s += lstmForward(m, xs).y;
          return Math.max(0, s / nets.length * span + lo);
        };
        models.push(lstmModel);
        const ensBounds = ENS.reduce((acc, c) => { acc.push((acc.length ? acc[acc.length - 1] : 0) + c.ep); return acc; }, []);
        finishForecast(models, series, horizon, metric, { model: nets, lo, span, W, all, h, test, lossHist, epochs: totalEp, ensBounds, models });
        return;
      }
      if (!cur) { cur = lstmCreate(ENS[ci].H, 20250601 + ci * 7919); ep = 0; }
      const cfg = ENS[ci];
      const lr = cfg.lr * (1 - ep / cfg.ep * 0.85);
      let lsum = 0;
      for (const [x, y] of samples) lsum += lstmTrainStep(cur, x, y, lr);
      ep++; doneEp++;
      lossHist.push(lsum / samples.length);
      setProg('LSTM 集成训练 ' + (ci + 1) + '/' + ENS.length + ' · epoch ' + ep + '/' + cfg.ep + ' · loss=' + (lsum / samples.length).toFixed(5));
      if (ep < cfg.ep) { setTimeout(trainLoop, 0); return; }
      nets.push(cur); cur = null; ci++;
      setTimeout(trainLoop, 0);
    })();
  }
}

function finishForecast(models, series, horizon, metric, xai) {
  // 推荐模型（WAPE 最小；小样本、含零值日时比 MAPE 更稳健）
  let best = models[0];
  for (const m of models) if (m.wape < best.wape) best = m;
  if (xai) xai.pred1 = best.p1 || null;
  fcResult = { models, best, series, horizon, metric, xai: xai || null };
  // 模型表
  document.getElementById('fc-model-table').innerHTML = models.map(m =>
    '<tr class="border-t' + (m === best ? ' bg-teal-50' : '') + '">' +
    '<td class="px-3 py-2 font-medium">' + m.name + '</td>' +
    '<td class="px-3 py-2 text-xs text-slate-500">' + m.cat + '</td>' +
    '<td class="px-3 py-2 text-right">' + m.mae.toFixed(2) + '</td>' +
    '<td class="px-3 py-2 text-right">' + m.rmse.toFixed(2) + '</td>' +
    '<td class="px-3 py-2 text-right">' + m.wape.toFixed(1) + '</td>' +
    '<td class="px-3 py-2 text-center">' + (m === best ? '<span class="px-2 py-0.5 rounded-full text-xs bg-teal-600 text-white">★ 最优</span>' : '') + '</td></tr>'
  ).join('');
  document.getElementById('fc-result').classList.remove('hidden');
  drawFcChart();
  renderFcFuture();
  if (xai) { drawModelCharts(); renderXAI(); }
  document.getElementById('fc-export-btn').classList.remove('hidden');
  document.getElementById('fc-best-note').textContent = '综合 WAPE 推荐模型：' + best.name;
  toast('预测完成，推荐模型：' + best.name);
}

function exportForecast() {
  if (!fcResult) return;
  const { models, best, series, horizon, metric } = fcResult;
  const dates = futureDates(series[series.length - 1].date, horizon);
  const head = ['日期', ...models.map(m => m.name), '推荐(' + best.name + ')'];
  const aoa = [
    ['鲲鉴智策 · 智慧水产 智能销量预测报告'], ['模型对比（回测后 20% 数据）'],
    ["模型","类别","MAE","RMSE","WAPE(%)"],
    ...models.map(m => [m.name, m.cat, +m.mae.toFixed(2), +m.rmse.toFixed(2), +m.wape.toFixed(1)]),
    [], ['未来 ' + horizon + ' 天预测（' + (metric === 'qty' ? '数量' : '金额') + '）'], head,
    ...dates.map((d, i) => [d, ...models.map(m => +m.fut[i].toFixed(2)), +best.fut[i].toFixed(2)])
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, '预测报告');
  downloadBlob(writeWorkbook(wb), '智能预测报告_' + new Date().toISOString().slice(0, 10) + '.xlsx', (m, bad) => toast(m, !bad));
}
