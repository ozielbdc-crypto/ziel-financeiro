// Extensão: período dos 6 indicadores principais do Dashboard
state.dashboardPeriod = state.dashboardPeriod || 'month';

function zielDashboardPeriodRange(period){
  const now=new Date();
  const y=now.getFullYear(),m=now.getMonth(),d=now.getDate();
  const toIso=x=>zielIsoDate(x);
  if(period==='today'){
    const t=toIso(new Date(y,m,d));
    return {start:t,end:t,label:'Hoje'};
  }
  if(period==='year'){
    return {start:toIso(new Date(y,0,1)),end:toIso(new Date(y,11,31)),label:'Ano atual'};
  }
  if(period==='all') return {start:null,end:null,label:'Todo período'};
  return {start:toIso(new Date(y,m,1)),end:toIso(new Date(y,m+1,0)),label:'Mês atual'};
}

function zielInPeriod(date,start,end){
  if(!date) return false;
  if(!start&&!end) return true;
  return date>=start&&date<=end;
}

function zielPaintMainDashboardKpis(){
  const box=document.querySelector('.dashboard-kpis');
  if(!box) return;
  const period=state.dashboardPeriod||'month';
  const range=zielDashboardPeriodRange(period);
  const txBase=filtered(state.transactions).filter(t=>t.source_type!=='transfer');
  const tx=txBase.filter(t=>zielInPeriod(t.transaction_date,range.start,range.end));
  const pay=filtered(state.payables).filter(p=>p.status==='Pendente'&&zielInPeriod(p.due_date,range.start,range.end));
  const rec=filtered(state.receivables).filter(r=>r.status==='Pendente'&&zielInPeriod(r.due_date,range.start,range.end));
  const entries=tx.filter(t=>t.type==='Entrada').reduce((a,t)=>a+Number(t.amount||0),0);
  const exits=tx.filter(t=>t.type==='Saída').reduce((a,t)=>a+Number(t.amount||0),0);
  const profit=entries-exits;
  const margin=entries>0?(profit/entries*100):0;
  const openPay=pay.reduce((a,x)=>a+Number(x.amount||0),0);
  const openRec=rec.reduce((a,x)=>a+Number(x.amount||0),0);
  const sub=range.label;
  box.innerHTML=
    kpiDetail('Lucro / Prejuízo',fmt(profit),sub,profit>=0?'g':'r')+
    kpiDetail('Entradas',fmt(entries),sub,'b')+
    kpiDetail('Saídas',fmt(exits),sub,'r')+
    kpiDetail('A receber',fmt(openRec),`Vencimentos · ${sub}`,'b')+
    kpiDetail('A pagar',fmt(openPay),`Vencimentos · ${sub}`,'a')+
    kpiDetail('Margem de lucro',`${margin.toFixed(1)}%`,`Lucro ÷ receitas · ${sub}`,profit>=0?'g':'r');
}

const _zielRenderDashboardPeriod = renderDashboard;
renderDashboard = function(){
  _zielRenderDashboardPeriod();
  const kpis=document.querySelector('.dashboard-kpis');
  if(!kpis) return;
  const range=zielDashboardPeriodRange(state.dashboardPeriod||'month');
  const selector=document.createElement('div');
  selector.className='card';
  selector.style.cssText='margin-bottom:14px;padding:12px 14px';
  selector.innerHTML=`<div class="section-head" style="margin-bottom:0"><div><b>Período dos indicadores principais</b><div class="mini">Entradas, saídas, lucro, margem e vencimentos</div></div><div class="actions" id="dashboardPeriodActions">
    <button class="btn ${state.dashboardPeriod==='today'?'btn-primary':'btn-soft'}" data-dashboard-period="today">Hoje</button>
    <button class="btn ${state.dashboardPeriod==='month'?'btn-primary':'btn-soft'}" data-dashboard-period="month">Mês atual</button>
    <button class="btn ${state.dashboardPeriod==='year'?'btn-primary':'btn-soft'}" data-dashboard-period="year">Ano atual</button>
    <button class="btn ${state.dashboardPeriod==='all'?'btn-primary':'btn-soft'}" data-dashboard-period="all">Todo período</button>
  </div></div>`;
  kpis.parentNode.insertBefore(selector,kpis);
  zielPaintMainDashboardKpis();
};

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-dashboard-period]');
  if(!b) return;
  state.dashboardPeriod=b.dataset.dashboardPeriod;
  renderDashboard();
});
