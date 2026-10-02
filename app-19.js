// Aprimoramento da interface de transferências entre carteiras. Sem alteração nas rotinas de movimentação do banco.

function zielTransferWallet(id){
  return state.wallets.find(w=>w.id===id)||null;
}

function zielTransferNorm(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
}

function zielTransferRecords(filters={}){
  const {month='',kind='',search=''}=filters;
  const query=zielTransferNorm(search);
  return (state.transfers||[]).filter(t=>{
    const from=zielTransferWallet(t.source_wallet_id),to=zielTransferWallet(t.destination_wallet_id);
    if(state.businessFilter&&from?.business_id!==state.businessFilter&&to?.business_id!==state.businessFilter)return false;
    const between=!!(from&&to&&from.business_id!==to.business_id);
    if(kind==='between'&&!between)return false;
    if(kind==='same'&&(!from||!to||between))return false;
    if(month&&!String(t.transfer_date||'').startsWith(month))return false;
    const searchable=[t.transfer_date,t.description,from?.name,to?.name,from?businessName(from.business_id):'',to?businessName(to.business_id):''].join(' ');
    return !query||zielTransferNorm(searchable).includes(query);
  }).sort((a,b)=>String(b.transfer_date||'').localeCompare(String(a.transfer_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
}

function zielTransferDetails(t){
  const from=zielTransferWallet(t.source_wallet_id),to=zielTransferWallet(t.destination_wallet_id);
  const between=!!(from&&to&&from.business_id!==to.business_id);
  let created='';
  if(t.created_at){
    const d=new Date(t.created_at);
    if(!Number.isNaN(d.getTime()))created=d.toLocaleString('pt-BR');
  }
  modal('Detalhes da transferência',`<div class="transfer-detail">
    <div class="transfer-detail-value"><small>Valor movimentado</small><strong>${fmt(t.amount)}</strong><span class="mini">${between?'Entre negócios':'Entre carteiras'}</span></div>
    <div class="transfer-detail-route">
      <div><small>ORIGEM · VALOR RETIRADO</small><strong>${esc(from?.name||'Carteira não encontrada')}</strong><span>${esc(from?businessName(from.business_id):'Empresa não identificada')}</span></div>
      <span class="transfer-flow-arrow" aria-hidden="true">→</span>
      <div><small>DESTINO · VALOR RECEBIDO</small><strong>${esc(to?.name||'Carteira não encontrada')}</strong><span>${esc(to?businessName(to.business_id):'Empresa não identificada')}</span></div>
    </div>
    <div class="transfer-detail-fields">
      <div><small>Data da transferência</small><strong>${br(t.transfer_date)||'—'}</strong></div>
      <div><small>Descrição</small><strong>${esc(t.description||'Transferência entre carteiras')}</strong></div>
      ${created?`<div><small>Registrada em</small><strong>${esc(created)}</strong></div>`:''}
      ${t.id?`<div><small>Identificação do registro</small><span class="transfer-id">${esc(t.id)}</span></div>`:''}
    </div>
    <p class="mini">Transferência interna: movimenta o saldo das carteiras, sem compor receita ou despesa no resultado financeiro.</p>
  </div>`);
}

function transferTable(records=zielTransferRecords()){
  if(!records.length)return '<div class="empty">Nenhuma transferência encontrada com os filtros selecionados.</div>';
  let lastMonth='';
  return `<div class="transfer-list">${records.map(t=>{
    const from=zielTransferWallet(t.source_wallet_id),to=zielTransferWallet(t.destination_wallet_id);
    const between=!!(from&&to&&from.business_id!==to.business_id);
    const month=String(t.transfer_date||'').slice(0,7);
    let heading='';
    if(month&&month!==lastMonth){
      lastMonth=month;
      const date=new Date(`${month}-01T12:00:00`);
      heading=`<div class="transfer-month-heading">${esc(Number.isNaN(date.getTime())?month:date.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}))}</div>`;
    }
    return `${heading}<article class="transfer-entry">
      <div class="transfer-entry-head"><div><span class="transfer-date">${br(t.transfer_date)||'Data não informada'}</span><span class="transfer-kind">${between?'Entre negócios':'Entre carteiras'}</span></div><strong class="transfer-entry-amount">${fmt(t.amount)}</strong></div>
      <div class="transfer-route">
        <div class="transfer-route-side"><small>SAIU DE</small><strong>${esc(from?.name||'Carteira não encontrada')}</strong><span>${esc(from?businessName(from.business_id):'Empresa não identificada')}</span></div>
        <div class="transfer-flow-arrow" aria-hidden="true">→</div>
        <div class="transfer-route-side"><small>ENTROU EM</small><strong>${esc(to?.name||'Carteira não encontrada')}</strong><span>${esc(to?businessName(to.business_id):'Empresa não identificada')}</span></div>
      </div>
      <div class="transfer-entry-foot"><span class="transfer-description">${esc(t.description||'Transferência entre carteiras')}</span><button type="button" class="btn btn-soft transfer-detail-button" data-transfer-detail="${esc(t.id)}">Ver detalhes</button></div>
    </article>`;
  }).join('')}</div>`;
}

function renderTransfers(){
  const wallets=state.wallets.filter(w=>w.active!==false);
  const defaultSource=wallets.find(w=>w.business_id===state.businessFilter)||wallets[0]||null;
  const defaultDestination=wallets.find(w=>w.id!==defaultSource?.id)||null;
  $('content').innerHTML=setTitle('Transferências','Movimente valores entre carteiras sem registrar uma nova receita ou despesa')+`
    <div class="transfer-page">
      <section class="card transfer-form-card">
        <div class="section-head"><div><h3>Nova transferência</h3><p class="mini">Selecione de onde o valor sai e onde ele será recebido.</p></div><span class="mini">Movimentação interna</span></div>
        ${wallets.length<2?'<p class="message error">Cadastre pelo menos duas carteiras ativas para realizar uma transferência.</p>':''}
        <form id="transferForm" class="form-grid transfer-form-grid">
          <div class="field"><label for="trSource">Carteira de origem</label><select id="trSource" required>${walletOptions('',defaultSource?.id||'')}</select></div>
          <div class="field"><label for="trDest">Carteira de destino</label><select id="trDest" required>${walletOptions('',defaultDestination?.id||'')}</select></div>
          <div class="field"><label for="trAmount">Valor a transferir (R$)</label><input class="input" id="trAmount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0,00" required></div>
          <div class="field"><label for="trDate">Data da transferência</label><input class="input" id="trDate" type="date" value="${iso()}" required></div>
          <div class="field span-2"><label for="trDesc">Descrição / finalidade</label><input class="input" id="trDesc" maxlength="250" value="Transferência entre carteiras" placeholder="Ex.: Reforço do caixa da loja"></div>
          <div class="span-2" id="transferPreview" aria-live="polite"></div>
          <div class="span-2 transfer-submit-row"><p class="mini">O mesmo valor sai da origem e entra no destino. O lucro/prejuízo não é alterado.</p><button class="btn btn-primary" id="trSubmit" type="submit">Confirmar transferência</button></div>
        </form>
      </section>
      <section class="card transfer-history-card">
        <div class="section-head"><div><h3>Histórico de transferências</h3><p class="mini">${state.businessFilter?'Exibindo movimentos em que a empresa selecionada é origem ou destino.':'Movimentações de todas as empresas e carteiras.'}</p></div></div>
        <div class="transfer-history-filters">
          <div class="field"><label for="trSearch">Buscar</label><input class="input" id="trSearch" type="search" placeholder="Carteira, empresa ou descrição"></div>
          <div class="field"><label for="trMonth">Mês</label><input class="input" id="trMonth" type="month" title="Em branco: todos os meses"></div>
          <div class="field"><label for="trKind">Tipo de movimentação</label><select id="trKind"><option value="">Todas</option><option value="same">Mesmo negócio</option><option value="between">Entre negócios</option></select></div>
        </div>
        <div class="transfer-history-tools"><span class="mini" id="transferHistoryCount"></span><button type="button" class="btn btn-soft" id="trClearFilters">Limpar filtros</button></div>
        <div class="transfer-stats" id="transferStats"></div>
        <div id="transferHistory"></div>
      </section>
    </div>`;
  if(defaultSource)$('trSource').value=defaultSource.id;
  if(defaultDestination)$('trDest').value=defaultDestination.id;
  const updatePreview=()=>{
    const from=zielTransferWallet($('trSource').value),to=zielTransferWallet($('trDest').value);
    const amount=Number($('trAmount').value);
    const validAmount=Number.isFinite(amount)&&amount>0;
    const same=from&&to&&from.id===to.id;
    $('trSubmit').disabled=!from||!to||same||!validAmount||!$('trDate').value;
    if(!from||!to){$('transferPreview').innerHTML='<div class="transfer-preview transfer-preview-warning">Selecione duas carteiras ativas.</div>';return;}
    const sourceBalance=walletBalance(from),destinationBalance=walletBalance(to);
    $('transferPreview').innerHTML=`<div class="transfer-preview">
      <div class="transfer-preview-caption">Prévia da movimentação · saldos atuais</div>
      <div class="transfer-preview-flow">
        <div class="transfer-preview-side"><small>SAI DE</small><strong>${esc(from.name)}</strong><span>${esc(businessName(from.business_id))}</span><span>Saldo atual: <b>${fmt(sourceBalance)}</b></span>${validAmount?`<span>Saldo estimado após: <b class="${sourceBalance-amount<0?'r':''}">${fmt(sourceBalance-amount)}</b></span>`:''}</div>
        <span class="transfer-flow-arrow" aria-hidden="true">→</span>
        <div class="transfer-preview-side"><small>ENTRA EM</small><strong>${esc(to.name)}</strong><span>${esc(businessName(to.business_id))}</span><span>Saldo atual: <b>${fmt(destinationBalance)}</b></span>${validAmount?`<span>Saldo estimado após: <b>${fmt(destinationBalance+amount)}</b></span>`:''}</div>
      </div>
      ${same?'<p class="transfer-preview-alert">Origem e destino precisam ser carteiras diferentes.</p>':''}
      ${validAmount&&!same&&sourceBalance-amount<0?'<p class="transfer-preview-alert">Atenção: considerando o saldo atual, a carteira de origem ficará negativa.</p>':''}
      <p class="mini">Os saldos projetados são uma simulação com base no saldo atual, não um extrato da data selecionada.</p>
    </div>`;
  };
  ['trSource','trDest','trAmount','trDate'].forEach(id=>$(id).addEventListener('input',updatePreview));
  updatePreview();
  $('transferForm').onsubmit=submitTransfer;
  const paintHistory=()=>{
    const records=zielTransferRecords({month:$('trMonth').value,kind:$('trKind').value,search:$('trSearch').value});
    const moved=records.reduce((sum,t)=>sum+Number(t.amount||0),0);
    const cross=records.filter(t=>{const from=zielTransferWallet(t.source_wallet_id),to=zielTransferWallet(t.destination_wallet_id);return !!(from&&to&&from.business_id!==to.business_id);});
    const crossAmount=cross.reduce((sum,t)=>sum+Number(t.amount||0),0);
    $('transferStats').innerHTML=`
      <div class="transfer-stat"><span>Transferências exibidas</span><strong>${records.length}</strong><small>Registros após os filtros</small></div>
      <div class="transfer-stat"><span>Total movimentado</span><strong>${fmt(moved)}</strong><small>Valor contado uma vez por transferência</small></div>
      <div class="transfer-stat"><span>Entre negócios</span><strong>${fmt(crossAmount)}</strong><small>${cross.length} transferência${cross.length===1?'':'s'}</small></div>`;
    $('transferHistoryCount').textContent=`${records.length} registro${records.length===1?'':'s'} encontrado${records.length===1?'':'s'}`;
    $('transferHistory').innerHTML=transferTable(records);
    $('transferHistory').querySelectorAll('[data-transfer-detail]').forEach(btn=>{
      btn.onclick=()=>{const t=records.find(t=>String(t.id)===btn.dataset.transferDetail);if(t)zielTransferDetails(t);};
    });
  };
  ['trSearch','trMonth','trKind'].forEach(id=>$(id).addEventListener('input',paintHistory));
  $('trClearFilters').onclick=()=>{$('trSearch').value='';$('trMonth').value='';$('trKind').value='';paintHistory();};
  paintHistory();
}
