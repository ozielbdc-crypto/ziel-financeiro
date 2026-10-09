// Consulta manual de entradas — Mercado Pago, Asaas, Efí e Lytex.
// Fluxo: escolher carteira -> dia/período -> revisar -> confirmar -> Lançamentos.
// A tela consulta somente recebimentos; transferências ficam fora deste fluxo.

zielLoadIncomingIntegrations = async function(){
  const {data,error}=await supabase.rpc('list_wallet_integrations');
  if(error)throw error;
  zielIncomingIntegrations=(Array.isArray(data)?data:[])
    .filter(i=>i.enabled!==false&&['mercado_pago','asaas','efi','lytex'].includes(i.provider));
  return zielIncomingIntegrations;
};

zielIncomingProviderSupported = function(provider){
  return ['mercado_pago','asaas','efi','lytex'].includes(provider);
};

zielIncomingPaintWallet = function(){
  const walletId=$('zinQueryWallet')?.value||'';
  const note=$('zinWalletIntegrationNote');
  const button=$('zinQueryButton');
  const integrations=zielIncomingIntegrationsForWallet(walletId);

  if(!walletId){
    if(note){
      note.textContent='Selecione uma carteira com Mercado Pago, Asaas, Efí ou Lytex configurado.';
      note.className='mini';
    }
    if(button)button.disabled=true;
    return;
  }

  if(integrations.length!==1){
    if(note){
      note.textContent=integrations.length
        ?'Esta carteira possui mais de uma integração ativa. Mantenha somente uma instituição vinculada à carteira.'
        :'Esta carteira não possui integração ativa.';
      note.className='mini r';
    }
    if(button)button.disabled=true;
    return;
  }

  const provider=integrations[0].provider;
  const supported=zielIncomingProviderSupported(provider);
  if(note){
    note.textContent=supported
      ?zielIncomingProviderLabel(provider)+' · consulta manual de recebimentos usando a credencial protegida desta carteira.'
      :zielIncomingProviderLabel(provider)+' ainda não possui conector de consulta.';
    note.className=supported?'mini g':'mini r';
  }
  if(button)button.disabled=zielIncomingQueryInFlight||!supported;
};

