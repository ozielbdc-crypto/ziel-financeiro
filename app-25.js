// Entradas importadas — consulta manual por dia/período e confirmação antes do lançamento.

let zielIncomingRows=[];
let zielIncomingRenderSeq=0;
let zielIncomingIntegrations=[];
let zielIncomingLastQuery=null;

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
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{
    timeZone:'America/Fortaleza',
    dateStyle:'short',
    timeStyle:'short'
  });
}

function zielIncomingDateKey(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Fortaleza',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).formatToParts(d);
  const y=parts.find(p=>p.type==='year')?.value;
  const m=parts.find(p=>p.type==='month')?.value;
  const day=parts.find(p=>p.type==='day')?.value;
  return y&&m&&day?`${y}-${m}-${day}`:'';
}

function zielIncomingProviderStatusLabel(status,kind='payment'){
  const s=String(status||'').trim().toLowerCase();
  const map={
    approved:'Aprovado',
    pending:'Pendente',
    in_process:'Em processamento',
    in_mediation:'Em mediação',
    rejected:'Rejeitado',
    cancelled:'Cancelado',
    canceled:'Cancelado',
    refunded:'Reembolsado',
    charged_back:'Estornado',
    withdrawal:'Transferência',
    payout:'Retirada',
    withdrawal_cancel:'Cancelamento de transferência'
  };
  if(map[s])return map[s];
  if(kind==='transfer'){
    const upper=String(status||'').trim().toUpperCase();
    if(upper==='WITHDRAWAL')return 'Transferência';
    if(upper==='PAYOUT')return 'Retirada';
    if(upper==='WITHDRAWAL_CANCEL')return 'Cancelamento de transferência';
  }
  return status||'—';
}

function zielIncomingStatusBadge(status){
  const kind=status==='Confirmado'?'green':status==='Ignorado'?'amber':'blue';
  return `<span class="badge ${kind}">${esc(status||'Pendente')}</span>`;
}

function zielIncomingCard(row){
  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  const when=row.approved_at||row.occurred_at||row.imported_at;
  const gross=Number(row.gross_amount??row.amount??0);
  const net=Number(row.net_amount??gross);
  const fee=Number(row.fee_amount??Math.max(0,gross-net));
  const isTransfer=row.movement_kind==='transfer';
  const isCard=!isTransfer&&['credit_card','debit_card','prepaid_card'].includes(String(row.payment_type_id||'').toLowerCase());
  const released=row.available_for_balance!==false;
  let actions='';

  if(row.decision_status==='Pendente'){
    if(isTransfer){
      actions=`<button type="button" class="btn btn-primary" data-zin-confirm="${esc(row.id)}">Lançar saída</button>`;
    }else{
      actions=released
        ?`<button type="button" class="btn btn-primary" data-zin-confirm="${esc(row.id)}">Lançar entrada</button>
          <button type="button" class="btn btn-soft" data-zin-ignore="${esc(row.id)}">Ignorar</button>`
        :`<button type="button" class="btn btn-soft" disabled>Aguardando liberação</button>
          <button type="button" class="btn btn-soft" data-zin-ignore="${esc(row.id)}">Ignorar</button>`;
    }
  }else if(row.decision_status==='Ignorado'){
    actions=isTransfer?'':`<button type="button" class="btn btn-soft" data-zin-reopen="${esc(row.id)}">Voltar para pendente</button>`;
  }else{
    actions=`<button type="button" class="btn btn-soft" data-zin-tx="${esc(row.transaction_id||'')}">Ver em Lançamentos</button>`;
  }

  const amountText=(isTransfer?'− ':'')+fmt(gross);
  const kindLabel=isTransfer?'Transferência / retirada':'Pagamento';

  return `<article class="zin-card ${!released?'zin-card-waiting':''} ${isTransfer?'zin-card-transfer':''}">
    <div class="zin-card-head">
      <div>
        <div class="zin-kind-row">
          <span class="zin-provider">${esc(zielIncomingProviderLabel(row.provider))}</span>
          <span class="zin-kind ${isTransfer?'transfer':'payment'}">${esc(kindLabel)}</span>
        </div>
        <h3>${esc(row.description||(isTransfer?'Transferência importada':'Entrada importada'))}</h3>
        <span class="mini">${esc(businessName(row.business_id))} · ${esc(wallet?.name||'Carteira')}</span>
      </div>
      <div class="zin-amount-block">
        <strong class="zin-amount ${isTransfer?'r':''}">${amountText}</strong>
        ${!isTransfer&&fee>0.009?`<small>Líquido ${fmt(net)}</small>`:''}
      </div>
    </div>

    <div class="zin-meta">
      <div><small>${isTransfer?'Data do movimento':'Data de aprovação'}</small><strong>${esc(zielIncomingWhen(when))}</strong></div>
      <div><small>${isTransfer?'Tipo no provedor':'Status no provedor'}</small><strong>${esc(zielIncomingProviderStatusLabel(row.provider_transaction_type||row.provider_status||'—',isTransfer?'transfer':'payment'))}</strong></div>
      <div><small>Método</small><strong>${esc(row.payment_method||'—')}</strong></div>
      <div><small>ID Mercado Pago</small><strong>${esc(row.provider_source_id||row.external_id||'—')}</strong></div>
      ${isCard?`<div><small>Parcelas</small><strong>${Number(row.installments||1)}x</strong></div>
      <div><small>Taxas/deduções</small><strong>${fmt(fee)}</strong></div>
      <div><small>Valor líquido</small><strong>${fmt(net)}</strong></div>
      <div><small>Liberação</small><strong class="${released?'g':'a'}">${released?'Liberado':row.money_release_date?zielIncomingWhen(row.money_release_date):'Aguardando'}</strong></div>`:''}
    </div>

    ${!released&&!isTransfer?`<div class="zin-release-warning"><strong>Pagamento aprovado, mas ainda não disponível na carteira.</strong><span>O ZIEL não permite lançar esse valor no saldo até a liberação do Mercado Pago. Consulte novamente depois.</span></div>`:''}

    ${isTransfer?`<div class="zin-transfer-note"><strong>Transferência:</strong><span>ao confirmar, o ZIEL registrará este movimento como uma <b>Saída</b> normal em Lançamentos.</span></div>`:''}

    <div class="zin-foot">
      <div>${zielIncomingStatusBadge(row.decision_status)}</div>
      <div class="zin-actions">${actions}</div>
    </div>
  </article>`;
}

