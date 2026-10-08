// Entradas importadas — consulta manual por dia/período e confirmação antes do lançamento.

let zielIncomingRows=[];
let zielIncomingRenderSeq=0;
let zielIncomingIntegrations=[];
let zielIncomingLastQuery=null;
let zielIncomingQueryInFlight=false;

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
    received:'Recebido',
    confirmed:'Confirmado',
    received_in_cash:'Recebido em dinheiro',
    refund_requested:'Reembolso solicitado',
    refund_in_progress:'Reembolso em andamento',
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

function zielIncomingFeeItems(row){
  const raw=Array.isArray(row?.fee_breakdown)?row.fee_breakdown:[];
  const items=raw.map(item=>({
    label:String(item?.label||item?.type||'Taxa / dedução'),
    amount:Math.round(Math.abs(Number(item?.amount||0))*100)/100
  })).filter(item=>item.amount>.004);

  const total=Math.round(Number(row?.fee_amount||0)*100)/100;
  const sum=Math.round(items.reduce((a,item)=>a+item.amount,0)*100)/100;

  if(total>.004&&Math.abs(total-sum)>.01){
    items.push({
      label:'Outras taxas / deduções',
      amount:Math.round(Math.max(0,total-sum)*100)/100
    });
  }
  if(total>.004&&!items.length){
    items.push({label:'Taxas / deduções '+zielIncomingProviderLabel(row?.provider),amount:total});
  }
  return items;
}

