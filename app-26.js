// Consulta de vendas via token — somente leitura.
// Não importa, não lança e não altera o financeiro.

let zielSalesRows=[];
let zielSalesLastQuery=null;
let zielSalesIntegrations=[];
let zielSalesQueryInFlight=false;
let zielSalesRenderSeq=0;

function zielSalesProviderLabel(provider){
  return {
    mercado_pago:'Mercado Pago',
    asaas:'Asaas',
    efi:'Efí',
    lytex:'Lytex',
    sgp:'SGP',
    outro:'Outro / API'
  }[provider]||provider||'Integração';
}

function zielSalesDateTime(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{
    timeZone:'America/Fortaleza',
    dateStyle:'short',
    timeStyle:'short'
  });
}

function zielSalesConfiguredWallets(){
  const active=zielSalesIntegrations.filter(i=>i.enabled!==false);
  const ids=new Set(active.map(i=>i.wallet_id));
  return (state.wallets||[])
    .filter(w=>w.active!==false&&ids.has(w.id)&&(!state.businessFilter||w.business_id===state.businessFilter))
    .sort((a,b)=>{
      const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
      return biz||a.name.localeCompare(b.name,'pt-BR');
    });
}

function zielSalesIntegrationsForWallet(walletId){
  return zielSalesIntegrations.filter(i=>i.wallet_id===walletId&&i.enabled!==false);
}

function zielSalesWalletOptions(selected=''){
  return zielSalesConfiguredWallets().map(w=>{
    const integrations=zielSalesIntegrationsForWallet(w.id);
    const provider=integrations.length===1?zielSalesProviderLabel(integrations[0].provider):'múltiplas integrações';
    return `<option value="${esc(w.id)}" ${w.id===selected?'selected':''}>${esc(businessName(w.business_id))} — ${esc(w.name)} · ${esc(provider)}</option>`;
  }).join('');
}

function zielSalesPaintWallet(){
  const walletId=$('zsalesWallet')?.value||'';
  const note=$('zsalesWalletNote');
  const btn=$('zsalesQuery');
  const integrations=zielSalesIntegrationsForWallet(walletId);

  if(!walletId){
    if(note){note.className='mini';note.textContent='Selecione uma carteira integrada.';}
    if(btn)btn.disabled=true;
    return;
  }

  if(integrations.length!==1){
    if(note){
      note.className='mini r';
      note.textContent=integrations.length
        ?'Esta carteira possui mais de uma integração ativa.'
        :'Esta carteira não possui integração ativa.';
    }
    if(btn)btn.disabled=true;
    return;
  }

  const provider=integrations[0].provider;
  const supported=provider==='mercado_pago';

  if(note){
    note.className=supported?'mini g':'mini a';
    note.textContent=supported
      ?'Mercado Pago · consulta direta e somente leitura pela API usando o token desta carteira.'
      :zielSalesProviderLabel(provider)+' está configurado, mas a consulta de vendas ainda não foi ativada para este provedor.';
  }

  if(btn)btn.disabled=!supported||zielSalesQueryInFlight;
}

function zielSalesPaintDateMode(){
  const mode=$('zsalesMode')?.value||'day';
  $('zsalesDayWrap')?.classList.toggle('hidden',mode!=='day');
  $('zsalesRangeWrap')?.classList.toggle('hidden',mode!=='period');
}

function zielSalesDates(){
  if($('zsalesMode').value==='day'){
    const d=$('zsalesDay').value;
    return {from:d,to:d};
  }
  return {from:$('zsalesFrom').value,to:$('zsalesTo').value};
}

