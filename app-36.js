// Fluxo unificado: consultar + lançar.
// Também deixa o Account Money Report silencioso enquanto o Mercado Pago processa;
// a tela de movimentos só abre quando o relatório estiver concluído.

const zielAccountMoneySilentActive={};
const zielAccountMoneySilentFailures={};

function zielEntriesApplyUnifiedLabels(){
  const navBtn=document.querySelector('.sidebar .nav [data-page="entradas-importadas"]');
  if(navBtn)navBtn.textContent='⇩ Consultar e lançar';

  const active=document.querySelector('.sidebar .nav button.active')?.dataset.page;
  if(active!=='entradas-importadas')return;

  const title=document.querySelector('#content .title-row h1');
  const subtitle=document.querySelector('#content .title-row p');
  if(title)title.textContent='Consultar e lançar';
  if(subtitle)subtitle.textContent='Escolha um dia ou período. Cada consulta busca dados novos na API; o último relatório fica salvo apenas como histórico. Lance no financeiro sem duplicidade.';

  const head=document.querySelector('#content .zin-query-head strong');
  const headText=document.querySelector('#content .zin-query-head p');
  if(head)head.textContent='Consultar e lançar movimentos';
  if(headText)headText.textContent='Escolha a carteira e o dia ou período. Quando a consulta terminar, o ZIEL exibirá os movimentos disponíveis para seleção e lançamento.';

  const queryBtn=$('zinQueryButton');
  if(queryBtn&&!zielIncomingQueryInFlight)queryBtn.textContent='Consultar e lançar entradas';

  const accountBtn=$('zinAccountMoneyButton');
  if(accountBtn&&!accountBtn.disabled)accountBtn.textContent='Movimentações e lançamentos · nova consulta';
}

const _zielUnifiedPreviousRenderShell=renderShell;
renderShell=function(){
  _zielUnifiedPreviousRenderShell();
  zielEntriesApplyUnifiedLabels();
};

const _zielUnifiedPreviousRenderIncoming=renderIncomingEntries;
renderIncomingEntries=async function(seq=zielIncomingRenderSeq){
  await _zielUnifiedPreviousRenderIncoming(seq);
  if(seq!==zielIncomingRenderSeq)return;
  zielEntriesApplyUnifiedLabels();
};

const _zielUnifiedPreviousRunIncoming=zielRunIncomingQuery;
zielRunIncomingQuery=async function(){
  await _zielUnifiedPreviousRunIncoming();
  zielEntriesApplyUnifiedLabels();
};

const _zielUnifiedPreviousAccountMoneyPaint=zielAccountMoneyPaintButton;
zielAccountMoneyPaintButton=function(){
  _zielUnifiedPreviousAccountMoneyPaint();

  const btn=$('zinAccountMoneyButton');
  const walletId=$('zinQueryWallet')?.value||'';
  if(!btn||!walletId)return;

  let key='';
  try{
    const dates=zielIncomingQueryDates();
    if(dates?.from&&dates?.to)key=zielAccountMoneyTaskKey(walletId,dates.from,dates.to);
  }catch(_){}

  if(key&&zielAccountMoneySilentActive[key]){
    btn.classList.remove('hidden');
    btn.disabled=true;
    btn.textContent='Preparando movimentações…';
    return;
  }

  if(!btn.classList.contains('hidden')){
    btn.textContent='Movimentações e lançamentos · nova consulta';
  }
};

function zielAccountMoneySilentSchedule(key,wallet){
  if(zielAccountMoneyPollTimer){
    clearTimeout(zielAccountMoneyPollTimer);
    zielAccountMoneyPollTimer=null;
  }

  zielAccountMoneyPollTimer=setTimeout(async()=>{
    zielAccountMoneyPollTimer=null;

    const selector=$('zinQueryWallet');
    if(!selector||selector.value!==wallet.id){
      delete zielAccountMoneySilentActive[key];
      delete zielAccountMoneySilentFailures[key];
      return;
    }

    try{
      await zielRunAccountMoneyReport();

      // Se o retorno não foi "pending", o render final remove a chave.
      // Se houve falha transitória, tenta novamente sem abrir tela intermediária.
      if(zielAccountMoneySilentActive[key]&&!zielAccountMoneyPollTimer){
        const failures=(zielAccountMoneySilentFailures[key]||0)+1;
        zielAccountMoneySilentFailures[key]=failures;
        if(failures<=3){
          zielAccountMoneySilentSchedule(key,wallet);
        }else{
          delete zielAccountMoneySilentActive[key];
          delete zielAccountMoneySilentFailures[key];
          zielAccountMoneyPaintButton();
          toast('O Mercado Pago ainda não concluiu o relatório. Tente novamente em alguns instantes.','error');
        }
      }
    }catch(_){
      const failures=(zielAccountMoneySilentFailures[key]||0)+1;
      zielAccountMoneySilentFailures[key]=failures;
      if(failures<=3)zielAccountMoneySilentSchedule(key,wallet);
      else{
        delete zielAccountMoneySilentActive[key];
        delete zielAccountMoneySilentFailures[key];
        zielAccountMoneyPaintButton();
      }
    }
  },3500);
}

