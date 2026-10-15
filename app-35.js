// Cache do último Account Money Report por carteira.
// Permite reabrir o último relatório salvo sem consultar o Mercado Pago novamente.

let zielAccountMoneyCacheSeq=0;
let zielAccountMoneyLatestCache=null;

function zielAccountMoneyCacheStamp(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{
    timeZone:'America/Fortaleza',
    dateStyle:'short',
    timeStyle:'short'
  });
}

async function zielAccountMoneyLoadLatestCache(walletId){
  if(!walletId)return null;
  const {data,error}=await supabase
    .from('integration_account_money_reports')
    .select('id,wallet_id,provider,date_from,date_to,file_name,rows_total,rows_truncated,totals,generated_at,updated_at')
    .eq('wallet_id',walletId)
    .eq('provider','mercado_pago')
    .order('updated_at',{ascending:false})
    .limit(1);
  if(error)throw error;
  return Array.isArray(data)&&data.length?data[0]:null;
}

async function zielAccountMoneyLoadCachedPayload(cacheId){
  const {data,error}=await supabase
    .from('integration_account_money_reports')
    .select('id,wallet_id,provider,date_from,date_to,file_name,rows_total,rows_truncated,totals,generated_at,updated_at,report_payload')
    .eq('id',cacheId)
    .limit(1);
  if(error)throw error;
  const row=Array.isArray(data)&&data.length?data[0]:null;
  if(!row)throw new Error('Relatório salvo não encontrado.');
  if(!row.report_payload||typeof row.report_payload!=='object'){
    throw new Error('O relatório salvo não possui dados reutilizáveis.');
  }
  return row;
}

function zielAccountMoneyApplyCachedPeriod(cache){
  if(!cache)return;
  const from=String(cache.date_from||'');
  const to=String(cache.date_to||'');
  if(!from||!to)return;

  if($('zinQueryMode')){
    $('zinQueryMode').value=from===to?'day':'period';
    if(typeof zielIncomingPaintDateMode==='function')zielIncomingPaintDateMode();
  }
  if(from===to&&$('zinQueryDay'))$('zinQueryDay').value=from;
  if($('zinQueryFrom'))$('zinQueryFrom').value=from;
  if($('zinQueryTo'))$('zinQueryTo').value=to;
}

async function zielAccountMoneyPaintCacheButton(){
  const btn=$('zinAccountMoneyCachedButton');
  const meta=$('zinAccountMoneyCacheMeta');
  const walletId=$('zinQueryWallet')?.value||'';
  const provider=walletId?zielAccountMoneyProviderForWallet(walletId):'';
  const seq=++zielAccountMoneyCacheSeq;

  zielAccountMoneyLatestCache=null;

  if(!btn)return;
  if(!walletId||provider!=='mercado_pago'){
    btn.classList.add('hidden');
    btn.disabled=true;
    if(meta)meta.innerHTML='';
    return;
  }

  btn.classList.remove('hidden');
  btn.disabled=true;
  btn.textContent='Verificando último relatório…';
  if(meta)meta.innerHTML='<span>Buscando relatório salvo no ZIEL…</span>';

  try{
    const cache=await zielAccountMoneyLoadLatestCache(walletId);
    if(seq!==zielAccountMoneyCacheSeq)return;
    zielAccountMoneyLatestCache=cache;

    if(!cache){
      btn.disabled=true;
      btn.textContent='Nenhum relatório salvo';
      if(meta)meta.innerHTML='<span>Depois da primeira consulta de movimentações, o ZIEL guardará o relatório para reutilização.</span>';
      return;
    }

    btn.disabled=false;
    btn.textContent='Ver último relatório salvo (histórico)';
    if(meta){
      const period=cache.date_from===cache.date_to
        ?br(cache.date_from)
        :br(cache.date_from)+' até '+br(cache.date_to);
      meta.innerHTML='<span><b>Último salvo:</b> '+esc(period)+' · '+
        Number(cache.rows_total||0)+' movimento'+(Number(cache.rows_total||0)===1?'':'s')+
        ' · atualizado '+esc(zielAccountMoneyCacheStamp(cache.updated_at))+'</span>';
    }
  }catch(error){
    if(seq!==zielAccountMoneyCacheSeq)return;
    btn.disabled=true;
    btn.textContent='Último relatório indisponível';
    if(meta)meta.innerHTML='<span class="r">Não foi possível verificar o relatório salvo.</span>';
  }
}

