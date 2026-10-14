// Reforço do fluxo manual de entradas.
// Mantém consulta existente e torna o lançamento das pendentes sempre visível.

function zielIncomingPeriodEligible(){
  if(!zielIncomingLastQuery)return [];
  return (zielIncomingRows||[]).filter(function(row){
    if(row.wallet_id!==zielIncomingLastQuery.wallet_id)return false;
    if(zielIncomingLastQuery.provider&&row.provider!==zielIncomingLastQuery.provider)return false;
    if(row.movement_kind==='transfer')return false;
    var key=zielIncomingDateKey(row.approved_at||row.occurred_at||row.imported_at);
    if(!key||key<zielIncomingLastQuery.date_from||key>zielIncomingLastQuery.date_to)return false;
    return zielIncomingSelectable(row);
  });
}

function zielIncomingInstallQuickLaunch(){
  var host=$('zinQueryResult');
  if(!host||!zielIncomingLastQuery)return;

  var old=$('zinQuickLaunch');
  if(old)old.remove();

  var eligible=zielIncomingPeriodEligible();
  var box=document.createElement('div');
  box.id='zinQuickLaunch';
  box.className='zin-quick-launch';

  if(eligible.length){
    var total=eligible.reduce(function(sum,row){
      return sum+Number(row.gross_amount!=null?row.gross_amount:(row.amount||0));
    },0);

    box.innerHTML=
      '<div>'+
        '<strong>'+eligible.length+' entrada'+(eligible.length===1?'':'s')+' pendente'+(eligible.length===1?'':'s')+' e liberada'+(eligible.length===1?'':'s')+'</strong>'+
        '<span>Total bruto: '+fmt(total)+'</span>'+
      '</div>'+
      '<button type="button" class="btn btn-primary" id="zinQuickLaunchButton">Selecionar e lançar</button>';

    host.appendChild(box);

    $('zinQuickLaunchButton').onclick=function(){
      zielIncomingSelected.clear();
      eligible.forEach(function(row){zielIncomingSelected.add(row.id);});
      zielPaintIncoming();
      zielIncomingOpenBatchConfirm();
    };
  }else{
    box.innerHTML=
      '<div>'+
        '<strong>Nenhuma entrada pendente liberada para lançamento.</strong>'+
        '<span>Entradas já confirmadas não são lançadas novamente.</span>'+
      '</div>';
    host.appendChild(box);
  }
}

var _zielStablePaintQueryResult=zielPaintQueryResult;
zielPaintQueryResult=function(){
  _zielStablePaintQueryResult();
  zielIncomingInstallQuickLaunch();
};

var _zielStablePaintIncoming=zielPaintIncoming;
zielPaintIncoming=function(){
  _zielStablePaintIncoming();
  zielIncomingInstallBatchBar();
  zielIncomingBindSelection();
  zielIncomingPaintBatchBar();
  zielIncomingInstallQuickLaunch();
};

var _zielStableRunIncomingQuery=zielRunIncomingQuery;
zielRunIncomingQuery=async function(){
  await _zielStableRunIncomingQuery();
  if(zielIncomingLastQuery){
    // Recarrega a lista uma vez depois da consulta para garantir que a tela
    // reflita os registros gravados pelo backend.
    try{
      await zielLoadIncomingEntries();
      zielPaintQueryResult();
      zielPaintIncoming();
      var result=$('zinQueryResult');
      if(result&&typeof result.scrollIntoView==='function'){
        result.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
    }catch(error){
      toast('A consulta foi concluída, mas a tela não conseguiu atualizar: '+(error&&error.message?error.message:'erro desconhecido'),'error');
    }
  }
};
