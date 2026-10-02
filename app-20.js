// Painel de saldos por carteira: fotografia auditável do saldo informado, sem criar movimentações.

function zielPositionSystemBalance(wallet,cutoff=iso()){
  // Saldo até a data local; lançamentos futuros não podem inflar o dinheiro disponível.
  const movements=(state.transactions||[]).filter(t=>t.wallet_id===wallet.id&&String(t.transaction_date||'')<=cutoff);
  const cents=Math.round(Number(wallet.opening_balance||0)*100)+movements.reduce((sum,t)=>
    sum+(t.type==='Entrada'?1:-1)*Math.round(Number(t.amount||0)*100),0);
  return cents/100;
}

function zielPositionDifference(check){
  return Number(check?.difference??(Number(check?.reported_balance||0)-Number(check?.system_balance||0)));
}

function zielPositionLastCheck(walletId){
  return (state.wallet_balance_checks||[]).find(c=>c.wallet_id===walletId)||null;
}

function zielPositionStamp(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Data indisponível':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

function zielPositionStatus(wallet,check,current){
  if(!check)return {kind:'never',label:'Não conferida'};
  if(Math.abs(zielPositionDifference(check))>=.005)return {kind:'diff',label:'Diferença na última conferência'};
  if(Math.abs(Number(check.system_balance)-current)>=.005)return {kind:'stale',label:'Saldo mudou · reconferir'};
  const d=new Date(check.checked_at);
  if(Number.isNaN(d.getTime())||iso(d)!==iso())return {kind:'stale',label:'Conferência anterior · atualizar'};
  return {kind:'ok',label:'Conferida hoje'};
}

function zielPositionHistory(walletId){
  const wallet=state.wallets.find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');
  const rows=(state.wallet_balance_checks||[]).filter(c=>c.wallet_id===walletId).slice(0,20);
  modal('Histórico de conferências',`<div class="zbal-history">
    <div class="zbal-history-intro"><strong>${esc(wallet.name)}</strong><span>${esc(businessName(wallet.business_id))} · últimos ${rows.length} registros</span></div>
    <p class="mini">Cada diferença abaixo foi calculada com os dois saldos registrados naquela conferência. Ela não representa necessariamente a diferença atual.</p>
    ${rows.map(c=>{
      const difference=zielPositionDifference(c);
      return `<div class="zbal-history-row">
        <div class="zbal-history-head"><strong>${zielPositionStamp(c.checked_at)}</strong><span class="zbal-chip ${Math.abs(difference)<.005?'ok':'diff'}">${Math.abs(difference)<.005?'Conferiu':'Diferença '+(difference>0?'+':'−')+fmt(Math.abs(difference))}</span></div>
        <div class="zbal-history-values"><div><small>Saldo ZIEL</small><b>${fmt(c.system_balance)}</b></div><div><small>Saldo informado</small><b>${fmt(c.reported_balance)}</b></div></div>
        ${c.notes?`<p>${esc(c.notes)}</p>`:''}
      </div>`;
    }).join('')||'<div class="empty">Nenhuma conferência registrada nesta carteira.</div>'}
  </div>`);
}

function zielPositionOpenCheck(walletId){
  const wallet=state.wallets.find(w=>w.id===walletId&&w.active!==false);
  if(!wallet)return toast('Carteira ativa não encontrada.','error');
  const cash=String(wallet.type||'').toLowerCase().includes('caixa');
  const current=zielPositionSystemBalance(wallet);
  modal('Conferir saldo da carteira',`<form id="zbalCheckForm" class="zbal-check-form">
    <div class="zbal-check-wallet"><strong>${esc(wallet.name)}</strong><span>${esc(businessName(wallet.business_id))} · ${esc(wallet.type||'Carteira')}</span></div>
    <div class="zbal-check-system"><small>Saldo registrado no ZIEL até hoje</small><strong>${fmt(current)}</strong></div>
    <div class="field"><label for="zbalReported">${cash?'Valor contado fisicamente':'Saldo exibido no aplicativo / extrato'} (R$)</label><input class="input" id="zbalReported" type="number" step="0.01" inputmode="decimal" placeholder="Digite o valor real" required></div>
    <div class="zbal-check-result" id="zbalCheckResult" aria-live="polite">Informe o valor real para visualizar a diferença.</div>
    <div class="field"><label for="zbalNotes">Observação (opcional)</label><textarea id="zbalNotes" maxlength="500" rows="2" placeholder="Ex.: tarifa pendente, Pix ainda não lançado, saldo disponível do app"></textarea></div>
    <p class="mini">Informe o saldo do mesmo momento que os lançamentos registrados no ZIEL. Esta conferência guarda um histórico; não altera saldos, não cria lançamentos e não movimenta dinheiro.</p>
    <div class="zbal-check-actions"><button type="button" class="btn btn-soft" id="zbalCancel">Cancelar</button><button type="submit" class="btn btn-primary" id="zbalSubmit">Salvar conferência</button></div>
  </form>`);
  const paint=()=>{
    const raw=$('zbalReported').value;
    if(raw===''){$('zbalCheckResult').textContent='Informe o valor real para visualizar a diferença.';return;}
    const reported=Number(raw);
    if(!Number.isFinite(reported)){$('zbalCheckResult').textContent='Informe um valor válido.';return;}
    const delta=Math.round((reported-current)*100)/100;
    $('zbalCheckResult').innerHTML=Math.abs(delta)<.005?'<strong class="g">Os saldos conferem.</strong>':
      `<strong class="${delta>0?'g':'r'}">${delta>0?'Valor informado maior':'Valor informado menor'}: ${fmt(Math.abs(delta))}</strong><div class="mini">Diferença = valor informado − saldo ZIEL.</div>`;
  };
  $('zbalReported').oninput=paint;
  $('zbalCancel').onclick=closeModal;
  $('zbalCheckForm').onsubmit=async e=>{
    e.preventDefault();
    const raw=$('zbalReported').value;
    const reported=Number(raw);
    if(raw===''||!Number.isFinite(reported))return toast('Informe o saldo real.','error');
    const submit=$('zbalSubmit');
    submit.disabled=true;
    try{
      const {data,error}=await supabase.rpc('record_wallet_balance_check',{
        p_wallet_id:wallet.id,
        p_reported_balance:reported,
        p_notes:$('zbalNotes').value.trim()||null
      });
      if(error)throw error;
      const check=Array.isArray(data)?data[0]:data;
      if(!check?.id)throw new Error('Conferência não retornou um registro válido. Atualize a página antes de tentar novamente.');
      state.wallet_balance_checks=[check,...(state.wallet_balance_checks||[])].sort((a,b)=>String(b.checked_at||'').localeCompare(String(a.checked_at||'')));
      closeModal();
      renderMoneyPosition();
      const delta=zielPositionDifference(check);
      toast(Math.abs(delta)<.005?'Conferência registrada: saldos iguais.':'Conferência registrada com diferença de '+fmt(Math.abs(delta))+'.',Math.abs(delta)<.005?'ok':'error');
    }catch(error){
      toast('Não foi possível registrar: '+(error?.message||'erro desconhecido'),'error');
      if($('zbalSubmit'))$('zbalSubmit').disabled=false;
    }
  };
}

function zielPositionWalletCard(info){
  const {wallet,current,check,status}=info;
  const delta=check?zielPositionDifference(check):0;
  const snapshotChanged=check&&Math.abs(Number(check.system_balance)-current)>=.005;
  const cash=String(wallet.type||'').toLowerCase().includes('caixa');
  return `<article class="zbal-wallet-card">
    <div class="zbal-wallet-head"><div><span class="zbal-wallet-type">${esc(wallet.type||'Carteira')}</span><h3>${esc(wallet.name)}</h3></div><span class="zbal-chip ${status.kind}">${esc(status.label)}</span></div>
    <div class="zbal-wallet-current"><span>Saldo ZIEL · até hoje</span><strong>${fmt(current)}</strong></div>
    <div class="zbal-wallet-compare">
      <div><small>${cash?'Último valor contado':'Último saldo informado'}</small><b>${check?fmt(check.reported_balance):'—'}</b></div>
      <div><small>Saldo ZIEL naquela conferência</small><b>${check?fmt(check.system_balance):'—'}</b></div>
      <div><small>Diferença naquela conferência</small><b class="${check&&Math.abs(delta)>=.005?'r':'g'}">${check?(delta>0?'+':delta<0?'−':'')+fmt(Math.abs(delta)):'—'}</b></div>
    </div>
    <div class="zbal-wallet-meta">${check?`Última conferência: <strong>${zielPositionStamp(check.checked_at)}</strong>`:'Ainda não há conferência registrada.'}</div>
    ${snapshotChanged?'<p class="zbal-wallet-alert">O saldo no ZIEL mudou desde a última conferência. Informe novamente o saldo externo para uma comparação atual.</p>':''}
    <div class="zbal-wallet-actions"><button type="button" class="btn btn-primary" data-zbal-check="${esc(wallet.id)}">${check?'Conferir novamente':'Informar saldo real'}</button><button type="button" class="btn btn-soft" data-zbal-history="${esc(wallet.id)}">Histórico</button></div>
  </article>`;
}

function renderMoneyPosition(){
  const wallets=(state.wallets||[]).filter(w=>w.active!==false&&(!state.businessFilter||w.business_id===state.businessFilter));
  const infos=wallets.map(wallet=>{
    const current=zielPositionSystemBalance(wallet),check=zielPositionLastCheck(wallet.id);
    return {wallet,current,check,status:zielPositionStatus(wallet,check,current)};
  });
  const total=infos.reduce((a,info)=>a+info.current,0);
  const checkedToday=infos.filter(x=>x.check&&iso(new Date(x.check.checked_at))===iso()).length;
  const diffs=infos.filter(x=>x.status.kind==='diff').length;
  const need=infos.filter(x=>x.status.kind!=='ok').length;
  $('content').innerHTML=setTitle('Onde está meu dinheiro?','Conferência dos saldos por banco, carteira digital e caixa físico',`<button type="button" class="btn btn-soft" id="zbalRefresh">↻ Atualizar saldos</button>`)+`
    <div class="zbal-page">
      <div class="zbal-topstats">
        <div class="zbal-topstat"><span>Saldo total no ZIEL</span><strong>${fmt(total)}</strong><small>${state.businessFilter?'Negócio selecionado':'Todas as empresas'} · até ${br(iso())}</small></div>
        <div class="zbal-topstat"><span>Carteiras ativas</span><strong>${wallets.length}</strong><small>${checkedToday} conferida${checkedToday===1?'':'s'} hoje</small></div>
        <div class="zbal-topstat"><span>Última conferência divergente</span><strong>${diffs}</strong><small>Diferença na data em que foi registrada</small></div>
        <div class="zbal-topstat"><span>Precisam de atenção</span><strong>${need}</strong><small>Não conferidas, antigas ou divergentes</small></div>
      </div>
      <div class="zbal-notice"><strong>Como usar:</strong> abra seu aplicativo bancário e informe o saldo exibido em cada carteira. O ZIEL guarda os dois valores no momento da conferência. Os valores informados anteriormente <b>não são tratados como saldos bancários em tempo real</b>.</div>
      <section class="zbal-section">
        <div class="zbal-section-top"><div><h2>Posição por negócio</h2><p class="mini">Cada valor fica na carteira onde está registrado. Transferências internas não são receitas.</p></div>
        <div class="field"><label for="zbalFilter">Exibir carteiras</label><select id="zbalFilter"><option value="all">Todas</option><option value="attention">Precisam de atenção</option><option value="diff">Com diferença</option><option value="never">Sem conferência</option></select></div></div>
        <div id="zbalGroupList"></div>
      </section>
      <p class="mini zbal-bottom-note">O saldo ZIEL considera lançamentos com data até hoje e exclui movimentos futuros. Saldos de bancos podem diferir por transações ainda não registradas, tarifas, compensações ou lançamentos em carteiras incorretas. Conferir não corrige nem zera valores automaticamente.</p>
    </div>`;
  const paint=()=>{
    const f=$('zbalFilter').value;
    const selected=infos.filter(x=>
      f==='all'||(f==='attention'&&x.status.kind!=='ok')||(f==='diff'&&x.status.kind==='diff')||(f==='never'&&x.status.kind==='never'));
    const bIds=[...new Set(selected.map(x=>x.wallet.business_id))];
    $('zbalGroupList').innerHTML=bIds.map(id=>{
      const shown=selected.filter(x=>x.wallet.business_id===id);
      const full=infos.filter(x=>x.wallet.business_id===id);
      const businessTotal=full.reduce((sum,x)=>sum+x.current,0);
      return `<div class="zbal-business">
        <div class="zbal-business-head"><div><h3>${esc(businessName(id))}</h3><span>${shown.length} carteira${shown.length===1?'':'s'} exibida${shown.length===1?'':'s'}</span></div><div><small>Saldo ZIEL do negócio</small><strong>${fmt(businessTotal)}</strong></div></div>
        <div class="zbal-wallet-grid">${shown.map(zielPositionWalletCard).join('')}</div>
      </div>`;
    }).join('')||'<div class="empty">Nenhuma carteira encontrada para este filtro.</div>';
    document.querySelectorAll('[data-zbal-check]').forEach(btn=>btn.onclick=()=>zielPositionOpenCheck(btn.dataset.zbalCheck));
    document.querySelectorAll('[data-zbal-history]').forEach(btn=>btn.onclick=()=>zielPositionHistory(btn.dataset.zbalHistory));
  };
  $('zbalFilter').onchange=paint;
  $('zbalRefresh').onclick=async()=>{
    $('zbalRefresh').disabled=true;
    try{await loadAll();renderMoneyPosition();toast('Saldos atualizados.');}
    catch(error){toast('Falha ao atualizar saldos: '+(error?.message||'erro de rede'),'error');if($('zbalRefresh'))$('zbalRefresh').disabled=false;}
  };
  paint();
}

const _zielPositionPreviousRenderShell=renderShell;
renderShell=function(){
  _zielPositionPreviousRenderShell();
  const navEl=document.querySelector('.sidebar .nav');
  if(navEl&&!navEl.querySelector('[data-page="posicao"]')){
    const btn=document.createElement('button');
    btn.dataset.page='posicao';
    btn.textContent='◎ Onde está meu dinheiro?';
    btn.onclick=()=>{showPage('posicao');document.body.classList.remove('menu-open');};
    navEl.insertBefore(btn,navEl.querySelector('[data-page="transferencias"]'));
  }
};
const _zielPositionPreviousShowPage=showPage;
showPage=function(page){
  if(page==='posicao'){activate(page);renderMoneyPosition();return;}
  return _zielPositionPreviousShowPage(page);
};
