// Relatórios salvos: a consulta mais recente fica como "Última consulta" e
// consultas anteriores permanecem disponíveis no histórico, inclusive para o mesmo período.

let zielAccountMoneySavedReports=[];

function zielAccountMoneyReportPeriodLabel(row){
  if(!row)return '—';
  return row.date_from===row.date_to
    ? br(row.date_from)
    : br(row.date_from)+' até '+br(row.date_to);
}

async function zielAccountMoneyLoadSavedReports(walletId,limit=30){
  if(!walletId)return [];
  const {data,error}=await supabase
    .from('integration_account_money_reports')
    .select('id,wallet_id,provider,date_from,date_to,file_name,rows_total,rows_truncated,totals,generated_at,updated_at')
    .eq('wallet_id',walletId)
    .eq('provider','mercado_pago')
    .order('generated_at',{ascending:false})
    .order('updated_at',{ascending:false})
    .limit(limit);
  if(error)throw error;
  zielAccountMoneySavedReports=Array.isArray(data)?data:[];
  return zielAccountMoneySavedReports;
}

async function zielAccountMoneyPaintCacheButton(){
  const btn=$('zinAccountMoneyCachedButton');
  const historyBtn=$('zinAccountMoneyHistoryButton');
  const meta=$('zinAccountMoneyCacheMeta');
  const walletId=$('zinQueryWallet')?.value||'';
  const provider=walletId?zielAccountMoneyProviderForWallet(walletId):'';
  const seq=++zielAccountMoneyCacheSeq;

  zielAccountMoneyLatestCache=null;
  zielAccountMoneySavedReports=[];

  if(!btn)return;
  if(!walletId||provider!=='mercado_pago'){
    btn.classList.add('hidden');
    btn.disabled=true;
    if(historyBtn){historyBtn.classList.add('hidden');historyBtn.disabled=true;}
    if(meta)meta.innerHTML='';
    return;
  }

  btn.classList.remove('hidden');
  btn.disabled=true;
  btn.textContent='Verificando última consulta…';
  if(historyBtn){historyBtn.classList.add('hidden');historyBtn.disabled=true;}
  if(meta)meta.innerHTML='<span>Buscando a última consulta salva no ZIEL…</span>';

  try{
    const rows=await zielAccountMoneyLoadSavedReports(walletId,30);
    if(seq!==zielAccountMoneyCacheSeq)return;

    const latest=rows[0]||null;
    zielAccountMoneyLatestCache=latest;

    if(!latest){
      btn.disabled=true;
      btn.textContent='Nenhuma consulta salva';
      if(meta)meta.innerHTML='<span>Depois da primeira consulta concluída, o ZIEL salvará o relatório aqui.</span>';
      return;
    }

    btn.disabled=false;
    btn.textContent='Abrir última consulta salva';

    if(historyBtn){
      const historyCount=Math.max(0,rows.length-1);
      historyBtn.classList.toggle('hidden',historyCount===0);
      historyBtn.disabled=historyCount===0;
      historyBtn.textContent=historyCount
        ?'Histórico de relatórios ('+historyCount+(rows.length>=30?'+':'')+')'
        :'Sem histórico anterior';
    }

    if(meta){
      const stamp=latest.generated_at||latest.updated_at;
      meta.innerHTML='<span><b>Última consulta salva:</b> '+
        esc(zielAccountMoneyReportPeriodLabel(latest))+' · '+
        Number(latest.rows_total||0)+' movimento'+(Number(latest.rows_total||0)===1?'':'s')+
        ' · consultada em '+esc(zielAccountMoneyCacheStamp(stamp))+'</span>';
    }
  }catch(error){
    if(seq!==zielAccountMoneyCacheSeq)return;
    btn.disabled=true;
    btn.textContent='Consulta salva indisponível';
    if(historyBtn){historyBtn.classList.add('hidden');historyBtn.disabled=true;}
    if(meta)meta.innerHTML='<span class="r">Não foi possível carregar os relatórios salvos.</span>';
  }
}