function zielSalesSummary(){
  const host=$('zsalesResult');
  if(!host)return;

  if(!zielSalesLastQuery){
    host.innerHTML='<div class="zin-query-empty">Escolha a carteira e o dia ou período para consultar as vendas diretamente no provedor.</div>';
    return;
  }

  const q=zielSalesLastQuery;
  const wallet=state.wallets.find(w=>w.id===q.wallet_id);

  host.innerHTML=`<div class="zin-query-summary">
    <div><small>Fonte</small><strong class="g">API ao vivo</strong><span class="mini">Consulta somente leitura</span></div>
    <div><small>Carteira</small><strong>${esc(wallet?.name||'Carteira')}</strong><span class="mini">${esc(businessName(wallet?.business_id))}</span></div>
    <div><small>Período consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' até '+esc(br(q.date_to)):''}</strong></div>
    <div><small>Vendas encontradas</small><strong>${Number(q.sales_found||0)}</strong></div>
    <div class="zin-query-total"><small>Total bruto</small><strong class="g">${fmt(Number(q.period_gross_total||0))}</strong></div>
    <div><small>Total líquido</small><strong>${fmt(Number(q.period_net_total||0))}</strong></div>
    <div><small>Taxas / deduções</small><strong class="r">${fmt(Number(q.period_fee_total||0))}</strong></div>
  </div>
  <div class="zlive-source-note"><strong>Consulta realizada agora:</strong><span>${esc(zielSalesDateTime(q.queried_at))}. Nenhum valor foi gravado no financeiro.</span></div>`;
}

function zielSalesCard(row){
  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  const gross=Number(row.gross_amount||0);
  const net=Number(row.net_amount??gross);
  const fee=Number(row.fee_amount||0);
  const released=row.available_for_balance!==false;

  return `<article class="zin-card zlive-card">
    <div class="zin-card-head">
      <div>
        <div class="zin-kind-row">
          <span class="zin-provider">${esc(zielSalesProviderLabel(row.provider))}</span>
          <span class="zin-kind payment">VENDA</span>
        </div>
        <h3>${esc(row.description||'Pagamento Mercado Pago')}</h3>
        <span class="mini">${esc(businessName(row.business_id))} · ${esc(wallet?.name||'Carteira')}</span>
      </div>
      <div class="zin-amount-block">
        <strong class="zin-amount g">+${fmt(gross)}</strong>
        ${fee>.009?`<small>Líquido ${fmt(net)}</small>`:''}
      </div>
    </div>

    <div class="zin-meta">
      <div><small>Data de aprovação</small><strong>${esc(zielSalesDateTime(row.date_approved||row.date_created))}</strong></div>
      <div><small>Método</small><strong>${esc(row.payment_method||'—')}</strong></div>
      <div><small>Status</small><strong>${esc(row.status||'approved')}</strong></div>
      <div><small>ID Mercado Pago</small><strong>${esc(row.external_id||'—')}</strong></div>
      ${Number(row.installments||0)>1?`<div><small>Parcelas</small><strong>${Number(row.installments)}x</strong></div>`:''}
      ${fee>.009?`<div><small>Taxas / deduções</small><strong class="r">− ${fmt(fee)}</strong></div>
      <div><small>Valor líquido</small><strong class="g">${fmt(net)}</strong></div>`:''}
      <div><small>Disponibilidade</small><strong class="${released?'g':'a'}">${released?'Liberado':'Aguardando liberação'}</strong></div>
    </div>
  </article>`;
}

