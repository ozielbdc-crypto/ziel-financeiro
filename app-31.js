// Seleção e lançamento em lote das entradas consultadas.
// Confirmação continua manual; o banco mantém as travas de duplicidade.

const zielIncomingSelected=new Set();

function zielIncomingSelectable(row){
  return !!row &&
    row.movement_kind!=='transfer' &&
    row.decision_status==='Pendente' &&
    row.available_for_balance!==false &&
    !row.transaction_id;
}

function zielIncomingRowsInLastQuery(){
  const q=zielIncomingLastQuery;
  if(!q)return [];
  return (zielIncomingRows||[]).filter(function(row){
    if(row.wallet_id!==q.wallet_id)return false;
    if(q.provider&&row.provider!==q.provider)return false;
    if(row.movement_kind==='transfer')return false;
    const key=zielIncomingDateKey(row.approved_at||row.occurred_at);
    return !!key&&key>=q.date_from&&key<=q.date_to;
  });
}

function zielIncomingSelectableInLastQuery(){
  return zielIncomingRowsInLastQuery().filter(zielIncomingSelectable);
}

function zielIncomingPruneSelection(){
  const eligibleIds=new Set((zielIncomingRows||[]).filter(zielIncomingSelectable).map(function(row){return row.id;}));
  Array.from(zielIncomingSelected).forEach(function(id){
    if(!eligibleIds.has(id))zielIncomingSelected.delete(id);
  });
}

function zielIncomingSelectionRows(){
  zielIncomingPruneSelection();
  return (zielIncomingRows||[]).filter(function(row){
    return zielIncomingSelected.has(row.id)&&zielIncomingSelectable(row);
  });
}

function zielIncomingSelectionTotal(){
  return zielIncomingSelectionRows().reduce(function(sum,row){
    return sum+Number(row.gross_amount!=null?row.gross_amount:(row.amount||0));
  },0);
}

function zielIncomingInstallBatchBar(){
  const list=$('zinList');
  if(!list)return;

  let bar=$('zinBatchBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='zinBatchBar';
    bar.className='zin-batch-bar';
    bar.innerHTML=
      '<div class="zin-batch-info">'+
        '<strong id="zinSelectedCount">0 selecionadas</strong>'+
        '<span id="zinSelectedAmount">'+fmt(0)+'</span>'+
      '</div>'+
      '<div class="zin-batch-actions">'+
        '<button type="button" class="btn btn-soft" id="zinSelectAll">Selecionar pendentes do período</button>'+
        '<button type="button" class="btn btn-soft" id="zinClearSelection" disabled>Limpar seleção</button>'+
        '<button type="button" class="btn btn-primary" id="zinLaunchSelected" disabled>Lançar selecionadas</button>'+
      '</div>';
    list.insertAdjacentElement('beforebegin',bar);

    $('zinSelectAll').onclick=function(){
      zielIncomingSelectableInLastQuery().forEach(function(row){zielIncomingSelected.add(row.id);});
      zielPaintIncoming();
    };

    $('zinClearSelection').onclick=function(){
      zielIncomingSelected.clear();
      zielPaintIncoming();
    };

    $('zinLaunchSelected').onclick=zielIncomingOpenBatchConfirm;
  }

  zielIncomingPaintBatchBar();
}

function zielIncomingPaintBatchBar(){
  const bar=$('zinBatchBar');
  if(!bar)return;

  const eligible=zielIncomingSelectableInLastQuery();
  const selected=zielIncomingSelectionRows();
  const count=selected.length;
  const total=zielIncomingSelectionTotal();

  if($('zinSelectedCount'))$('zinSelectedCount').textContent=count+' selecionada'+(count===1?'':'s');
  if($('zinSelectedAmount'))$('zinSelectedAmount').textContent=fmt(total);
  if($('zinClearSelection'))$('zinClearSelection').disabled=!count;
  if($('zinLaunchSelected'))$('zinLaunchSelected').disabled=!count;

  if($('zinSelectAll')){
    $('zinSelectAll').disabled=!eligible.length;
    $('zinSelectAll').textContent=eligible.length
      ?'Selecionar '+eligible.length+' pendente'+(eligible.length===1?'':'s')+' do período'
      :'Nenhuma pendente liberada';
  }
}

