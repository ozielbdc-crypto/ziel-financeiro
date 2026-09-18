// Extensão: Contas a pagar parcelado
renderPayables = function(){
  let arr=filtered(state.payables),fixed=filtered(state.recurring_payables);
  $('content').innerHTML=setTitle('Contas a Pagar','Controle de vencimentos, pagamentos e recorrências',`<div class="actions"><button class="btn btn-soft" id="newFixed">+ Conta fixa</button><button class="btn btn-soft" id="newInstallmentPay">+ Contas a pagar parcelado</button><button class="btn btn-primary" id="newPay">+ Nova conta</button></div>`)+
  `<div class="card" style="margin-bottom:14px"><div class="section-head"><h3>Contas fixas recorrentes</h3><span class="mini">Geração mensal automática</span></div><div id="fixedList"></div></div><div class="card"><div class="toolbar"><select id="payStatus"><option value="">Todos</option><option>Pendente</option><option>Pago</option><option>Cancelado</option></select></div><div id="payTable"></div></div>`;
  $('newPay').onclick=openPayable;
  $('newFixed').onclick=openRecurringPayable;
  $('newInstallmentPay').onclick=openInstallmentPayables;
  $('payStatus').onchange=paint;
  paint();
  function paint(){
    let x=arr.filter(p=>!$('payStatus').value||p.status===$('payStatus').value);
    $('payTable').innerHTML=payableTable(x,true);
    $('fixedList').innerHTML=fixed.length?fixed.map(r=>`<div class="wallet-line"><span><b>${esc(r.description)}</b><small>${esc(businessName(r.business_id))} · ${esc(r.supplier)} · vence dia ${r.due_day}</small></span><span><b>${fmt(r.amount)}</b><div class="actions"><button class="btn btn-soft" data-edit-fixed="${r.id}">Editar</button><button class="btn btn-soft" data-toggle-fixed="${r.id}" data-active="${r.active}">${r.active?'Pausar':'Reativar'}</button></div></span></div>`).join(''):'<div class="empty">Nenhuma conta fixa cadastrada.</div>';
  }
};

function openInstallmentPayables(){
  modal('Contas a pagar parcelado',`<form id="installmentPayForm" class="form-grid">
    <div class="field"><label>Empresa</label><select id="ipBiz" required>${businessOptions(false,state.businessFilter)}</select></div>
    <div class="field"><label>Fornecedor</label><input class="input" id="ipSupplier" required></div>
    <div class="field"><label>Categoria</label><select id="ipCat" required>${categoryOptions('Saída')}</select></div>
    <div class="field"><label>Valor total da compra</label><input class="input" id="ipTotal" type="number" step="0.01" min="0.01" required></div>
    <div class="field span-2"><label>Descrição</label><input class="input" id="ipDesc" required placeholder="Ex.: Compra de mercadorias"></div>
    <div class="field"><label>Data da compra / emissão</label><input class="input" id="ipIssue" type="date" value="${iso()}" required></div>
    <div class="field"><label>Documento / NF</label><input class="input" id="ipDoc"></div>
    <div class="span-2"><div class="section-head"><div><h3>Boletos</h3><span class="mini">Informe o vencimento e o valor exato de cada boleto.</span></div><button type="button" class="btn btn-soft" id="addInstallmentRow">+ Adicionar boleto</button></div><div id="installmentRows"></div></div>
    <div class="span-2 card" style="box-shadow:none"><div class="section-head"><span><b>Total informado</b><div class="mini" id="ipTotalLabel">R$ 0,00</div></span><span><b>Soma dos boletos</b><div class="mini" id="ipSumLabel">R$ 0,00</div></span><span><b>Diferença</b><div class="mini" id="ipDiffLabel">R$ 0,00</div></span></div></div>
    <div class="actions span-2"><button class="btn btn-primary">Salvar todos</button></div>
  </form>`);

  const rows=$('installmentRows');
  const addRow=(due='',amount='')=>{
    const n=rows.querySelectorAll('.installment-row').length+1;
    const div=document.createElement('div');
    div.className='installment-row card';
    div.style.cssText='box-shadow:none;margin-bottom:10px;padding:12px';
    div.innerHTML=`<div class="form-grid"><div class="field"><label>Boleto ${n} - Vencimento</label><input class="input ipDue" type="date" value="${due}" required></div><div class="field"><label>Valor</label><input class="input ipAmount" type="number" step="0.01" min="0.01" value="${amount}" required></div><div class="actions span-2" style="margin-top:0"><button type="button" class="btn btn-soft removeInstallment">Remover</button></div></div>`;
    rows.appendChild(div);
    div.querySelector('.removeInstallment').onclick=()=>{if(rows.querySelectorAll('.installment-row').length>1){div.remove();renumber();updateTotals();}};
    div.querySelector('.ipAmount').oninput=updateTotals;
    updateTotals();
  };
  const renumber=()=>rows.querySelectorAll('.installment-row').forEach((r,i)=>{const l=r.querySelector('label');if(l)l.textContent=`Boleto ${i+1} - Vencimento`;});
  const updateTotals=()=>{
    const total=Number($('ipTotal').value||0);
    const sum=[...rows.querySelectorAll('.ipAmount')].reduce((a,x)=>a+Number(x.value||0),0);
    const diff=total-sum;
    $('ipTotalLabel').textContent=fmt(total);$('ipSumLabel').textContent=fmt(sum);$('ipDiffLabel').textContent=fmt(diff);
    $('ipDiffLabel').className='mini '+(Math.abs(diff)<0.01?'g':'r');
  };
  $('ipTotal').oninput=updateTotals;
  $('addInstallmentRow').onclick=()=>addRow();
  addRow();addRow();

  $('installmentPayForm').onsubmit=async e=>{
    e.preventDefault();
    const total=Number($('ipTotal').value||0);
    const installments=[...rows.querySelectorAll('.installment-row')].map((r,i)=>({
      index:i+1,
      due:r.querySelector('.ipDue').value,
      amount:Number(r.querySelector('.ipAmount').value||0)
    }));
    if(!installments.length)return toast('Adicione pelo menos um boleto.','error');
    if(installments.some(x=>!x.due||x.amount<=0))return toast('Preencha vencimento e valor de todos os boletos.','error');
    const sum=installments.reduce((a,x)=>a+x.amount,0);
    if(Math.abs(total-sum)>=0.01)return toast(`A soma dos boletos (${fmt(sum)}) precisa ser igual ao total da compra (${fmt(total)}).`,'error');
    const description=$('ipDesc').value.trim(),doc=$('ipDoc').value.trim()||null,issue=$('ipIssue').value,supplier=$('ipSupplier').value.trim(),biz=$('ipBiz').value,cat=$('ipCat').value;
    const count=installments.length;
    const data=installments.map(x=>({business_id:biz,supplier,category:cat,description:`${description} - Parcela ${x.index}/${count}`,document:doc,amount:x.amount,issue_date:issue,due_date:x.due,status:'Pendente',notes:`Conta parcelada ${x.index}/${count} · Total da compra: ${fmt(total)}`}));
    await perform(()=>supabase.from('payables').insert(data),`${count} contas a pagar cadastradas.`);
  };
}
