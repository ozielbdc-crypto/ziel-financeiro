// Seleção em lote para recebimentos consultados.
// Completa o fluxo manual: consultar -> selecionar -> lançar no financeiro,
// reutilizando a RPC confirm_incoming_entries_batch e as travas de duplicidade do banco.

let zielIncomingBatchSelected=new Set();

function zielIncomingBatchEligible(row){
  return !!row &&
    row.movement_kind!=='transfer' &&
    row.decision_status==='Pendente' &&
    row.available_for_balance===true;
}

function zielIncomingBatchVisibleEligible(){
  const ids=[...document.querySelectorAll('[data-zin-batch-id]')]
    .filter(el=>!el.disabled)
    .map(el=>el.dataset.zinBatchId)
    .filter(Boolean);
  return ids;
}

function zielIncomingBatchSelectedRows(){
  return zielIncomingRows.filter(row=>zielIncomingBatchSelected.has(row.id)&&zielIncomingBatchEligible(row));
}

function zielIncomingBatchPaintBar(){
  const count=$('zinBatchCount');
  const total=$('zinBatchTotal');
  const launch=$('zinBatchLaunch');
  const clear=$('zinBatchClear');
  if(!count||!total||!launch||!clear)return;

  // Remove da seleção itens que deixaram de ser elegíveis após uma atualização.
  for(const id of [...zielIncomingBatchSelected]){
    const row=zielIncomingRows.find(r=>r.id===id);
    if(!zielIncomingBatchEligible(row))zielIncomingBatchSelected.delete(id);
  }

  const rows=zielIncomingBatchSelectedRows();
  const gross=rows.reduce((sum,row)=>sum+Number(row.gross_amount??row.amount??0),0);
  const net=rows.reduce((sum,row)=>sum+Number(row.net_amount??row.gross_amount??row.amount??0),0);

  count.textContent=String(rows.length);
  total.textContent=fmt(gross);
  const netNode=$('zinBatchNet');
  if(netNode)netNode.textContent=fmt(net);

  launch.disabled=!rows.length;
  launch.textContent=rows.length
    ?'Lançar '+rows.length+' selecionada'+(rows.length===1?'':'s')
    :'Lançar selecionadas';
  clear.disabled=!rows.length;
}

function zielIncomingBatchBindChecks(){
  document.querySelectorAll('[data-zin-batch-id]').forEach(box=>{
    const id=box.dataset.zinBatchId;
    box.checked=zielIncomingBatchSelected.has(id);
    box.onchange=()=>{
      if(box.checked)zielIncomingBatchSelected.add(id);
      else zielIncomingBatchSelected.delete(id);
      zielIncomingBatchPaintBar();
    };
  });
  zielIncomingBatchPaintBar();
}

const _zielBatchPreviousCard=zielIncomingCard;
zielIncomingCard=function(row){
  let html=_zielBatchPreviousCard(row);
  if(!zielIncomingBatchEligible(row))return html;

  const checked=zielIncomingBatchSelected.has(row.id)?'checked':'';
  const control=`<label class="zin-batch-check" title="Selecionar para lançamento em lote">
    <input type="checkbox" data-zin-batch-id="${esc(row.id)}" ${checked}>
    <span>Selecionar</span>
  </label>`;

  // Insere o seletor no início do cartão sem alterar a estrutura financeira já existente.
  return html.replace(
    '<div class="zin-card-head">',
    control+'<div class="zin-card-head">'
  );
};

function zielIncomingBatchInstallToolbar(){
  const list=$('zinList');
  if(!list)return;

  let bar=$('zinBatchBar');
  if(!bar){
    bar=document.createElement('section');
    bar.id='zinBatchBar';
    bar.className='zin-batch-bar';
    bar.innerHTML=`
      <div class="zin-batch-info">
        <div><span>Selecionadas</span><strong id="zinBatchCount">0</strong></div>
        <div><span>Total bruto</span><strong id="zinBatchTotal">R$ 0,00</strong></div>
        <div><span>Total líquido estimado</span><strong id="zinBatchNet">R$ 0,00</strong></div>
      </div>
      <div class="zin-batch-actions">
        <button type="button" class="btn btn-soft" id="zinBatchSelectVisible">Selecionar pendentes visíveis</button>
        <button type="button" class="btn btn-soft" id="zinBatchClear" disabled>Limpar seleção</button>
        <button type="button" class="btn btn-primary" id="zinBatchLaunch" disabled>Lançar selecionadas</button>
      </div>
      <p class="mini">Somente recebimentos <b>pendentes e já liberados</b> podem ser selecionados. Transferências, entradas ignoradas e valores ainda não liberados não entram no lote.</p>
    `;
    list.insertAdjacentElement('beforebegin',bar);

    $('zinBatchSelectVisible').onclick=()=>{
      const ids=zielIncomingBatchVisibleEligible();
      if(!ids.length)return toast('Não há recebimentos pendentes e liberados visíveis para selecionar.','error');
      ids.forEach(id=>zielIncomingBatchSelected.add(id));
      zielIncomingBatchBindChecks();
    };

    $('zinBatchClear').onclick=()=>{
      zielIncomingBatchSelected.clear();
      zielIncomingBatchBindChecks();
    };

    $('zinBatchLaunch').onclick=zielIncomingBatchOpenConfirm;
  }

  zielIncomingBatchBindChecks();
}

