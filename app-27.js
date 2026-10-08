// Consulta manual de vendas \u2014 Mercado Pago apenas.
// Mant\u00E9m o fluxo: consultar por dia/per\u00EDodo -> revisar -> confirmar -> Lan\u00E7amentos.
// Transfer\u00EAncias e outros provedores ficam fora desta tela.

zielLoadIncomingIntegrations = async function(){
  const {data,error}=await supabase.rpc('list_wallet_integrations');
  if(error)throw error;
  zielIncomingIntegrations=(Array.isArray(data)?data:[])
    .filter(i=>i.enabled!==false&&i.provider==='mercado_pago');
  return zielIncomingIntegrations;
};

zielIncomingProviderSupported = function(provider){
  return provider==='mercado_pago';
};

zielIncomingPaintWallet = function(){
  const walletId=$('zinQueryWallet')?.value||'';
  const note=$('zinWalletIntegrationNote');
  const button=$('zinQueryButton');
  const integrations=zielIncomingIntegrationsForWallet(walletId);

  if(!walletId){
    if(note){note.textContent='Selecione uma carteira com token Mercado Pago configurado.';note.className='mini';}
    if(button)button.disabled=true;
    return;
  }

  if(integrations.length!==1||integrations[0].provider!=='mercado_pago'){
    if(note){
      note.textContent='Esta tela aceita somente uma integra\u00E7\u00E3o Mercado Pago ativa por carteira.';
      note.className='mini r';
    }
    if(button)button.disabled=true;
    return;
  }

  if(note){
    note.textContent='Mercado Pago \u00B7 consulta manual de vendas aprovadas usando o token protegido desta carteira.';
    note.className='mini g';
  }
  if(button)button.disabled=zielIncomingQueryInFlight;
};

zielRunIncomingQuery = async function(){
  if(zielIncomingQueryInFlight)return;

  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira Mercado Pago.','error');

  const integrations=zielIncomingIntegrationsForWallet(walletId);
  if(integrations.length!==1||integrations[0].provider!=='mercado_pago'){
    return toast('Esta tela consulta somente carteiras com token Mercado Pago ativo.','error');
  }

  const {from,to}=zielIncomingQueryDates();
  if(!from||!to)return toast('Informe a data ou per\u00EDodo da consulta.','error');
  if(from>to)return toast('A data inicial n\u00E3o pode ser maior que a data final.','error');

  const start=new Date(from+'T00:00:00');
  const end=new Date(to+'T00:00:00');
  const days=Math.round((end-start)/86400000);
  if(!Number.isFinite(days)||days<0)return toast('Per\u00EDodo inv\u00E1lido.','error');
  if(days>365)return toast('Consulte no m\u00E1ximo 366 dias por vez.','error');

  const btn=$('zinQueryButton');
  zielIncomingQueryInFlight=true;
  if(btn){
    btn.disabled=true;
    btn.textContent='Consultando vendas\u2026';
  }

  try{
    const {data,error}=await supabase.functions.invoke('wallet-integration-query',{
      body:{
        wallet_id:walletId,
        date_from:from,
        date_to:to,
        payments_only:true
      }
    });

    if(error)throw new Error(error.message||'Falha ao consultar o backend.');
    if(!data?.ok)throw new Error(data?.error||'A consulta n\u00E3o foi conclu\u00EDda.');
    if(String(data.provider||'mercado_pago')!=='mercado_pago'){
      throw new Error('A consulta retornou um provedor diferente do Mercado Pago.');
    }

    await zielLoadIncomingEntries();

    const periodRows=zielIncomingRows.filter(row=>{
      if(row.wallet_id!==walletId||row.provider!=='mercado_pago')return false;
      if(row.movement_kind==='transfer')return false;
      const key=zielIncomingDateKey(row.approved_at||row.occurred_at);
      return !!key&&key>=from&&key<=to;
    });

    const paymentRows=[...new Map(periodRows.map(row=>[
      String(row.external_id||row.id||''),
      row
    ])).values()];

    const grossTotal=paymentRows.reduce((sum,row)=>sum+Number(row.gross_amount??row.amount??0),0);
    const netTotal=paymentRows.reduce((sum,row)=>sum+Number(row.net_amount??row.gross_amount??row.amount??0),0);
    const feeTotal=paymentRows.reduce((sum,row)=>sum+Number(row.fee_amount??0),0);
    const awaiting=paymentRows.filter(row=>row.available_for_balance===false).length;

    zielIncomingLastQuery={
      ...data,
      wallet_id:walletId,
      provider:'mercado_pago',
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
      updated_entries:Number(data.updated_entries??data.already_existing??0)
    };

    if($('zinWalletFilter'))$('zinWalletFilter').value=walletId;
    if($('zinStatus'))$('zinStatus').value='Todos';

    zielPaintQueryResult();
    zielPaintIncoming();

    toast(
      'Consulta conclu\u00EDda: '+paymentRows.length+' venda(s), '+
      Number(zielIncomingLastQuery.new_entries||0)+' nova(s) e '+
      Number(zielIncomingLastQuery.updated_entries||0)+' j\u00E1 existente(s)/atualizada(s).'
    );
  }catch(error){
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    zielIncomingQueryInFlight=false;
    if($('zinQueryButton'))$('zinQueryButton').textContent='Consultar vendas';
    zielIncomingPaintWallet();
  }
};

