/* ============================================================
 * 鲲鉴智策 · models/metrics.js
 * 职责：评估与回测：MAE/RMSE/MAPE/WAPE 计算、样本构造、分块滚动回测
 * 依赖：无（纯函数）
 * ============================================================ */

// ---------- 直接多步模型的回测 / 未来预测 ----------
function makeSamples(data, L, H, stride) {
  const out = [];
  for (let s = L; s + H <= data.length; s += stride) out.push({ x: data.slice(s - L, s), y: data.slice(s, s + H) });
  return out;
}
function blockBacktest(model, allVals, startIdx, h, H, L) {
  const out = [];
  for (let s = startIdx; s < startIdx + h; s += H) {
    const win = allVals.slice(Math.max(0, s - L), s);
    const p = model.predict(win);
    for (let i = 0; i < H && out.length < h; i++) out.push(p[i]);
  }
  return out;
}

function errMetrics(actual, pred) {
  let mae = 0, rmse = 0, mape = 0, cnt = 0, sumA = 0, sumE = 0;
  for (let i = 0; i < actual.length; i++) {
    const e = Math.abs(actual[i] - pred[i]);
    mae += e; rmse += e * e; sumA += Math.abs(actual[i]); sumE += e;
    const den = Math.max(Math.abs(actual[i]), 1e-6);
    if (Math.abs(actual[i]) > 1e-6) { mape += Math.abs((actual[i] - pred[i]) / den); cnt++; }
  }
  mae /= actual.length; rmse = Math.sqrt(rmse / actual.length);
  mape = cnt ? mape / cnt * 100 : 0;
  const wape = sumA > 0 ? sumE / sumA * 100 : 0;
  return { mae, rmse, mape, wape };
}
