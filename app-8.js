// Extensão: edição de contas fixas recorrentes
renderPayables = function(){
  let arr=filtered(state.payables),fixed=filtered(state.recurring_payables);
  $('content').innerHTML=setTitle('Contas a Pagar','Controle de vencimentos, pagamentos e recorrências',`<div class="actions"><button class="btn btn-soft" id="newFixed">+ Conta fixa</button><button class="btn btn-primary" id="newPay">+ Nova conta</button></div>`)+
  `<div class="card" style="margin-bottom:14px"><div class="section-head"><h3>Contas fixas recorrentes</h3><span class="mini">Geração mensal automática</span></div><div id="fixedList"></div></div><div class="card"><div class="toolbar"><select id="payStatus"><option value="">Todos</option><option>Pendente</option><option>Pago</option><option>Cancelado</option></select></div><div id="payTable"></div></div>`;
  $('newPay').onclick=openPayable;
  $('newFixed').onclick=openRecurringPayable;
  $('payStatus').onchange=paint;
  paint();
  function paint(){
    let x=arr.filter(p=>!$('payStatus').value||p.status===$('payStatus').value);
    $('payTable').innerHTML=payableTable(x,true);
    $('fixedList').innerHTML=fixed.length?fixed.map(r=>`<div class="wallet-line"><span><b>${esc(r.description)}</b><small>${esc(businessName(r.business_id))} · ${esc(r.supplier)} · vence dia ${r.due_day}</small></span><span><b>${fmt(r.amount)}</b><div class="actions"><button class="btn btn-soft" data-edit-fixed="${r.id}">Editar</button><button class="btn btn-soft" data-toggle-fixed="${r.id}" data-active="${r.active}">${r.active?'Pausar':'Reativar'}</button></div></span></div>`).join(''):'<div class="empty">Nenhuma conta fixa cadastrada.</div>';
  }
};

function openEditRecurringPayable(id){
  const r=state.recurring_payables.find(x=>x.id===id);
  if(!r) return toast('Conta fixa não encontrada.','error');

  modal('Editar conta fixa',`<form id="editFixedForm" class="form-grid">
    <div class="field"><label>Empresa</label><select id="efBiz" required>${businessOptions(false,r.business_id)}</select></div>
    <div class="field"><label>Fornecedor</label><input class="input" id="efSupplier" value="${esc(r.supplier||'')}" required></div>
    <div class="field"><label>Categoria</label><select id="efCat" required>${categoryOptions('Saída',r.category)}</select></div>
    <div class="field"><label>Valor padrão</label><input class="input" id="efAmount" type="number" step="0.01" min="0" value="${Number(r.amount||0)}" required></div>
    <div class="field span-2"><label>Descrição</label><input class="input" id="efDesc" value="${esc(r.description||'')}" required></div>
    <div class="field"><label>Dia do vencimento</label><input class="input" id="efDay" type="number" min="1" max="31" value="${Number(r.due_day||1)}" required></div>
    <div class="field"><label>Início</label><input class="input" id="efStart" type="date" value="${r.start_date||''}" required></div>
    <div class="field"><label>Fim (opcional)</label><input class="input" id="efEnd" type="date" value="${r.end_date||''}"></div>
    <div class="field span-2"><label>Observações</label><textarea id="efNotes">${esc(r.notes||'')}</textarea></div>
    <div class="span-2 mini">As alterações valem para os próximos vencimentos ainda não gerados. Parcelas já criadas permanecem como estão.</div>
    <div class="actions span-2"><button class="btn btn-primary">Salvar alterações</button></div>
  </form>`);

  $('editFixedForm').onsubmit=async e=>{
    e.preventDefault();
    const start=$('efStart').value,end=$('efEnd').value||null;
    if(end&&end<start) return toast('A data final não pode ser anterior à data inicial.','error');
    await perform(
      ()=>supabase.from('recurring_payables').update({
        business_id:$('efBiz').value,
        supplier:$('efSupplier').value.trim(),
        category:$('efCat').value,
        amount:Number($('efAmount').value),
        description:$('efDesc').value.trim(),
        due_day:Number($('efDay').value),
        start_date:start,
        end_date:end,
        notes:$('efNotes').value.trim()||null,
        updated_at:new Date().toISOString()
      }).eq('id',id),
      'Conta fixa atualizada.'
    );
  };
}

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-edit-fixed]');
  if(btn) openEditRecurringPayable(btn.dataset.editFixed);
});
