// Classificação de movimentações específicas do Account Money Report.
// Tarifa, retirada, transferência, estorno e outras movimentações podem ser
// selecionadas individualmente e classificadas antes de virarem lançamento.

function zielAccountMoneyCanClassify(row){
  if(!row)return false;
  const kind=String(row.kind||'').toLowerCase();
  const type=String(row.transaction_type||'').trim().toUpperCase();

  // Recebimentos SETTLEMENT com SOURCE_ID normalmente correspondem ao fluxo
  // de pagamentos já tratado em "Consultar entradas"; evitamos duplicar receita.
  if(kind==='income'&&type==='SETTLEMENT'&&row.source_id)return false;

  return ['fee','transfer','expense','refund','chargeback','income'].includes(kind);
}

function zielAccountMoneyActionLabel(row){
  const kind=String(row?.kind||'').toLowerCase();
  if(kind==='fee')return 'Classificar tarifa';
  if(kind==='refund'||kind==='chargeback')return 'Classificar estorno';
  if(kind==='transfer')return 'Classificar transferência';
  if(kind==='expense')return 'Classificar saída';
  if(kind==='income')return 'Classificar entrada';
  return 'Classificar';
}

function zielAccountMoneyOccurredAt(row){
  const raw=row?.date||row?.settlement_date;
  if(!raw)return new Date().toISOString();
  const d=new Date(raw);
  return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();
}

async function zielAccountMoneyClassify(rowIndex,walletId){
  const report=zielAccountMoneyLast;
  const row=Array.isArray(report?.rows)?report.rows[Number(rowIndex)]:null;
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);

  if(!row||!wallet)return toast('Movimentação não encontrada.','error');
  if(!zielAccountMoneyCanClassify(row)){
    return toast('Este recebimento deve ser lançado pelo fluxo “Consultar entradas” para evitar duplicidade.','error');
  }

  const btn=document.querySelector('[data-zam-classify="'+CSS.escape(String(rowIndex))+'"]');
  const original=btn?.textContent||'Classificar';
  if(btn){
    btn.disabled=true;
    btn.textContent='Preparando…';
  }

  try{
    const {data,error}=await supabase.rpc('stage_account_money_movement',{
      p_wallet_id:wallet.id,
      p_transaction_type:row.transaction_type||null,
      p_source_id:row.source_id||null,
      p_external_reference:row.external_reference||null,
      p_occurred_at:zielAccountMoneyOccurredAt(row),
      p_transaction_amount:Number(row.transaction_amount||0),
      p_fee_amount:Number(row.fee_amount||0),
      p_settlement_net_amount:Number(row.settlement_net_amount||0),
      p_payment_method:row.payment_method||null,
      p_payment_method_type:row.payment_method_type||null,
      p_classification:row.kind||null
    });
    if(error)throw error;

    const staged=Array.isArray(data)?data[0]:data;
    if(!staged?.id)throw new Error('O backend não retornou a movimentação preparada.');

    if(staged.decision_status==='Confirmado'&&staged.transaction_id){
      toast('Esta movimentação já foi lançada anteriormente. Nenhum duplicado foi criado.');
      return;
    }

    const idx=(zielIncomingRows||[]).findIndex(x=>x.id===staged.id);
    if(idx>=0)zielIncomingRows[idx]=staged;
    else zielIncomingRows=[staged,...(zielIncomingRows||[])];

    zielIncomingOpenTransferConfirm(staged.id);

    const modalTitle=document.querySelector('#modalWrap .modal-head h3');
    if(modalTitle)modalTitle.textContent='Classificar movimentação da conta';

    const mode=$('zinTransferMode');
    const category=$('zinTransferCategory');
    const description=$('zinTransferDescription');
    const kind=String(row.kind||'').toLowerCase();

    if(mode&&['fee','expense','refund','chargeback'].includes(kind)){
      mode.value='expense';
      if(typeof mode.onchange==='function')mode.onchange();
    }

    if(category&&kind==='fee'){
      const taxOption=[...category.options].find(o=>
        String(o.value||o.textContent||'').toLocaleLowerCase('pt-BR').includes('impostos/taxas')||
        String(o.value||o.textContent||'').toLocaleLowerCase('pt-BR').includes('taxa')
      );
      if(taxOption)category.value=taxOption.value;
    }

    if(description){
      if(kind==='fee')description.value='Tarifa / imposto Mercado Pago';
      else if(kind==='refund'||kind==='chargeback')description.value='Estorno / reembolso Mercado Pago';
      else if(kind==='transfer')description.value=staged.direction==='Saída'?'Retirada / transferência Mercado Pago':'Transferência recebida Mercado Pago';
    }

    const note=document.createElement('div');
    note.className='zam-classification-source';
    note.innerHTML='<strong>Origem: Account Money Report</strong><span>Esta linha foi selecionada por você. Ela só será lançada depois que você confirmar a classificação abaixo. O identificador externo fica vinculado para impedir duplicidade.</span>';
    const form=$('zinTransferForm');
    if(form)form.insertBefore(note,form.firstChild);
  }catch(error){
    toast('Não foi possível preparar a movimentação: '+(error?.message||'erro desconhecido'),'error');
  }finally{
    if(btn&&document.body.contains(btn)){
      btn.disabled=false;
      btn.textContent=original;
    }
  }
}

