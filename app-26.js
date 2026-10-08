// Entradas via API ao vivo.
// A consulta exibida nesta tela vem diretamente do provedor e permanece somente em memória.
// O banco é consultado apenas para marcar IDs que já foram lançados e impedir duplicidade.

let zielLiveRows=[];
let zielLiveLastQuery=null;
let zielLiveIntegrations=[];
let zielLiveQueryInFlight=false;

function zielLiveProviderLabel(provider){
  return typeof zielIncomingProviderLabel==='function'
    ?zielIncomingProviderLabel(provider)
    :({mercado_pago:'Mercado Pago',asaas:'Asaas',efi:'Efí',lytex:'Lytex'}[provider]||provider||'Integração');
}

function zielLiveDateTime(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'});
}

function zielLiveConfiguredWallets(){
  const active=zielLiveIntegrations.filter(i=>i.enabled!==false);
  const ids=new Set(active.map(i=>i.wallet_id));
  return (state.wallets||[])
    .filter(w=>w.active!==false&&ids.has(w.id)&&(!state.businessFilter||w.business_id===state.businessFilter))
    .sort((a,b)=>{
      const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
      return biz||a.name.localeCompare(b.name,'pt-BR');
    });
}

function zielLiveIntegrationsForWallet(walletId){
  return zielLiveIntegrations.filter(i=>i.wallet_id===walletId&&i.enabled!==false);
}

function zielLiveWalletOptions(selected=''){
  return zielLiveConfiguredWallets().map(w=>{
    const integrations=zielLiveIntegrationsForWallet(w.id);
    const provider=integrations.length===1?zielLiveProviderLabel(integrations[0].provider):'múltiplas integrações';
    return `<option value="${esc(w.id)}" ${w.id===selected?'selected':''}>${esc(businessName(w.business_id))} — ${esc(w.name)} · ${esc(provider)}</option>`;
  }).join('');
}

function zielLivePaintWallet(){
  const walletId=$('zliveWallet')?.value||'';
  const note=$('zliveWalletNote');
  const btn=$('zliveQuery');
  const integrations=zielLiveIntegrationsForWallet(walletId);

  if(!walletId){
    if(note){note.className='mini';note.textContent='Selecione uma carteira integrada.';}
    if(btn)btn.disabled=true;
    return;
  }
  if(integrations.length!==1){
    if(note){
      note.className='mini r';
      note.textContent=integrations.length?'Esta carteira possui mais de uma integração ativa.':'Esta carteira não possui integração ativa.';
    }
    if(btn)btn.disabled=true;
    return;
  }

  const provider=integrations[0].provider;
  const supported=provider==='mercado_pago';
  if(note){
    note.className=supported?'mini g':'mini r';
    note.textContent=supported
      ?'Mercado Pago · consulta direta pela API usando o token desta carteira.'
      :zielLiveProviderLabel(provider)+' está configurado, mas a consulta ao vivo ainda não foi ativada para este provedor.';
  }
  if(btn)btn.disabled=!supported||zielLiveQueryInFlight;
}

function zielLivePaintDateMode(){
  const mode=$('zliveMode')?.value||'day';
  $('zliveDayWrap')?.classList.toggle('hidden',mode!=='day');
  $('zliveRangeWrap')?.classList.toggle('hidden',mode!=='period');
}

function zielLiveDates(){
  if($('zliveMode').value==='day'){
    const d=$('zliveDay').value;
    return {from:d,to:d};
  }
  return {from:$('zliveFrom').value,to:$('zliveTo').value};
}

