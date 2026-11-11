/* ============================================================
 * 鲲鉴智策 · core/nav.js
 * 职责：导航层：页签切换、登录页一键填入演示账号
 * 依赖：无
 * ============================================================ */

// ================= Tab 切换 =================
function switchTab(tab) {
  ['records','reconcile','customers','data','forecast','report'].forEach(t => {
    const pg = document.getElementById('page-'+t);
    pg.classList.toggle('hidden', t !== tab);
    document.getElementById('tab-'+t).className = 'px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ' +
      (t === tab ? 'bg-white shadow-md shadow-teal-200/70 text-teal-700 font-semibold' : 'text-slate-500 hover:text-slate-700');
    if (t === tab) { pg.classList.remove('page-enter'); void pg.offsetWidth; pg.classList.add('page-enter'); }
  });
  refreshSelects();
  if (tab === 'records') renderRecords();
  if (tab === 'reconcile') renderReconcile();
  if (tab === 'customers') renderCustomers();
  if (tab === 'forecast') refreshFcSelects();
}

function lgDemoFill() {
  document.getElementById('lg-user').value = 'admin';
  document.getElementById('lg-pass').value = 'admin123';
}
