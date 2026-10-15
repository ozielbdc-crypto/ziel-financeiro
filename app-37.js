// Garante que "Movimentações e lançamentos · nova consulta" sempre inicia
// uma nova tarefa na API. O polling interno continua reutilizando somente a
// tarefa recém-criada até ela ser concluída.

async function zielRunFreshAccountMoneyReport(){
  const walletId=$('zinQueryWallet')?.value||'';
  if(!walletId)return toast('Selecione uma carteira Mercado Pago.','error');

  let from='',to='';
  try{
    const dates=zielIncomingQueryDates();
    from=dates?.from||'';
    to=dates?.to||'';
  }catch(_){}

  if(!from||!to)return toast('Informe a data ou período.','error');

  const key=zielAccountMoneyTaskKey(walletId,from,to);

  // Clique manual = consulta nova. Nunca reaproveitar task_id anterior.
  delete zielAccountMoneyTasks[key];
  delete zielAccountMoneyPollAttempts[key];
  delete zielAccountMoneySilentFailures[key];
  delete zielAccountMoneySilentActive[key];

  if(zielAccountMoneyPollTimer){
    clearTimeout(zielAccountMoneyPollTimer);
    zielAccountMoneyPollTimer=null;
  }

  await zielRunAccountMoneyReport();
}

const _zielFreshAccountMoneyPreviousInstall=zielAccountMoneyInstall;
zielAccountMoneyInstall=function(){
  _zielFreshAccountMoneyPreviousInstall();
  const btn=$('zinAccountMoneyButton');
  if(btn){
    btn.onclick=zielRunFreshAccountMoneyReport;
    if(!btn.disabled&&!btn.classList.contains('hidden')){
      btn.textContent='Movimentações e lançamentos · nova consulta';
      btn.title='Buscar agora um relatório novo diretamente na API do Mercado Pago';
    }
  }
};

const _zielFreshAccountMoneyPreviousRender=zielAccountMoneyRenderReport;
zielAccountMoneyRenderReport=function(data,wallet){
  _zielFreshAccountMoneyPreviousRender(data,wallet);

  if(data?._ziel_cached)return;

  const banner=document.querySelector('#modalWrap .zam-fresh-banner');
  if(banner&&data?.source==='mercado_pago_api_fresh'){
    const task=data?.task_id?String(data.task_id):'—';
    banner.innerHTML='<strong>Consulta nova confirmada na API</strong>'+
      '<span>Dados obtidos agora diretamente do Mercado Pago. Tarefa da consulta: <b>'+
      esc(task)+'</b>. Relatórios salvos anteriormente não foram usados como fonte desta tela.</span>';
  }
};
