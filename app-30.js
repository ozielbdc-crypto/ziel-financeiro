// Account Money Report — relatório tratado, separado da importação de entradas.
// Usa o mesmo período/carteira da consulta manual, mas não cria lançamentos.

let zielAccountMoneyTasks={};
let zielAccountMoneyLast=null;

function zielAccountMoneyTaskKey(walletId,from,to){
  return [walletId,from,to].join('|');
}

function zielAccountMoneyProviderForWallet(walletId){
  const integrations=typeof zielIncomingIntegrationsForWallet==='function'
    ?zielIncomingIntegrationsForWallet(walletId)
    :[];
  return integrations.length===1?integrations[0].provider:'';
}

function zielAccountMoneyPaintButton(){
  const btn=$('zinAccountMoneyButton');
  const walletId=$('zinQueryWallet')?.value||'';
  if(!btn)return;
  const provider=walletId?zielAccountMoneyProviderForWallet(walletId):'';
  const visible=provider==='mercado_pago';
  btn.classList.toggle('hidden',!visible);
  btn.disabled=!visible||!walletId;
  if(visible)btn.title='Gerar o Account Money Report tratado deste período';
}

function zielAccountMoneyEscCsv(value){
  const s=String(value??'');
  return '"'+s.replaceAll('"','""')+'"';
}

