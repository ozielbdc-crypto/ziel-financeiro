// Extensão: desfazer/excluir conciliação sem apagar extrato ou lançamento
bankTable = function(arr){
  if(!arr.length) return '<div class="empty">Nenhum item de extrato.</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${arr.map(b=>{const reconciled=!!b.transaction_id||b.status==='Conciliado'||b.status==='Divergente';return `<tr><td>${br(b.bank_date)}</td><td>${esc(b.description)}<div class="mini">${esc(walletName(b.wallet_id))}</div></td><td class="${Number(b.amount)>=0?'g':'r'}">${fmt(b.amount)}</td><td>${badge(b.status||'Não conciliado')}</td><td><div class="actions">${reconciled?`<button class="btn btn-soft" data-unrecon="${b.id}">Excluir conciliação</button>`:`<button class="btn btn-soft" data-recon="${b.id}">Conciliar</button>`}</div></td></tr>`}).join('')}</tbody></table></div>`;
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


// Conferência de Caixa Físico
renderReconciliation = function(){
  const bank=state.businessFilter?state.bank.filter(b=>b.business_id===state.businessFilter):state.bank;
  const tx=filtered(state.transactions).filter(t=>t.reconciliation_status!=='Conciliado');
  $('content').innerHTML=
    setTitle(
      'Conciliação Bancária',
      'Compare o extrato com os lançamentos e confira o caixa físico',
      '<div class="actions"><button class="btn btn-soft" id="cashCheck">Conferir Caixa Físico</button><button class="btn btn-primary" id="newBank">+ Item de extrato</button></div>'
    )+
    '<div class="recon-grid"><div class="card"><div class="section-head"><h3>Extrato bancário</h3></div>'+bankTable(bank)+'</div><div class="card"><div class="section-head"><h3>Lançamentos não conciliados</h3></div>'+transactionTable(tx,false)+'</div></div>';

  $('newBank').onclick=openBankEntry;
  $('cashCheck').onclick=openCashCheck;
};

function openCashCheck(){
  const cashWallets=state.wallets.filter(w=>
    w.active!==false &&
    (!state.businessFilter || w.business_id===state.businessFilter) &&
    (String(w.type||'').toLowerCase().includes('caixa') || String(w.name||'').toLowerCase().includes('caixa'))
  );

  if(!cashWallets.length){
    return toast('Nenhuma carteira de caixa físico encontrada.','error');
  }

  modal('Conferência de Caixa Físico',`
    <form id="cashCheckForm" class="form-grid">
      <div class="field span-2">
        <label>Carteira</label>
        <select id="cashWallet" required>
          ${cashWallets.map(w=>`<option value="${w.id}">${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>Saldo do sistema</label>
        <input class="input" id="cashSystem" readonly>
      </div>

      <div class="field">
        <label>Valor contado no caixa</label>
        <input class="input" id="cashCounted" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00" required>
      </div>

      <div class="field span-2">
        <label>Diferença</label>
        <input class="input" id="cashDifference" readonly>
        <div class="mini" id="cashCheckStatus">Informe o valor contado.</div>
      </div>

      <div class="actions span-2">
        <button type="button" class="btn btn-soft" id="cashClear">Limpar</button>
        <button type="submit" class="btn btn-primary">Conferir</button>
      </div>
    </form>
  `);

  const wallet=()=>state.wallets.find(w=>w.id===$('cashWallet').value);
  const paintSystem=()=>{
    const w=wallet();
    $('cashSystem').value=w?fmt(walletBalance(w)):'';
    $('cashDifference').value='';
    $('cashCheckStatus').textContent='Informe o valor contado.';
  };

  $('cashWallet').onchange=paintSystem;
  paintSystem();

  $('cashClear').onclick=()=>{
    $('cashCounted').value='';
    $('cashDifference').value='';
    $('cashCheckStatus').textContent='Informe o valor contado.';
    $('cashCounted').focus();
  };

  $('cashCheckForm').onsubmit=e=>{
    e.preventDefault();
    const w=wallet();
    if(!w) return toast('Carteira não encontrada.','error');

    const system=walletBalance(w);
    const counted=Number($('cashCounted').value);
    if(!Number.isFinite(counted)) return toast('Informe o valor contado no caixa.','error');

    const diff=counted-system;
    $('cashDifference').value=fmt(diff);

    if(Math.abs(diff)<0.01){
      $('cashCheckStatus').textContent='Caixa conferido: o valor contado bate com o saldo do sistema.';
      toast('Caixa conferido sem diferença.');
    }else if(diff>0){
      $('cashCheckStatus').textContent='Sobra de '+fmt(diff)+' no caixa físico.';
      toast('Conferência concluída: existe sobra no caixa.','error');
    }else{
      $('cashCheckStatus').textContent='Falta de '+fmt(Math.abs(diff))+' no caixa físico.';
      toast('Conferência concluída: existe falta no caixa.','error');
    }
  };
}