zielRunIncomingQuery = async function(){
  if(zielIncomingQueryInFlight)return;

  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira integrada.','error');

  const integrations=zielIncomingIntegrationsForWallet(walletId);
  if(integrations.length!==1){
    return toast(
      integrations.length
        ?'Esta carteira possui mais de uma integração ativa. Corrija em Integrações / Tokens.'
        :'Esta carteira não possui integração ativa.',
      'error'
    );
  }

  const provider=integrations[0].provider;
  if(!zielIncomingProviderSupported(provider)){
    return toast('A consulta de '+zielIncomingProviderLabel(provider)+' ainda não está disponível.','error');
  }

  const {from,to}=zielIncomingQueryDates();
  if(!from||!to)return toast('Informe a data ou período da consulta.','error');
  if(from>to)return toast('A data inicial não pode ser maior que a data final.','error');

  const start=new Date(from+'T00:00:00');
  const end=new Date(to+'T00:00:00');
  const days=Math.round((end-start)/86400000);
  if(!Number.isFinite(days)||days<0)return toast('Período inválido.','error');
  if(days>365)return toast('Consulte no máximo 366 dias por vez.','error');

  const btn=$('zinQueryButton');
  zielIncomingQueryInFlight=true;
  if(btn){
    btn.disabled=true;
    btn.textContent='Consultando '+zielIncomingProviderLabel(provider)+'…';
  }

  try{
    const functionName=provider==='lytex'
      ?'wallet-integration-query-lytex'
      :provider==='efi'
        ?'wallet-integration-query-efi'
        :'wallet-integration-query';

    const {data,error}=await supabase.functions.invoke(functionName,{
      body:{
        wallet_id:walletId,
        date_from:from,
        date_to:to,
        payments_only:true
      }
    });

    if(error){
      let message=error.message||'Falha ao consultar o backend.';
      try{
        const response=error.context;
        if(response&&typeof response.clone==='function'){
          const payload=await response.clone().json();
          if(payload?.error)message=payload.error;
        }
      }catch(_){}
      throw new Error(message);
    }

    if(!data?.ok)throw new Error(data?.error||'A consulta não foi concluída.');

    const actualProvider=String(data.provider||provider);
    if(actualProvider!==provider){
      throw new Error('A consulta retornou um provedor diferente da configuração da carteira.');
    }

    await zielLoadIncomingEntries();

    const periodRows=zielIncomingRows.filter(row=>{
      if(row.wallet_id!==walletId||row.provider!==provider)return false;
      if(row.movement_kind==='transfer')return false;
      const key=zielIncomingDateKey(row.approved_at||row.occurred_at);
      return !!key&&key>=from&&key<=to;
    });

    const paymentRows=[...new Map(periodRows.map(row=>[
      String(row.provider||'')+'|'+String(row.external_id||row.id||''),
      row
    ])).values()];

    const grossTotal=paymentRows.reduce((sum,row)=>sum+Number(row.gross_amount??row.amount??0),0);
    const netTotal=paymentRows.reduce((sum,row)=>sum+Number(row.net_amount??row.gross_amount??row.amount??0),0);
    const feeTotal=paymentRows.reduce((sum,row)=>sum+Number(row.fee_amount??0),0);
    const awaiting=paymentRows.filter(row=>row.available_for_balance===false).length;

    zielIncomingLastQuery={
      ...data,
      wallet_id:walletId,
      provider,
      date_from:from,
      date_to:to,
      payments_only:true,
      payments_found:paymentRows.length,
      transfers_found:0,
      outgoing_transfers_found:0,
      incoming_transfers_found:0,
      ambiguous_transfers_found:0,
      period_gross_total:Math.round(grossTotal*100)/100,
      period_net_total:Math.round(netTotal*100)/100,
      period_fee_total:Math.round(feeTotal*100)/100,
      awaiting_release:awaiting,
      new_entries:Number(data.new_entries??data.payments_new??0),
      updated_entries:Number(data.updated_entries??data.payments_updated??data.already_existing??0)
    };

    if($('zinWalletFilter'))$('zinWalletFilter').value=walletId;
    if($('zinStatus'))$('zinStatus').value='Todos';

    zielPaintQueryResult();
    zielPaintIncoming();

    toast(
      'Consulta '+zielIncomingProviderLabel(provider)+' concluída: '+
      paymentRows.length+' recebimento(s), '+
      Number(zielIncomingLastQuery.new_entries||0)+' novo(s) e '+
      Number(zielIncomingLastQuery.updated_entries||0)+' já conhecido(s)/atualizado(s).'
    );
  }catch(error){
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    zielIncomingQueryInFlight=false;
    if($('zinQueryButton'))$('zinQueryButton').textContent='Consultar entradas';
    zielIncomingPaintWallet();
  }
};

zielPaintQueryResult = function(){
  const host=$('zinQueryResult');
  if(!host)return;

  const q=zielIncomingLastQuery;
  if(!q){
    host.innerHTML='<div class="zin-query-empty">Escolha uma carteira e o dia ou período para consultar os recebimentos.</div>';
    return;
  }

  const wallet=state.wallets.find(w=>w.id===q.wallet_id);
  const providerLabel=zielIncomingProviderLabel(q.provider);

  host.innerHTML=`<div class="zin-query-summary">
    <div><small>Carteira</small><strong>${esc(wallet?.name||'Carteira')}</strong><span class="mini">${esc(businessName(wallet?.business_id))}</span></div>
    <div><small>Instituição</small><strong>${esc(providerLabel)}</strong><span class="mini">Credencial protegida da carteira</span></div>
    <div><small>Período consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' até '+esc(br(q.date_to)):''}</strong></div>
    <div><small>Entradas encontradas</small><strong>${Number(q.payments_found||0)}</strong></div>
    <div class="zin-query-total"><small>${q.date_from===q.date_to?'Total bruto do dia':'Total bruto no período'}</small><strong class="g">${fmt(Number(q.period_gross_total||0))}</strong></div>
    <div><small>Total líquido</small><strong>${fmt(Number(q.period_net_total??q.period_gross_total??0))}</strong></div>
    <div><small>Taxas / deduções</small><strong class="r">${fmt(Number(q.period_fee_total||0))}</strong></div>
    <div><small>Novas na consulta</small><strong class="g">${Number(q.new_entries||0)}</strong></div>
    <div><small>Já conhecidas</small><strong>${Number(q.updated_entries||0)}</strong></div>
    <div><small>Aguardando liberação</small><strong class="a">${Number(q.awaiting_release||0)}</strong></div>
  </div>
  <p class="mini">A consulta é manual. Nenhuma entrada vira lançamento sem sua confirmação. O ZIEL usa <b>provedor + ID externo</b> para impedir duplicidade ao consultar novamente e ao lançar.</p>`;
};