zielPaintQueryResult = function(){
  const host=$('zinQueryResult');
  if(!host)return;

  const q=zielIncomingLastQuery;
  if(!q){
    host.innerHTML='<div class="zin-query-empty">Escolha a carteira Mercado Pago e o dia ou per\u00EDodo para consultar as vendas.</div>';
    return;
  }

  const wallet=state.wallets.find(w=>w.id===q.wallet_id);
  host.innerHTML=`<div class="zin-query-summary">
    <div><small>Carteira</small><strong>${esc(wallet?.name||'Carteira')}</strong><span class="mini">${esc(businessName(wallet?.business_id))}</span></div>
    <div><small>Provedor</small><strong>Mercado Pago</strong><span class="mini">Token protegido da carteira</span></div>
    <div><small>Per\u00EDodo consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' at\u00E9 '+esc(br(q.date_to)):''}</strong></div>
    <div><small>Vendas encontradas</small><strong>${Number(q.payments_found||0)}</strong></div>
    <div class="zin-query-total"><small>${q.date_from===q.date_to?'Total bruto do dia':'Total bruto no per\u00EDodo'}</small><strong class="g">${fmt(Number(q.period_gross_total||0))}</strong></div>
    <div><small>Total l\u00EDquido</small><strong>${fmt(Number(q.period_net_total??q.period_gross_total??0))}</strong></div>
    <div><small>Taxas / dedu\u00E7\u00F5es</small><strong class="r">${fmt(Number(q.period_fee_total||0))}</strong></div>
    <div><small>Novas na consulta</small><strong class="g">${Number(q.new_entries||0)}</strong></div>
    <div><small>J\u00E1 conhecidas</small><strong>${Number(q.updated_entries||0)}</strong></div>
    <div><small>Aguardando libera\u00E7\u00E3o</small><strong class="a">${Number(q.awaiting_release||0)}</strong></div>
  </div>
  <p class="mini">A consulta \u00E9 manual. Nenhuma venda vira lan\u00E7amento sem sua confirma\u00E7\u00E3o. O <b>ID do pagamento do Mercado Pago</b> \u00E9 usado para impedir duplicidade ao reconsultar e ao lan\u00E7ar.</p>`;
};

