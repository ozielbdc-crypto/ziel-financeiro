// Extensão: comparativos, ponto de equilíbrio e nomenclatura Favorecido

// Mantém o campo técnico "supplier" no banco, mas usa "Favorecido" na interface.
if (typeof payableTable === 'function') {
  const _zielPayableTable = payableTable;
  payableTable = function(arr, actions=true){
    return _zielPayableTable(arr, actions).replace(/Fornecedor/g,'Favorecido');
  };
}

if (typeof accountForm === 'function') {
  const _zielAccountForm = accountForm;
  accountForm = function(kind){
    return _zielAccountForm(kind).replace(/Fornecedor/g,'Favorecido');
  };
}

function zielRelabelFavorecido(){
  document.querySelectorAll('#modalRoot label').forEach(label=>{
    if(label.textContent.trim()==='Fornecedor') label.textContent='Favorecido';
  });
}

if (typeof openRecurringPayable === 'function') {
  const _zielOpenRecurring = openRecurringPayable;
  openRecurringPayable = function(){ _zielOpenRecurring(); zielRelabelFavorecido(); };
}
if (typeof openEditRecurringPayable === 'function') {
  const _zielOpenEditRecurring = openEditRecurringPayable;
  openEditRecurringPayable = function(id){ _zielOpenEditRecurring(id); zielRelabelFavorecido(); };
}
if (typeof openInstallmentPayables === 'function') {
  const _zielOpenInstallment = openInstallmentPayables;
  openInstallmentPayables = function(){ _zielOpenInstallment(); zielRelabelFavorecido(); };
}

