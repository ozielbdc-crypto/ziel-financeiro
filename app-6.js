// Exibição responsiva: tabelas no desktop e cartões no celular.
function mobileTxCards(arr, actions=true){
  return `<div class="mobile-cards">${arr.map(t=>`<div class="mobile-record">
    <div class="mobile-record-head"><div class="mobile-record-title">${esc(t.description)}</div><div class="mobile-record-value ${t.type==='Entrada'?'g':'r'}">${t.type==='Entrada'?'+':'-'} ${fmt(t.amount)}</div></div>
    <div class="mobile-record-grid">
      <div class="mobile-field"><span>Data</span><b>${br(t.transaction_date)}</b></div>
      <div class="mobile-field"><span>Empresa</span><b>${esc(businessName(t.business_id))}</b></div>
      <div class="mobile-field"><span>Carteira</span><b>${esc(walletName(t.wallet_id))}</b></div>
      <div class="mobile-field"><span>Categoria</span><b>${esc(t.category||'—')}</b></div>
      <div class="mobile-field"><span>Tipo</span><div>${badge(t.type)}</div></div>
      <div class="mobile-field"><span>Conciliação</span><div>${badge(t.reconciliation_status)}</div></div>
    </div>
    ${actions&&t.source_type==='manual'?`<div class="mobile-record-actions"><button class="btn btn-soft" data-del-tx="${t.id}">Excluir</button></div>`:''}
  </div>`).join('')}</div>`;
}

transactionTable = function(arr,actions=true){
  if(!arr.length)return '<div class="empty">Nenhum lançamento encontrado.</div>';
  const desktop=`<div class="table-wrap desktop-table"><table class="table"><thead><tr><th>Data</th><th>Empresa</th><th>Descrição</th><th>Carteira</th><th>Tipo</th><th>Valor</th><th>Conciliação</th>${actions?'<th></th>':''}</tr></thead><tbody>${arr.map(t=>`<tr><td>${br(t.transaction_date)}</td><td>${esc(businessName(t.business_id))}</td><td>${esc(t.description)}<div class="mini">${esc(t.category||'')}</div></td><td>${esc(walletName(t.wallet_id))}</td><td>${badge(t.type)}</td><td class="${t.type==='Entrada'?'g':'r'}"><b>${t.type==='Entrada'?'+':'-'} ${fmt(t.amount)}</b></td><td>${badge(t.reconciliation_status)}</td>${actions?`<td>${t.source_type==='manual'?`<button class="btn btn-soft" data-del-tx="${t.id}">Excluir</button>`:''}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
  return desktop+mobileTxCards(arr,actions);
};

payableTable = function(arr, actions=true){
  if(!arr.length)return '<div class="empty">Nenhuma conta a pagar.</div>';
  const desktop=`<div class="table-wrap desktop-table"><table class="table"><thead><tr><th>Vencimento</th><th>Empresa</th><th>Fornecedor</th><th>Descrição</th><th>Valor</th><th>Status</th>${actions?'<th></th>':''}</tr></thead><tbody>${arr.map(p=>{const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;return `<tr><td>${br(p.due_date)}</td><td>${esc(businessName(p.business_id))}</td><td>${esc(p.supplier)}</td><td>${esc(p.description)}</td><td><b>${fmt(p.amount)}</b></td><td>${badge(st)}</td>${actions?`<td><div class="actions">${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}<button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button></div></td>`:''}</tr>`}).join('')}</tbody></table></div>`;
  const mobile=`<div class="mobile-cards">${arr.map(p=>{const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;return `<div class="mobile-record">
    <div class="mobile-record-head"><div class="mobile-record-title">${esc(p.description)}</div><div class="mobile-record-value">${fmt(p.amount)}</div></div>
    <div class="mobile-record-grid">
      <div class="mobile-field"><span>Vencimento</span><b>${br(p.due_date)}</b></div>
      <div class="mobile-field"><span>Status</span><div>${badge(st)}</div></div>
      <div class="mobile-field"><span>Empresa</span><b>${esc(businessName(p.business_id))}</b></div>
      <div class="mobile-field"><span>Fornecedor</span><b>${esc(p.supplier)}</b></div>
    </div>
    ${actions?`<div class="mobile-record-actions">${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}<button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button></div>`:''}
  </div>`}).join('')}</div>`;
  return desktop+mobile;
};

receivableTable = function(arr,actions=true){
  if(!arr.length)return '<div class="empty">Nenhuma conta a receber.</div>';
  const desktop=`<div class="table-wrap desktop-table"><table class="table"><thead><tr><th>Vencimento</th><th>Empresa</th><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Status</th>${actions?'<th></th>':''}</tr></thead><tbody>${arr.map(p=>{const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;return `<tr><td>${br(p.due_date)}</td><td>${esc(businessName(p.business_id))}</td><td>${esc(p.customer)}</td><td>${esc(p.description)}</td><td><b>${fmt(p.amount)}</b></td><td>${badge(st)}</td>${actions?`<td>${p.status==='Pendente'?`<button class="btn btn-green" data-receive="${p.id}">Receber</button>`:''}</td>`:''}</tr>`}).join('')}</tbody></table></div>`;
  const mobile=`<div class="mobile-cards">${arr.map(p=>{const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;return `<div class="mobile-record">
    <div class="mobile-record-head"><div class="mobile-record-title">${esc(p.description)}</div><div class="mobile-record-value">${fmt(p.amount)}</div></div>
    <div class="mobile-record-grid">
      <div class="mobile-field"><span>Vencimento</span><b>${br(p.due_date)}</b></div>
      <div class="mobile-field"><span>Status</span><div>${badge(st)}</div></div>
      <div class="mobile-field"><span>Empresa</span><b>${esc(businessName(p.business_id))}</b></div>
      <div class="mobile-field"><span>Cliente</span><b>${esc(p.customer)}</b></div>
    </div>
    ${actions&&p.status==='Pendente'?`<div class="mobile-record-actions"><button class="btn btn-green" data-receive="${p.id}">Receber</button></div>`:''}
  </div>`}).join('')}</div>`;
  return desktop+mobile;
};

dashboardTransactionTable = function(arr){
  if(!arr.length)return '<div class="empty">Nenhum lançamento encontrado.</div>';
  const desktop=`<div class="table-wrap desktop-table"><table class="table"><thead><tr><th>Data</th><th>Empresa</th><th>Descrição</th><th>Carteira</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Conciliação</th></tr></thead><tbody>${arr.map(t=>`<tr><td>${br(t.transaction_date)}</td><td>${esc(businessName(t.business_id))}</td><td>${esc(t.description)}</td><td>${esc(walletName(t.wallet_id))}</td><td>${esc(t.category||'—')}</td><td>${badge(t.type)}</td><td class="${t.type==='Entrada'?'g':'r'}"><b>${fmt(t.amount)}</b></td><td>${badge(t.reconciliation_status)}</td></tr>`).join('')}</tbody></table></div>`;
  return desktop+mobileTxCards(arr,false);
};