renderIncomingEntries = async function(seq=zielIncomingRenderSeq){
  const today=iso();

  zielIncomingRows=[];
  zielIncomingLastQuery=null;

  $('content').innerHTML=setTitle(
    'Consulta de vendas \u2014 Mercado Pago',
    'Escolha um dia ou per\u00EDodo, revise as vendas e lance somente as que voc\u00EA confirmar'
  )+`
    <div class="zin-page">
      <section class="zin-query-card">
        <div class="zin-query-head">
          <div>
            <span class="zin-auto-icon">\u2315</span>
            <div>
              <strong>Consultar vendas pelo token do Mercado Pago/</strong>
              <p>A busca \u00E9 feita somente quando voc\u00EA clicar em Consultar vendas. N\u00E3o existe consulta autom\u00D1tica nesta tela.</p>
            </div>
          </div>
          <span class="zin-manual-badge">MANUAL</span>
        </div>

        <div class="zin-query-grid zin-query-layout">
          <div class="field zin-query-wallet">
            <label for="zinQueryWallet">Carteira Mercado Pago</label>
            <select id="zinQueryWallet"><option value="">Carregando carteiras\u2026</option></select>
            <div class="mini zin-wallet-integration-note" id="zinWalletIntegrationNote"></div>
          </div>

          <div class="zin-query-controls">
            <div class="field zin-query-mode">
              <label for="zinQueryMode">Consulta</label>
              <select id="zinQueryMode">
                <option value="day">Um dia</option>
                <option value="period">Per\u00EDodo</option>
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
                <label for="zinQueryTo">At\u00E9</label>
                <input class="input" id="zinQueryTo" type="date" value="${today}" max="${today}">
              </div>
            </div>

            <div class="zin-query-action">
              <button type="button" class="btn btn-primary" id="zinQueryButton" disabled>Consultar vendas</button>
            </div>
          </div>
        </div>

        <div id="zinQueryResult"></div>
      </section>

      <div class="zin-stats">
        <div><span>Pendentes</span><strong id="zinPending">\u2014</strong><small>Vendas consultadas ainda n\u00E3o lan\u00E7adas</small></div>
        <div><span>Confirmadas</span><strong id="zinConfirmed">\u2014</strong><small>J\u00E1 constam em Lan\u00E7amentos</small></div>
        <div><span>Ignoradas</span><strong id="zinIgnored">\u2014</strong><small>N\u00E3o ser\u00E3o lan\u00E7adas</small></div>
      </div>

      <div class="zin-toolbar zin-toolbar-manual">
        <div class="field">
          <label for="zinStatus">Situa\u00E7\u00E3o </label>
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
          <label for="zinSearch">Buscar venda</label>
          <input class="input" id="zinSearch" type="search" placeholder="Descri\u00E7\u00E3o, ID ou m\u00E9todo">
        </div>
      </div>

      <div id="zinList">
        <div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o per\u00EDodo acima para buscar vendas do Mercado Pago.</span></div>
      </div>

      <div class="zin-duplicate-note">
        <strong>Prote\u00E7\u00E3o contra duplicidade</strong>
        <span>Cada venda \u00E9 identificada pelo <b>ID do pagamento do Mercado Pago</b>. Consultar novamente o mesmo dia n\u00E3o ceria outra venda; e uma venda j\u00E1 confirmada n\u00E3o pode gerar um segundo lan\u00E7amento.</span>
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
      :'<option value="">Nenhuma carteira Mercado Pago com token ativo</option>';
    $('zinQueryWallet').disabled=!wallets.length;

    $('zinWalletFilter').innerHTML='<option value="">Todas</option>'+ 
      wallets.map(w=>`<option value="${esc(w.id)}">${esc(businessName(w.business_id))} \u2014 ${esc(w.name)}</option>`).join('');

    zielIncomingPaintWallet();
    zielPaintIncoming();
  }catch(error){
    if(seq!==zielIncomingRenderSeq)return;
    const host=$('zinList');
    if(host)host.innerHTML='<div class="message error">N\u00E3o foi poss\u00EDvel carregar a integra\u00E7\u00E3o Mercado Pago: '+esc(error?.message||'erro desconhecido')+'</div>';
  }
};

const _zielMpSalesPreviousRenderShell=renderShell;
renderShell=function(){
  _zielMpSalesPreviousRenderShell();
  const btn=document.querySelector('.sidebar .nav [data-page="entradas-importadas"]');
  if(btn)btn.textContent='\u2315 Consulta de vendas';
};