const _zielBatchPreviousIncomingCard=zielIncomingCard;
zielIncomingCard=function(row){
  let html=_zielBatchPreviousIncomingCard(row);
  if(!zielIncomingSelectable(row))return html;

  const checked=zielIncomingSelected.has(row.id)?' checked':'';
  const selector=
    '<label class="zin-select-entry">'+
      '<input type="checkbox" data-zin-select="'+esc(row.id)+'"'+checked+'>'+
      '<span>Selecionar para lançamento</span>'+
    '</label>';

  if(html.includes('<div class="zin-card-head">')){
    html=html.replace('<div class="zin-card-head">',selector+'<div class="zin-card-head">');
  }
  return html;
};

function zielIncomingBindSelection(){
  document.querySelectorAll('[data-zin-select]').forEach(function(input){
    input.onchange=function(){
      const id=input.dataset.zinSelect;
      if(input.checked)zielIncomingSelected.add(id);
      else zielIncomingSelected.delete(id);
      zielIncomingPaintBatchBar();
    };
  });
}

const _zielBatchPreviousPaintIncoming=zielPaintIncoming;
zielPaintIncoming=function(){
  _zielBatchPreviousPaintIncoming();
  zielIncomingInstallBatchBar();
  zielIncomingBindSelection();
  zielIncomingPaintBatchBar();
};

