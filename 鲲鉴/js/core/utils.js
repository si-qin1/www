/* ============================================================
 * 鲲鉴智策 · core/utils.js
 * 职责：通用工具：数字格式化、Toast 提示、月份截取、HTML 转义、下拉选项刷新
 * 依赖：store.js（db）
 * ============================================================ */

// ================= 工具 =================
function fmt(n) { return Number(n||0).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function toast(msg, ok=true) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-sm shadow-lg z-[60] text-white ' + (ok ? 'bg-emerald-600' : 'bg-red-600');
  setTimeout(() => t.classList.add('hidden'), 2200);
  t.classList.remove('hidden');
}
function monthOf(dateStr) { return (dateStr||'').slice(0,7); }

// ================= 下拉选项 =================
function refreshSelects() {
  const names = [...new Set(db.records.map(r => r.customer).filter(Boolean))].sort();
  const opts = (allLabel) => '<option value="">' + allLabel + '</option>' + names.map(n => `<option>${esc(n)}</option>`).join('');
  const fc = document.getElementById('f-customer');
  if (fc) fc.innerHTML = opts('全部客户');
  const rc = document.getElementById('r-customer');
  if (rc) rc.innerHTML = opts('请选择客户');
  document.getElementById('customer-list').innerHTML = db.customers.map(c => `<option value="${esc(c.name)}">`).join('');
}
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
