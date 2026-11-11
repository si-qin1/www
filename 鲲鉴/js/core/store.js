/* ============================================================
 * 鲲鉴智策 · core/store.js
 * 职责：数据层：localStorage 读写、演示数据生成、记录唯一 ID
 * 依赖：无
 * ============================================================ */

// ================= 数据存储 =================
const KEY = 'bill_system_v2';
let db = loadData();

function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.records) return d;
  } catch(e) {}
  return { records: demoData(), customers: [
    {id: id(), name: '鲜港汇水产批发(深圳)有限公司', contact: '陈经理', phone: '137****2266', note: '批发大户，日结'},
    {id: id(), name: '蓝海餐饮供应链(深圳)有限公司', contact: '林采购', phone: '158****0921', note: '连锁餐饮，月结'},
    {id: id(), name: '湾仔渔市贸易行', contact: '何老板', phone: '139****7754', note: '渔市档口'},
  ]};
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function demoData() {
  // 内置演示数据：确定性生成约 120 天 / 500 条水产送货记录（可「清空全部数据」删除）
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(20250601);
  const products = [
    { n: '南美白对虾', spec: '30-40头/斤', u: '斤', p: 28, base: 90 },
    { n: '鲜活鲈鱼',   spec: '0.6-0.8斤/条', u: '斤', p: 22, base: 55 },
    { n: '基围虾',     spec: '50-60头/斤', u: '斤', p: 32, base: 45 },
    { n: '大黄花鱼',   spec: '1-1.2斤/条', u: '斤', p: 19, base: 38 },
    { n: '花蟹',       spec: '三母两公', u: '斤', p: 65, base: 16 },
    { n: '梭子蟹',     spec: '半斤以上', u: '斤', p: 58, base: 14 },
    { n: '花甲',       spec: '中规格', u: '斤', p: 9.5, base: 70 },
    { n: '蛏子',       spec: '中规格', u: '斤', p: 16, base: 30 },
    { n: '带冰扇贝',   spec: '6-7cm', u: '箱', p: 120, base: 6 },
    { n: '小龙虾',     spec: '4-6钱', u: '斤', p: 25, base: 40 },
  ];
  const customers = ['鲜港汇水产批发(深圳)有限公司', '蓝海餐饮供应链(深圳)有限公司', '湾仔渔市贸易行'];
  const rows = [];
  let no = 81200;
  const start = new Date(Date.UTC(2025, 5, 1)), endD = new Date(Date.UTC(2025, 8, 28));
  let dayIdx = 0;
  for (let d = new Date(start); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    const weekend = (dow === 5 || dow === 6) ? 1.28 : (dow === 0 ? 1.12 : 1);
    const m = d.getUTCMonth() + 1;
    const season = m === 6 ? 1.0 : m === 7 ? 1.14 : m === 8 ? 1.2 : 1.08; // 夏季旺季
    const trend = 1 + dayIdx / 120 * 0.16; // 稳中有升的成长曲线
    dayIdx++;
    customers.forEach((cu, ci) => {
      if (rnd() < 0.03) return; // 极少数不送货
      const core = [[0, 1, 8], [2, 4, 7], [3, 5, 6]][ci]; // 各客户稳定的核心品名结构
      const picks = ci === 0 ? 3 : 2;
      const used = {};
      for (let k = 0; k < picks; k++) {
        let pi = k < core.length ? core[k] : Math.floor(rnd() * products.length);
        if (used[pi]) continue; used[pi] = 1;
        const pr = products[pi];
        const scale = [1.0, 0.74, 0.52][ci];
        let qty = Math.round(pr.base * scale * weekend * season * trend * (0.94 + rnd() * 0.12));
        if (qty <= 0) continue;
        const price = +(pr.p * (0.98 + rnd() * 0.04)).toFixed(1);
        rows.push({ date, deliveryNo: 'SW' + (no++), orderNo: 'PO' + date.replace(/-/g, '') + String.fromCharCode(65 + k),
          product: pr.n, spec: pr.spec, qty, unit: pr.u, price, customer: cu });
      }
    });
  }
  return rows.map(r => ({ id: id(), ...r }));
}
