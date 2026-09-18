// Calendário Financeiro - visão mensal de contas a pagar
let zielCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function zielCalendarIso(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function zielCalendarMonthLabel(d){
  const s=d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  return s.charAt(0).toUpperCase()+s.slice(1);
}

function zielOpenCalendarDay(date){
  const items=filtered(state.payables)
    .filter(p=>p.due_date===date)
    .sort((a,b)=>String(a.status||'').localeCompare(String(b.status||'')) || String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));
  if(!items.length)return;
  modal(`Contas de ${br(date)}`,`<div class="calendar-day-modal"><div class="mini" style="margin-bottom:12px">${items.length} conta${items.length===1?'':'s'} com vencimento nesta data.</div>${payableTable(items,true)}</div>`);
}

function renderFinancialCalendar(){
  const cursor=new Date(zielCalendarCursor.getFullYear(),zielCalendarCursor.getMonth(),1);
  const y=cursor.getFullYear(),m=cursor.getMonth();
  const monthStart=zielCalendarIso(new Date(y,m,1));
  const monthEnd=zielCalendarIso(new Date(y,m+1,0));
  const today=iso();

  const monthItems=filtered(state.payables)
    .filter(p=>p.due_date>=monthStart&&p.due_date<=monthEnd)
    .sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')));

  const valid=monthItems.filter(p=>p.status!=='Cancelado');
  const total=valid.reduce((a,p)=>a+Number(p.amount||0),0);
  const paid=valid.filter(p=>p.status==='Pago').reduce((a,p)=>a+Number(p.amount||0),0);
  const pending=valid.filter(p=>p.status==='Pendente').reduce((a,p)=>a+Number(p.amount||0),0);
  const overdue=valid.filter(p=>p.status==='Pendente'&&p.due_date<today).reduce((a,p)=>a+Number(p.amount||0),0);

  const byDate={};
  monthItems.forEach(p=>(byDate[p.due_date]||(byDate[p.due_date]=[])).push(p));

  const firstDow=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const prevDays=new Date(y,m,0).getDate();
  const cells=[];

  for(let i=0;i<42;i++){
    let cellDate,dayNum,outside=false;
    if(i<firstDow){
      dayNum=prevDays-firstDow+i+1;
      cellDate=new Date(y,m-1,dayNum);
      outside=true;
    }else if(i>=firstDow+daysInMonth){
      dayNum=i-(firstDow+daysInMonth)+1;
      cellDate=new Date(y,m+1,dayNum);
      outside=true;
    }else{
      dayNum=i-firstDow+1;
      cellDate=new Date(y,m,dayNum);
    }
    const date=zielCalendarIso(cellDate);
    const items=byDate[date]||[];
    const activeItems=items.filter(p=>p.status!=='Cancelado');
    const dayTotal=activeItems.reduce((a,p)=>a+Number(p.amount||0),0);
    const dayPaid=activeItems.filter(p=>p.status==='Pago').reduce((a,p)=>a+Number(p.amount||0),0);
    const dayPending=activeItems.filter(p=>p.status==='Pendente').reduce((a,p)=>a+Number(p.amount||0),0);
    const dayOverdue=activeItems.some(p=>p.status==='Pendente'&&p.due_date<today);
    const isToday=date===today;
    const classes=['fin-cal-day'];
    if(outside)classes.push('outside');
    if(isToday)classes.push('today');
    if(dayOverdue)classes.push('has-overdue');
    if(items.length)classes.push('has-items');

    cells.push(`<button class="${classes.join(' ')}" data-calendar-date="${date}" ${items.length?'':'disabled'}>
      <span class="fin-cal-number">${dayNum}</span>
      ${isToday?'<span class="fin-cal-today-label">Hoje</span>':''}
      ${items.length?`<span class="fin-cal-total">${fmt(dayTotal)}</span>
        <span class="fin-cal-count">${items.length} conta${items.length===1?'':'s'}</span>
        ${dayPending>0?`<span class="fin-cal-status pending">Pendente ${fmt(dayPending)}</span>`:''}
        ${dayPaid>0?`<span class="fin-cal-status paid">Pago ${fmt(dayPaid)}</span>`:''}`:''}
    </button>`);
  }

  $('content').innerHTML=setTitle('Calendário Financeiro','Vencimentos das contas a pagar em visão mensal',`<div class="actions"><button class="btn btn-soft" id="calToday">Hoje</button></div>`)+`
    <div class="grid kpis dashboard-kpis" style="margin-bottom:14px">
      ${kpiDetail('Total do mês',fmt(total),'Contas não canceladas','b')}
      ${kpiDetail('Pago',fmt(paid),'Baixado no mês','g')}
      ${kpiDetail('Pendente',fmt(pending),'Ainda em aberto','a')}
      ${kpiDetail('Vencido',fmt(overdue),'Pendentes em atraso',overdue>0?'r':'g')}
    </div>
    <div class="card fin-cal-card">
      <div class="fin-cal-toolbar">
        <button class="btn btn-soft" id="calPrev" aria-label="Mês anterior">‹</button>
        <h2>${esc(zielCalendarMonthLabel(cursor))}</h2>
        <button class="btn btn-soft" id="calNext" aria-label="Próximo mês">›</button>
      </div>
      <div class="fin-cal-scroll">
        <div class="fin-cal-weekdays">
          <span>domingo</span><span>segunda-feira</span><span>terça-feira</span><span>quarta-feira</span><span>quinta-feira</span><span>sexta-feira</span><span>sábado</span>
        </div>
        <div class="fin-cal-grid">${cells.join('')}</div>
      </div>
      <div class="fin-cal-legend"><span><i class="today-dot"></i> Hoje</span><span><i class="pending-dot"></i> Pendente</span><span><i class="paid-dot"></i> Pago</span><span><i class="overdue-dot"></i> Vencido</span></div>
    </div>`;

  $('calPrev').onclick=()=>{zielCalendarCursor=new Date(y,m-1,1);renderFinancialCalendar();};
  $('calNext').onclick=()=>{zielCalendarCursor=new Date(y,m+1,1);renderFinancialCalendar();};
  $('calToday').onclick=()=>{const n=new Date();zielCalendarCursor=new Date(n.getFullYear(),n.getMonth(),1);renderFinancialCalendar();};
  document.querySelectorAll('[data-calendar-date]').forEach(b=>{if(!b.disabled)b.onclick=()=>zielOpenCalendarDay(b.dataset.calendarDate)});
}

// Acrescenta a nova página sem alterar o núcleo original.
const _zielShowPageCalendar = showPage;
showPage = function(page){
  if(page==='calendario'){
    activate(page);
    renderFinancialCalendar();
    return;
  }
  _zielShowPageCalendar(page);
};

const _zielRenderShellCalendar = renderShell;
renderShell = function(){
  _zielRenderShellCalendar();
  const navEl=document.querySelector('.nav');
  if(navEl&&!navEl.querySelector('[data-page="calendario"]')){
    const btn=document.createElement('button');
    btn.dataset.page='calendario';
    btn.innerHTML='▦ Calendário Financeiro';
    const reports=navEl.querySelector('[data-page="relatorios"]');
    navEl.insertBefore(btn,reports||null);
    btn.onclick=()=>{showPage('calendario');document.body.classList.remove('menu-open');};
  }
};