function zielIncomingOpenTransferConfirm(id){
  const row=zielIncomingRows.find(x=>x.id===id);
  if(!row)return toast('Transferência importada não encontrada.','error');

  if(row.direction!=='Saída'){
    return toast('Retornos/cancelamentos de transferência não entram no fluxo de lançamento.','error');
  }

  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  if(!wallet)return toast('Carteira de origem não encontrada.','error');

  const amount=Number(row.amount||0);

  modal('Lançar transferência como saída',`
    <form id="zinTransferForm" class="zin-confirm-form">
      <div class="zin-confirm-summary">
        <div><small>VALOR DA SAÍDA</small><strong class="r">− ${fmt(amount)}</strong></div>
        <div><small>CARTEIRA</small><strong>${esc(wallet.name)}</strong><span>${esc(businessName(wallet.business_id))}</span></div>
      </div>

      <div class="field">
        <label>Categoria da saída</label>
        <select id="zinTransferCategory" required>${categoryOptions('Saída')}</select>
      </div>

      <div class="field">
        <label>Descrição</label>
        <input class="input" id="zinTransferDescription" maxlength="160" value="${esc(row.description||'Transferência Mercado Pago')}" required>
      </div>

      <div class="zin-confirm-note">
        Este movimento será registrado diretamente como <b>Saída</b> no fluxo de Lançamentos. O ID externo <b>${esc(row.external_id||'—')}</b> impede que a mesma transferência seja lançada novamente.
      </div>

      <div class="actions">
        <button type="button" class="btn btn-soft" id="zinTransferCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zinTransferConfirm">Confirmar saída</button>
      </div>
    </form>`);

  $('zinTransferCancel').onclick=closeModal;

  $('zinTransferForm').onsubmit=async e=>{
    e.preventDefault();
    const category=$('zinTransferCategory').value;
    const description=$('zinTransferDescription').value.trim();
    if(!category)return toast('Selecione a categoria da saída.','error');
    if(!description)return toast('Informe a descrição.','error');

    const btn=$('zinTransferConfirm');
    btn.disabled=true;
    btn.textContent='Lançando…';

    try{
      const {data,error}=await supabase.rpc('confirm_imported_transfer',{
        p_entry_id:row.id,
        p_mode:'expense',
        p_category:category,
        p_description:description,
        p_destination_wallet:null
      });
      if(error)throw error;
      if(!data)throw new Error('O lançamento não retornou um identificador válido.');

      closeModal();
      await loadAll();
      await zielLoadIncomingEntries();
      zielPaintIncoming();
      toast('Transferência lançada como Saída em Lançamentos.');
    }catch(error){
      toast('Não foi possível lançar: '+(error?.message||'erro desconhecido'),'error');
      if($('zinTransferConfirm')){
        $('zinTransferConfirm').disabled=false;
        $('zinTransferConfirm').textContent='Confirmar saída';
      }
    }
  };
}