async function zielAccountMoneyOpenSavedById(reportId,latest=false){
  const full=await zielAccountMoneyLoadCachedPayload(reportId);
  const wallet=(state.wallets||[]).find(w=>w.id===full.wallet_id);
  if(!wallet)throw new Error('Carteira do relatório não encontrada.');

  const payload={
    ...full.report_payload,
    ok:true,
    pending:false,
    provider:'mercado_pago',
    date_from:full.date_from,
    date_to:full.date_to,
    file_name:full.file_name||full.report_payload?.file_name||null,
    rows_total:Number(full.rows_total||full.report_payload?.rows_total||0),
    rows_truncated:full.rows_truncated===true,
    totals:full.totals||full.report_payload?.totals||{},
    _ziel_cached:true,
    _ziel_cached_at:full.generated_at||full.updated_at,
    _ziel_saved_latest:latest===true
  };

  zielAccountMoneyApplyCachedPeriod(full);
  zielAccountMoneyRenderReport(payload,wallet);

  const report=document.querySelector('.zam-report');
  if(report){
    const note=document.createElement('div');
    note.className='zam-cache-banner '+(latest?'is-latest':'is-history');
    note.innerHTML=latest
      ?'<strong>Última consulta salva</strong><span>Consulta realizada em '+
        esc(zielAccountMoneyCacheStamp(full.generated_at||full.updated_at))+
        '. Nenhuma nova consulta foi enviada ao Mercado Pago. Este relatório salvo é somente leitura.</span>'
      :'<strong>Relatório do histórico</strong><span>Consulta realizada em '+
        esc(zielAccountMoneyCacheStamp(full.generated_at||full.updated_at))+
        '. Nenhuma nova consulta foi enviada ao Mercado Pago. Este relatório é somente histórico.</span>';
    const head=report.querySelector('.zam-report-head');
    if(head)head.insertAdjacentElement('afterend',note);
    else report.prepend(note);
  }

  document.querySelectorAll('#modalWrap [data-zam-classify]').forEach(btn=>{
    btn.disabled=true;
    btn.textContent='Somente leitura';
    btn.removeAttribute('data-zam-classify');
  });
  document.querySelectorAll('#modalWrap .zam-receipt-flow').forEach(el=>{
    el.textContent=latest?'Consulta salva':'Relatório histórico';
  });
  const foot=document.querySelector('#modalWrap .zam-report p.mini');
  if(foot){
    foot.innerHTML='<b>'+(latest?'Última consulta salva:':'Relatório histórico:')+
      '</b> este conteúdo não gera novos lançamentos. Para lançar movimentos, feche esta tela e faça uma <b>nova consulta</b> à API.';
  }
}

zielAccountMoneyOpenCached=async function(){
  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira Mercado Pago.','error');

  const btn=$('zinAccountMoneyCachedButton');
  const original=btn?.textContent||'Abrir última consulta salva';
  if(btn){btn.disabled=true;btn.textContent='Abrindo última consulta…';}

  try{
    let latest=zielAccountMoneyLatestCache;
    if(!latest||latest.wallet_id!==walletId){
      const rows=await zielAccountMoneyLoadSavedReports(walletId,1);
      latest=rows[0]||null;
    }
    if(!latest)return toast('Ainda não há consulta salva para esta carteira.','error');

    await zielAccountMoneyOpenSavedById(latest.id,true);
    toast('Última consulta salva aberta. Para lançar, faça uma nova consulta.');
  }catch(error){
    toast('Não foi possível abrir a consulta salva: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    if(btn&&document.body.contains(btn)){
      btn.disabled=false;
      btn.textContent=original;
    }
  }
};

