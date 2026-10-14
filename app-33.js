// Consulta manual estável por período.
// O backend consulta o provedor; a tela relê o período diretamente do banco para evitar estado desatualizado.

async function zielLoadIncomingPeriodRows(walletId,provider,from,to){
  const {data,error}=await supabase.rpc('list_incoming_entries_period',{
    p_wallet_id:walletId,
    p_provider:provider,
    p_date_from:from,
    p_date_to:to
  });
  if(error)throw error;
  zielIncomingRows=Array.isArray(data)?data:[];
  return zielIncomingRows;
}

async function zielInvokeIncomingProvider(functionName,body){
  if(!supabase?.functions||typeof supabase.functions.invoke!=='function'){
    throw new Error('Cliente de integração indisponível. Atualize a página e tente novamente.');
  }
  const {data,error}=await supabase.functions.invoke(functionName,{body});
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
  return data;
}

zielRunIncomingQuery=async function(){
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

  const dates=zielIncomingQueryDates();
  const from=dates.from,to=dates.to;

  if(!from||!to)return toast('Informe a data ou período da consulta.','error');
  if(from>to)return toast('A data inicial não pode ser maior que a data final.','error');

  const start=new Date(from+'T00:00:00');
  const end=new Date(to+'T00:00:00');
  const days=Math.round((end-start)/86400000);
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
      throw new Error('A consulta retornou uma instituição diferente da configurada na carteira.');
    }

    const periodRows=await zielLoadIncomingPeriodRows(walletId,provider,from,to);
    const paymentRows=[...new Map(
      periodRows
        .filter(row=>row.movement_kind!=='transfer')
        .map(row=>[
          String(row.provider||'')+'|'+String(row.external_id||row.id||''),
          row
        ])
    ).values()];

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

    if(typeof zielIncomingSelected!=='undefined'&&zielIncomingSelected?.clear)zielIncomingSelected.clear();

    if($('zinWalletFilter'))$('zinWalletFilter').value=walletId;
    if($('zinStatus'))$('zinStatus').value='Pendente';
    if($('zinMovement'))$('zinMovement').value='Recebimentos';

    zielPaintQueryResult();
    zielPaintIncoming();

    const eligible=typeof zielIncomingSelectableInLastQuery==='function'
      ?zielIncomingSelectableInLastQuery()
      :paymentRows.filter(row=>row.decision_status==='Pendente'&&row.available_for_balance!==false&&!row.transaction_id);

    toast(
      'Consulta concluída: '+paymentRows.length+' entrada(s) encontrada(s) · '+
      eligible.length+' pendente(s) para lançar.'
    );

    const result=$('zinQueryResult');
    if(result&&typeof result.scrollIntoView==='function'){
      setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
    }
  }catch(error){
    toast('Consulta falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    zielIncomingQueryInFlight=false;
    if(button&&document.body.contains(button)){
      button.disabled=false;
      button.textContent='Consultar entradas';
    }
    zielIncomingPaintWallet();
  }
};

const _zielStableIncomingRender=renderIncomingEntries;
renderIncomingEntries=async function(seq=zielIncomingRenderSeq){
  await _zielStableIncomingRender(seq);
  const btn=$('zinQueryButton');
  if(btn){
    btn.onclick=zielRunIncomingQuery;
    btn.textContent='Consultar entradas';
  }
};
