/* ============================================================
 * 鲲鉴智策 · pages/customers.js
 * 职责：客户管理：客户档案增删改查、累计送货统计
 * 依赖：store.js、utils.js
 * ============================================================ */

// ================= 客户管理 =================
function renderCustomers() {
  const q = (document.getElementById('c-search').value||'').trim().toLowerCase();
  const list = db.customers.filter(c => !q || c.name.toLowerCase().includes(q) || String(c.contact||'').toLowerCase().includes(q));
  document.getElementById('customers-body').innerHTML = list.map(c => {
    const recs = db.records.filter(r => r.customer === c.name);
    const total = recs.reduce((s,r) => s + r.qty*r.price, 0);
    return `<tr class="border-t hover:bg-teal-50/40">
      <td class="px-4 py-3 font-medium">${esc(c.name)}</td>
      <td class="px-4 py-3">${esc(c.contact)}</td>
      <td class="px-4 py-3">${esc(c.phone)}</td>
      <td class="px-4 py-3 text-right">${recs.length}</td>
      <td class="px-4 py-3 text-right font-semibold text-teal-600">¥${fmt(total)}</td>
      <td class="px-4 py-3 text-center no-print whitespace-nowrap">
        <button onclick="viewCustomerBills('${esc(c.name)}')" class="text-emerald-600 hover:underline text-xs mr-2">看账单</button>
        <button onclick="editCustomer('${c.id}')" class="text-teal-600 hover:underline text-xs mr-2">编辑</button>
        <button onclick="deleteCustomer('${c.id}')" class="text-red-500 hover:underline text-xs">删除</button>
      </td>
    </tr>`;
  }).join('');
}
let editingCustomerId = null;
function openCustomerEditor(c) {
  editingCustomerId = c ? c.id : null;
  document.getElementById('customer-modal-title').textContent = c ? '编辑客户' : '新增客户';
  ['name','contact','phone','note'].forEach(k => document.getElementById('cu-'+k).value = c ? (c[k]||'') : '');
  document.getElementById('customer-modal').classList.remove('hidden');
}
function editCustomer(cid) { openCustomerEditor(db.customers.find(c => c.id === cid)); }
function closeCustomerEditor() { document.getElementById('customer-modal').classList.add('hidden'); }
function saveCustomer() {
  const name = document.getElementById('cu-name').value.trim();
  if (!name) return toast('请填写客户名称', false);
  const data = { name, contact: document.getElementById('cu-contact').value.trim(),
    phone: document.getElementById('cu-phone').value.trim(), note: document.getElementById('cu-note').value.trim() };
  if (editingCustomerId) {
    const c = db.customers.find(c => c.id === editingCustomerId);
    const oldName = c.name; Object.assign(c, data);
    db.records.forEach(r => { if (r.customer === oldName) r.customer = name; });
    toast('已保存');
  } else { db.customers.push({id: id(), ...data}); toast('已添加客户'); }
  save(); refreshSelects(); renderCustomers(); closeCustomerEditor();
}
function deleteCustomer(cid) {
  const c = db.customers.find(x => x.id === cid);
  const cnt = db.records.filter(r => r.customer === c.name).length;
  if (cnt > 0 && !confirm(`该客户名下有 ${cnt} 条送货记录，删除后记录将保留但显示为原名称。\n确认删除客户？`)) return;
  if (cnt === 0 && !confirm('确认删除该客户？')) return;
  db.customers = db.customers.filter(x => x.id !== cid);
  save(); refreshSelects(); renderCustomers(); toast('已删除');
}
function viewCustomerBills(name) {
  switchTab('records');
  document.getElementById('f-customer').value = name;
  renderRecords();
}