function zielLiveSummary(){
  const host=$('zliveResult');
  if(!host)return;
  if(!zielLiveLastQuery){
    host.innerHTML='<div class="zin-query-empty">Escolha a carteira e o dia ou período para consultar diretamente a API.</div>';
    return;
  }
  const q=zielLiveLastQuery;
  const wallet=state.wallets.find(w=>w.id===q.wallet_id);
  host.innerHTML=`<div class="zin-query-summary">
    <div><small>Fonte</small><strong class="g">API ao vivo</strong><span class="mini">Não usa movimentos salvos como fonte</span></div>
    <div><small>Carteira</small><strong>${esc(wallet?.name||'Carteira')}</strong><span class="mini">${esc(businessName(wallet?.business_id))}</span></div>
    <div><small>Período consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' até '+esc(br(q.date_to)):''}</strong></div>
    <div><small>Entradas encontradas</small><strong>${Number(q.payments_found||0)}</strong></div>
    <div><small>Disponíveis para lançar</small><strong class="g">${Number(q.available_to_launch||0)}</strong></div>
    <div><small>Já lançadas</small><strong>${Number(q.already_launched||0)}</strong></div>
    <div class="zin-query-total"><small>Total bruto consultado</small><strong class="g">${fmt(Number(q.period_gross_total||0))}</strong></div>
    <div><small>Total líquido</small><strong>${fmt(Number(q.period_net_total||0))}</strong></div>
    <div><small>Taxas / deduções</small><strong class="r">${fmt(Number(q.period_fee_total||0))}</strong></div>
  </div>
  <div class="zlive-source-note"><strong>Consulta realizada agora:</strong><span>${esc(zielLiveDateTime(q.queried_at))}. Os valores acima vieram da resposta do Mercado Pago nesta consulta.</span></div>`;
}

function zielLiveCard(row){
  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  const launched=row.already_launched===true;
  const available=row.available_for_balance!==false;
  const fee=Number(row.fee_amount||0);
  const net=Number(row.net_amount??row.amount??0);
  return `<article class="zin-card zlive-card ${launched?'is-launched':''} ${!available?'zin-card-waiting':''}">
    <div class="zin-card-head">
      <div>
        <div class="zin-kind-row">
          <span class="zin-provider">${esc(zielLiveProviderLabel(row.provider))}</span>
          <span class="zin-kind payment">API AO VIVO</span>
        </div>
        <h3>${esc(row.description||'Pagamento Mercado Pago')}</h3>
        <span class="mini">${esc(businessName(row.business_id))} · ${esc(wallet?.name||'Carteira')}</span>
      </div>
      <div class="zin-amount-block">
        <strong class="zin-amount g">+${fmt(Number(row.gross_amount??row.amount??0))}</strong>
        ${fee>.009?`<small>Líquido ${fmt(net)}</small>`:''}
      </div>
    </div>
    <div class="zin-meta">
      <div><small>Data de aprovação</small><strong>${esc(zielLiveDateTime(row.approved_at||row.occurred_at))}</strong></div>
      <div><small>Método</small><strong>${esc(row.payment_method||'—')}</strong></div>
      <div><small>Status no provedor</small><strong>${esc(String(row.provider_status||'approved'))}</strong></div>
      <div><small>ID Mercado Pago</small><strong>${esc(row.external_id||'—')}</strong></div>
      ${fee>.009?`<div><small>Taxas / deduções</small><strong class="r">− ${fmt(fee)}</strong></div><div><small>Valor líquido</small><strong class="g">${fmt(net)}</strong></div>`:''}
    </div>
    ${!available?'<div class="zin-release-warning"><strong>Ainda não liberado para saldo.</strong><span>O ZIEL não permite lançar enquanto o Mercado Pago ainda não disponibilizou o valor.</span></div>':''}
    <div class="zin-foot">
      <div>${launched?'<span class="badge green">Já lançado</span>':available?'<span class="badge blue">Disponível para lançar</span>':'<span class="badge amber">Aguardando liberação</span>'}</div>
      <div class="zin-actions">
        ${launched
          ?'<button type="button" class="btn btn-soft" data-zlive-open-tx="1">Ver Lançamentos</button>'
          :available
            ?`<button type="button" class="btn btn-primary" data-zlive-launch="${esc(row.external_id)}">Lançar entrada</button>`
            :'<button type="button" class="btn btn-soft" disabled>Aguardando</button>'}
      </div>
    </div>
  </article>`;
}

