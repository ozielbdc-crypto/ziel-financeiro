// Extensão: desfazer/excluir conciliação sem apagar extrato ou lançamento
bankTable = function(arr){
  if(!arr.length) return '<div class="empty">Nenhum item de extrato.</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${arr.map(b=>`<tr><td>${br(b.bank_date)}</td><td>${esc(b.description)}<div class="mini">${esc(walletName(b.wallet_id))}</div></td><td class="${Number(b.amount)>=0?'g':'r'}">${fmt(b.amount)}</td><td>${badge(b.status||'Não conciliado')}</td><td><div class="actions">${b.transaction_id?`<button class="btn btn-soft" data-unrecon="${b.id}">Excluir conciliação</button>`:`<button class="btn btn-soft" data-recon="${b.id}">Conciliar</button>`}</div></td></tr>`).join('')}</tbody></table></div>`;
};

async function undoReconciliation(bankId){
  const bank = state.bank.find(b=>b.id===bankId);
  if(!bank) return {error:{message:'Item de extrato não encontrado.'}};

  if(bank.transaction_id){
    const tx = await supabase.from('transactions')
      .update({reconciliation_status:'Não conciliado'})
      .eq('id',bank.transaction_id);
    if(tx.error) return tx;
  }

  return await supabase.from('bank_entries')
    .update({status:'Não conciliado',transaction_id:null,reconciled_at:null})
    .eq('id',bankId);
}

document.addEventListener('click', async e=>{
  const btn = e.target.closest('[data-unrecon]');
  if(!btn) return;

  const bank = state.bank.find(b=>b.id===btn.dataset.unrecon);
  const detalhe = bank ? `\n\n${br(bank.bank_date)} — ${bank.description} — ${fmt(bank.amount)}` : '';
  if(!confirm(`Excluir esta conciliação?${detalhe}\n\nO item do extrato e o lançamento financeiro serão mantidos.`)) return;

  await perform(
    ()=>undoReconciliation(btn.dataset.unrecon),
    'Conciliação excluída. Extrato e lançamento foram mantidos.'
  );
});
