// Fluxo final e simplificado de consulta manual de entradas.
// Regra: consultar por dia/período -> selecionar -> confirmar -> lançar.
// Nenhuma consulta ou lançamento acontece automaticamente.

function zielManualIncomingRows(){
  if(!zielIncomingLastQuery)return [];
  return (zielIncomingRows||[]).filter(row=>{
    if(row.wallet_id!==zielIncomingLastQuery.wallet_id)return false;
    if(row.provider!==zielIncomingLastQuery.provider)return false;
    if(row.movement_kind==='transfer')return false;
    const key=zielIncomingDateKey(row.approved_at||row.occurred_at||row.imported_at);
    return !!key&&key>=zielIncomingLastQuery.date_from&&key<=zielIncomingLastQuery.date_to;
  });
}

zielPaintQueryResult=function(){
  const host=$('zinQueryResult');
  if(!host)return;
  const q=zielIncomingLastQuery;
  if(!q){
    host.innerHTML='<div class="zin-query-empty">Nenhuma consulta realizada. Escolha a carteira e a data ou período.</div>';
    return;
  }

  const wallet=state.wallets.find(w=>w.id===q.wallet_id);
  const rows=zielManualIncomingRows();
  const pending=rows.filter(r=>r.decision_status==='Pendente'&&r.available_for_balance!==false&&!r.transaction_id).length;
  const confirmed=rows.filter(r=>r.decision_status==='Confirmado'||r.transaction_id).length;
  const awaiting=rows.filter(r=>r.available_for_balance===false).length;
  const total=rows.reduce((s,r)=>s+Number(r.gross_amount??r.amount??0),0);

  host.innerHTML=`
    <div class="zin-query-summary">
      <div><small>Carteira</small><strong>${esc(wallet?.name||'Carteira')}</strong><span class="mini">${esc(businessName(wallet?.business_id))}</span></div>
      <div><small>Instituição</small><strong>${esc(zielIncomingProviderLabel(q.provider))}</strong></div>
      <div><small>Período consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' até '+esc(br(q.date_to)):''}</strong></div>
      <div><small>Entradas encontradas</small><strong>${rows.length}</strong></div>
      <div><small>Pendentes para lançar</small><strong class="a">${pending}</strong></div>
      <div><small>Já lançadas</small><strong class="g">${confirmed}</strong></div>
      <div><small>Aguardando liberação</small><strong>${awaiting}</strong></div>
      <div class="zin-query-total"><small>Total bruto consultado</small><strong class="g">${fmt(total)}</strong></div>
    </div>
    <div class="zin-manual-proof">
      <strong>Consulta manual concluída.</strong>
      <span>Nada foi lançado automaticamente. Selecione as entradas desejadas abaixo e confirme o lançamento.</span>
    </div>
  `;
};