function zielIncomingBatchOpenConfirm(){
  const rows=zielIncomingBatchSelectedRows();
  if(!rows.length)return toast('Selecione pelo menos uma entrada pendente.','error');

  if(rows.length>200){
    return toast('Selecione no máximo 200 entradas por lançamento em lote.','error');
  }

  const gross=rows.reduce((sum,row)=>sum+Number(row.gross_amount??row.amount??0),0);
  const net=rows.reduce((sum,row)=>sum+Number(row.net_amount??row.gross_amount??row.amount??0),0);
  const fees=Math.max(0,Math.round((gross-net)*100)/100);
  const wallets=[...new Set(rows.map(r=>r.wallet_id))];
  const businesses=[...new Set(rows.map(r=>r.business_id))];

  modal('Lançar entradas selecionadas',`
    <form id="zinBatchForm" class="zin-batch-modal">
      <div class="zin-batch-modal-summary">
        <div><small>RECEBIMENTOS</small><strong>${rows.length}</strong></div>
        <div><small>TOTAL BRUTO</small><strong class="g">${fmt(gross)}</strong></div>
        <div><small>TAXAS / DEDUÇÕES</small><strong class="r">${fees>.009?'− '+fmt(fees):fmt(0)}</strong></div>
        <div><small>EFEITO LÍQUIDO</small><strong>${fmt(net)}</strong></div>
      </div>

      <div class="field">
        <label>Categoria para as entradas</label>
        <select id="zinBatchCategory" required>${categoryOptions('Entrada')}</select>
        <div class="mini">A mesma categoria será aplicada às entradas selecionadas. As taxas continuam sendo lançadas separadamente em Impostos/Taxas quando existirem.</div>
      </div>

      <div class="zin-batch-modal-note">
        <strong>Proteção contra duplicidade ativa</strong>
        <span>O banco verifica cada pagamento antes de criar o lançamento. Se algum item já tiver sido confirmado, ele será reconhecido como existente e não será lançado novamente.</span>
      </div>

      <div class="zin-batch-modal-scope">
        <span>${businesses.length} negócio${businesses.length===1?'':'s'}</span>
        <span>${wallets.length} carteira${wallets.length===1?'':'s'}</span>
        <span>${rows.length} ID${rows.length===1?'':'s'} externo${rows.length===1?'':'s'} único${rows.length===1?'':'s'}</span>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-soft" id="zinBatchCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zinBatchConfirm">Confirmar lançamento em lote</button>
      </div>
    </form>
  `);

  $('zinBatchCancel').onclick=closeModal;

  $('zinBatchForm').onsubmit=async e=>{
    e.preventDefault();
    const category=$('zinBatchCategory').value;
    if(!category)return toast('Selecione a categoria.','error');

    const btn=$('zinBatchConfirm');
    btn.disabled=true;
    btn.textContent='Lançando…';

    try{
      const {data,error}=await supabase.rpc('confirm_incoming_entries_batch',{
        p_entry_ids:rows.map(r=>r.id),
        p_category:category
      });
      if(error)throw error;
      if(!data?.ok)throw new Error('O banco não confirmou o lote.');

      zielIncomingBatchSelected.clear();
      closeModal();
      await loadAll();
      await zielLoadIncomingEntries();
      zielPaintIncoming();

      const created=Number(data.created||0);
      const existing=Number(data.already_confirmed||0);
      const skipped=Number(data.skipped||0);

      let message=created+' entrada'+(created===1?' lançada':'s lançadas')+' no financeiro.';
      if(existing)message+=' '+existing+' já '+(existing===1?'estava confirmada.':'estavam confirmadas.');
      if(skipped)message+=' '+skipped+' não '+(skipped===1?'foi processada.':'foram processadas.');
      toast(message,skipped?'error':'ok');
    }catch(error){
      toast('Não foi possível concluir o lote: '+(error?.message||'erro desconhecido'),'error');
      if($('zinBatchConfirm')){
        $('zinBatchConfirm').disabled=false;
        $('zinBatchConfirm').textContent='Confirmar lançamento em lote';
      }
    }
  };
}

const _zielBatchPreviousPaint=zielPaintIncoming;
zielPaintIncoming=function(){
  _zielBatchPreviousPaint();
  zielIncomingBatchInstallToolbar();
};

const _zielBatchPreviousRender=renderIncomingEntries;
renderIncomingEntries=async function(seq=zielIncomingRenderSeq){
  zielIncomingBatchSelected.clear();
  await _zielBatchPreviousRender(seq);
  if(seq!==zielIncomingRenderSeq)return;
  zielIncomingBatchInstallToolbar();
};

const _zielBatchPreviousRun=zielRunIncomingQuery;
zielRunIncomingQuery=async function(){
  zielIncomingBatchSelected.clear();
  await _zielBatchPreviousRun();
  zielIncomingBatchInstallToolbar();
};