function zielSalesPaintRows(){
  const host=$('zsalesList');
  if(!host)return;

  if(!zielSalesLastQuery){
    host.innerHTML='<div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o período acima.</span></div>';
    return;
  }

  const q=String($('zsalesSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
  const method=$('zsalesMethod')?.value||'';

  const rows=zielSalesRows.filter(row=>{
    if(method&&String(row.payment_method||'')!==method)return false;
    if(q){
      const hay=[row.description,row.external_id,row.payment_method,row.status].join(' ').toLocaleLowerCase('pt-BR');
      if(!hay.includes(q))return false;
    }
    return true;
  });

  host.innerHTML=rows.length
    ?rows.map(zielSalesCard).join('')
    :'<div class="empty">Nenhuma venda encontrada para este filtro.</div>';
}

function zielSalesRefreshMethodFilter(){
  const select=$('zsalesMethod');
  if(!select)return;
  const current=select.value;
  const methods=[...new Set(zielSalesRows.map(r=>String(r.payment_method||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  select.innerHTML='<option value="">Todos os métodos</option>'+methods.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if(methods.includes(current))select.value=current;
}

async function zielSalesRunQuery(){
  if(zielSalesQueryInFlight)return;

  const walletId=$('zsalesWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira integrada.','error');

  const integrations=zielSalesIntegrationsForWallet(walletId);
  if(integrations.length!==1||integrations[0].provider!=='mercado_pago'){
    return toast('Selecione uma carteira com integração Mercado Pago ativa.','error');
  }

  const {from,to}=zielSalesDates();
  if(!from||!to)return toast('Informe o dia ou período.','error');
  if(from>to)return toast('A data inicial não pode ser maior que a final.','error');

  const start=new Date(from+'T00:00:00');
  const end=new Date(to+'T00:00:00');
  const days=Math.round((end-start)/86400000);
  if(!Number.isFinite(days)||days<0||days>365){
    return toast('Consulte um período de até 366 dias.','error');
  }

  const btn=$('zsalesQuery');
  zielSalesQueryInFlight=true;
  btn.disabled=true;
  btn.textContent='Consultando API…';
  zielSalesRows=[];
  zielSalesLastQuery=null;
  zielSalesSummary();
  zielSalesPaintRows();

  try{
    const {data,error}=await supabase.functions.invoke('wallet-integration-query-live',{
      body:{wallet_id:walletId,date_from:from,date_to:to}
    });

    if(error)throw new Error(error.message||'Falha ao consultar o backend.');
    if(!data?.ok)throw new Error(data?.error||'A consulta não foi concluída.');
    if(data.source!=='live_api'||data.read_only!==true){
      throw new Error('O backend não confirmou o modo somente leitura.');
    }

    zielSalesRows=Array.isArray(data.sales)?data.sales:[];
    zielSalesLastQuery=data;
    zielSalesRefreshMethodFilter();
    zielSalesSummary();
    zielSalesPaintRows();
    toast('Consulta concluída: '+zielSalesRows.length+' venda(s) encontrada(s).');
  }catch(error){
    zielSalesRows=[];
    zielSalesLastQuery=null;
    zielSalesRefreshMethodFilter();
    zielSalesSummary();
    zielSalesPaintRows();
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    zielSalesQueryInFlight=false;
    if($('zsalesQuery')){
      $('zsalesQuery').textContent='Consultar vendas';
      zielSalesPaintWallet();
    }
  }
}

async function renderSalesQuery(seq){
  const today=iso();
  zielSalesRows=[];
  zielSalesLastQuery=null;

  $('content').innerHTML=setTitle(
    'Consulta de vendas',
    'Consulte vendas diretamente pelo token da carteira, sem importar ou lançar no financeiro'
  )+`
    <div class="zin-page">
      <section class="zin-query-card zlive-query-card">
        <div class="zin-query-head">
          <div>
            <span class="zin-auto-icon">⌕</span>
            <div>
              <strong>Consultar vendas no provedor</strong>
              <p>Cada consulta busca os dados diretamente na API usando o token protegido da carteira.</p>
            </div>
          </div>
          <span class="zlive-live-badge">SOMENTE CONSULTA</span>
        </div>

        <div class="zin-query-grid zin-query-layout">
          <div class="field zin-query-wallet">
            <label for="zsalesWallet">Carteira</label>
            <select id="zsalesWallet"><option value="">Carregando carteiras…</option></select>
            <div class="mini" id="zsalesWalletNote"></div>
          </div>

          <div class="zin-query-controls">
            <div class="field zin-query-mode">
              <label for="zsalesMode">Consulta</label>
              <select id="zsalesMode">
                <option value="day">Um dia</option>
                <option value="period">Período</option>
              </select>
            </div>

            <div class="field zin-query-day" id="zsalesDayWrap">
              <label for="zsalesDay">Data</label>
              <input class="input" id="zsalesDay" type="date" value="${today}" max="${today}">
            </div>

            <div class="zin-range hidden" id="zsalesRangeWrap">
              <div class="field"><label for="zsalesFrom">De</label><input class="input" id="zsalesFrom" type="date" value="${today}" max="${today}"></div>
              <div class="field"><label for="zsalesTo">Até</label><input class="input" id="zsalesTo" type="date" value="${today}" max="${today}"></div>
            </div>

            <div class="zin-query-action">
              <button type="button" class="btn btn-primary" id="zsalesQuery" disabled>Consultar vendas</button>
            </div>
          </div>
        </div>

        <div id="zsalesResult"></div>
      </section>

      <div class="zin-toolbar zin-toolbar-manual zlive-toolbar">
        <div class="field">
          <label for="zsalesMethod">Método</label>
          <select id="zsalesMethod"><option value="">Todos os métodos</option></select>
        </div>
        <div class="field">
          <label for="zsalesSearch">Buscar</label>
          <input class="input" id="zsalesSearch" type="search" placeholder="Descrição, ID ou método">
        </div>
      </div>

      <div id="zsalesList">
        <div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o período acima.</span></div>
      </div>

      <div class="zint-footnote">
        <strong>Somente leitura:</strong> esta tela não cria lançamentos, não altera saldos e não grava vendas no financeiro.
      </div>
    </div>`;

  $('zsalesMode').onchange=zielSalesPaintDateMode;
  $('zsalesWallet').onchange=zielSalesPaintWallet;
  $('zsalesQuery').onclick=zielSalesRunQuery;
  $('zsalesMethod').onchange=zielSalesPaintRows;
  $('zsalesSearch').oninput=zielSalesPaintRows;
  zielSalesPaintDateMode();
  zielSalesSummary();
  zielSalesPaintRows();

  try{
    const {data,error}=await supabase.rpc('list_wallet_integrations');
    if(error)throw error;
    if(seq!==zielSalesRenderSeq)return;

    zielSalesIntegrations=(Array.isArray(data)?data:[]).filter(i=>i.enabled!==false);
    const wallets=zielSalesConfiguredWallets();

    $('zsalesWallet').innerHTML=wallets.length
      ?zielSalesWalletOptions(wallets[0]?.id||'')
      :'<option value="">Nenhuma carteira com integração ativa</option>';
    $('zsalesWallet').disabled=!wallets.length;
    zielSalesPaintWallet();
  }catch(error){
    if(seq!==zielSalesRenderSeq)return;
    const host=$('zsalesList');
    if(host)host.innerHTML='<div class="message error">Não foi possível carregar as integrações: '+esc(error?.message||'erro desconhecido')+'</div>';
  }
}

const _zielSalesPreviousRenderShell=renderShell;
renderShell=function(){
  _zielSalesPreviousRenderShell();
  const navEl=document.querySelector('.sidebar .nav');
  if(navEl&&!navEl.querySelector('[data-page="consulta-vendas"]')){
    const btn=document.createElement('button');
    btn.dataset.page='consulta-vendas';
    btn.textContent='⌕ Consulta de vendas';
    btn.onclick=()=>{showPage('consulta-vendas');document.body.classList.remove('menu-open');};
    const integrationsBtn=navEl.querySelector('[data-page="integracoes"]');
    navEl.insertBefore(btn,integrationsBtn||navEl.querySelector('[data-page="cadastros"]')||null);
  }
};

const _zielSalesPreviousShowPage=showPage;
showPage=function(page){
  zielSalesRenderSeq++;
  const seq=zielSalesRenderSeq;
  if(page==='consulta-vendas'){
    activate(page);
    renderSalesQuery(seq);
    return;
  }
  return _zielSalesPreviousShowPage(page);
};