function zielLivePaintRows(){
  const host=$('zliveList');
  if(!host)return;
  if(!zielLiveLastQuery){
    host.innerHTML='<div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>A lista será preenchida somente depois de uma consulta ao vivo.</span></div>';
    return;
  }

  const status=$('zliveStatus')?.value||'Todos';
  const q=String($('zliveSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
  const rows=zielLiveRows.filter(row=>{
    if(status==='Não lançadas'&&row.already_launched)return false;
    if(status==='Já lançadas'&&!row.already_launched)return false;
    if(q){
      const hay=[row.description,row.external_id,row.payment_method,row.provider_status].join(' ').toLocaleLowerCase('pt-BR');
      if(!hay.includes(q))return false;
    }
    return true;
  });

  host.innerHTML=rows.length?rows.map(zielLiveCard).join(''):'<div class="empty">Nenhuma entrada encontrada para este filtro.</div>';
  document.querySelectorAll('[data-zlive-launch]').forEach(btn=>btn.onclick=()=>zielLiveOpenLaunch(btn.dataset.zliveLaunch));
  document.querySelectorAll('[data-zlive-open-tx]').forEach(btn=>btn.onclick=()=>{showPage('lancamentos');toast('Lançamento já registrado.');});
}

async function zielLiveRunQuery(){
  if(zielLiveQueryInFlight)return;
  const walletId=$('zliveWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira integrada.','error');
  const integrations=zielLiveIntegrationsForWallet(walletId);
  if(integrations.length!==1||integrations[0].provider!=='mercado_pago')return toast('Selecione uma carteira com integração Mercado Pago ativa.','error');

  const {from,to}=zielLiveDates();
  if(!from||!to)return toast('Informe o dia ou período.','error');
  if(from>to)return toast('A data inicial não pode ser maior que a final.','error');
  const start=new Date(from+'T00:00:00'),end=new Date(to+'T00:00:00');
  const days=Math.round((end-start)/86400000);
  if(!Number.isFinite(days)||days<0||days>365)return toast('Consulte um período de até 366 dias.','error');

  const btn=$('zliveQuery');
  zielLiveQueryInFlight=true;
  btn.disabled=true;
  btn.textContent='Consultando API…';
  zielLiveRows=[];
  zielLiveLastQuery=null;
  zielLivePaintRows();
  zielLiveSummary();

  try{
    const {data,error}=await supabase.functions.invoke('wallet-integration-query-live',{
      body:{wallet_id:walletId,date_from:from,date_to:to}
    });
    if(error)throw new Error(error.message||'Falha ao consultar o backend.');
    if(!data?.ok)throw new Error(data?.error||'A consulta não foi concluída.');
    if(data.source!=='live_api')throw new Error('O backend não confirmou a fonte ao vivo da consulta.');

    zielLiveRows=Array.isArray(data.movements)?data.movements:[];
    zielLiveLastQuery=data;
    zielLiveSummary();
    zielLivePaintRows();
    toast('Consulta ao vivo concluída: '+zielLiveRows.length+' entrada(s) encontrada(s).');
  }catch(error){
    zielLiveRows=[];
    zielLiveLastQuery=null;
    zielLiveSummary();
    zielLivePaintRows();
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    zielLiveQueryInFlight=false;
    if($('zliveQuery')){
      $('zliveQuery').textContent='Consultar entradas';
      zielLivePaintWallet();
    }
  }
}

function zielLiveOpenLaunch(externalId){
  const row=zielLiveRows.find(r=>String(r.external_id)===String(externalId));
  if(!row)return toast('Entrada não encontrada na consulta atual.','error');
  if(row.already_launched)return toast('Esta entrada já foi lançada.','error');
  if(row.available_for_balance===false)return toast('Este pagamento ainda não está liberado para saldo.','error');

  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  const fee=Number(row.fee_amount||0);
  const gross=Number(row.gross_amount??row.amount??0);
  const net=Number(row.net_amount??gross);
  const defaultCategory=(state.categories||[]).find(c=>c.active!==false&&c.type==='Entrada'&&String(c.name).toLocaleLowerCase('pt-BR').includes('venda'))?.name||'';

  modal('Lançar entrada consultada na API',`
    <form id="zliveLaunchForm" class="zin-confirm-form">
      <div class="zlive-confirm-source">
        <strong>Validação em duas etapas</strong>
        <span>Ao confirmar, o backend consulta novamente o ID <b>${esc(row.external_id)}</b> no Mercado Pago antes de gravar. O valor exibido no navegador não é usado como fonte final.</span>
      </div>
      <div class="zin-confirm-summary">
        <div><small>VALOR BRUTO</small><strong class="g">${fmt(gross)}</strong></div>
        <div><small>CARTEIRA</small><strong>${esc(wallet?.name||'Carteira')}</strong><span>${esc(businessName(row.business_id))}</span></div>
      </div>
      ${fee>.009?`<div class="zlive-net-grid"><div><small>Taxas/deduções</small><strong class="r">− ${fmt(fee)}</strong></div><div><small>Valor líquido no saldo</small><strong class="g">${fmt(net)}</strong></div></div>`:''}
      <div class="field">
        <label>Categoria da entrada</label>
        <select id="zliveCategory" required>
          <option value="">Selecione</option>
          ${categoryOptions('Entrada',defaultCategory)}
        </select>
      </div>
      <div class="field">
        <label>Descrição</label>
        <input class="input" id="zliveDescription" maxlength="160" value="${esc(row.description||'Pagamento Mercado Pago')}" required>
      </div>
      <div class="zlive-dedup-note"><strong>Sem duplicidade:</strong><span>o ID externo do Mercado Pago é único no ZIEL. Se este pagamento já tiver sido lançado, o backend devolve o lançamento existente e não cria outro.</span></div>
      <div class="actions">
        <button type="button" class="btn btn-soft" id="zliveCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zliveConfirm">Confirmar lançamento</button>
      </div>
    </form>`);

  $('zliveCancel').onclick=closeModal;
  $('zliveLaunchForm').onsubmit=async e=>{
    e.preventDefault();
    const category=$('zliveCategory').value;
    const description=$('zliveDescription').value.trim();
    if(!category)return toast('Selecione a categoria.','error');
    if(!description)return toast('Informe a descrição.','error');

    const btn=$('zliveConfirm');
    btn.disabled=true;
    btn.textContent='Validando no Mercado Pago…';
    try{
      const {data,error}=await supabase.functions.invoke('wallet-integration-confirm-live',{
        body:{wallet_id:row.wallet_id,external_id:row.external_id,category,description}
      });
      if(error)throw new Error(error.message||'Falha ao lançar entrada.');
      if(!data?.ok)throw new Error(data?.error||'O lançamento não foi confirmado.');

      row.already_launched=true;
      row.transaction_id=data.transaction_id||row.transaction_id||null;
      closeModal();
      await loadAll();
      zielLivePaintRows();
      if(zielLiveLastQuery){
        zielLiveLastQuery.already_launched=zielLiveRows.filter(r=>r.already_launched).length;
        zielLiveLastQuery.available_to_launch=zielLiveRows.filter(r=>!r.already_launched&&r.available_for_balance!==false).length;
        zielLiveSummary();
      }
      toast(data.duplicate?'Este pagamento já estava lançado; nenhum duplicado foi criado.':'Entrada lançada em Lançamentos.');
    }catch(error){
      toast('Não foi possível lançar: '+(error?.message||'erro desconhecido'),'error');
      if($('zliveConfirm')){
        $('zliveConfirm').disabled=false;
        $('zliveConfirm').textContent='Confirmar lançamento';
      }
    }
  };
}

renderIncomingEntries=async function(seq){
  const today=iso();
  zielLiveRows=[];
  zielLiveLastQuery=null;

  $('content').innerHTML=setTitle(
    'Entradas via API',
    'Consulta manual e ao vivo por dia ou período; você escolhe o que será lançado'
  )+`
    <div class="zin-page">
      <section class="zin-query-card zlive-query-card">
        <div class="zin-query-head">
          <div>
            <span class="zin-auto-icon">⌕</span>
            <div><strong>Consultar entradas diretamente no provedor</strong><p>Nenhum movimento salvo anteriormente é usado como fonte desta lista. Cada clique faz uma nova consulta usando o token da carteira.</p></div>
          </div>
          <span class="zlive-live-badge">API AO VIVO</span>
        </div>

        <div class="zin-query-grid zin-query-layout">
          <div class="field zin-query-wallet">
            <label for="zliveWallet">Carteira</label>
            <select id="zliveWallet"><option value="">Carregando carteiras…</option></select>
            <div class="mini" id="zliveWalletNote"></div>
          </div>
          <div class="zin-query-controls">
            <div class="field zin-query-mode">
              <label for="zliveMode">Consulta</label>
              <select id="zliveMode"><option value="day">Um dia</option><option value="period">Período</option></select>
            </div>
            <div class="field zin-query-day" id="zliveDayWrap">
              <label for="zliveDay">Data</label>
              <input class="input" id="zliveDay" type="date" value="${today}" max="${today}">
            </div>
            <div class="zin-range hidden" id="zliveRangeWrap">
              <div class="field"><label for="zliveFrom">De</label><input class="input" id="zliveFrom" type="date" value="${today}" max="${today}"></div>
              <div class="field"><label for="zliveTo">Até</label><input class="input" id="zliveTo" type="date" value="${today}" max="${today}"></div>
            </div>
            <div class="zin-query-action"><button type="button" class="btn btn-primary" id="zliveQuery" disabled>Consultar entradas</button></div>
          </div>
        </div>
        <div id="zliveResult"></div>
      </section>

      <div class="zin-toolbar zin-toolbar-manual zlive-toolbar">
        <div class="field"><label for="zliveStatus">Situação</label><select id="zliveStatus"><option>Todos</option><option>Não lançadas</option><option>Já lançadas</option></select></div>
        <div class="field"><label for="zliveSearch">Buscar</label><input class="input" id="zliveSearch" type="search" placeholder="Descrição, ID ou método"></div>
      </div>

      <div id="zliveList"><div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o período acima.</span></div></div>

      <div class="zin-duplicate-note">
        <strong>Proteção contra duplicidade</strong>
        <span>O ZIEL usa <b>instituição + ID externo do pagamento</b>. A consulta pode ser repetida quantas vezes quiser; um pagamento já lançado não gera outro lançamento.</span>
      </div>
    </div>`;

  $('zliveMode').onchange=zielLivePaintDateMode;
  $('zliveWallet').onchange=zielLivePaintWallet;
  $('zliveQuery').onclick=zielLiveRunQuery;
  $('zliveStatus').onchange=zielLivePaintRows;
  $('zliveSearch').oninput=zielLivePaintRows;
  zielLivePaintDateMode();
  zielLiveSummary();
  zielLivePaintRows();

  try{
    const {data,error}=await supabase.rpc('list_wallet_integrations');
    if(error)throw error;
    zielLiveIntegrations=(Array.isArray(data)?data:[]).filter(i=>i.enabled!==false);
    const wallets=zielLiveConfiguredWallets();
    $('zliveWallet').innerHTML=wallets.length?zielLiveWalletOptions(wallets[0]?.id||''):'<option value="">Nenhuma carteira com integração ativa</option>';
    $('zliveWallet').disabled=!wallets.length;
    zielLivePaintWallet();
  }catch(error){
    const host=$('zliveList');
    if(host)host.innerHTML='<div class="message error">Não foi possível carregar as integrações: '+esc(error?.message||'erro desconhecido')+'</div>';
  }
};

const _zielLivePreviousRenderShell=renderShell;
renderShell=function(){
  _zielLivePreviousRenderShell();
  const btn=document.querySelector('.sidebar .nav [data-page="entradas-importadas"]');
  if(btn)btn.textContent='⇩ Entradas via API';
};