zielPaintIncoming=function(){
  const host=$('zinList');
  if(!host)return;

  if(!zielIncomingLastQuery){
    if($('zinPending'))$('zinPending').textContent='—';
    if($('zinConfirmed'))$('zinConfirmed').textContent='—';
    if($('zinIgnored'))$('zinIgnored').textContent='—';
    host.innerHTML='<div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha um dia ou período e clique em <b>Consultar entradas</b>.</span></div>';
    return;
  }

  const base=zielManualIncomingRows();
  const status=$('zinStatus')?.value||'Pendente';
  const q=String($('zinSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');

  const pending=base.filter(r=>r.decision_status==='Pendente').length;
  const confirmed=base.filter(r=>r.decision_status==='Confirmado'||r.transaction_id).length;
  const ignored=base.filter(r=>r.decision_status==='Ignorado').length;
  if($('zinPending'))$('zinPending').textContent=String(pending);
  if($('zinConfirmed'))$('zinConfirmed').textContent=String(confirmed);
  if($('zinIgnored'))$('zinIgnored').textContent=String(ignored);

  const rows=base.filter(row=>{
    if(status!=='Todos'){
      if(status==='Confirmado'){
        if(!(row.decision_status==='Confirmado'||row.transaction_id))return false;
      }else if(row.decision_status!==status)return false;
    }
    if(q){
      const hay=[
        row.description,row.external_id,row.external_reference,row.payment_method,
        row.payment_method_id,row.payment_type_id,zielIncomingProviderLabel(row.provider)
      ].join(' ').toLocaleLowerCase('pt-BR');
      if(!hay.includes(q))return false;
    }
    return true;
  });

  host.innerHTML=rows.length
    ?rows.map(zielIncomingCard).join('')
    :'<div class="empty">Nenhuma entrada encontrada para este filtro.</div>';

  zielBindIncomingActions();

  if(typeof zielIncomingInstallBatchBar==='function'){
    zielIncomingInstallBatchBar();
    if(typeof zielIncomingBindSelection==='function')zielIncomingBindSelection();
    if(typeof zielIncomingPaintBatchBar==='function')zielIncomingPaintBatchBar();
  }
};

zielRunIncomingQuery=async function(){
  if(zielIncomingQueryInFlight)return;

  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira integrada.','error');

  const integrations=zielIncomingIntegrationsForWallet(walletId);
  if(integrations.length!==1){
    return toast(integrations.length
      ?'Esta carteira possui mais de uma integração ativa. Ajuste em Integrações / Tokens.'
      :'Esta carteira não possui integração ativa.','error');
  }

  const provider=integrations[0].provider;
  if(!zielIncomingProviderSupported(provider)){
    return toast('A consulta de '+zielIncomingProviderLabel(provider)+' ainda não está disponível.','error');
  }

  const dates=zielIncomingQueryDates();
  const from=dates.from,to=dates.to;
  if(!from||!to)return toast('Informe a data ou período.','error');
  if(from>to)return toast('A data inicial não pode ser maior que a final.','error');

  const days=Math.round((new Date(to+'T00:00:00')-new Date(from+'T00:00:00'))/86400000);
  if(!Number.isFinite(days)||days<0)return toast('Período inválido.','error');
  if(days>365)return toast('Consulte no máximo 366 dias por vez.','error');

  const button=$('zinQueryButton');
  zielIncomingQueryInFlight=true;
  if(button){
    button.disabled=true;
    button.textContent='Consultando '+zielIncomingProviderLabel(provider)+'…';
  }

  try{
    const functionName=provider==='lytex'
      ?'wallet-integration-query-lytex'
      :provider==='efi'
        ?'wallet-integration-query-efi'
        :'wallet-integration-query';

    const data=await zielInvokeIncomingProvider(functionName,{
      wallet_id:walletId,
      date_from:from,
      date_to:to,
      payments_only:true
    });

    const actualProvider=String(data.provider||provider);
    if(actualProvider!==provider){
      throw new Error('A consulta retornou uma instituição diferente da carteira selecionada.');
    }

    await zielLoadIncomingPeriodRows(walletId,provider,from,to);

    // Defesa extra no frontend. A trava real também existe no banco:
    // owner + provider + external_id.
    zielIncomingRows=[...new Map((zielIncomingRows||[]).map(row=>[
      String(row.provider||'')+'|'+String(row.external_id||row.id||''),
      row
    ])).values()];

    zielIncomingLastQuery={
      ...data,
      wallet_id:walletId,
      provider,
      date_from:from,
      date_to:to,
      payments_only:true
    };

    if(typeof zielIncomingSelected!=='undefined'&&zielIncomingSelected?.clear)zielIncomingSelected.clear();
    if($('zinStatus'))$('zinStatus').value='Pendente';

    zielPaintQueryResult();
    zielPaintIncoming();

    const rows=zielManualIncomingRows();
    const eligible=rows.filter(r=>r.decision_status==='Pendente'&&r.available_for_balance!==false&&!r.transaction_id);
    toast('Consulta concluída: '+rows.length+' entrada(s) encontrada(s) · '+eligible.length+' pendente(s) para lançar.');

    const result=$('zinQueryResult');
    if(result?.scrollIntoView)setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),40);
  }catch(error){
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    zielIncomingQueryInFlight=false;
    zielIncomingPaintWallet();
    if(button&&document.body.contains(button))button.textContent='Consultar entradas';
  }
};

