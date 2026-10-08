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

function zielIncomingPayerDocument(row){
  const type=String(row?.payer_document_type||'').trim().toUpperCase();
  const last4=String(row?.payer_document_last4||'').replace(/\D/g,'').slice(-4);
  if(!last4)return '';
  return (type||'Documento')+' final '+last4;
}

function zielIncomingPayerName(row){
  const value=String(row?.payer_name||'').trim();
  if(!value)return 'Nome não fornecido pelo Mercado Pago';
  if(/^(CPF|CNPJ|Documento) final \d{1,4}$/i.test(value))return 'Nome não fornecido pelo Mercado Pago';
  return value;
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
  const isMoneyTransfer=isTransfer&&String(row.provider_transaction_type||'').toLowerCase().includes('money_transfer');
  const direction=isMoneyTransfer?'Saída':row.direction;
  const directionKnown=!isTransfer||direction==='Entrada'||direction==='Saída';
  const isCard=!isTransfer&&['credit_card','debit_card','prepaid_card'].includes(String(row.payment_type_id||'').toLowerCase());
  const released=row.available_for_balance!==false;
  let actions='';

  if(row.decision_status==='Pendente'){
    if(isTransfer){
      actions=directionKnown
        ?`<button type="button" class="btn btn-primary" data-zin-confirm="${esc(row.id)}">Classificar transferência</button>`
        :`<button type="button" class="btn btn-soft" disabled>Aguardando direção</button>`;
    }else{
      actions=released
        ?`<button type="button" class="btn btn-primary" data-zin-confirm="${esc(row.id)}">Lançar entrada</button>
          <button type="button" class="btn btn-soft" data-zin-ignore="${esc(row.id)}">Ignorar</button>`
        :`<button type="button" class="btn btn-soft" disabled>Aguardando liberação</button>
          <button type="button" class="btn btn-soft" data-zin-ignore="${esc(row.id)}">Ignorar</button>`;
    }
  }else if(row.decision_status==='Ignorado'){
    actions=`<button type="button" class="btn btn-soft" data-zin-reopen="${esc(row.id)}">Voltar para pendente</button>`;
  }else{
    actions=`<button type="button" class="btn btn-soft" data-zin-tx="${esc(row.transaction_id||'')}">Ver em Lançamentos</button>`;
  }

  const amountPrefix=isTransfer?(direction==='Saída'?'− ':direction==='Entrada'?'+ ':'↕ '):'';
  const amountText=amountPrefix+fmt(gross);
  const kindLabel=isTransfer
    ?(direction==='Saída'
      ?'Transferência enviada / retirada'
      :direction==='Entrada'
        ?'Transferência recebida'
        :'Transferência — direção a confirmar')
    :'Pagamento';

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
        <strong class="zin-amount ${isTransfer?(direction==='Saída'?'r':direction==='Entrada'?'g':'a'):''}">${amountText}</strong>
        ${!isTransfer&&fee>0.009?`<small>Líquido ${fmt(net)}</small>`:''}
      </div>
    </div>

    ${!isTransfer?`<div class="zin-payer-highlight zin-payer-card">
      <small>PAGADOR</small>
      <strong>${esc(zielIncomingPayerName(row))}</strong>
      ${zielIncomingPayerDocument(row)?`<span>${esc(zielIncomingPayerDocument(row))}</span>`:''}
    </div>`:''}

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

    ${isTransfer?`<div class="zin-transfer-note ${!directionKnown?'pending-direction':''}"><strong>Transferência:</strong><span>${directionKnown
      ?`classifique se o dinheiro foi movimentado <b>entre suas próprias carteiras</b> ou se foi uma ${direction==='Saída'?'<b>saída externa</b>':'<b>entrada externa</b>'}. Transferências internas não alteram o resultado do negócio.`
      :'<b>direção ainda não confirmada pelo provedor.</b> O ZIEL não presume entrada ou saída. Consulte novamente o mesmo período para o relatório de saldo identificar o impacto real antes de lançar.'}</span></div>`:''}

    <div class="zin-foot">
      <div>${zielIncomingStatusBadge(row.decision_status)}</div>
      <div class="zin-actions">${actions}</div>
    </div>
  </article>`;
}

function zielIncomingOpenTransferConfirm(id){
  const row=zielIncomingRows.find(x=>x.id===id);
  if(!row)return toast('Transferência importada não encontrada.','error');

  const wallet=state.wallets.find(w=>w.id===row.wallet_id);
  if(!wallet)return toast('Carteira vinculada não encontrada.','error');

  const isMoneyTransfer=String(row.provider_transaction_type||'').toLowerCase().includes('money_transfer');
  const direction=isMoneyTransfer?'Saída':row.direction;

  if(direction!=='Entrada'&&direction!=='Saída'){
    return toast('A direção desta transferência ainda não foi confirmada pelo Mercado Pago. Consulte novamente o mesmo período antes de lançar.','error');
  }

  const incoming=direction==='Entrada';
  const amount=Number(row.amount||0);
  const counterpartWallets=(state.wallets||[])
    .filter(w=>w.active!==false&&w.id!==wallet.id)
    .sort((a,b)=>{
      const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
      return biz||a.name.localeCompare(b.name,'pt-BR');
    });

  const walletChoices='<option value="">Selecione a carteira</option>'+
    counterpartWallets.map(w=>`<option value="${esc(w.id)}">${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');

  modal(incoming?'Classificar transferência recebida':'Classificar transferência enviada',`
    <form id="zinTransferForm" class="zin-confirm-form">
      <div class="zin-confirm-summary">
        <div><small>${incoming?'VALOR RECEBIDO':'VALOR ENVIADO'}</small><strong class="${incoming?'g':'r'}">${incoming?'+ ':'− '}${fmt(amount)}</strong></div>
        <div><small>CARTEIRA MERCADO PAGO</small><strong>${esc(wallet.name)}</strong><span>${esc(businessName(wallet.business_id))}</span></div>
      </div>

      <div class="field">
        <label>Como classificar este movimento?</label>
        <select id="zinTransferMode">
          <option value="transfer">${incoming?'Veio de outra carteira minha':'Foi para outra carteira minha'}</option>
          <option value="${incoming?'income':'expense'}">${incoming?'Entrada externa':'Saída externa / retirada / despesa'}</option>
        </select>
      </div>

      <div class="field" id="zinTransferDestinationWrap">
        <label>${incoming?'Carteira de origem':'Carteira de destino'}</label>
        <select id="zinTransferCounterpart">${walletChoices}</select>
        <div class="mini">Use esta opção quando o dinheiro apenas mudou de uma carteira sua para outra. Isso não vira receita nem despesa.</div>
      </div>

      <div class="field hidden" id="zinTransferCategoryWrap">
        <label>Categoria da ${incoming?'entrada':'saída'}</label>
        <select id="zinTransferCategory">${categoryOptions(incoming?'Entrada':'Saída')}</select>
        <div class="mini">Use somente quando a movimentação não veio de / não foi para outra carteira controlada no ZIEL.</div>
      </div>

      <div class="field">
        <label>Descrição</label>
        <input class="input" id="zinTransferDescription" maxlength="160" value="${esc(row.description||(incoming?'Transferência recebida Mercado Pago':'Transferência enviada Mercado Pago'))}" required>
      </div>

      <div class="zin-confirm-note" id="zinTransferNote"></div>

      <div class="actions">
        <button type="button" class="btn btn-soft" id="zinTransferCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zinTransferConfirm">Confirmar classificação</button>
      </div>
    </form>`);

  const paint=()=>{
    const mode=$('zinTransferMode').value;
    const internal=mode==='transfer';
    $('zinTransferDestinationWrap').classList.toggle('hidden',!internal);
    $('zinTransferCategoryWrap').classList.toggle('hidden',internal);
    $('zinTransferNote').innerHTML=internal
      ?`O ZIEL criará uma <b>Transferência</b> entre as duas carteiras. O resultado financeiro não será alterado. O ID externo <b>${esc(row.external_id||'—')}</b> continuará vinculado para impedir duplicidade.`
      :`O ZIEL criará uma <b>${incoming?'Entrada':'Saída'}</b> normal em Lançamentos. O ID externo <b>${esc(row.external_id||'—')}</b> impede que este movimento seja confirmado duas vezes.`;
  };

  $('zinTransferMode').onchange=paint;
  $('zinTransferCancel').onclick=closeModal;
  paint();

  $('zinTransferForm').onsubmit=async e=>{
    e.preventDefault();
    const mode=$('zinTransferMode').value;
    const internal=mode==='transfer';
    const category=internal?null:$('zinTransferCategory').value;
    const counterpart=internal?$('zinTransferCounterpart').value:null;
    const description=$('zinTransferDescription').value.trim();

    if(internal&&!counterpart)return toast('Selecione a outra carteira da transferência.','error');
    if(!internal&&!category)return toast('Selecione a categoria.','error');
    if(!description)return toast('Informe a descrição.','error');

    const btn=$('zinTransferConfirm');
    btn.disabled=true;
    btn.textContent='Lançando…';

    try{
      const {data,error}=await supabase.rpc('confirm_imported_transfer',{
        p_entry_id:row.id,
        p_mode:mode,
        p_category:category,
        p_description:description,
        p_destination_wallet:counterpart
      });
      if(error)throw error;
      if(!data)throw new Error('O lançamento não retornou um identificador válido.');

      closeModal();
      await loadAll();
      await zielLoadIncomingEntries();
      zielPaintIncoming();
      toast(internal
        ?'Transferência vinculada entre carteiras sem alterar o resultado.'
        :(incoming?'Entrada lançada em Lançamentos.':'Saída lançada em Lançamentos.'));
    }catch(error){
      toast('Não foi possível lançar: '+(error?.message||'erro desconhecido'),'error');
      if($('zinTransferConfirm')){
        $('zinTransferConfirm').disabled=false;
        $('zinTransferConfirm').textContent='Confirmar classificação';
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
      <div class="zin-payer-highlight">
        <small>PAGADOR</small>
        <strong>${esc(zielIncomingPayerName(row))}</strong>
        ${zielIncomingPayerDocument(row)?`<span>${esc(zielIncomingPayerDocument(row))}</span>`:''}
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
  btn.textContent='Consultando entradas…';

  try{
    const {data,error}=await supabase.functions.invoke('wallet-integration-query',{
      body:{
        wallet_id:walletId,
        provider:'mercado_pago',
        date_from:from,
        date_to:to,
        payments_only:true
      }
    });

    if(error)throw new Error(error.message||'Falha ao consultar o backend.');
    if(!data?.ok)throw new Error(data?.error||'A consulta não foi concluída.');

    zielIncomingLastQuery=data;
    await zielLoadIncomingEntries();

    if($('zinWalletFilter'))$('zinWalletFilter').value=walletId;
    if($('zinStatus'))$('zinStatus').value='Todos';
    if($('zinMovement'))$('zinMovement').value='Recebimentos';

    zielPaintQueryResult();
    zielPaintIncoming();

    toast('Consulta concluída: '+Number(data.new_entries||0)+' nova(s), '+Number(data.updated_entries||0)+' atualizada(s).');
  }catch(error){
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    if($('zinQueryButton')){
      $('zinQueryButton').disabled=false;
      $('zinQueryButton').textContent='Consultar entradas';
    }
  }
}

function zielPaintQueryResult(){
  const host=$('zinQueryResult');
  if(!host)return;

  const q=zielIncomingLastQuery;
  if(!q){
    host.innerHTML='<div class="zin-query-empty">Escolha a carteira e a data para consultar entradas aprovadas do Mercado Pago.</div>';
    return;
  }

  host.innerHTML=`<div class="zin-query-summary">
    <div><small>Período consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' até '+esc(br(q.date_to)):''}</strong></div>
    <div><small>Entradas localizadas</small><strong>${Number(q.payments_found||0)}</strong></div>
    <div><small>Novas entradas</small><strong class="g">${Number(q.payments_new??q.new_entries??0)}</strong></div>
    <div><small>Já existentes / atualizadas</small><strong>${Number(q.payments_updated??q.updated_entries??q.already_existing??0)}</strong></div>
    <div><small>Aguardando liberação</small><strong class="a">${Number(q.awaiting_release||0)}</strong></div>
  </div>
  <p class="mini">A consulta é <b>manual</b> e traz somente <b>recebimentos aprovados</b>. Reconsultar o mesmo período atualiza os mesmos IDs do Mercado Pago e não cria duplicidade.</p>`;
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

  if(!zielIncomingLastQuery){
    if($('zinPending'))$('zinPending').textContent='—';
    if($('zinConfirmed'))$('zinConfirmed').textContent='—';
    if($('zinIgnored'))$('zinIgnored').textContent='—';
    host.innerHTML='<div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira, o dia ou período e clique em <b>Consultar movimentos</b>. O histórico não é carregado automaticamente.</span></div>';
    return;
  }

  const status=$('zinStatus')?.value||'Todos';
  const walletFilter=$('zinWalletFilter')?.value||zielIncomingLastQuery.wallet_id||'';
  const movement=$('zinMovement')?.value||'Todos';
  const q=String($('zinSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');

  const queryRange={from:zielIncomingLastQuery.date_from,to:zielIncomingLastQuery.date_to};

  const visibleBase=zielIncomingRows.filter(row=>{
    if(row.wallet_id!==zielIncomingLastQuery.wallet_id)return false;
    if(row.movement_kind==='transfer')return false;
    const key=zielIncomingDateKey(row.approved_at||row.occurred_at);
    return !!key&&key>=queryRange.from&&key<=queryRange.to;
  });

  const rows=visibleBase.filter(row=>{
    if(status!=='Todos'&&row.decision_status!==status)return false;
    if(walletFilter&&row.wallet_id!==walletFilter)return false;
    if(movement==='Recebimentos'&&row.movement_kind==='transfer')return false;
    if(movement==='Transferências'&&row.movement_kind!=='transfer')return false;

    if(q){
      const wallet=state.wallets.find(w=>w.id===row.wallet_id);
      const hay=[
        row.description,row.payer_name,row.payer_document_type,row.payer_document_last4,row.external_id,row.external_reference,row.payment_method,
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

  // Esta página é deliberadamente manual: nunca exibe histórico ao abrir.
  zielIncomingRows=[];
  zielIncomingLastQuery=null;

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
              <strong>Consultar entradas do Mercado Pago</strong>
              <p>Escolha a carteira e o dia ou período. O ZIEL busca somente recebimentos aprovados para sua conferência antes de lançar no financeiro.</p>
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
            <button type="button" class="btn btn-primary" id="zinQueryButton">Consultar entradas</button>
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
          <select id="zinMovement" disabled>
            <option selected>Recebimentos</option>
          </select>
        </div>

        <div class="field">
          <label for="zinSearch">Buscar</label>
          <input class="input" id="zinSearch" type="search" placeholder="Pagador, CNPJ final, descrição ou ID">
        </div>
      </div>

      <div id="zinList"><div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o dia ou período acima para buscar entradas.</span></div></div>

      <div class="zin-duplicate-note">
        <strong>Proteção contra duplicidade</strong>
        <span>Cada recebimento usa o ID único do Mercado Pago. Reconsultar o mesmo dia ou período atualiza o registro existente; ao confirmar, o banco bloqueia uma segunda criação do mesmo lançamento.</span>
      </div>
    </div>`;

  $('zinQueryMode').onchange=zielIncomingPaintDateMode;
  $('zinQueryButton').onclick=zielRunIncomingQuery;
  $('zinStatus').onchange=zielPaintIncoming;
  $('zinWalletFilter').onchange=zielPaintIncoming;
  $('zinMovement').value='Recebimentos';
  $('zinSearch').oninput=zielPaintIncoming;
  zielIncomingPaintDateMode();
  zielPaintQueryResult();

  try{
    await zielLoadIncomingIntegrations();
    if(seq!==zielIncomingRenderSeq)return;

    const wallets=zielIncomingConfiguredWallets();
    $('zinQueryWallet').innerHTML=wallets.length
      ?zielIncomingWalletOptions()
      :'<option value="">Nenhuma carteira Mercado Pago integrada</option>';
    $('zinQueryWallet').disabled=!wallets.length;
    $('zinQueryButton').disabled=!wallets.length;

    $('zinWalletFilter').innerHTML='<option value="">Todas</option>'+
      wallets.map(w=>`<option value="${esc(w.id)}">${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');

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
