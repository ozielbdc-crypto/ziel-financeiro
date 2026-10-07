// Fila de entradas importadas — consulta automática, confirmação manual.

let zielIncomingRows=[];
let zielIncomingRenderSeq=0;

function zielIncomingProviderLabel(provider){
  return {
    mercado_pago:'Mercado Pago',
    asaas:'Asaas',
    efi:'Efí',
    lytex:'Lytex',
    sgp:'SGP',
    outro:'Outro / API'
  }[provider]||provider||'Integração';
}

function zielIncomingWhen(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

function zielIncomingStatusBadge(status){
  const kind=status==='Confirmado'?'green':status==='Ignorado'?'amber':'blue';
  return `<span class="badge ${kind}">${esc(status||'Pendente')}</span>`;
}

function zielIncomingCard(row){
  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  const when=row.approved_at||row.occurred_at||row.imported_at;
  let actions='';
  if(row.decision_status==='Pendente'){
    actions=`<button type="button" class="btn btn-primary" data-zin-confirm="${esc(row.id)}">Confirmar lançamento</button>
      <button type="button" class="btn btn-soft" data-zin-ignore="${esc(row.id)}">Ignorar</button>`;
  }else if(row.decision_status==='Ignorado'){
    actions=`<button type="button" class="btn btn-soft" data-zin-reopen="${esc(row.id)}">Voltar para pendente</button>`;
  }else{
    actions=`<button type="button" class="btn btn-soft" data-zin-tx="${esc(row.transaction_id||'')}">Lançamento confirmado</button>`;
  }

  return `<article class="zin-card">
    <div class="zin-card-head">
      <div>
        <span class="zin-provider">${esc(zielIncomingProviderLabel(row.provider))}</span>
        <h3>${esc(row.description||'Entrada importada')}</h3>
        <span class="mini">${esc(businessName(row.business_id))} · ${esc(wallet?.name||'Carteira')}</span>
      </div>
      <strong class="zin-amount">${fmt(row.amount)}</strong>
    </div>
    <div class="zin-meta">
      <div><small>Data</small><strong>${esc(zielIncomingWhen(when))}</strong></div>
      <div><small>Status no provedor</small><strong>${esc(row.provider_status||'—')}</strong></div>
      <div><small>Método</small><strong>${esc(row.payment_method||'—')}</strong></div>
      <div><small>ID externo</small><strong>${esc(row.external_id||'—')}</strong></div>
    </div>
    <div class="zin-foot">
      <div>${zielIncomingStatusBadge(row.decision_status)}</div>
      <div class="zin-actions">${actions}</div>
    </div>
  </article>`;
}

function zielIncomingOpenConfirm(id){
  const row=zielIncomingRows.find(x=>x.id===id);
  if(!row)return toast('Entrada importada não encontrada.','error');
  const wallet=state.wallets.find(w=>w.id===row.wallet_id);

  modal('Confirmar entrada no financeiro',`
    <form id="zinConfirmForm" class="zin-confirm-form">
      <div class="zin-confirm-summary">
        <div><small>VALOR</small><strong>${fmt(row.amount)}</strong></div>
        <div><small>CARTEIRA</small><strong>${esc(wallet?.name||'Carteira')}</strong><span>${esc(businessName(row.business_id))}</span></div>
      </div>
      <div class="field">
        <label>Categoria</label>
        <select id="zinCategory" required>${categoryOptions('Entrada')}</select>
      </div>
      <div class="field">
        <label>Descrição do lançamento</label>
        <input class="input" id="zinDescription" maxlength="160" value="${esc(row.description||'Entrada Mercado Pago')}" required>
      </div>
      <div class="zin-confirm-note">
        Ao confirmar, o ZIEL criará uma <b>Entrada</b> nessa carteira. O ID do provedor ficará vinculado para impedir lançamento duplicado.
      </div>
      <div class="actions">
        <button type="button" class="btn btn-soft" id="zinCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zinConfirmButton">Confirmar entrada</button>
      </div>
    </form>
  `);

  $('zinCancel').onclick=closeModal;
  $('zinConfirmForm').onsubmit=async e=>{
    e.preventDefault();
    const category=$('zinCategory').value;
    const description=$('zinDescription').value.trim();
    if(!category)return toast('Selecione a categoria.','error');
    if(!description)return toast('Informe a descrição.','error');

    const btn=$('zinConfirmButton');
    btn.disabled=true;
    btn.textContent='Confirmando…';
    try{
      const {data,error}=await supabase.rpc('confirm_incoming_entry',{
        p_entry_id:row.id,
        p_category:category,
        p_description:description
      });
      if(error)throw error;
      if(!data)throw new Error('O lançamento não retornou um identificador válido.');
      closeModal();
      await loadAll();
      await zielLoadIncomingEntries();
      zielPaintIncoming();
      toast('Entrada confirmada e lançada no financeiro.');
    }catch(error){
      toast('Não foi possível confirmar: '+(error?.message||'erro desconhecido'),'error');
      if($('zinConfirmButton')){
        $('zinConfirmButton').disabled=false;
        $('zinConfirmButton').textContent='Confirmar entrada';
      }
    }
  };
}

async function zielSetIncomingDecision(id,status){
  const row=zielIncomingRows.find(x=>x.id===id);
  if(!row)return toast('Entrada importada não encontrada.','error');
  if(status==='Ignorado'&&!confirm('Ignorar esta entrada? Ela continuará no histórico, mas não será lançada no financeiro.'))return;

  try{
    const {data,error}=await supabase.rpc('set_incoming_entry_decision',{
      p_entry_id:id,
      p_status:status
    });
    if(error)throw error;
    if(!data)throw new Error('Entrada não encontrada ou já vinculada a um lançamento.');
    await zielLoadIncomingEntries();
    zielPaintIncoming();
    toast(status==='Ignorado'?'Entrada ignorada.':'Entrada voltou para pendente.');
  }catch(error){
    toast('Não foi possível atualizar: '+(error?.message||'erro desconhecido'),'error');
  }
}

async function zielLoadIncomingEntries(){
  let query=supabase
    .from('integration_incoming_entries')
    .select('*')
    .order('occurred_at',{ascending:false,nullsFirst:false})
    .order('imported_at',{ascending:false})
    .limit(500);

  if(state.businessFilter)query=query.eq('business_id',state.businessFilter);

  const {data,error}=await query;
  if(error)throw error;
  zielIncomingRows=Array.isArray(data)?data:[];
  return zielIncomingRows;
}

function zielBindIncomingActions(){
  document.querySelectorAll('[data-zin-confirm]').forEach(btn=>btn.onclick=()=>zielIncomingOpenConfirm(btn.dataset.zinConfirm));
  document.querySelectorAll('[data-zin-ignore]').forEach(btn=>btn.onclick=()=>zielSetIncomingDecision(btn.dataset.zinIgnore,'Ignorado'));
  document.querySelectorAll('[data-zin-reopen]').forEach(btn=>btn.onclick=()=>zielSetIncomingDecision(btn.dataset.zinReopen,'Pendente'));
  document.querySelectorAll('[data-zin-tx]').forEach(btn=>btn.onclick=()=>{
    showPage('lancamentos');
    toast('O lançamento confirmado está disponível em Lançamentos.');
  });
}

function zielPaintIncoming(){
  const host=$('zinList');
  if(!host)return;

  const status=$('zinStatus')?.value||'Pendente';
  const q=String($('zinSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');

  const rows=zielIncomingRows.filter(row=>{
    if(status!=='Todos'&&row.decision_status!==status)return false;
    if(q){
      const wallet=state.wallets.find(w=>w.id===row.wallet_id);
      const hay=[
        row.description,row.external_id,row.external_reference,row.payment_method,
        zielIncomingProviderLabel(row.provider),wallet?.name,businessName(row.business_id)
      ].join(' ').toLocaleLowerCase('pt-BR');
      if(!hay.includes(q))return false;
    }
    return true;
  });

  const pending=zielIncomingRows.filter(r=>r.decision_status==='Pendente').length;
  const confirmed=zielIncomingRows.filter(r=>r.decision_status==='Confirmado').length;
  const ignored=zielIncomingRows.filter(r=>r.decision_status==='Ignorado').length;

  if($('zinPending'))$('zinPending').textContent=String(pending);
  if($('zinConfirmed'))$('zinConfirmed').textContent=String(confirmed);
  if($('zinIgnored'))$('zinIgnored').textContent=String(ignored);

  host.innerHTML=rows.length
    ?rows.map(zielIncomingCard).join('')
    :'<div class="empty">Nenhuma entrada encontrada para este filtro.</div>';

  zielBindIncomingActions();
}

async function renderIncomingEntries(seq=zielIncomingRenderSeq){
  $('content').innerHTML=setTitle(
    'Entradas importadas',
    'Consulta automática das integrações com confirmação manual antes do lançamento',
    '<button type="button" class="btn btn-soft" id="zinRefresh">↻ Atualizar fila</button>'
  )+`
    <div class="zin-page">
      <div class="zin-auto">
        <div>
          <span class="zin-auto-icon">↻</span>
          <div><strong>Consulta automática ativa</strong><p>Mercado Pago é consultado pelo backend a cada <b>5 minutos</b>. Pagamentos novos entram nesta fila e não afetam o financeiro até você confirmar.</p></div>
        </div>
        <span class="zin-auto-badge">AUTOMÁTICO</span>
      </div>

      <div class="zin-stats">
        <div><span>Pendentes</span><strong id="zinPending">—</strong><small>Aguardando sua decisão</small></div>
        <div><span>Confirmadas</span><strong id="zinConfirmed">—</strong><small>Já lançadas no financeiro</small></div>
        <div><span>Ignoradas</span><strong id="zinIgnored">—</strong><small>Mantidas apenas no histórico</small></div>
      </div>

      <div class="zin-toolbar">
        <div class="field">
          <label for="zinStatus">Situação</label>
          <select id="zinStatus">
            <option>Pendente</option>
            <option>Confirmado</option>
            <option>Ignorado</option>
            <option>Todos</option>
          </select>
        </div>
        <div class="field">
          <label for="zinSearch">Buscar</label>
          <input class="input" id="zinSearch" type="search" placeholder="Descrição, ID, carteira ou provedor">
        </div>
      </div>

      <div id="zinList"><div class="empty">Carregando entradas…</div></div>
      <p class="mini zin-note">Duplicidades são bloqueadas pelo ID externo do provedor. Uma entrada confirmada gera apenas um lançamento financeiro.</p>
    </div>`;

  $('zinStatus').onchange=zielPaintIncoming;
  $('zinSearch').oninput=zielPaintIncoming;
  $('zinRefresh').onclick=async()=>{
    const btn=$('zinRefresh');
    btn.disabled=true;
    try{
      await zielLoadIncomingEntries();
      zielPaintIncoming();
      toast('Fila atualizada.');
    }catch(error){
      toast('Não foi possível atualizar a fila: '+(error?.message||'erro desconhecido'),'error');
    }finally{
      if($('zinRefresh'))$('zinRefresh').disabled=false;
    }
  };

  try{
    await zielLoadIncomingEntries();
    if(seq!==zielIncomingRenderSeq)return;
    zielPaintIncoming();
  }catch(error){
    if(seq!==zielIncomingRenderSeq)return;
    const host=$('zinList');
    if(host)host.innerHTML='<div class="message error">Não foi possível carregar as entradas: '+esc(error?.message||'erro desconhecido')+'</div>';
  }
}

const _zielIncomingPreviousRenderShell=renderShell;
renderShell=function(){
  _zielIncomingPreviousRenderShell();
  const navEl=document.querySelector('.sidebar .nav');
  if(navEl&&!navEl.querySelector('[data-page="entradas-importadas"]')){
    const btn=document.createElement('button');
    btn.dataset.page='entradas-importadas';
    btn.textContent='⇩ Entradas importadas';
    btn.onclick=()=>{showPage('entradas-importadas');document.body.classList.remove('menu-open');};
    const integrationsBtn=navEl.querySelector('[data-page="integracoes"]');
    navEl.insertBefore(btn,integrationsBtn||navEl.querySelector('[data-page="cadastros"]')||null);
  }
};

const _zielIncomingPreviousShowPage=showPage;
showPage=function(page){
  zielIncomingRenderSeq++;
  const seq=zielIncomingRenderSeq;
  if(page==='entradas-importadas'){
    activate(page);
    renderIncomingEntries(seq);
    return;
  }
  return _zielIncomingPreviousShowPage(page);
};
