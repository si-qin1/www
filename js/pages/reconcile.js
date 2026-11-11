/* ============================================================
 * 鲲鉴智策 · pages/reconcile.js
 * 职责：月度对账：按客户/月份汇总、对账单渲染、传统对账单格式 Excel 导出
 * 依赖：store.js、utils.js、vendor/xlsx.bundle.js
 * ============================================================ */

// ================= 月度对账 =================
function reconcileData() {
  const cu = document.getElementById('r-customer').value;
  const mo = document.getElementById('r-month').value;
  const list = db.records
    .filter(r => (!cu || r.customer === cu) && (!mo || monthOf(r.date) === mo))
    .sort((a,b) => (a.date||'').localeCompare(b.date||'') || String(a.deliveryNo).localeCompare(String(b.deliveryNo), undefined, {numeric:true}));
  // 按月分组
  const groups = {};
  list.forEach(r => { (groups[monthOf(r.date) || '未知月份'] = groups[monthOf(r.date) || '未知月份'] || []).push(r); });
  return { list, groups };
}
function renderReconcile() {
  const { list, groups } = reconcileData();
  const cu = document.getElementById('r-customer').value;
  const el = document.getElementById('reconcile-content');
  if (!cu && !list.length) {
    el.innerHTML = '<div class="bg-white rounded-xl shadow-sm py-16 text-center text-slate-400 text-sm">请在左上角选择客户，查看该客户分月对账汇总</div>';
    return;
  }
  let html = '';
  const months = Object.keys(groups).sort();
  if (!months.length) {
    html = '<div class="bg-white rounded-xl shadow-sm py-16 text-center text-slate-400 text-sm">该客户暂无账单记录</div>';
  }
  months.forEach(m => {
    const rows = groups[m];
    const total = rows.reduce((s,r) => s + r.qty*r.price, 0);
    html += `
    <div class="bg-white rounded-xl shadow-sm mb-5 overflow-hidden">
      <div class="px-5 py-3 bg-slate-50 border-b flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <span class="bg-teal-600 text-white text-sm font-bold px-3 py-1 rounded-md">${esc(m)} 月度对账单</span>
          <span class="text-sm text-slate-500 font-medium">${esc(cu || '全部客户')}</span>
        </div>
        <div class="text-sm">本月合计：<span class="text-lg font-bold text-teal-600">¥${fmt(total)}</span></div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[820px]">
          <thead class="text-xs text-slate-500 bg-slate-50/60">
            <tr>
              <th class="px-3 py-2 text-left">送货日期</th><th class="px-3 py-2 text-left">送货单号</th>
              <th class="px-3 py-2 text-left">订单编号</th><th class="px-3 py-2 text-left">品名</th>
              <th class="px-3 py-2 text-left">规格</th><th class="px-3 py-2 text-right">数量</th>
              <th class="px-3 py-2 text-center">单位</th><th class="px-3 py-2 text-right">单价</th>
              <th class="px-3 py-2 text-right">金额(RMB)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
            <tr class="border-t">
              <td class="px-3 py-1.5 whitespace-nowrap">${esc(r.date)}</td>
              <td class="px-3 py-1.5">${esc(r.deliveryNo)}</td>
              <td class="px-3 py-1.5 text-slate-500">${esc(r.orderNo)}</td>
              <td class="px-3 py-1.5">${esc(r.product)}</td>
              <td class="px-3 py-1.5">${esc(r.spec)}</td>
              <td class="px-3 py-1.5 text-right">${r.qty}</td>
              <td class="px-3 py-1.5 text-center">${esc(r.unit)}</td>
              <td class="px-3 py-1.5 text-right">${fmt(r.price)}</td>
              <td class="px-3 py-1.5 text-right font-semibold">${fmt(r.qty*r.price)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="bg-teal-50 font-bold">
              <td colspan="8" class="px-3 py-2 text-right text-sm">合计（${rows.length} 笔）</td>
              <td class="px-3 py-2 text-right text-teal-700">¥${fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  });
  const grand = list.reduce((s,r) => s + r.qty*r.price, 0);
  html += `<div class="bg-white rounded-xl shadow-sm px-5 py-4 flex items-center justify-between">
    <span class="font-bold">总合计</span>
    <span class="text-2xl font-bold text-teal-600">¥${fmt(grand)}</span>
  </div>`;
  el.innerHTML = html;
}
// ====== 对账单 Excel 样式工具（仿传统对账单格式） ======
const THIN = { style: 'thin', color: { rgb: '000000' } };
const B_ALL = { top: THIN, bottom: THIN, left: THIN, right: THIN };
function buildStatementSheet(rows, customer, monthLabel) {
  const contact = (db.customers.find(c => c.name === customer) || {}).contact || '';
  const total = rows.reduce((s, r) => s + r.qty * r.price, 0);
  const header = ['送货日期','送货单号','订单编号','品名','规格','数量','单位','单价','金额(RMB)'];
  const aoa = [
    [customer, '', '', '', '', '', '', '', ''],
    [monthLabel, '', '', '', '', '', '', '', ''],
    ['客户：' + customer, '', '', '联系人：' + (contact || ''), '', '', '', '', ''],
    header,
    ...rows.map(r => [r.date, String(r.deliveryNo), String(r.orderNo), r.product, r.spec, r.qty, r.unit, r.price, +(r.qty * r.price).toFixed(2)]),
    ['合计', '', '', '', '', '', '', '', +total.toFixed(2)]
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:12},{wch:11},{wch:13},{wch:26},{wch:10},{wch:8},{wch:6},{wch:9},{wch:12}];
  const last = aoa.length - 1;
  ws['!merges'] = [
    { s:{r:0,c:0}, e:{r:0,c:8} },              // 第1行：客户名称整行居中
    { s:{r:1,c:0}, e:{r:1,c:8} },              // 第2行：2025年8月份对账单 整行居中
    { s:{r:2,c:0}, e:{r:2,c:8} },              // 第3行：客户 / 联系人 整行合并居中
    { s:{r:last,c:0}, e:{r:last,c:7} },        // 末行：合计 跨 A-H（占一个单元格）
    { s:{r:last,c:8}, e:{r:last,c:8} }         // 末行：合计金额 独立一格 I 列
  ];
  const nRows = aoa.length;
  for (let R = 0; R < nRows; R++) {
    for (let C = 0; C < 9; C++) {
      const addr = XLSX.utils.encode_cell({r: R, c: C});
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const cell = ws[addr];
      const isTitle = R <= 1, isHead = R === 3, isTotal = R === last;
      cell.s = {
        font: {
          name: '宋体', sz: isTitle ? (R === 0 ? 14 : 12) : 11,
          bold: isTitle || isHead || isTotal
        },
        alignment: {
          horizontal: (isTitle || isHead || (isTotal && C === 8) || (R === 2 && (C === 0 || C === 4))) ? 'center'
                    : (isTotal && C < 8) ? 'right'
                    : (C >= 5 && C !== 6 ? 'right' : (C === 6 ? 'center' : 'left')),
          vertical: 'center'
        },
        border: (R >= 2) ? B_ALL : {}
      };
      if (C === 8 && R >= 4) cell.z = '#,##0.00';
      if (C === 7 && R >= 4) cell.z = '#,##0.00';
    }
  }
  ws['!rows'] = [{hpt: 22}, {hpt: 20}, {hpt: 18}, {hpt: 18}];
  return ws;
}
// 统一的文件导出：APP 内调用原生保存到「下载」目录，网页端用浏览器下载
function downloadBlob(blob, fileName, cb) {
  var isApp = !!(window.AndroidBridge && window.AndroidBridge.saveFile);
  if (isApp) {
    var fr = new FileReader();
    fr.onload = function () {
      var b64 = String(fr.result).split(',')[1] || '';
      try {
        window.AndroidBridge.saveFile(b64, fileName,
          /xlsx$/.test(fileName) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : /\.png$/.test(fileName) ? 'image/png'
          : 'application/json');
        if (cb) cb('已保存到「下载」目录');
      } catch (e) { if (cb) cb('导出失败', true); }
    };
    fr.onerror = function () { if (cb) cb('导出失败', true); };
    fr.readAsDataURL(blob);
    return true;
  }
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  if (cb) cb('已导出');
  return false;
}
// 生成 xlsx 二进制
function writeWorkbook(wb) {
  var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function safeSheetName(name, used) {
  let n = String(name).replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
  let base = n, i = 2;
  while (used.has(n)) n = (base.slice(0, 28) + '_' + i++);
  used.add(n); return n;
}
function exportReconcile() {
  const { list, groups } = reconcileData();
  const cu = document.getElementById('r-customer').value || '全部客户';
  if (!list.length) return toast('没有可导出的数据', false);
  const wb = XLSX.utils.book_new();
  const used = new Set();
  const months = Object.keys(groups).sort();
  months.forEach(m => {
    const label = m + '月份对账单';
    const ws = buildStatementSheet(groups[m], cu, label);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(m + '对账单', used));
  });
  downloadBlob(writeWorkbook(wb), `对账单_${cu}_${document.getElementById('r-month').value || '全部'}.xlsx`,
    (m, bad) => toast(m, !bad));
}
