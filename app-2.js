function renderDashboard(){
 const txAll=filtered(state.transactions).filter(t=>t.source_type!=='transfer'),pay=filtered(state.payables),rec=filtered(state.receivables),wallets=state.businessFilter?state.wallets.filter(w=>w.business_id===state.businessFilter):state.wallets;
 const entries=txAll.filter(t=>t.type==='Entrada').reduce((a,t)=>a+Number(t.amount),0);
 const exits=txAll.filter(t=>t.type==='Saída').reduce((a,t)=>a+Number(t.amount),0);
 const profit=entries-exits;
 const margin=entries>0?(profit/entries*100):0;
 const openPay=pay.filter(x=>x.status==='Pendente').reduce((a,x)=>a+Number(x.amount),0);
 const openRec=rec.filter(x=>x.status==='Pendente').reduce((a,x)=>a+Number(x.amount),0);
 const today=iso();
 const in7=new Date();in7.setDate(in7.getDate()+7);const in30=new Date();in30.setDate(in30.getDate()+30);
 const d7=in7.toISOString().slice(0,10),d30=in30.toISOString().slice(0,10);
 const overdue=pay.filter(x=>x.status==='Pendente'&&x.due_date<today).reduce((a,x)=>a+Number(x.amount),0);
 const due7=pay.filter(x=>x.status==='Pendente'&&x.due_date>=today&&x.due_date<=d7).reduce((a,x)=>a+Number(x.amount),0);
 const due30=pay.filter(x=>x.status==='Pendente'&&x.due_date>=today&&x.due_date<=d30).reduce((a,x)=>a+Number(x.amount),0);
 const currentPrefix=today.slice(0,7);const prev=new Date();prev.setMonth(prev.getMonth()-1);const prevPrefix=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
 const monthProfit=txAll.filter(t=>t.transaction_date?.startsWith(currentPrefix)).reduce((a,t)=>a+moneySign(t),0);
 const prevProfit=txAll.filter(t=>t.transaction_date?.startsWith(prevPrefix)).reduce((a,t)=>a+moneySign(t),0);
 const variation=prevProfit===0?(monthProfit===0?0:100):((monthProfit-prevProfit)/Math.abs(prevProfit))*100;
 const biz=state.businessFilter?state.businesses.filter(b=>b.id===state.businessFilter):state.businesses.filter(b=>b.active!==false);
 const byBusiness=biz.map(b=>{const arr=txAll.filter(t=>t.business_id===b.id);const revenue=arr.filter(t=>t.type==='Entrada').reduce((a,t)=>a+Number(t.amount),0);const expense=arr.filter(t=>t.type==='Saída').reduce((a,t)=>a+Number(t.amount),0);return {name:b.name,revenue,expense,profit:revenue-expense,margin:revenue>0?((revenue-expense)/revenue*100):0}});
 $('content').innerHTML=setTitle('Dashboard','Visão consolidada dos três negócios',`<button class="btn btn-primary" id="newTx">+ Novo lançamento</button>`)+
 `<div class="grid kpis dashboard-kpis">
 ${kpiDetail('Lucro / Prejuízo',fmt(profit),'Receitas - despesas do filtro atual',profit>=0?'g':'r')}
 ${kpiDetail('Entradas',fmt(entries),'No filtro atual','b')}
 ${kpiDetail('Saídas',fmt(exits),'No filtro atual','r')}
 ${kpiDetail('A receber',fmt(openRec),'Em aberto','b')}
 ${kpiDetail('A pagar',fmt(openPay),'Em aberto','a')}
 ${kpiDetail('Margem de lucro',`${margin.toFixed(1)}%`,'Lucro ÷ receitas',profit>=0?'g':'r')}
 </div>
 <div class="grid two dashboard-charts">
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
}
function kpiDetail(l,v,s,c){return `<div class="card kpi"><span>${l}</span><strong class="${c}">${v}</strong><small>${s}</small></div>`}
function dueCard(l,v,c){return `<div class="card due-card"><span>${l}</span><strong class="${c}">${fmt(v)}</strong></div>`}
function indicator(l,v,c){return `<div><span class="mini">${l}</span><strong class="${c}">${v}</strong></div>`}
function profitTable(rows){if(!rows.length)return '<div class="empty">Nenhum negócio.</div>';return `<div class="table-wrap"><table class="table profit-table"><thead><tr><th>Empresa</th><th>Receitas</th><th>Despesas</th><th>Lucro</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${fmt(x.revenue)}</td><td>${fmt(x.expense)}</td><td class="${x.profit>=0?'g':'r'}"><b>${fmt(x.profit)} (${x.margin.toFixed(1)}%)</b></td></tr>`).join('')}</tbody></table></div>`}
function dashboardTransactionTable(arr){if(!arr.length)return '<div class="empty">Nenhum lançamento encontrado.</div>';return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Empresa</th><th>Descrição</th><th>Carteira</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Conciliação</th></tr></thead><tbody>${arr.map(t=>`<tr><td>${br(t.transaction_date)}</td><td>${esc(businessName(t.business_id))}</td><td>${esc(t.description)}</td><td>${esc(walletName(t.wallet_id))}</td><td>${esc(t.category||'—')}</td><td>${badge(t.type)}</td><td class="${t.type==='Entrada'?'g':'r'}"><b>${fmt(t.amount)}</b></td><td>${badge(t.reconciliation_status)}</td></tr>`).join('')}</tbody></table></div>`}
function kpi(l,v,c){return `<div class="card kpi"><span>${l}</span><strong class="${c}">${v}</strong></div>`}
function destroyChart(k){if(state.charts[k]){state.charts[k].destroy();delete state.charts[k]}}
function drawCharts(tx,byBusiness=[]){
 ['f','n','c'].forEach(destroyChart);const months=[];for(let i=11;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
 const ins=months.map(m=>tx.filter(t=>t.type==='Entrada'&&t.transaction_date?.startsWith(m)).reduce((a,t)=>a+Number(t.amount),0));
 const outs=months.map(m=>tx.filter(t=>t.type==='Saída'&&t.transaction_date?.startsWith(m)).reduce((a,t)=>a+Number(t.amount),0));
 state.charts.f=new Chart($('chartFluxo'),{type:'bar',data:{labels:months.map(m=>m.split('-').reverse().join('/')),datasets:[{label:'Entradas',data:ins},{label:'Saídas',data:outs}]},options:{responsive:true,maintainAspectRatio:false}});
 state.charts.n=new Chart($('chartNegocios'),{type:'bar',data:{labels:byBusiness.map(x=>x.name),datasets:[{label:'Lucro / Prejuízo',data:byBusiness.map(x=>x.profit)}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y'}});
 const cat={};tx.filter(t=>t.type==='Saída').forEach(t=>cat[t.category||'Sem categoria']=(cat[t.category||'Sem categoria']||0)+Number(t.amount));const top=Object.entries(cat).sort((a,b)=>b[1]-a[1]).slice(0,6);
 state.charts.c=new Chart($('chartCategorias'),{type:'doughnut',data:{labels:top.map(x=>x[0]),datasets:[{label:'Despesas',data:top.map(x=>x[1])}]},options:{responsive:true,maintainAspectRatio:false}})
}