async function zielAccountMoneyOpenHistory(){
  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira Mercado Pago.','error');

  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  try{
    const rows=await zielAccountMoneyLoadSavedReports(walletId,50);
    if(rows.length<=1)return toast('Ainda não há relatórios anteriores no histórico.','error');

    const latestId=rows[0]?.id||'';
    const historical=rows.slice(1);

    modal('Histórico de consultas — Mercado Pago',`
      <div class="zam-history">
        <div class="zam-history-head">
          <div><strong>${esc(wallet.name)}</strong><span>${esc(businessName(wallet.business_id))}</span></div>
          <span>${historical.length} relatório${historical.length===1?'':'s'} anterior${historical.length===1?'':'es'}</span>
        </div>

        <div class="zam-history-current">
          <span>ÚLTIMA CONSULTA SALVA</span>
          <strong>${esc(zielAccountMoneyReportPeriodLabel(rows[0]))}</strong>
          <small>${Number(rows[0].rows_total||0)} movimentos · ${esc(zielAccountMoneyCacheStamp(rows[0].generated_at||rows[0].updated_at))}</small>
        </div>

        <div class="zam-history-list">
          ${historical.map((r,i)=>`<button type="button" class="zam-history-row" data-zam-history-id="${esc(r.id)}">
            <div>
              <span>Histórico #${i+1}</span>
              <strong>${esc(zielAccountMoneyReportPeriodLabel(r))}</strong>
              <small>${esc(zielAccountMoneyCacheStamp(r.generated_at||r.updated_at))}</small>
            </div>
            <div>
              <strong>${Number(r.rows_total||0)}</strong>
              <small>movimento${Number(r.rows_total||0)===1?'':'s'}</small>
            </div>
          </button>`).join('')}
        </div>

        <p class="mini">Os relatórios do histórico são somente leitura. Para gerar lançamentos, faça uma nova consulta na API.</p>
      </div>
    `);

    document.querySelectorAll('[data-zam-history-id]').forEach(btn=>{
      btn.onclick=async()=>{
        const id=btn.dataset.zamHistoryId;
        try{
          await zielAccountMoneyOpenSavedById(id,false);
        }catch(error){
          toast('Não foi possível abrir o relatório: '+(error?.message||'erro desconhecido'),'error');
        }
      };
    });
  }catch(error){
    toast('Não foi possível carregar o histórico: '+(error?.message||'erro desconhecido'),'error');
  }
}

const _zielSavedReportsPreviousInstall=zielAccountMoneyInstall;
zielAccountMoneyInstall=function(){
  _zielSavedReportsPreviousInstall();

  const action=document.querySelector('.zin-query-controls .zin-query-action');
  if(!action)return;

  let historyBtn=$('zinAccountMoneyHistoryButton');
  if(!historyBtn){
    historyBtn=document.createElement('button');
    historyBtn.type='button';
    historyBtn.className='btn btn-soft hidden';
    historyBtn.id='zinAccountMoneyHistoryButton';
    historyBtn.textContent='Histórico de relatórios';
    action.appendChild(historyBtn);
  }
  historyBtn.onclick=zielAccountMoneyOpenHistory;

  const cached=$('zinAccountMoneyCachedButton');
  if(cached){
    cached.textContent='Abrir última consulta salva';
    cached.onclick=zielAccountMoneyOpenCached;
  }

  zielAccountMoneyPaintCacheButton();
};

const _zielSavedReportsPreviousRender=zielAccountMoneyRenderReport;
zielAccountMoneyRenderReport=function(data,wallet){
  _zielSavedReportsPreviousRender(data,wallet);

  if(!data?._ziel_cached){
    const fresh=document.querySelector('#modalWrap .zam-fresh-banner');
    if(fresh){
      const stamp=data?.queried_at
        ?new Date(data.queried_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'})
        :new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'});
      fresh.innerHTML='<strong>Consulta nova na API</strong><span>Este relatório foi obtido agora do Mercado Pago em '+
        esc(stamp)+
        ' e foi salvo como sua <b>última consulta</b>. O relatório anterior foi mantido no histórico.</span>';
    }
    setTimeout(()=>zielAccountMoneyPaintCacheButton(),0);
  }
};