const _zielAccountMoneyPreviousRender=zielAccountMoneyRenderReport;
zielAccountMoneyRenderReport=function(data,wallet){
  zielAccountMoneyLast=data;
  const rows=Array.isArray(data.rows)?data.rows:[];
  const visible=rows.slice(0,500);
  const totals=data.totals||{};

  modal('Movimentações da conta — Mercado Pago',`
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
        <span>Agora você pode escolher uma movimentação específica e classificá-la antes de lançar. Recebimentos normais continuam no fluxo <b>Consultar entradas</b>, evitando receita duplicada.</span>
      </div>

      <div class="zam-report-meta">
        <span><b>${Number(data.rows_total||rows.length)}</b> movimento${Number(data.rows_total||rows.length)===1?'':'s'}</span>
        <span>Arquivo Mercado Pago: <b>${esc(data.file_name||'—')}</b></span>
        ${data.rows_truncated?'<span class="r"><b>Resposta limitada pelo backend.</b> Consulte períodos menores para detalhamento completo.</span>':''}
        ${rows.length>500?'<span class="a">A tela mostra os 500 movimentos mais recentes; o CSV tratado inclui todas as linhas recebidas.</span>':''}
      </div>

      <div class="zam-table-wrap">
        <table class="zam-table zam-table-actions">
          <thead><tr>
            <th>Data</th><th>Classificação</th><th>ID</th><th>Método</th>
            <th>Bruto</th><th>Taxas</th><th>Impacto no saldo</th><th>Ação</th>
          </tr></thead>
          <tbody>
            ${visible.map((r,i)=>`<tr>
              <td><strong>${esc(zielIncomingWhen(r.date))}</strong><small>${esc(r.transaction_type||'—')}</small></td>
              <td><span class="zam-kind ${zielAccountMoneyKindClass(r.kind)}">${esc(r.classification||'Movimento')}</span></td>
              <td><strong>${esc(r.source_id||'—')}</strong><small>${esc(r.external_reference||'')}</small></td>
              <td><strong>${esc(r.payment_method||'—')}</strong><small>${esc(r.payment_method_type||'')}</small></td>
              <td class="${Number(r.transaction_amount||0)>=0?'':'r'}">${fmt(Number(r.transaction_amount||0))}</td>
              <td class="a">${fmt(Math.abs(Number(r.fee_amount||0)))}</td>
              <td class="${Number(r.settlement_net_amount||0)>=0?'g':'r'}"><b>${Number(r.settlement_net_amount||0)>=0?'+ ':'− '}${fmt(Math.abs(Number(r.settlement_net_amount||0)))}</b></td>
              <td class="zam-action-cell">
                ${zielAccountMoneyCanClassify(r)
                  ?`<button type="button" class="btn btn-soft" data-zam-classify="${i}" data-zam-wallet="${esc(wallet?.id||'')}">${esc(zielAccountMoneyActionLabel(r))}</button>`
                  :'<span class="zam-receipt-flow">Use “Consultar entradas”</span>'}
              </td>
            </tr>`).join('')||'<tr><td colspan="8"><div class="empty">Nenhum movimento no período.</div></td></tr>'}
          </tbody>
        </table>
      </div>

      <p class="mini">Selecionar uma linha <b>não lança nada automaticamente</b>. Primeiro o ZIEL prepara a movimentação; em seguida você escolhe se é transferência entre suas carteiras, saída/retirada, entrada externa ou — nas saídas — pagamento de uma conta cadastrada. O banco bloqueia reutilização do mesmo identificador.</p>
    </div>
  `);

  document.querySelector('#modalWrap .modal')?.classList.add('zam-modal');
  $('zamExport').onclick=zielAccountMoneyExport;
  document.querySelectorAll('[data-zam-classify]').forEach(btn=>{
    btn.onclick=()=>zielAccountMoneyClassify(btn.dataset.zamClassify,btn.dataset.zamWallet);
  });
};