async function zielAccountMoneyOpenCached(){
  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira Mercado Pago.','error');

  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  const btn=$('zinAccountMoneyCachedButton');
  const original=btn?.textContent||'Ver último relatório salvo (histórico)';
  if(btn){
    btn.disabled=true;
    btn.textContent='Abrindo histórico salvo…';
  }

  try{
    let cache=zielAccountMoneyLatestCache;
    if(!cache||cache.wallet_id!==walletId){
      cache=await zielAccountMoneyLoadLatestCache(walletId);
    }
    if(!cache)return toast('Ainda não há relatório salvo para esta carteira.','error');

    const full=await zielAccountMoneyLoadCachedPayload(cache.id);
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
      _ziel_cached_at:full.updated_at
    };

    zielAccountMoneyApplyCachedPeriod(full);
    zielAccountMoneyRenderReport(payload,wallet);

    const report=document.querySelector('.zam-report');
    if(report){
      const note=document.createElement('div');
      note.className='zam-cache-banner';
      note.innerHTML='<strong>Relatório reaproveitado do ZIEL</strong><span>Aberto do cache salvo em '+
        esc(zielAccountMoneyCacheStamp(full.updated_at))+
        '. Nenhuma nova consulta foi enviada ao Mercado Pago. Este relatório é somente histórico.</span>';
      const head=report.querySelector('.zam-report-head');
      if(head)head.insertAdjacentElement('afterend',note);
      else report.prepend(note);
    }

    document.querySelectorAll('#modalWrap [data-zam-classify]').forEach(btn=>{
      btn.disabled=true;
      btn.textContent='Somente histórico';
      btn.removeAttribute('data-zam-classify');
    });
    document.querySelectorAll('#modalWrap .zam-receipt-flow').forEach(el=>{
      el.textContent='Relatório histórico';
    });
    const foot=document.querySelector('#modalWrap .zam-report p.mini');
    if(foot){
      foot.innerHTML='<b>Relatório histórico:</b> este conteúdo foi salvo anteriormente e não pode gerar novos lançamentos. Para lançar movimentos, feche esta tela e use <b>Movimentações e lançamentos</b>, que sempre consulta a API novamente.';
    }
    toast('Histórico aberto. Para lançar, faça uma nova consulta à API.');
  }catch(error){
    toast('Não foi possível abrir o relatório salvo: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    if(btn&&document.body.contains(btn)){
      btn.disabled=false;
      btn.textContent=original;
    }
  }
}

const _zielAccountMoneyCachePreviousInstall=zielAccountMoneyInstall;
zielAccountMoneyInstall=function(){
  _zielAccountMoneyCachePreviousInstall();

  const action=document.querySelector('.zin-query-controls .zin-query-action');
  if(!action)return;

  if(!$('zinAccountMoneyCachedButton')){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn btn-soft hidden';
    btn.id='zinAccountMoneyCachedButton';
    btn.textContent='Ver último relatório salvo (histórico)';
    btn.onclick=zielAccountMoneyOpenCached;
    action.appendChild(btn);
  }

  let meta=$('zinAccountMoneyCacheMeta');
  if(!meta){
    meta=document.createElement('div');
    meta.id='zinAccountMoneyCacheMeta';
    meta.className='zam-cache-meta';
    action.insertAdjacentElement('afterend',meta);
  }

  const wallet=$('zinQueryWallet');
  if(wallet&&!wallet.dataset.zielCacheListener){
    wallet.dataset.zielCacheListener='1';
    wallet.addEventListener('change',()=>setTimeout(zielAccountMoneyPaintCacheButton,0));
  }

  zielAccountMoneyPaintCacheButton();
};

const _zielAccountMoneyCachePreviousRun=zielRunAccountMoneyReport;
zielRunAccountMoneyReport=async function(){
  await _zielAccountMoneyCachePreviousRun();
  setTimeout(()=>zielAccountMoneyPaintCacheButton(),0);
};