async function zielIncomingOpenBatchConfirm(){
  const rows=zielIncomingSelectionRows();
  if(!rows.length)return toast('Selecione pelo menos uma entrada pendente.','error');
  if(rows.length>200)return toast('Selecione no máximo 200 entradas por vez.','error');

  const walletIds=Array.from(new Set(rows.map(function(row){return row.wallet_id;})));
  if(walletIds.length!==1)return toast('Selecione entradas de uma única carteira por vez.','error');

  const wallet=state.wallets.find(function(w){return w.id===walletIds[0];});
  const total=rows.reduce(function(sum,row){return sum+Number(row.gross_amount!=null?row.gross_amount:(row.amount||0));},0);
  const totalFees=rows.reduce(function(sum,row){return sum+Number(row.fee_amount||0);},0);
  const totalNet=rows.reduce(function(sum,row){return sum+Number(row.net_amount!=null?row.net_amount:(row.gross_amount!=null?row.gross_amount:(row.amount||0)));},0);

  const preview=rows.slice(0,12).map(function(row){
    return '<div>'+
      '<span>'+esc(zielIncomingWhen(row.approved_at||row.occurred_at))+'</span>'+
      '<strong>'+fmt(Number(row.gross_amount!=null?row.gross_amount:(row.amount||0)))+'</strong>'+
      '<small>'+esc(row.description||('Entrada '+zielIncomingProviderLabel(row.provider)))+'</small>'+
    '</div>';
  }).join('');

  const more=rows.length>12?'<p class="mini">+ '+(rows.length-12)+' entrada(s) selecionada(s).</p>':'';
  const periodFrom=zielIncomingLastQuery?zielIncomingLastQuery.date_from:'';
  const periodTo=zielIncomingLastQuery?zielIncomingLastQuery.date_to:'';
  const periodLabel=br(periodFrom)+(periodFrom!==periodTo?' até '+br(periodTo):'');

  modal('Lançar entradas selecionadas',
    '<form id="zinBatchForm" class="zin-batch-confirm">'+
      '<div class="zin-batch-summary">'+
        '<div><small>ENTRADAS SELECIONADAS</small><strong>'+rows.length+'</strong></div>'+
        '<div><small>VALOR BRUTO</small><strong class="g">'+fmt(total)+'</strong></div>'+
        '<div><small>TAXAS / DEDUÇÕES</small><strong class="'+(totalFees>.009?'r':'')+'">'+fmt(totalFees)+'</strong></div>'+
        '<div><small>LÍQUIDO NA CARTEIRA</small><strong>'+fmt(totalNet)+'</strong></div>'+
      '</div>'+
      '<div class="zin-confirm-summary">'+
        '<div><small>CARTEIRA</small><strong>'+esc(wallet?wallet.name:'Carteira')+'</strong><span>'+esc(businessName(wallet?wallet.business_id:''))+'</span></div>'+
        '<div><small>PERÍODO</small><strong>'+esc(periodLabel)+'</strong></div>'+
      '</div>'+
      '<div class="field">'+
        '<label>Categoria das entradas</label>'+
        '<select id="zinBatchCategory" required>'+categoryOptions('Entrada')+'</select>'+
        '<div class="mini">A categoria será aplicada às entradas selecionadas. A descrição e o ID da instituição serão preservados em cada lançamento.</div>'+
      '</div>'+
      '<div class="zin-duplicate-note">'+
        '<strong>Sem duplicidade</strong>'+
        '<span>Entradas já confirmadas são ignoradas. O banco também impede que o mesmo ID externo gere outro lançamento.</span>'+
      '</div>'+
      '<div class="zin-batch-preview">'+preview+more+'</div>'+
      '<div class="actions">'+
        '<button type="button" class="btn btn-soft" id="zinBatchCancel">Cancelar</button>'+
        '<button type="submit" class="btn btn-primary" id="zinBatchConfirmButton">Lançar '+rows.length+' entrada'+(rows.length===1?'':'s')+'</button>'+
      '</div>'+
    '</form>'
  );

  const category=$('zinBatchCategory');
  if(category&&Array.from(category.options).some(function(o){return o.value==='Vendas';}))category.value='Vendas';

  $('zinBatchCancel').onclick=closeModal;

  $('zinBatchForm').onsubmit=async function(e){
    e.preventDefault();
    const selectedCategory=$('zinBatchCategory').value;
    if(!selectedCategory)return toast('Selecione a categoria.','error');

    const btn=$('zinBatchConfirmButton');
    btn.disabled=true;
    btn.textContent='Lançando…';

    try{
      const result=await supabase.rpc('confirm_incoming_entries_batch',{
        p_entry_ids:rows.map(function(row){return row.id;}),
        p_category:selectedCategory
      });
      if(result.error)throw result.error;
      const data=result.data;
      if(!data||!data.ok)throw new Error(data&&data.error?data.error:'O lote não foi concluído.');

      const created=Number(data.created||0);
      const existing=Number(data.already_confirmed||0);
      const skipped=Number(data.skipped||0);

      closeModal();
      zielIncomingSelected.clear();
      await loadAll();
      await zielLoadIncomingEntries();
      zielPaintIncoming();

      let message=created+' entrada'+(created===1?'':'s')+' lançada'+(created===1?'':'s')+' em Lançamentos.';
      if(existing)message+=' '+existing+' já estava'+(existing===1?'':'m')+' confirmada'+(existing===1?'':'s')+'.';
      if(skipped)message+=' '+skipped+' não foi'+(skipped===1?'':'ram')+' lançada'+(skipped===1?'':'s')+'.';
      toast(message,skipped?'error':'ok');
    }catch(error){
      toast('Não foi possível lançar o lote: '+(error&&error.message?error.message:'erro desconhecido'),'error');
      if($('zinBatchConfirmButton')){
        $('zinBatchConfirmButton').disabled=false;
        $('zinBatchConfirmButton').textContent='Lançar '+rows.length+' entrada'+(rows.length===1?'':'s');
      }
    }
  };
}

const _zielBatchPreviousRunIncomingQuery=zielRunIncomingQuery;
zielRunIncomingQuery=async function(){
  zielIncomingSelected.clear();
  await _zielBatchPreviousRunIncomingQuery();
  zielIncomingPaintBatchBar();
};

const _zielBatchPreviousRenderIncomingEntries=renderIncomingEntries;
renderIncomingEntries=async function(seq){
  zielIncomingSelected.clear();
  await _zielBatchPreviousRenderIncomingEntries(seq);
  if(seq!==zielIncomingRenderSeq)return;
  zielIncomingInstallBatchBar();
  zielIncomingPaintBatchBar();
};