function zielDate(y,m,d){
  const last=new Date(y,m+1,0).getDate();
  return new Date(y,m,Math.min(d,last));
}
function zielIsoDate(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function zielRangeStats(tx,start,end){
  const arr=tx.filter(t=>t.transaction_date>=start&&t.transaction_date<=end);
  const entries=arr.filter(t=>t.type==='Entrada').reduce((a,t)=>a+Number(t.amount||0),0);
  const exits=arr.filter(t=>t.type==='Saída').reduce((a,t)=>a+Number(t.amount||0),0);
  return {entries,exits,result:entries-exits};
}
function zielVariation(current,previous){
  if(previous===0) return current===0?0:null;
  return ((current-previous)/Math.abs(previous))*100;
}
function zielCompRow(label,current,previous,currentLabel,previousLabel){
  const v=zielVariation(current.result,previous.result);
  const variation=v===null?'—':`${v>=0?'+':''}${v.toFixed(1)}%`;
  return `<tr>
    <td><b>${esc(label)}</b><div class="mini">${esc(currentLabel)} × ${esc(previousLabel)}</div></td>
    <td>${fmt(current.entries)}<div class="mini">Anterior: ${fmt(previous.entries)}</div></td>
    <td>${fmt(current.exits)}<div class="mini">Anterior: ${fmt(previous.exits)}</div></td>
    <td class="${current.result>=0?'g':'r'}"><b>${fmt(current.result)}</b><div class="mini">Anterior: ${fmt(previous.result)}</div></td>
    <td class="${v===null?'':(v>=0?'g':'r')}"><b>${variation}</b></td>
  </tr>`;
}

renderDashboard = function(){
 const txAll=filtered(state.transactions).filter(t=>t.source_type!=='transfer'),pay=filtered(state.payables),rec=filtered(state.receivables),wallets=state.businessFilter?state.wallets.filter(w=>w.business_id===state.businessFilter):state.wallets;
 const entries=txAll.filter(t=>t.type==='Entrada').reduce((a,t)=>a+Number(t.amount),0);
 const exits=txAll.filter(t=>t.type==='Saída').reduce((a,t)=>a+Number(t.amount),0);
 const profit=entries-exits;
 const margin=entries>0?(profit/entries*100):0;
 const openPay=pay.filter(x=>x.status==='Pendente').reduce((a,x)=>a+Number(x.amount),0);
 const openRec=rec.filter(x=>x.status==='Pendente').reduce((a,x)=>a+Number(x.amount),0);
 const today=iso();
 const in7=new Date();in7.setDate(in7.getDate()+7);const in30=new Date();in30.setDate(in30.getDate()+30);
 const d7=zielIsoDate(in7),d30=zielIsoDate(in30);
 const overdue=pay.filter(x=>x.status==='Pendente'&&x.due_date<today).reduce((a,x)=>a+Number(x.amount),0);
 const due7=pay.filter(x=>x.status==='Pendente'&&x.due_date>=today&&x.due_date<=d7).reduce((a,x)=>a+Number(x.amount),0);
 const due30=pay.filter(x=>x.status==='Pendente'&&x.due_date>=today&&x.due_date<=d30).reduce((a,x)=>a+Number(x.amount),0);

 const now=new Date();
 const y=now.getFullYear(),m=now.getMonth(),d=now.getDate();
 const yesterday=new Date(y,m,d-1);
 const prevMonthDay=zielDate(y,m-1,d);
 const monthStart=zielDate(y,m,1),monthEnd=zielDate(y,m+1,0);
 const prevMonthStart=zielDate(y,m-1,1),prevMonthEnd=zielDate(y,m,0);
 const prevYearMonthStart=zielDate(y-1,m,1),prevYearMonthEnd=zielDate(y-1,m+1,0);
 const yearStart=zielDate(y,0,1),yearEnd=zielDate(y,11,31);
 const prevYearStart=zielDate(y-1,0,1),prevYearEnd=zielDate(y-1,11,31);

 const currentPrefix=today.slice(0,7);const prevPrefix=zielIsoDate(prevMonthStart).slice(0,7);
 const monthProfit=txAll.filter(t=>t.transaction_date?.startsWith(currentPrefix)).reduce((a,t)=>a+moneySign(t),0);
 const prevProfit=txAll.filter(t=>t.transaction_date?.startsWith(prevPrefix)).reduce((a,t)=>a+moneySign(t),0);
 const variation=prevProfit===0?(monthProfit===0?0:100):((monthProfit-prevProfit)/Math.abs(prevProfit))*100;
 const biz=state.businessFilter?state.businesses.filter(b=>b.id===state.businessFilter):state.businesses.filter(b=>b.active!==false);
 const byBusiness=biz.map(b=>{const arr=txAll.filter(t=>t.business_id===b.id);const revenue=arr.filter(t=>t.type==='Entrada').reduce((a,t)=>a+Number(t.amount),0);const expense=arr.filter(t=>t.type==='Saída').reduce((a,t)=>a+Number(t.amount),0);return {name:b.name,revenue,expense,profit:revenue-expense,margin:revenue>0?((revenue-expense)/revenue*100):0}});

 // Ponto de equilíbrio gerencial estimado.
 const fixedRecurring=filtered(state.recurring_payables).filter(r=>r.active!==false).reduce((a,r)=>a+Number(r.amount||0),0);
 const monthTx=txAll.filter(t=>t.transaction_date>=zielIsoDate(monthStart)&&t.transaction_date<=today);
 const monthRevenue=monthTx.filter(t=>t.type==='Entrada').reduce((a,t)=>a+Number(t.amount||0),0);
 const recurringPayableIds=new Set(pay.filter(p=>p.recurring_payable_id).map(p=>p.id));
 const fixedPaid=monthTx.filter(t=>t.type==='Saída'&&t.source_type==='payable'&&recurringPayableIds.has(t.source_id)).reduce((a,t)=>a+Number(t.amount||0),0);
 const monthExpense=monthTx.filter(t=>t.type==='Saída').reduce((a,t)=>a+Number(t.amount||0),0);
 const variableExpense=Math.max(0,monthExpense-fixedPaid);
 const contributionMargin=monthRevenue>0?(monthRevenue-variableExpense)/monthRevenue:0;
 const breakEven=contributionMargin>0?fixedRecurring/contributionMargin:null;

 const todayStats=zielRangeStats(txAll,today,today);
 const yestIso=zielIsoDate(yesterday),yesterdayStats=zielRangeStats(txAll,yestIso,yestIso);
 const prevMonthDayIso=zielIsoDate(prevMonthDay),prevMonthDayStats=zielRangeStats(txAll,prevMonthDayIso,prevMonthDayIso);
 const monthStats=zielRangeStats(txAll,zielIsoDate(monthStart),zielIsoDate(monthEnd));
 const prevMonthStats=zielRangeStats(txAll,zielIsoDate(prevMonthStart),zielIsoDate(prevMonthEnd));
 const prevYearMonthStats=zielRangeStats(txAll,zielIsoDate(prevYearMonthStart),zielIsoDate(prevYearMonthEnd));
 const yearStats=zielRangeStats(txAll,zielIsoDate(yearStart),zielIsoDate(yearEnd));
 const prevYearStats=zielRangeStats(txAll,zielIsoDate(prevYearStart),zielIsoDate(prevYearEnd));

 $('content').innerHTML=setTitle('Dashboard','Visão consolidada dos três negócios',`<button class="btn btn-primary" id="newTx">+ Novo lançamento</button>`)+
 `<div class="grid kpis dashboard-kpis">
 ${kpiDetail('Lucro / Prejuízo',fmt(profit),'Receitas - despesas do filtro atual',profit>=0?'g':'r')}
 ${kpiDetail('Entradas',fmt(entries),'No filtro atual','b')}
 ${kpiDetail('Saídas',fmt(exits),'No filtro atual','r')}
 ${kpiDetail('A receber',fmt(openRec),'Em aberto','b')}
 ${kpiDetail('A pagar',fmt(openPay),'Em aberto','a')}
 ${kpiDetail('Margem de lucro',`${margin.toFixed(1)}%`,'Lucro ÷ receitas',profit>=0?'g':'r')}
 </div>
 <div class="card" style="margin-top:14px">
   <div class="section-head"><div><h3>Comparativos</h3><span class="mini">Entradas, saídas e resultado por período</span></div></div>
   <div class="table-wrap"><table class="table"><thead><tr><th>Comparação</th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Variação</th></tr></thead><tbody>
     ${zielCompRow('Dia anterior',todayStats,yesterdayStats,br(today),br(yestIso))}
     ${zielCompRow('Dia do mês anterior',todayStats,prevMonthDayStats,br(today),br(prevMonthDayIso))}
     ${zielCompRow('Mês anterior',monthStats,prevMonthStats,currentPrefix,prevPrefix)}
     ${zielCompRow('Mês do ano anterior',monthStats,prevYearMonthStats,currentPrefix,`${y-1}-${String(m+1).padStart(2,'0')}`)}
     ${zielCompRow('Ano anterior',yearStats,prevYearStats,String(y),String(y-1))}
   </tbody></table></div>
 </div>
 <div class="card" style="margin-top:14px">
   <div class="section-head"><div><h3>Ponto de equilíbrio estimado</h3><span class="mini">Custos fixos recorrentes ÷ margem de contribuição gerencial</span></div></div>
   <div class="profit-indicators">
     ${indicator('Custos fixos mensais',fmt(fixedRecurring),'a')}
     ${indicator('Margem de contribuição',`${(contributionMargin*100).toFixed(1)}%`,contributionMargin>0?'g':'r')}
     ${indicator('Ponto de equilíbrio',breakEven===null?'Indisponível':fmt(breakEven),breakEven===null?'r':'b')}
     ${indicator('Receita mês atual',fmt(monthRevenue),monthRevenue>=Number(breakEven||0)?'g':'b')}
   </div>
   <div class="mini" style="margin-top:10px">Estimativa gerencial: considera como custos fixos as contas fixas recorrentes ativas e, no mês atual, trata as demais saídas como variáveis. Quanto melhor a classificação das contas, mais útil será o indicador.</div>
 </div>
 <div class="grid two dashboard-charts" style="margin-top:14px">
   <div class="card"><div class="section-head"><h3>Entradas x Saídas por mês</h3><span class="mini">12 meses</span></div><div class="chart-box"><canvas id="chartFluxo"></canvas></div></div>
   <div class="card"><div class="section-head"><h3>Resultado por negócio</h3><span class="mini">Consolidado</span></div><div class="chart-box"><canvas id="chartNegocios"></canvas></div></div>
 </div>
 <div class="grid two" style="margin-top:14px">
   <div class="card"><div class="section-head"><h3>Despesas por categoria</h3><span class="mini">Top 6</span></div><div class="chart-box"><canvas id="chartCategorias"></canvas></div></div>
   <div class="card"><div class="section-head"><h3>Saldo por carteira</h3><span class="mini">Atual</span></div><div class="wallet-list">${wallets.map(w=>`<div class="wallet-line"><span><small>${esc(businessName(w.business_id))}</small><b>${esc(w.name)}</b></span><strong class="${walletBalance(w)>=0?'g':'r'}">${fmt(walletBalance(w))}</strong></div>`).join('')||'<div class="empty">Nenhuma carteira.</div>'}</div></div>
 </div>
 <div class="due-grid" style="margin-top:14px">${dueCard('Vencidas',overdue,'r')}${dueCard('Vence em 7 dias',due7,'a')}${dueCard('Vence em 30 dias',due30,'b')}</div>
 <div class="card" style="margin-top:14px"><div class="section-head"><div><h3>Lucro por negócio</h3><span class="mini">Período atual</span></div></div>${profitTable(byBusiness)}</div>
 <div class="card" style="margin-top:14px"><div class="section-head"><div><h3>Indicadores de lucro</h3><span class="mini">Consolidado</span></div></div><div class="profit-indicators">${indicator('Lucro acumulado',fmt(profit),profit>=0?'g':'r')}${indicator('Lucro mês atual',fmt(monthProfit),monthProfit>=0?'g':'r')}${indicator('Mês anterior',fmt(prevProfit),prevProfit>=0?'g':'r')}${indicator('Variação mensal',`${variation>=0?'+':''}${variation.toFixed(1)}%`,variation>=0?'g':'r')}</div></div>
 <div class="card" style="margin-top:14px"><div class="section-head"><h3>Movimentações recentes</h3><button class="btn btn-soft" id="allTx">Ver todas</button></div>${dashboardTransactionTable(txAll.slice(0,8))}</div>`;
 $('newTx').onclick=()=>openTransaction();$('allTx').onclick=()=>showPage('lancamentos');drawCharts(txAll,byBusiness);
};