renderIncomingEntries=async function(seq=zielIncomingRenderSeq){
  const today=iso();
  zielIncomingRows=[];
  zielIncomingLastQuery=null;
  if(typeof zielIncomingSelected!=='undefined'&&zielIncomingSelected?.clear)zielIncomingSelected.clear();

  $('content').innerHTML=setTitle(
    'Consultar entradas',
    'Consulta manual por dia ou período · lançamento somente após sua confirmação'
  )+`
    <div class="zin-page">
      <section class="zin-query-card">
        <div class="zin-query-head">
          <div>
            <span class="zin-auto-icon">⌕</span>
            <div>
              <strong>Consultar entradas da carteira</strong>
              <p>Escolha a carteira e consulte somente quando quiser. O ZIEL não busca nem lança entradas automaticamente nesta tela.</p>
            </div>
          </div>
          <span class="zin-manual-badge">MANUAL</span>
        </div>

        <div class="zin-query-grid zin-query-layout">
          <div class="field zin-query-wallet">
            <label for="zinQueryWallet">Carteira integrada</label>
            <select id="zinQueryWallet"><option value="">Carregando carteiras…</option></select>
            <div class="mini zin-wallet-integration-note" id="zinWalletIntegrationNote"></div>
          </div>

          <div class="zin-query-controls">
            <div class="field zin-query-mode">
              <label for="zinQueryMode">Consultar por</label>
              <select id="zinQueryMode">
                <option value="day">Um dia</option>
                <option value="period">Período</option>
              </select>
            </div>

            <div class="field zin-query-day" id="zinDayWrap">
              <label for="zinQueryDay">Dia</label>
              <input class="input" id="zinQueryDay" type="date" value="${today}" max="${today}">
            </div>

            <div class="zin-range hidden" id="zinRangeWrap">
              <div class="field">
                <label for="zinQueryFrom">De</label>
                <input class="input" id="zinQueryFrom" type="date" value="${today}" max="${today}">
              </div>
              <div class="field">
                <label for="zinQueryTo">Até</label>
                <input class="input" id="zinQueryTo" type="date" value="${today}" max="${today}">
              </div>
            </div>

            <div class="zin-query-action">
              <button type="button" class="btn btn-primary" id="zinQueryButton" disabled>Consultar entradas</button>
            </div>
          </div>
        </div>

        <div id="zinQueryResult"></div>
      </section>

      <div class="zin-manual-rules">
        <div><strong>1. Consultar</strong><span>Escolha o dia ou período.</span></div>
        <div><strong>2. Selecionar</strong><span>Marque somente as entradas que deseja lançar.</span></div>
        <div><strong>3. Confirmar</strong><span>O lançamento só nasce depois da sua confirmação.</span></div>
      </div>

      <div class="zin-stats">
        <div><span>Pendentes</span><strong id="zinPending">—</strong><small>Ainda não lançadas</small></div>
        <div><span>Confirmadas</span><strong id="zinConfirmed">—</strong><small>Já estão em Lançamentos</small></div>
        <div><span>Ignoradas</span><strong id="zinIgnored">—</strong><small>Não serão lançadas</small></div>
      </div>

      <div class="zin-toolbar zin-toolbar-manual">
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
          <input class="input" id="zinSearch" type="search" placeholder="Descrição, ID ou método">
        </div>
      </div>

      <div id="zinList">
        <div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o dia ou período acima.</span></div>
      </div>

      <div class="zin-duplicate-note">
        <strong>Duplicidade bloqueada no banco</strong>
        <span>O ZIEL identifica cada recebimento por <b>instituição + ID externo</b>. Reconsultar o mesmo período não cria outra entrada, e um recebimento já confirmado não pode gerar um segundo lançamento.</span>
      </div>
    </div>`;

  $('zinQueryMode').onchange=zielIncomingPaintDateMode;
  $('zinQueryWallet').onchange=zielIncomingPaintWallet;
  $('zinQueryButton').onclick=zielRunIncomingQuery;
  $('zinStatus').onchange=zielPaintIncoming;
  $('zinSearch').oninput=zielPaintIncoming;

  zielIncomingPaintDateMode();
  zielPaintQueryResult();

  try{
    await zielLoadIncomingIntegrations();
    if(seq!==zielIncomingRenderSeq)return;

    const wallets=zielIncomingConfiguredWallets();
    $('zinQueryWallet').innerHTML=wallets.length
      ?zielIncomingWalletOptions(wallets[0]?.id||'')
      :'<option value="">Nenhuma carteira com integração ativa</option>';
    $('zinQueryWallet').disabled=!wallets.length;

    zielIncomingPaintWallet();
    zielPaintIncoming();
  }catch(error){
    if(seq!==zielIncomingRenderSeq)return;
    const host=$('zinList');
    if(host)host.innerHTML='<div class="message error">Não foi possível carregar as integrações: '+esc(error?.message||'erro desconhecido')+'</div>';
  }
};

const _zielManualFinalRenderShell=renderShell;
renderShell=function(){
  _zielManualFinalRenderShell();
  const btn=document.querySelector('.sidebar .nav [data-page="entradas-importadas"]');
  if(btn){
    btn.textContent='⇩ Consultar entradas';
    btn.title='Consulta manual por dia ou período';
  }
};