function zielIncomingOpenConfirm(id){
  const row=zielIncomingRows.find(x=>x.id===id);
  if(!row)return toast('Movimento importado não encontrado.','error');
  if(row.movement_kind==='transfer')return zielIncomingOpenTransferConfirm(id);

  if(row.available_for_balance===false){
    return toast('Este pagamento ainda não foi liberado pelo Mercado Pago. Consulte novamente após a data de liberação.','error');
  }

  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  const gross=Number(row.gross_amount??row.amount??0);
  const net=Number(row.net_amount??gross);
  const fee=Number(row.fee_amount??Math.max(0,gross-net));
  const isCard=['credit_card','debit_card','prepaid_card'].includes(String(row.payment_type_id||'').toLowerCase());
  const releaseWhen=row.money_release_date||row.approved_at||row.occurred_at;

  modal('Lançar entrada no financeiro',`
    <form id="zinConfirmForm" class="zin-confirm-form">
      <div class="zin-confirm-summary">
        <div><small>VALOR BRUTO</small><strong>${fmt(gross)}</strong></div>
        <div><small>CARTEIRA</small><strong>${esc(wallet?.name||'Carteira')}</strong><span>${esc(businessName(row.business_id))}</span></div>
      </div>

      ${isCard||fee>0.009?`<div class="zin-settlement-summary">
        <div><small>Método</small><strong>${esc(row.payment_method||'Cartão')}</strong></div>
        <div><small>Taxas/deduções</small><strong class="r">− ${fmt(fee)}</strong></div>
        <div><small>Líquido na carteira</small><strong class="g">${fmt(net)}</strong></div>
        <div><small>Data de liberação</small><strong>${esc(zielIncomingWhen(releaseWhen))}</strong></div>
      </div>`:''}

      <div class="field">
        <label>Categoria</label>
        <select id="zinCategory" required>${categoryOptions('Entrada')}</select>
      </div>

      <div class="field">
        <label>Descrição do lançamento</label>
        <input class="input" id="zinDescription" maxlength="160" value="${esc(row.description||'Entrada Mercado Pago')}" required>
      </div>

      <div class="zin-confirm-note">
        ${fee>0.009
          ?`O ZIEL criará uma <b>Entrada de ${fmt(gross)}</b> e uma <b>Saída de ${fmt(fee)}</b> em <b>Impostos/Taxas</b>. O efeito líquido na carteira será <b>${fmt(net)}</b>.`
          :`O ZIEL criará uma <b>Entrada de ${fmt(gross)}</b> nessa carteira.`}
        A data usada será a de liberação do dinheiro quando disponível. O ID externo <b>${esc(row.external_id||'—')}</b> impede lançamento duplicado.
      </div>

      <div class="actions">
        <button type="button" class="btn btn-soft" id="zinCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zinConfirmButton">Confirmar lançamento</button>
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
    btn.textContent='Lançando…';

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
      toast(fee>0.009?'Entrada e taxa lançadas no financeiro.':'Entrada lançada no fluxo de Lançamentos.');
    }catch(error){
      toast('Não foi possível lançar: '+(error?.message||'erro desconhecido'),'error');
      if($('zinConfirmButton')){
        $('zinConfirmButton').disabled=false;
        $('zinConfirmButton').textContent='Confirmar lançamento';
      }
    }
  };
}

async function zielSetIncomingDecision(id,status){
  const row=zielIncomingRows.find(x=>x.id===id);
  if(!row)return toast('Entrada importada não encontrada.','error');

  if(status==='Ignorado'&&!confirm('Ignorar esta entrada? Ela continuará no histórico e não será lançada no financeiro.'))return;

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
    .order('approved_at',{ascending:false,nullsFirst:false})
    .order('imported_at',{ascending:false})
    .limit(1000);

  if(state.businessFilter)query=query.eq('business_id',state.businessFilter);

  const {data,error}=await query;
  if(error)throw error;
  zielIncomingRows=Array.isArray(data)?data:[];
  return zielIncomingRows;
}

async function zielLoadIncomingIntegrations(){
  const {data,error}=await supabase.rpc('list_wallet_integrations');
  if(error)throw error;
  zielIncomingIntegrations=(Array.isArray(data)?data:[]).filter(i=>i.enabled!==false&&i.provider==='mercado_pago');
  return zielIncomingIntegrations;
}

function zielIncomingConfiguredWallets(){
  const walletIds=new Set(zielIncomingIntegrations.map(i=>i.wallet_id));
  return (state.wallets||[])
    .filter(w=>w.active!==false&&walletIds.has(w.id)&&(!state.businessFilter||w.business_id===state.businessFilter))
    .sort((a,b)=>{
      const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
      return biz||a.name.localeCompare(b.name,'pt-BR');
    });
}

function zielIncomingWalletOptions(selected=''){
  const wallets=zielIncomingConfiguredWallets();
  return wallets.map(w=>`<option value="${esc(w.id)}" ${w.id===selected?'selected':''}>${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');
}

function zielIncomingPaintDateMode(){
  const mode=$('zinQueryMode')?.value||'day';
  const day=$('zinDayWrap');
  const range=$('zinRangeWrap');
  if(day)day.classList.toggle('hidden',mode!=='day');
  if(range)range.classList.toggle('hidden',mode!=='period');
}

function zielIncomingQueryDates(){
  const mode=$('zinQueryMode').value;
  if(mode==='day'){
    const date=$('zinQueryDay').value;
    return {from:date,to:date};
  }
  return {from:$('zinQueryFrom').value,to:$('zinQueryTo').value};
}

async function zielRunIncomingQuery(){
  const walletId=$('zinQueryWallet').value;
  if(!walletId)return toast('Selecione uma carteira integrada ao Mercado Pago.','error');

  const {from,to}=zielIncomingQueryDates();
  if(!from||!to)return toast('Informe a data ou período da consulta.','error');
  if(from>to)return toast('A data inicial não pode ser maior que a data final.','error');

  const start=new Date(from+'T00:00:00');
  const end=new Date(to+'T00:00:00');
  const days=Math.round((end-start)/86400000);
  if(!Number.isFinite(days)||days<0)return toast('Período inválido.','error');
  if(days>365)return toast('Consulte no máximo 366 dias por vez.','error');

  const btn=$('zinQueryButton');
  btn.disabled=true;
  btn.textContent='Consultando movimentos…';

  try{
    const {data,error}=await supabase.functions.invoke('wallet-integration-query',{
      body:{
        wallet_id:walletId,
        provider:'mercado_pago',
        date_from:from,
        date_to:to
      }
    });

    if(error)throw new Error(error.message||'Falha ao consultar o backend.');
    if(!data?.ok)throw new Error(data?.error||'A consulta não foi concluída.');

    zielIncomingLastQuery=data;
    await zielLoadIncomingEntries();

    if($('zinWalletFilter'))$('zinWalletFilter').value=walletId;
    if($('zinStatus'))$('zinStatus').value='Todos';
    if($('zinMovement'))$('zinMovement').value='Todos';

    zielPaintQueryResult();
    zielPaintIncoming();

    toast('Consulta concluída: '+Number(data.new_entries||0)+' nova(s), '+Number(data.updated_entries||0)+' atualizada(s).');
  }catch(error){
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    if($('zinQueryButton')){
      $('zinQueryButton').disabled=false;
      $('zinQueryButton').textContent='Consultar movimentos';
    }
  }
}

function zielPaintQueryResult(){
  const host=$('zinQueryResult');
  if(!host)return;

  const q=zielIncomingLastQuery;
  if(!q){
    host.innerHTML='<div class="zin-query-empty">Escolha a carteira e a data para consultar pagamentos recebidos e transferências do Mercado Pago.</div>';
    return;
  }

  host.innerHTML=`<div class="zin-query-summary">
    <div><small>Período consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' até '+esc(br(q.date_to)):''}</strong></div>
    <div><small>Entradas localizadas</small><strong>${Number(q.payments_found||0)}</strong></div>
    <div><small>Novas entradas</small><strong class="g">${Number(q.new_entries||0)}</strong></div>
    <div><small>Já existentes / atualizadas</small><strong>${Number(q.updated_entries??q.already_existing??0)}</strong></div>
    <div><small>Transferências localizadas</small><strong>${Number(q.transfers_found||0)}</strong></div>
    <div><small>Novas transferências</small><strong class="g">${Number(q.transfers_new||0)}</strong></div>
    <div><small>Aguardando liberação</small><strong class="a">${Number(q.awaiting_release||0)}</strong></div>
  </div>
  <div class="zin-query-shortcuts">
    <button type="button" class="btn btn-soft" id="zinShowAllQuery">Ver todos do período</button>
    <button type="button" class="btn btn-soft" id="zinShowTransfersQuery">Ver transferências</button>
  </div>
  ${q.transfers_pending?'<div class="message"><b>Transferências:</b> o relatório ainda está sendo gerado pelo Mercado Pago. Consulte o mesmo período novamente em alguns instantes.</div>':''}
  ${q.transfer_warning?'<div class="message"><b>Transferências:</b> '+esc(q.transfer_warning)+'</div>':''}
  <p class="mini">A consulta traz <b>recebimentos aprovados</b> e <b>transferências/retiradas de saída</b>. Cancelamentos e retornos de transferência são ignorados. Reconsultar o mesmo período <b>atualiza</b> os mesmos IDs, sem duplicar.</p>`;

  const showAll=$('zinShowAllQuery');
  if(showAll)showAll.onclick=()=>{
    if($('zinWalletFilter'))$('zinWalletFilter').value=q.wallet_id||'';
    if($('zinStatus'))$('zinStatus').value='Todos';
    if($('zinMovement'))$('zinMovement').value='Todos';
    zielPaintIncoming();
  };

  const showTransfers=$('zinShowTransfersQuery');
  if(showTransfers)showTransfers.onclick=()=>{
    if($('zinWalletFilter'))$('zinWalletFilter').value=q.wallet_id||'';
    if($('zinStatus'))$('zinStatus').value='Todos';
    if($('zinMovement'))$('zinMovement').value='Transferências';
    zielPaintIncoming();
  };
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
  const walletFilter=$('zinWalletFilter')?.value||'';
  const movement=$('zinMovement')?.value||'Todos';
  const q=String($('zinSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');

  const queryRange=zielIncomingLastQuery&&walletFilter===zielIncomingLastQuery.wallet_id
    ?{from:zielIncomingLastQuery.date_from,to:zielIncomingLastQuery.date_to}
    :null;

  const visibleBase=zielIncomingRows.filter(row=>
    row.movement_kind!=='transfer'||row.direction==='Saída'
  );

  const rows=visibleBase.filter(row=>{
    if(status!=='Todos'&&row.decision_status!==status)return false;
    if(walletFilter&&row.wallet_id!==walletFilter)return false;
    if(movement==='Recebimentos'&&row.movement_kind==='transfer')return false;
    if(movement==='Transferências'&&row.movement_kind!=='transfer')return false;

    if(queryRange){
      const key=zielIncomingDateKey(row.approved_at||row.occurred_at);
      if(!key||key<queryRange.from||key>queryRange.to)return false;
    }

    if(q){
      const wallet=state.wallets.find(w=>w.id===row.wallet_id);
      const hay=[
        row.description,row.external_id,row.external_reference,row.payment_method,
        row.provider_transaction_type,row.movement_kind,row.direction,
        zielIncomingProviderLabel(row.provider),wallet?.name,businessName(row.business_id)
      ].join(' ').toLocaleLowerCase('pt-BR');
      if(!hay.includes(q))return false;
    }
    return true;
  });

  const pending=visibleBase.filter(r=>r.decision_status==='Pendente').length;
  const confirmed=visibleBase.filter(r=>r.decision_status==='Confirmado').length;
  const ignored=visibleBase.filter(r=>r.decision_status==='Ignorado').length;

  if($('zinPending'))$('zinPending').textContent=String(pending);
  if($('zinConfirmed'))$('zinConfirmed').textContent=String(confirmed);
  if($('zinIgnored'))$('zinIgnored').textContent=String(ignored);

  host.innerHTML=rows.length
    ?rows.map(zielIncomingCard).join('')
    :'<div class="empty">Nenhum movimento encontrado para este filtro.</div>';

  zielBindIncomingActions();
}

async function renderIncomingEntries(seq=zielIncomingRenderSeq){
  const today=iso();

  $('content').innerHTML=setTitle(
    'Entradas importadas',
    'Consulta manual por dia ou período, com lançamento somente após sua confirmação'
  )+`
    <div class="zin-page">
      <section class="zin-query-card">
        <div class="zin-query-head">
          <div>
            <span class="zin-auto-icon">⌕</span>
            <div>
              <strong>Consultar movimentos do Mercado Pago</strong>
              <p>Escolha a carteira e o dia ou período. O ZIEL busca recebimentos aprovados e transferências/retiradas de saída para sua conferência.</p>
            </div>
          </div>
          <span class="zin-manual-badge">MANUAL</span>
        </div>

        <div class="zin-query-grid">
          <div class="field zin-query-wallet">
            <label for="zinQueryWallet">Carteira</label>
            <select id="zinQueryWallet"><option value="">Carregando carteiras…</option></select>
          </div>

          <div class="field">
            <label for="zinQueryMode">Consulta</label>
            <select id="zinQueryMode">
              <option value="day">Um dia</option>
              <option value="period">Período</option>
            </select>
          </div>

          <div class="field" id="zinDayWrap">
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
            <button type="button" class="btn btn-primary" id="zinQueryButton">Consultar movimentos</button>
          </div>
        </div>

        <div id="zinQueryResult"></div>
      </section>

      <div class="zin-stats">
        <div><span>Pendentes</span><strong id="zinPending">—</strong><small>Aguardando lançamento ou decisão</small></div>
        <div><span>Confirmadas</span><strong id="zinConfirmed">—</strong><small>Já estão em Lançamentos</small></div>
        <div><span>Ignoradas</span><strong id="zinIgnored">—</strong><small>Não foram lançadas</small></div>
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
          <label for="zinMovement">Tipo</label>
          <select id="zinMovement">
            <option>Todos</option>
            <option>Recebimentos</option>
            <option>Transferências</option>
          </select>
        </div>

        <div class="field">
          <label for="zinSearch">Buscar</label>
          <input class="input" id="zinSearch" type="search" placeholder="Descrição, ID ou método">
        </div>
      </div>

      <div id="zinList"><div class="empty">Carregando entradas…</div></div>

      <div class="zin-duplicate-note">
        <strong>Proteção contra duplicidade</strong>
        <span>Cada recebimento e cada transferência usam um ID externo único do Mercado Pago. Reconsultar o mesmo período atualiza o registro existente e o banco bloqueia uma segunda confirmação do mesmo item. Transferências confirmadas são lançadas como Saída.</span>
      </div>
    </div>`;

  $('zinQueryMode').onchange=zielIncomingPaintDateMode;
  $('zinQueryButton').onclick=zielRunIncomingQuery;
  $('zinStatus').onchange=zielPaintIncoming;
  $('zinWalletFilter').onchange=zielPaintIncoming;
  $('zinMovement').onchange=zielPaintIncoming;
  $('zinSearch').oninput=zielPaintIncoming;
  zielIncomingPaintDateMode();
  zielPaintQueryResult();

  try{
    await Promise.all([zielLoadIncomingIntegrations(),zielLoadIncomingEntries()]);
    if(seq!==zielIncomingRenderSeq)return;

    const wallets=zielIncomingConfiguredWallets();
    $('zinQueryWallet').innerHTML=wallets.length
      ?zielIncomingWalletOptions()
      :'<option value="">Nenhuma carteira Mercado Pago integrada</option>';
    $('zinQueryWallet').disabled=!wallets.length;
    $('zinQueryButton').disabled=!wallets.length;

    const filterWallets=(state.wallets||[])
      .filter(w=>(zielIncomingRows.some(r=>r.wallet_id===w.id))&&(!state.businessFilter||w.business_id===state.businessFilter))
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));

    $('zinWalletFilter').innerHTML='<option value="">Todas</option>'+
      filterWallets.map(w=>`<option value="${esc(w.id)}">${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');

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
