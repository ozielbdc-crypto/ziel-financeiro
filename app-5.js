// Extensão: exclusão individual de contas a pagar e do lançamento financeiro vinculado
payableTable = function(arr, actions = true) {
  if (!arr.length) return '<div class="empty">Nenhuma conta a pagar.</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Vencimento</th><th>Empresa</th><th>Fornecedor</th><th>Descrição</th><th>Valor</th><th>Status</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>${arr.map(p => {
    const st = p.status === 'Pendente' && p.due_date < iso() ? 'Vencido' : p.status;
    return `<tr><td>${br(p.due_date)}</td><td>${esc(businessName(p.business_id))}</td><td>${esc(p.supplier)}</td><td>${esc(p.description)}</td><td><b>${fmt(p.amount)}</b></td><td>${badge(st)}</td>${actions ? `<td><div class="actions">${p.status === 'Pendente' ? `<button class="btn btn-green" data-pay="${p.id}">Pagar</button>` : ''}<button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button></div></td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
};

async function deletePayableWithTransaction(id){
  const payable = state.payables.find(p => p.id === id);
  if (!payable) return {error:{message:'Conta a pagar não encontrada.'}};

  // Exclui primeiro o lançamento financeiro criado na baixa.
  if (payable.transaction_id) {
    const tx = await supabase.from('transactions').delete().eq('id', payable.transaction_id);
    if (tx.error) return tx;
  } else {
    // Compatibilidade com registros antigos: procura pelo vínculo source_id.
    const tx = await supabase.from('transactions').delete().eq('source_id', id);
    if (tx.error) return tx;
  }

  return await supabase.from('payables').delete().eq('id', id);
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-del-pay]');
  if (!btn) return;

  const item = state.payables.find(x => x.id === btn.dataset.delPay);
  const descricao = item?.description ? `\n\n${item.description} — ${fmt(item.amount)}` : '';
  const pago = item?.status === 'Pago';
  const aviso = pago
    ? '\n\nO lançamento financeiro gerado pelo pagamento também será excluído.'
    : '';

  if (!confirm(`Excluir esta conta a pagar?${descricao}${aviso}\n\nEsta ação não poderá ser desfeita.`)) return;

  await perform(
    () => deletePayableWithTransaction(btn.dataset.delPay),
    'Conta a pagar excluída com o lançamento vinculado.'
  );
});