function zielIncomingFeeDetailsHtml(row,compact=false){
  const fee=Number(row?.fee_amount||0);
  if(fee<=.009)return '';
  const items=zielIncomingFeeItems(row);
  const providerLabel=zielIncomingProviderLabel(row?.provider);
  const basis=row?.fee_basis==='net_received_amount'
    ?'Total fechado pelo valor líquido efetivamente creditado pelo '+providerLabel+'.'
    :row?.fee_basis==='net_value'
      ?'Total fechado pelo valor líquido informado pelo '+providerLabel+'.'
      :'Total informado pelo detalhamento de taxas do '+providerLabel+'.';

  return `<div class="zin-fee-breakdown ${compact?'compact':''}">
    <div class="zin-fee-breakdown-head">
      <strong>Taxas e deduções incluídas</strong>
      <span>Total − ${fmt(fee)}</span>
    </div>
    <div class="zin-fee-lines">
      ${items.map(item=>`<div><span>${esc(item.label)}</span><b>− ${fmt(item.amount)}</b></div>`).join('')}
    </div>
    <p>${esc(basis)} Inclui tarifa de cartão/processamento, parcelamento, impostos ou outras deduções quando aplicáveis.</p>
  </div>`;
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
  const linkedPayable=row.linked_payable_id?(state.payables||[]).find(p=>p.id===row.linked_payable_id):null;
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

    <div class="zin-meta">
      <div><small>${isTransfer?'Data do movimento':'Data de aprovação'}</small><strong>${esc(zielIncomingWhen(when))}</strong></div>
      <div><small>${isTransfer?'Tipo no provedor':'Status no provedor'}</small><strong>${esc(zielIncomingProviderStatusLabel(row.provider_transaction_type||row.provider_status||'—',isTransfer?'transfer':'payment'))}</strong></div>
      <div><small>Método</small><strong>${esc(row.payment_method||'—')}</strong></div>
      <div><small>ID ${esc(zielIncomingProviderLabel(row.provider))}</small><strong>${esc(row.provider_source_id||row.external_id||'—')}</strong></div>
      ${isCard?`<div><small>Parcelas</small><strong>${Number(row.installments||1)}x</strong></div>`:''}
      ${!isTransfer&&fee>0.009?`<div><small>Taxas/deduções totais</small><strong class="r">− ${fmt(fee)}</strong></div>
      <div><small>Valor líquido</small><strong class="g">${fmt(net)}</strong></div>`:''}
      ${!isTransfer?`<div><small>Liberação</small><strong class="${released?'g':'a'}">${released?'Liberado':row.money_release_date?zielIncomingWhen(row.money_release_date):'Aguardando'}</strong></div>`:''}
    </div>

    ${!isTransfer&&fee>0.009?zielIncomingFeeDetailsHtml(row):''}

    ${!released&&!isTransfer?`<div class="zin-release-warning"><strong>Pagamento aprovado, mas ainda não disponível na carteira.</strong><span>O ZIEL não permite lançar esse valor no saldo até a liberação do ${esc(zielIncomingProviderLabel(row.provider))}. Consulte novamente depois.</span></div>`:''}

    ${isTransfer?`<div class="zin-transfer-note ${!directionKnown?'pending-direction':''}"><strong>Transferência:</strong><span>${directionKnown
      ?`classifique se o dinheiro foi movimentado <b>entre suas próprias carteiras</b>, se foi uma ${direction==='Saída'?'<b>saída externa</b>':'<b>entrada externa</b>'}${direction==='Saída'?' ou se corresponde ao <b>pagamento de uma conta cadastrada</b>':''}. Transferências internas não alteram o resultado do negócio.`
      :'<b>direção ainda não confirmada pelo provedor.</b> O ZIEL não presume entrada ou saída. Consulte novamente o mesmo período para o relatório de saldo identificar o impacto real antes de lançar.'}</span></div>`:''}

    ${linkedPayable?`<div class="zin-linked-payable"><strong>Conta a pagar vinculada</strong><span>${esc(linkedPayable.supplier||'Fornecedor')} · ${esc(linkedPayable.description||'Conta')} · ${fmt(Number(linkedPayable.amount||0))}</span></div>`:''}

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
  const movementDate=zielIncomingDateKey(row.approved_at||row.occurred_at||row.imported_at)||iso();

  const counterpartWallets=(state.wallets||[])
    .filter(w=>w.active!==false&&w.id!==wallet.id)
    .sort((a,b)=>{
      const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
      return biz||a.name.localeCompare(b.name,'pt-BR');
    });

  const walletChoices='<option value="">Selecione a carteira</option>'+
    counterpartWallets.map(w=>`<option value="${esc(w.id)}">${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');

  const openPayables=incoming?[]:(state.payables||[])
    .filter(p=>p.business_id===row.business_id&&Number(p.amount||0)-Number(p.paid_amount||0)>.009)
    .map(p=>({
      ...p,
      open_amount:Math.round((Number(p.amount||0)-Number(p.paid_amount||0))*100)/100
    }))
    .sort((a,b)=>{
      const amountDiff=Math.abs(a.open_amount-amount)-Math.abs(b.open_amount-amount);
      if(Math.abs(amountDiff)>.009)return amountDiff;
      const ad=Math.abs(new Date((a.due_date||movementDate)+'T12:00:00').getTime()-new Date(movementDate+'T12:00:00').getTime());
      const bd=Math.abs(new Date((b.due_date||movementDate)+'T12:00:00').getTime()-new Date(movementDate+'T12:00:00').getTime());
      return ad-bd;
    });

  const exactPayables=openPayables.filter(p=>Math.abs(p.open_amount-amount)<.01);
  const payableChoices='<option value="">Selecione a conta a pagar</option>'+
    openPayables.map((p,i)=>`<option value="${esc(p.id)}" ${i===0&&exactPayables.length?'selected':''}>${esc(p.supplier||p.description||'Conta')} — vence ${esc(br(p.due_date))} — aberto ${fmt(p.open_amount)}</option>`).join('');

  modal(incoming?'Classificar transferência recebida':'Classificar transferência enviada',`
    <form id="zinTransferForm" class="zin-confirm-form">
      <div class="zin-confirm-summary">
        <div><small>${incoming?'VALOR RECEBIDO':'VALOR ENVIADO'}</small><strong class="${incoming?'g':'r'}">${incoming?'+ ':'− '}${fmt(amount)}</strong></div>
        <div><small>CARTEIRA DE ORIGEM</small><strong>${esc(wallet.name)}</strong><span>${esc(businessName(wallet.business_id))}</span></div>
      </div>

      <div class="field">
        <label>Como classificar este movimento?</label>
        <select id="zinTransferMode">
          <option value="transfer">${incoming?'Veio de outra carteira minha':'Foi para outra carteira minha'}</option>
          ${!incoming?'<option value="payable">Pagamento de uma conta cadastrada</option>':''}
          <option value="${incoming?'income':'expense'}">${incoming?'Entrada externa':'Saída externa / retirada / despesa'}</option>
        </select>
        ${!incoming&&exactPayables.length?`<div class="zin-payable-suggestion"><strong>Sugestão:</strong> há ${exactPayables.length} conta${exactPayables.length===1?'':'s'} em aberto com exatamente ${fmt(amount)}.</div>`:''}
      </div>

      <div class="field" id="zinTransferDestinationWrap">
        <label>${incoming?'Carteira de origem':'Carteira de destino'}</label>
        <select id="zinTransferCounterpart">${walletChoices}</select>
        <div class="mini">Use esta opção quando o dinheiro apenas mudou de uma carteira sua para outra. Isso não vira receita nem despesa.</div>
      </div>

      ${!incoming?`<div class="field hidden" id="zinTransferPayableWrap">
        <label>Conta a pagar</label>
        <select id="zinTransferPayable">${payableChoices}</select>
        <div id="zinTransferPayableInfo" class="zin-payable-info">${openPayables.length?'Selecione a conta que originou esta saída.':'Não há contas em aberto neste negócio.'}</div>
      </div>`:''}

      <div class="field hidden" id="zinTransferCategoryWrap">
        <label>Categoria da ${incoming?'entrada':'saída'}</label>
        <select id="zinTransferCategory">${categoryOptions(incoming?'Entrada':'Saída')}</select>
        <div class="mini">Use somente quando a movimentação não veio de / não foi para outra carteira controlada no ZIEL e não corresponde a uma conta já cadastrada.</div>
      </div>

      <div class="field" id="zinTransferDescriptionWrap">
        <label>Descrição</label>
        <input class="input" id="zinTransferDescription" maxlength="160" value="${esc(row.description||(incoming?'Transferência recebida Mercado Pago':'Transferência enviada Mercado Pago'))}" required>
      </div>

      <div class="zin-confirm-note" id="zinTransferNote"></div>

      <div class="actions">
        <button type="button" class="btn btn-soft" id="zinTransferCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zinTransferConfirm">Confirmar classificação</button>
      </div>
    </form>`);

  const selectedPayable=()=>openPayables.find(p=>p.id===$('zinTransferPayable')?.value)||null;

  const paintPayable=()=>{
    const host=$('zinTransferPayableInfo');
    if(!host)return;
    const p=selectedPayable();
    if(!p){
      host.innerHTML=openPayables.length?'Selecione a conta que originou esta saída.':'Não há contas em aberto neste negócio.';
      return;
    }
    const after=Math.round((p.open_amount-amount)*100)/100;
    const tooLarge=amount>p.open_amount+.009;
    const partial=amount<p.open_amount-.009;
    host.innerHTML=`<div class="zin-payable-match ${tooLarge?'error':partial?'partial':'ok'}">
      <div><small>Fornecedor</small><strong>${esc(p.supplier||'—')}</strong></div>
      <div><small>Descrição</small><strong>${esc(p.description||'—')}</strong></div>
      <div><small>Vencimento</small><strong>${esc(br(p.due_date))}</strong></div>
      <div><small>Saldo em aberto</small><strong>${fmt(p.open_amount)}</strong></div>
      <div><small>Transferência</small><strong>${fmt(amount)}</strong></div>
      <div><small>Após a baixa</small><strong class="${tooLarge?'r':''}">${tooLarge?'Transferência maior que a conta':partial?fmt(after):'Quitada'}</strong></div>
    </div>`;
  };

  const paint=()=>{
    const mode=$('zinTransferMode').value;
    const internal=mode==='transfer';
    const payableMode=mode==='payable';
    $('zinTransferDestinationWrap').classList.toggle('hidden',!internal);
    $('zinTransferCategoryWrap').classList.toggle('hidden',internal||payableMode);
    if($('zinTransferPayableWrap'))$('zinTransferPayableWrap').classList.toggle('hidden',!payableMode);
    $('zinTransferDescriptionWrap').classList.toggle('hidden',payableMode);

    if(payableMode){
      paintPayable();
      const p=selectedPayable();
      $('zinTransferNote').innerHTML=p
        ?`O ZIEL usará esta movimentação do Mercado Pago para <b>baixar a conta já cadastrada</b>. Não será criada uma segunda despesa. Se o valor for menor que o saldo em aberto, a baixa será parcial. O ID externo <b>${esc(row.external_id||'—')}</b> ficará vinculado e não poderá ser utilizado novamente.`
        :`Selecione uma conta em aberto. O ZIEL não criará uma nova despesa: esta saída será vinculada diretamente à conta escolhida.`;
      return;
    }

    $('zinTransferNote').innerHTML=internal
      ?`O ZIEL criará uma <b>Transferência</b> entre as duas carteiras. O resultado financeiro não será alterado. O ID externo <b>${esc(row.external_id||'—')}</b> continuará vinculado para impedir duplicidade.`
      :`O ZIEL criará uma <b>${incoming?'Entrada':'Saída'}</b> normal em Lançamentos. O ID externo <b>${esc(row.external_id||'—')}</b> impede que este movimento seja confirmado duas vezes.`;
  };

  $('zinTransferMode').onchange=paint;
  if($('zinTransferPayable'))$('zinTransferPayable').onchange=()=>{paintPayable();paint();};
  $('zinTransferCancel').onclick=closeModal;
  paint();

  $('zinTransferForm').onsubmit=async e=>{
    e.preventDefault();
    const mode=$('zinTransferMode').value;
    const internal=mode==='transfer';
    const payableMode=mode==='payable';
    const category=internal||payableMode?null:$('zinTransferCategory').value;
    const counterpart=internal?$('zinTransferCounterpart').value:null;
    const description=payableMode?'':$('zinTransferDescription').value.trim();
    const payable=payableMode?selectedPayable():null;

    if(internal&&!counterpart)return toast('Selecione a outra carteira da transferência.','error');
    if(payableMode&&!payable)return toast('Selecione a conta a pagar correspondente.','error');
    if(payableMode&&amount>payable.open_amount+.009)return toast('A transferência é maior que o saldo em aberto da conta selecionada.','error');
    if(!internal&&!payableMode&&!category)return toast('Selecione a categoria.','error');
    if(!payableMode&&!description)return toast('Informe a descrição.','error');

    const btn=$('zinTransferConfirm');
    btn.disabled=true;
    btn.textContent='Lançando…';

    try{
      let data,error;

      if(payableMode){
        ({data,error}=await supabase.rpc('confirm_imported_transfer_payable',{
          p_entry_id:row.id,
          p_payable_id:payable.id
        }));
      }else{
        ({data,error}=await supabase.rpc('confirm_imported_transfer',{
          p_entry_id:row.id,
          p_mode:mode,
          p_category:category,
          p_description:description,
          p_destination_wallet:counterpart
        }));
      }

      if(error)throw error;
      if(!data)throw new Error('O lançamento não retornou um identificador válido.');

      const wasPartial=payableMode&&amount<payable.open_amount-.009;

      closeModal();
      await loadAll();
      await zielLoadIncomingEntries();
      zielPaintIncoming();

      toast(payableMode
        ?(wasPartial?'Pagamento parcial vinculado à conta a pagar.':'Conta a pagar quitada com a movimentação do Mercado Pago.')
        :internal
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
    return toast('Este pagamento ainda não foi liberado pelo '+zielIncomingProviderLabel(row.provider)+'. Consulte novamente após a data de liberação.','error');
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
        <div><small>Método</small><strong>${esc(row.payment_method||zielIncomingProviderLabel(row.provider))}</strong></div>
        <div><small>Taxas/deduções totais</small><strong class="r">− ${fmt(fee)}</strong></div>
        <div><small>Líquido na carteira</small><strong class="g">${fmt(net)}</strong></div>
        <div><small>Data de liberação</small><strong>${esc(zielIncomingWhen(releaseWhen))}</strong></div>
      </div>`:''}

      ${fee>0.009?zielIncomingFeeDetailsHtml(row,true):''}

      <div class="field">
        <label>Categoria</label>
        <select id="zinCategory" required>${categoryOptions('Entrada')}</select>
      </div>

      <div class="field">
        <label>Descrição do lançamento</label>
        <input class="input" id="zinDescription" maxlength="160" value="${esc(row.description||('Entrada '+zielIncomingProviderLabel(row.provider)))}" required>
      </div>

      <div class="zin-confirm-note">
        ${fee>0.009
          ?`O ZIEL criará uma <b>Entrada de ${fmt(gross)}</b> e uma <b>Saída de ${fmt(fee)}</b> em <b>Impostos/Taxas</b>, reunindo todas as deduções do provedor — inclusive taxas de cartão/parcelamento quando existirem. O efeito líquido na carteira será <b>${fmt(net)}</b>.`
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
  zielIncomingIntegrations=(Array.isArray(data)?data:[]).filter(i=>i.enabled!==false);
  return zielIncomingIntegrations;
}

function zielIncomingConfiguredWallets(provider=''){
  const walletIds=new Set(zielIncomingIntegrations
    .filter(i=>!provider||i.provider===provider)
    .map(i=>i.wallet_id));
  return (state.wallets||[])
    .filter(w=>w.active!==false&&walletIds.has(w.id)&&(!state.businessFilter||w.business_id===state.businessFilter))
    .sort((a,b)=>{
      const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
      return biz||a.name.localeCompare(b.name,'pt-BR');
    });
}

function zielIncomingWalletOptions(selected='',provider=''){
  const wallets=zielIncomingConfiguredWallets(provider);
  return wallets.map(w=>`<option value="${esc(w.id)}" ${w.id===selected?'selected':''}>${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');
}

function zielIncomingQueryableProviders(){
  const standard=['mercado_pago','asaas','efi','lytex'];
  const configured=[...new Set(zielIncomingIntegrations.map(i=>i.provider).filter(Boolean))];
  const extra=configured.filter(p=>!standard.includes(p));
  return [...standard,...extra];
}

function zielIncomingProviderOptions(selected=''){
  const providers=zielIncomingQueryableProviders();
  return providers.map(provider=>{
    const configured=zielIncomingIntegrations.some(i=>i.provider===provider&&i.enabled!==false);
    return `<option value="${esc(provider)}" ${provider===selected?'selected':''}>${esc(zielIncomingProviderLabel(provider))}${configured?'':' — sem token ativo'}</option>`;
  }).join('');
}

function zielIncomingProviderSupported(provider){
  return ['mercado_pago','asaas'].includes(provider);
}

function zielIncomingPaintProvider(){
  const provider=$('zinQueryProvider')?.value||'';
  const wallets=zielIncomingConfiguredWallets(provider);
  const walletSelect=$('zinQueryWallet');
  const queryButton=$('zinQueryButton');
  const note=$('zinProviderNote');

  if(walletSelect){
    const previous=walletSelect.value;
    walletSelect.innerHTML=wallets.length
      ?zielIncomingWalletOptions(wallets.some(w=>w.id===previous)?previous:'',provider)
      :'<option value="">Nenhuma carteira integrada a este provedor</option>';
    walletSelect.disabled=!wallets.length;
  }

  const supported=zielIncomingProviderSupported(provider);
  if(queryButton)queryButton.disabled=!wallets.length||!supported;

  if(note){
    const configured=zielIncomingIntegrations.some(i=>i.provider===provider&&i.enabled!==false);
    if(!provider){
      note.textContent='Selecione uma instituição / provedor.';
      note.className='mini';
    }else if(!configured){
      note.textContent='Nenhum token ativo de '+zielIncomingProviderLabel(provider)+' foi configurado.';
      note.className='mini r';
    }else if(!supported){
      note.textContent=zielIncomingProviderLabel(provider)+' está configurado, mas o conector de consulta ainda não foi ativado.';
      note.className='mini r';
    }else{
      note.textContent='Consulta disponível para '+zielIncomingProviderLabel(provider)+'.';
      note.className='mini g';
    }
  }
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
  if(zielIncomingQueryInFlight)return;

  const provider=$('zinQueryProvider')?.value||'';
  if(!provider)return toast('Selecione a instituição / provedor.','error');
  if(!zielIncomingProviderSupported(provider)){
    return toast('A consulta de '+zielIncomingProviderLabel(provider)+' ainda não está disponível.','error');
  }

  const walletId=$('zinQueryWallet').value;
  if(!walletId)return toast('Selecione uma carteira integrada a '+zielIncomingProviderLabel(provider)+'.','error');

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
  btn.disabled=true;
  btn.textContent='Consultando movimentos…';

  const invoke=async()=>{
    const {data,error}=await supabase.functions.invoke('wallet-integration-query',{
      body:{
        wallet_id:walletId,
        provider,
        date_from:from,
        date_to:to,
        payments_only:false
      }
    });

    if(error)throw new Error(error.message||'Falha ao consultar o backend.');
    if(!data?.ok)throw new Error(data?.error||'A consulta não foi concluída.');
    return data;
  };

  try{
    // Mercado Pago recebe uma segunda leitura interna de validação. No Asaas,
    // uma consulta paginada do período já é suficiente.
    const first=await invoke();
    let second=first;
    let verificationPasses=1;
    let totalNew=Number(first.new_entries||0);

    if(provider==='mercado_pago'){
      if($('zinQueryButton'))$('zinQueryButton').textContent='Validando recebimentos…';
      second=await invoke();
      verificationPasses=2;
      totalNew+=Number(second.new_entries||0);
    }

    // Recarrega o que efetivamente ficou salvo. O banco usa
    // UNIQUE(owner_id, provider, external_id) para impedir duplicidade.
    await zielLoadIncomingEntries();

    const periodRows=zielIncomingRows.filter(row=>{
      if(row.wallet_id!==walletId||row.provider!==provider)return false;
      const key=zielIncomingDateKey(row.approved_at||row.occurred_at);
      return !!key&&key>=from&&key<=to;
    });

    const uniqueRows=[...new Map(periodRows.map(row=>[
      String(row.provider||'')+'|'+String(row.external_id||row.id||''),
      row
    ])).values()];

    const receiptRows=uniqueRows.filter(row=>row.movement_kind!=='transfer');
    const transferRows=uniqueRows.filter(row=>row.movement_kind==='transfer');

    const grossTotal=receiptRows.reduce((sum,row)=>
      sum+Number(row.gross_amount??row.amount??0),0);
    const netTotal=receiptRows.reduce((sum,row)=>
      sum+Number(row.net_amount??row.gross_amount??row.amount??0),0);
    const feeTotal=receiptRows.reduce((sum,row)=>
      sum+Number(row.fee_amount??0),0);
    const awaiting=receiptRows.filter(row=>row.available_for_balance===false).length;

    zielIncomingLastQuery={
      ...second,
      wallet_id:walletId,
      provider,
      date_from:from,
      date_to:to,
      payments_only:false,
      payments_found:receiptRows.length,
      transfers_found:transferRows.length,
      period_gross_total:Math.round(grossTotal*100)/100,
      period_net_total:Math.round(netTotal*100)/100,
      period_fee_total:Math.round(feeTotal*100)/100,
      awaiting_release:awaiting,
      new_entries:totalNew,
      updated_entries:Number(second.updated_entries??second.already_existing??0),
      verification_passes:verificationPasses,
      transfer_warning:second.transfer_warning||null
    };

    if($('zinWalletFilter'))$('zinWalletFilter').value=walletId;
    if($('zinStatus'))$('zinStatus').value='Todos';
    if($('zinMovement'))$('zinMovement').value='Todos';

    zielPaintQueryResult();
    zielPaintIncoming();

    toast(
      'Consulta concluída: '+
      Number(zielIncomingLastQuery.new_entries||0)+' nova(s), '+
      Number(zielIncomingLastQuery.updated_entries||0)+' existente(s)/atualizada(s).'
    );
  }catch(error){
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    zielIncomingQueryInFlight=false;
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
    host.innerHTML='<div class="zin-query-empty">Escolha o provedor, a carteira e a data para consultar os movimentos.</div>';
    return;
  }

  host.innerHTML=`<div class="zin-query-summary">
    <div><small>Provedor</small><strong>${esc(zielIncomingProviderLabel(q.provider||'mercado_pago'))}</strong></div>
    <div><small>Período consultado</small><strong>${esc(br(q.date_from))}${q.date_from!==q.date_to?' até '+esc(br(q.date_to)):''}</strong></div>
    <div><small>Recebimentos encontrados</small><strong>${Number(q.payments_found||0)}</strong></div>
    <div><small>Transferências encontradas</small><strong>${Number(q.transfers_found||0)}</strong><span class="mini">Separadas das receitas</span></div>
    <div class="zin-query-total"><small>${q.date_from===q.date_to?'Total recebido do dia':'Total recebido no período'}</small><strong class="g">${fmt(Number(q.period_gross_total||0))}</strong><span class="mini">Somente recebimentos aprovados; transferências não entram neste total</span></div>
    <div><small>Total líquido</small><strong>${fmt(Number(q.period_net_total??q.period_gross_total??0))}</strong><span class="mini">Após taxas/deduções informadas pelo ${esc(zielIncomingProviderLabel(q.provider||'mercado_pago'))}</span></div>
    <div><small>Taxas / deduções totais</small><strong class="r">${fmt(Number(q.period_fee_total||0))}</strong><span class="mini">Inclui cartão, parcelamento, impostos e demais deduções que reduzam o líquido</span></div>
    <div><small>Novos movimentos</small><strong class="g">${Number(q.new_entries||0)}</strong></div>
    <div><small>Já existentes / atualizados</small><strong>${Number(q.updated_entries??q.already_existing??0)}</strong></div>
    <div><small>Aguardando liberação</small><strong class="a">${Number(q.awaiting_release||0)}</strong></div>
  </div>
  ${q.transfer_warning?`<div class="message error">${esc(q.transfer_warning)}</div>`:''}
  <div class="zin-query-shortcuts">
    <button type="button" class="btn btn-soft" id="zinShowAllQuery">Ver todos</button>
    <button type="button" class="btn btn-soft" id="zinShowReceiptsQuery">Só recebimentos</button>
    <button type="button" class="btn btn-soft" id="zinShowTransfersQuery">Só transferências</button>
  </div>
  <p class="mini">A consulta traz <b>recebimentos e transferências</b>, mas mantém os tipos separados. Os mesmos IDs do ${esc(zielIncomingProviderLabel(q.provider||'mercado_pago'))} são atualizados e <b>não criam duplicidade</b>. Transferências nunca entram no total de receitas.${Number(q.verification_passes||1)>1?' O botão faz duas leituras internas de conferência no mesmo clique e consolida tudo pelo ID único do pagamento.':''}</p>`;

  const applyView=movement=>{
    if($('zinWalletFilter'))$('zinWalletFilter').value=q.wallet_id||'';
    if($('zinStatus'))$('zinStatus').value='Todos';
    if($('zinMovement'))$('zinMovement').value=movement;
    zielPaintIncoming();
  };
  const showAll=$('zinShowAllQuery');
  const showReceipts=$('zinShowReceiptsQuery');
  const showTransfers=$('zinShowTransfersQuery');
  if(showAll)showAll.onclick=()=>applyView('Todos');
  if(showReceipts)showReceipts.onclick=()=>applyView('Recebimentos');
  if(showTransfers)showTransfers.onclick=()=>applyView('Transferências');

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
    if(zielIncomingLastQuery.provider&&row.provider!==zielIncomingLastQuery.provider)return false;
    if(zielIncomingLastQuery.payments_only===true&&row.movement_kind==='transfer')return false;
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
              <strong>Consultar movimentos por provedor</strong>
              <p>Escolha a instituição, a carteira e o dia ou período. O ZIEL consulta os movimentos sem lançar nada automaticamente no financeiro.</p>
            </div>
          </div>
          <span class="zin-manual-badge">MANUAL</span>
        </div>

        <div class="zin-query-grid">
          <div class="field">
            <label for="zinQueryProvider">Instituição / provedor</label>
            <select id="zinQueryProvider"><option value="">Carregando provedores…</option></select>
            <div class="mini" id="zinProviderNote"></div>
          </div>

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
            <option>Recebimentos</option>
            <option>Todos</option>
            <option>Transferências</option>
          </select>
        </div>

        <div class="field">
          <label for="zinSearch">Buscar</label>
          <input class="input" id="zinSearch" type="search" placeholder="Descrição, ID ou método">
        </div>
      </div>

      <div id="zinList"><div class="zin-manual-empty"><strong>Nenhuma consulta realizada.</strong><span>Escolha a carteira e o período acima para buscar movimentos.</span></div></div>

      <div class="zin-duplicate-note">
        <strong>Proteção contra duplicidade</strong>
        <span>Cada movimento usa a combinação <b>provedor + ID externo</b>. Reconsultar o mesmo dia ou período atualiza o mesmo registro; a confirmação é idempotente e o banco impede criar a mesma entrada duas vezes.</span>
      </div>
    </div>`;

  $('zinQueryMode').onchange=zielIncomingPaintDateMode;
  $('zinQueryProvider').onchange=zielIncomingPaintProvider;
  $('zinQueryButton').onclick=zielRunIncomingQuery;
  $('zinStatus').onchange=zielPaintIncoming;
  $('zinWalletFilter').onchange=zielPaintIncoming;
  $('zinSearch').oninput=zielPaintIncoming;
  zielIncomingPaintDateMode();
  zielPaintQueryResult();

  try{
    await zielLoadIncomingIntegrations();
    if(seq!==zielIncomingRenderSeq)return;

    const providers=zielIncomingQueryableProviders();
    const defaultProvider=providers.find(p=>
      zielIncomingProviderSupported(p)&&zielIncomingIntegrations.some(i=>i.provider===p&&i.enabled!==false)
    )||(providers[0]||'');

    $('zinQueryProvider').innerHTML=providers.length
      ?zielIncomingProviderOptions(defaultProvider)
      :'<option value="">Nenhum provedor integrado</option>';
    $('zinQueryProvider').disabled=!providers.length;

    zielIncomingPaintProvider();

    const allConfiguredWallets=zielIncomingConfiguredWallets();
    $('zinWalletFilter').innerHTML='<option value="">Todas</option>'+
      allConfiguredWallets.map(w=>`<option value="${esc(w.id)}">${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('');

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
