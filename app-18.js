function payableOpenAmount(p){return Math.max(0,Number(p.amount||0)-Number(p.paid_amount||0));}
// Restaura a exibição responsiva de Contas a Pagar após a extensão de dados de pagamento.
payableTable = function(arr, actions=true){
  if(!arr.length) return '<div class="empty">Nenhuma conta a pagar.</div>';

  const desktop=`<div class="table-wrap desktop-table"><table class="table"><thead><tr><th>Vencimento</th><th>Empresa</th><th>Favorecido</th><th>Descrição</th><th>Valor</th><th>Status</th>${actions?'<th></th>':''}</tr></thead><tbody>${arr.map(p=>{
    const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;
    const hasPayment=!!(p.payment_method||p.pix_key||p.boleto_code);
    return `<tr>
      <td>${br(p.due_date)}</td>
      <td>${esc(businessName(p.business_id))}</td>
      <td>${esc(p.supplier)}</td>
      <td>${esc(p.description)}${p.payment_method?`<div class="mini">${esc(p.payment_method)}</div>`:''}</td>
      <td><b>${fmt(payableOpenAmount(p))}</b></td>
      <td>${badge(st)}</td>
      ${actions?`<td><div class="actions">
        ${hasPayment?`<button class="btn btn-soft" data-payment-details="${p.id}">Dados de pagamento</button>`:''}
        ${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}
        <button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button>
      </div></td>`:''}
    </tr>`;
  }).join('')}</tbody></table></div>`;

  const mobile=`<div class="mobile-cards">${arr.map(p=>{
    const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;
    const hasPayment=!!(p.payment_method||p.pix_key||p.boleto_code);
    return `<div class="mobile-record">
      <div class="mobile-record-head">
        <div class="mobile-record-title">${esc(p.description)}</div>
        <div class="mobile-record-value">${fmt(payableOpenAmount(p))}</div>
      </div>
      <div class="mobile-record-grid">
        <div class="mobile-field"><span>Vencimento</span><b>${br(p.due_date)}</b></div>
        <div class="mobile-field"><span>Status</span><div>${badge(st)}</div></div>
        <div class="mobile-field"><span>Empresa</span><b>${esc(businessName(p.business_id))}</b></div>
        <div class="mobile-field"><span>Favorecido</span><b>${esc(p.supplier)}</b></div>
        ${p.payment_method?`<div class="mobile-field"><span>Pagamento</span><b>${esc(p.payment_method)}</b></div>`:''}
      </div>
      ${actions?`<div class="mobile-record-actions">
        ${hasPayment?`<button class="btn btn-soft" data-payment-details="${p.id}">Dados de pagamento</button>`:''}
        ${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}
        <button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button>
      </div>`:''}
    </div>`;
  }).join('')}</div>`;

  return desktop+mobile;
};