zielAccountMoneyPending=function(data,wallet,from,to){
  const key=zielAccountMoneyTaskKey(wallet.id,from,to);

  if(data.task_id)zielAccountMoneyTasks[key]=String(data.task_id);

  const attempt=(zielAccountMoneyPollAttempts[key]||0)+1;
  zielAccountMoneyPollAttempts[key]=attempt;
  zielAccountMoneySilentActive[key]=true;

  // Nenhum modal de "processando" é exibido.
  // Apenas a primeira resposta pendente informa que a consulta continua.
  if(attempt===1){
    toast('Consulta iniciada. O ZIEL exibirá as movimentações quando o Mercado Pago concluir o relatório.');
  }

  zielAccountMoneyPaintButton();

  if(attempt>60){
    delete zielAccountMoneySilentActive[key];
    delete zielAccountMoneySilentFailures[key];
    delete zielAccountMoneyPollAttempts[key];
    zielAccountMoneyPaintButton();
    toast('O relatório está demorando mais que o esperado. Tente novamente depois.','error');
    return;
  }

  zielAccountMoneySilentSchedule(key,wallet);
};

const _zielUnifiedPreviousAccountMoneyRender=zielAccountMoneyRenderReport;
zielAccountMoneyRenderReport=function(data,wallet){
  const from=String(data?.date_from||'');
  const to=String(data?.date_to||'');
  if(wallet?.id&&from&&to){
    const key=zielAccountMoneyTaskKey(wallet.id,from,to);
    delete zielAccountMoneySilentActive[key];
    delete zielAccountMoneySilentFailures[key];
    delete zielAccountMoneyPollAttempts[key];
    delete zielAccountMoneyTasks[key];
  }

  if(zielAccountMoneyPollTimer){
    clearTimeout(zielAccountMoneyPollTimer);
    zielAccountMoneyPollTimer=null;
  }

  _zielUnifiedPreviousAccountMoneyRender(data,wallet);

  const modalTitle=document.querySelector('#modalWrap .modal-head h3');
  if(modalTitle)modalTitle.textContent='Movimentações e lançamentos — Mercado Pago';

  if(!data?._ziel_cached){
    const report=document.querySelector('#modalWrap .zam-report');
    if(report&&!report.querySelector('.zam-fresh-banner')){
      const stamp=data?.queried_at
        ?new Date(data.queried_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'})
        :new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'});
      const banner=document.createElement('div');
      banner.className='zam-fresh-banner';
      banner.innerHTML='<strong>Consulta nova na API</strong><span>Este relatório foi obtido agora do Mercado Pago em '+esc(stamp)+'. O relatório anterior continua salvo apenas como histórico.</span>';
      const head=report.querySelector('.zam-report-head');
      if(head)head.insertAdjacentElement('afterend',banner);
      else report.prepend(banner);
    }
  }

  document.querySelectorAll('.zam-receipt-flow').forEach(el=>{
    if(el.textContent.includes('Consultar entradas'))el.textContent='Use “Consultar e lançar”';
  });

  document.querySelectorAll('.zam-note span,.zam-report p.mini').forEach(el=>{
    if(el.innerHTML.includes('Consultar entradas')){
      el.innerHTML=el.innerHTML.replaceAll('Consultar entradas','Consultar e lançar');
    }
  });

  zielEntriesApplyUnifiedLabels();
};

const _zielUnifiedPreviousAccountMoneyInstall=zielAccountMoneyInstall;
zielAccountMoneyInstall=function(){
  _zielUnifiedPreviousAccountMoneyInstall();
  zielEntriesApplyUnifiedLabels();
};
