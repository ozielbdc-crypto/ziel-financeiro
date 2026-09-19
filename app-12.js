// Extensão: melhoria da exibição de Contas a Pagar
renderPayables = function(){
  const allPay=filtered(state.payables);
  const fixed=filtered(state.recurring_payables);
  const now=new Date();
  const y=now.getFullYear(),m=now.getMonth();
  const today=iso();
  const monthStart=zielIsoDate(new Date(y,m,1));
  const monthEnd=zielIsoDate(new Date(y,m+1,0));
  const nextMonthStart=zielIsoDate(new Date(y,m+1,1));
  const nextMonthEnd=zielIsoDate(new Date(y,m+2,0));
  const in30=new Date(y,m,now.getDate()+30);
  const in30Iso=zielIsoDate(in30);

  const suppliers=[...new Set(allPay.map(p=>String(p.supplier||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));

  $('content').innerHTML=setTitle('Contas a Pagar','Controle de vencimentos, pagamentos e recorrências',`<div class="actions"><button class="btn btn-soft" id="newFixed">+ Conta fixa</button><button class="btn btn-soft" id="newInstallmentPay">+ Contas a pagar parcelado</button><button class="btn btn-primary" id="newPay">+ Nova conta</button></div>`)+
  `<div class="card" style="margin-bottom:14px"><div class="section-head"><h3>Contas fixas recorrentes</h3><span class="mini">Geração mensal automática</span></div><div id="fixedList"></div></div>
   <div class="card" style="margin-bottom:14px">
    <div class="section-head"><div><h3 id="payPeriodTitle">Contas do mês</h3><span class="mini" id="payPeriodSub"></span></div></div>
    <div class="toolbar" style="gap:10px;flex-wrap:wrap">
      <select id="payPeriod">
        <option value="month">Este mês</option>
        <option value="next">Próximo mês</option>
        <option value="30">Próximos 30 dias</option>
        <option value="all">Todas</option>
      </select>
      <select id="payStatus"><option value="">Todas as situações</option><option>Pendente</option><option>Pago</option><option>Cancelado</option></select>
      <select id="payFornecedor"><option value="">Todos os fornecedores</option>${suppliers.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>
    </div>
    <div class="grid kpis dashboard-kpis" style="margin-top:12px" id="paySummary"></div>
   </div>
   <div class="card"><div id="payTable"></div></div>`;

  $('newPay').onclick=openPayable;
  $('newFixed').onclick=openRecurringPayable;
  $('newInstallmentPay').onclick=openInstallmentPayables;
  $('payPeriod').onchange=paint;
  $('payStatus').onchange=paint;
  $('payFornecedor').onchange=paint;

  function periodFilter(p){
    const due=p.due_date||'';
    const mode=$('payPeriod').value;
    if(mode==='month') return due>=monthStart&&due<=monthEnd;
    if(mode==='next') return due>=nextMonthStart&&due<=nextMonthEnd;
    if(mode==='30') return due>=today&&due<=in30Iso;
    return true;
  }
  function periodLabel(){
    const mode=$('payPeriod').value;
    if(mode==='month') return new Date(y,m,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    if(mode==='next') return new Date(y,m+1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    if(mode==='30') return `De ${br(today)} até ${br(in30Iso)}`;
    return 'Todo o período cadastrado';
  }
  function paint(){
    const base=allPay.filter(periodFilter).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')));
    const total=base.filter(p=>p.status!=='Cancelado').reduce((a,p)=>a+Number(p.amount||0),0);
    const paid=base.filter(p=>p.status==='Pago').reduce((a,p)=>a+Number(p.amount||0),0);
    const pending=base.filter(p=>p.status==='Pendente').reduce((a,p)=>a+Number(p.amount||0),0);
    const overdue=base.filter(p=>p.status==='Pendente'&&p.due_date<today).reduce((a,p)=>a+Number(p.amount||0),0);
    $('payPeriodSub').textContent=periodLabel();
    $('paySummary').innerHTML=`
      ${kpiDetail('Total',fmt(total),'Contas do período','b')}
      ${kpiDetail('Pago',fmt(paid),'Baixado no período','g')}
      ${kpiDetail('Pendente',fmt(pending),'Ainda em aberto','a')}
      ${kpiDetail('Vencido',fmt(overdue),'Pendentes com vencimento passado',overdue>0?'r':'g')}`;

    const st=$('payStatus').value, supplier=$('payFornecedor').value;
    const visible=base.filter(p=>(!st||p.status===st)&&(!supplier||String(p.supplier||'')===supplier));
    $('payTable').innerHTML=payableTable(visible,true).replace(/Favorecido/g,'Fornecedor');

    $('fixedList').innerHTML=fixed.length?fixed.map(r=>`<div class="wallet-line"><span><b>${esc(r.description)}</b><small>${esc(businessName(r.business_id))} · ${esc(r.supplier)} · vence dia ${r.due_day}</small></span><span><b>${fmt(r.amount)}</b><div class="actions"><button class="btn btn-soft" data-edit-fixed="${r.id}">Editar</button><button class="btn btn-soft" data-toggle-fixed="${r.id}" data-active="${r.active}">${r.active?'Pausar':'Reativar'}</button></div></span></div>`).join(''):'<div class="empty">Nenhuma conta fixa cadastrada.</div>';
  }
  paint();
};