renderIncomingEntries = async function(seq=zielIncomingRenderSeq){
  const today=iso();

  zielIncomingRows=[];
  zielIncomingLastQuery=null;

  $('content').innerHTML=setTitle(
    'Consultar entradas',
    'Mercado Pago, Asaas, Efí e Lytex · consulta manual por dia ou período e lançamento somente após confirmação'
  )+`
    <div class="zin-page">
      <section class="zin-query-card">
        <div class="zin-query-head">
          <div>
            <span class="zin-auto-icon">⌕</span>
            <div>
              <strong>Consultar entradas da carteira</strong>
              <p>Escolha a carteira e o período. O ZIEL usa automaticamente o conector da instituição vinculada àquela carteira.</p>
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
              <label for="zinQueryMode">Consulta</label>
              <select id="zinQueryMode">
                <option value="day">Um dia</option>
                <option value="period">Período</option>
              </select>
            </div>

            <div class="field zin-query-day" id="zinDayWrap">
              <label for="zinQueryDay">Data</label>
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

      <div class="zin-stats">
        <div><span>Pendentes</span><strong id="zinPending">—</strong><small>Entradas consultadas ainda não lançadas</small></div>
        <div><span>Confirmadas</span><strong id="zinConfirmed">—</strong><small>Já constam em Lançamentos</small></div>
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
          <label for="zinWalletFilter">Carteira</label>
          <select id="zinWalletFilter"><option value="">Todas</option></select>
        </div>

        <div class="field">
          <label for="zinSearch">Buscar entrada</label>
          <input class="input" id="zinSearch" type="search" placeholder="Descrição, ID ou método">
        </div>
      </div>

      <div id="zinList">
        <div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o período acima para buscar entradas.</span></div>
      </div>

      <div class="zin-duplicate-note">
        <strong>Proteção contra duplicidade</strong>
        <span>Cada entrada é identificada por <b>instituição + ID externo</b>. Reconsultar o mesmo período atualiza o registro existente; uma entrada já confirmada não pode gerar um segundo lançamento.</span>
      </div>
    </div>`;

  $('zinQueryMode').onchange=zielIncomingPaintDateMode;
  $('zinQueryWallet').onchange=zielIncomingPaintWallet;
  $('zinQueryButton').onclick=zielRunIncomingQuery;
  $('zinStatus').onchange=zielPaintIncoming;
  $('zinWalletFilter').onchange=zielPaintIncoming;
  $('zinSearch').oninput=zielPaintIncoming;

  zielIncomingPaintDateMode();
  zielPaintQueryResult();

  try{
    await zielLoadIncomingIntegrations();
    if(seq!==zielIncomingRenderSeq)return;

    const wallets=zielIncomingConfiguredWallets();
    $('zinQueryWallet').innerHTML=wallets.length
      ?zielIncomingWalletOptions(wallets[0]?.id||'')
      :'<option value="">Nenhuma carteira Mercado Pago, Asaas, Efí ou Lytex com token ativo</option>';
    $('zinQueryWallet').disabled=!wallets.length;

    $('zinWalletFilter').innerHTML='<option value="">Todas</option>'+
      wallets.map(w=>`<option value="${esc(w.id)}">${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');

    zielIncomingPaintWallet();
    zielPaintIncoming();
  }catch(error){
    if(seq!==zielIncomingRenderSeq)return;
    const host=$('zinList');
    if(host)host.innerHTML='<div class="message error">Não foi possível carregar as integrações: '+esc(error?.message||'erro desconhecido')+'</div>';
  }
};

const _zielMultiIncomingPreviousRenderShell=renderShell;
renderShell=function(){
  _zielMultiIncomingPreviousRenderShell();
  const btn=document.querySelector('.sidebar .nav [data-page="entradas-importadas"]');
  if(btn)btn.textContent='⇩ Consultar entradas';
};