function zielAccountMoneyExport(){
  const report=zielAccountMoneyLast;
  if(!report?.rows?.length)return toast('Não há linhas para exportar.','error');
  const header=[
    'DATA','CLASSIFICACAO','TIPO_ORIGINAL','SOURCE_ID','REFERENCIA_EXTERNA',
    'METODO','TIPO_METODO','VALOR_TRANSACAO','TAXAS','IMPACTO_LIQUIDO','MOEDA'
  ];
  const rows=report.rows.map(r=>[
    r.date||'',r.classification||'',r.transaction_type||'',r.source_id||'',
    r.external_reference||'',r.payment_method||'',r.payment_method_type||'',
    Number(r.transaction_amount||0).toFixed(2).replace('.',','),
    Number(r.fee_amount||0).toFixed(2).replace('.',','),
    Number(r.settlement_net_amount||0).toFixed(2).replace('.',','),
    r.currency||'BRL'
  ]);
  const csv='\uFEFF'+[header,...rows].map(row=>row.map(zielAccountMoneyEscCsv).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='account-money-tratado-'+report.date_from+'-a-'+report.date_to+'.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function zielAccountMoneyKindClass(kind){
  if(kind==='income')return 'income';
  if(kind==='expense'||kind==='refund'||kind==='chargeback')return 'expense';
  if(kind==='fee')return 'fee';
  if(kind==='transfer')return 'transfer';
  return 'neutral';
}

function zielAccountMoneyRenderReport(data,wallet){
  zielAccountMoneyLast=data;
  const rows=Array.isArray(data.rows)?data.rows:[];
  const visible=rows.slice(0,500);
  const totals=data.totals||{};

  modal('Account Money Report — Mercado Pago',`
    <div class="zam-report">
      <div class="zam-report-head">
        <div>
          <span class="zam-report-badge">ACCOUNT MONEY</span>
          <h3>${esc(wallet?.name||'Mercado Pago')}</h3>
          <p>${esc(businessName(wallet?.business_id))} · ${esc(br(data.date_from))}${data.date_from!==data.date_to?' até '+esc(br(data.date_to)):''}</p>
        </div>
        <button type="button" class="btn btn-soft" id="zamExport">Exportar CSV tratado</button>
      </div>

      <div class="zam-summary">
        <div><small>Entradas no saldo</small><strong class="g">${fmt(Number(totals.incoming||0))}</strong></div>
        <div><small>Saídas do saldo</small><strong class="r">${fmt(Number(totals.outgoing||0))}</strong></div>
        <div><small>Taxas / deduções</small><strong class="a">${fmt(Number(totals.fees||0))}</strong></div>
        <div><small>Impacto líquido</small><strong class="${Number(totals.net_impact||0)>=0?'g':'r'}">${fmt(Number(totals.net_impact||0))}</strong></div>
      </div>

      <div class="zam-note">
        <strong>Relatório tratado pelo ZIEL.</strong>
        <span>O campo principal é o <b>impacto líquido no saldo</b> informado pelo Account Money Report. As taxas são exibidas separadamente para análise, mas já estão refletidas no impacto líquido quando o Mercado Pago assim as contabiliza.</span>
      </div>

      <div class="zam-report-meta">
        <span><b>${Number(data.rows_total||rows.length)}</b> movimento${Number(data.rows_total||rows.length)===1?'':'s'}</span>
        <span>Arquivo Mercado Pago: <b>${esc(data.file_name||'—')}</b></span>
        ${data.rows_truncated?'<span class="r"><b>Resposta limitada pelo backend.</b> Exporte/consulte períodos menores para detalhamento completo.</span>':''}
        ${rows.length>500?'<span class="a">A tela mostra os 500 movimentos mais recentes; o CSV tratado inclui todas as linhas recebidas.</span>':''}
      </div>

      <div class="zam-table-wrap">
        <table class="zam-table">
          <thead><tr>
            <th>Data</th><th>Classificação</th><th>ID</th><th>Método</th>
            <th>Bruto</th><th>Taxas</th><th>Impacto no saldo</th>
          </tr></thead>
          <tbody>
            ${visible.map(r=>`<tr>
              <td><strong>${esc(zielIncomingWhen(r.date))}</strong><small>${esc(r.transaction_type||'—')}</small></td>
              <td><span class="zam-kind ${zielAccountMoneyKindClass(r.kind)}">${esc(r.classification||'Movimento')}</span></td>
              <td><strong>${esc(r.source_id||'—')}</strong><small>${esc(r.external_reference||'')}</small></td>
              <td><strong>${esc(r.payment_method||'—')}</strong><small>${esc(r.payment_method_type||'')}</small></td>
              <td class="${Number(r.transaction_amount||0)>=0?'':'r'}">${fmt(Number(r.transaction_amount||0))}</td>
              <td class="a">${fmt(Math.abs(Number(r.fee_amount||0)))}</td>
              <td class="${Number(r.settlement_net_amount||0)>=0?'g':'r'}"><b>${Number(r.settlement_net_amount||0)>=0?'+ ':'− '}${fmt(Math.abs(Number(r.settlement_net_amount||0)))}</b></td>
            </tr>`).join('')||'<tr><td colspan="7"><div class="empty">Nenhum movimento no período.</div></td></tr>'}
          </tbody>
        </table>
      </div>

      <p class="mini">Este relatório é apenas analítico/reconciliatório. Abrir, tratar ou exportar o Account Money Report <b>não cria lançamentos</b> no ZIEL. Os lançamentos continuam sendo feitos somente pela confirmação na tela Consultar entradas.</p>
    </div>
  `);

  document.querySelector('#modalWrap .modal')?.classList.add('zam-modal');
  $('zamExport').onclick=zielAccountMoneyExport;
}

function zielAccountMoneyPending(data,wallet,from,to){
  const key=zielAccountMoneyTaskKey(wallet.id,from,to);
  if(data.task_id)zielAccountMoneyTasks[key]=String(data.task_id);

  modal('Account Money Report — processando',`
    <div class="zam-pending">
      <div class="zam-spinner">↻</div>
      <div>
        <strong>O Mercado Pago está gerando o relatório.</strong>
        <p>${esc(data.message||'A geração é assíncrona e pode levar alguns instantes.')}</p>
        <span>${esc(wallet.name)} · ${esc(br(from))}${from!==to?' até '+esc(br(to)):''}</span>
      </div>
    </div>
    <div class="zam-note"><span>O ZIEL guardou o identificador desta tarefa. Ao atualizar, continuará acompanhando o mesmo relatório em vez de criar outro.</span></div>
    <div class="actions"><button type="button" class="btn btn-soft" id="zamCancel">Fechar</button><button type="button" class="btn btn-primary" id="zamRefresh">Atualizar relatório</button></div>
  `);
  $('zamCancel').onclick=closeModal;
  $('zamRefresh').onclick=()=>{
    closeModal();
    zielRunAccountMoneyReport();
  };
}

async function zielRunAccountMoneyReport(){
  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira Mercado Pago.','error');

  const provider=zielAccountMoneyProviderForWallet(walletId);
  if(provider!=='mercado_pago')return toast('Account Money Report está disponível para carteiras Mercado Pago.','error');

  const wallet=state.wallets.find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  const {from,to}=zielIncomingQueryDates();
  if(!from||!to)return toast('Informe a data ou período.','error');
  if(from>to)return toast('A data inicial não pode ser maior que a final.','error');

  const days=Math.round((new Date(to+'T00:00:00')-new Date(from+'T00:00:00'))/86400000);
  if(!Number.isFinite(days)||days<0||days>365)return toast('Escolha um período de até 366 dias.','error');

  const key=zielAccountMoneyTaskKey(walletId,from,to);
  const btn=$('zinAccountMoneyButton');
  if(btn){btn.disabled=true;btn.textContent='Gerando relatório…';}

  try{
    const {data,error}=await supabase.functions.invoke('wallet-account-money-report',{
      body:{
        wallet_id:walletId,
        date_from:from,
        date_to:to,
        task_id:zielAccountMoneyTasks[key]||undefined
      }
    });

    if(error){
      let message=error.message||'Falha ao consultar o Account Money Report.';
      try{
        const response=error.context;
        if(response&&typeof response.clone==='function'){
          const payload=await response.clone().json();
          if(payload?.error)message=payload.error;
        }
      }catch(_){}
      throw new Error(message);
    }
    if(!data?.ok)throw new Error(data?.error||'O relatório não foi concluído.');

    if(data.pending){
      zielAccountMoneyPending(data,wallet,from,to);
      return;
    }

    delete zielAccountMoneyTasks[key];
    zielAccountMoneyRenderReport(data,wallet);
    toast('Account Money Report tratado com sucesso.');
  }catch(error){
    toast('Relatório falhou: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    if(btn&&document.body.contains(btn)){
      btn.textContent='Account Money Report';
      zielAccountMoneyPaintButton();
    }
  }
}

function zielAccountMoneyInstall(){
  const action=document.querySelector('.zin-query-controls .zin-query-action');
  const queryBtn=$('zinQueryButton');
  if(!action||!queryBtn||$('zinAccountMoneyButton'))return;

  const btn=document.createElement('button');
  btn.type='button';
  btn.className='btn btn-soft hidden';
  btn.id='zinAccountMoneyButton';
  btn.textContent='Account Money Report';
  btn.onclick=zielRunAccountMoneyReport;
  action.appendChild(btn);

  const wallet=$('zinQueryWallet');
  if(wallet)wallet.addEventListener('change',()=>setTimeout(zielAccountMoneyPaintButton,0));
  zielAccountMoneyPaintButton();
}

const _zielAccountMoneyPrevRenderIncomingEntries=renderIncomingEntries;
renderIncomingEntries=async function(seq=zielIncomingRenderSeq){
  await _zielAccountMoneyPrevRenderIncomingEntries(seq);
  if(seq!==zielIncomingRenderSeq)return;
  zielAccountMoneyInstall();
};
