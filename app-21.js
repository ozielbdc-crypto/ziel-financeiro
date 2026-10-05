// Gestão de carteiras por localização real do dinheiro.
// Regra: carteira = lugar onde o dinheiro existe (banco, carteira digital ou caixa físico).

function zielWalletNormalizeName(value){
  return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
}

function zielWalletIsGeneric(wallet){
  const n=zielWalletNormalizeName(wallet?.name);
  return n==='banco / pix'||n==='banco/pix'||n==='banco pix'||n==='pix / banco'||n==='pix/banco';
}

function zielWalletMovementCount(walletId){
  return (state.transactions||[]).filter(t=>t.wallet_id===walletId).length;
}

function zielWalletPendingBankCount(walletId){
  return (state.bank||[]).filter(b=>b.wallet_id===walletId&&b.status!=='Conciliado').length;
}

function zielWalletCanDeactivate(wallet){
  const balance=walletBalance(wallet);
  const pending=zielWalletPendingBankCount(wallet.id);
  return {ok:Math.abs(balance)<0.005&&pending===0,balance,pending};
}

function zielWalletTypeLabel(type){
  if(type==='Caixa')return 'Caixa físico';
  if(type==='Carteira Digital')return 'Carteira digital';
  return type||'Banco';
}

function zielWalletCard(wallet){
  const balance=walletBalance(wallet);
  const generic=zielWalletIsGeneric(wallet);
  const movements=zielWalletMovementCount(wallet.id);
  const pending=zielWalletPendingBankCount(wallet.id);
  return `<article class="zwallet-card ${wallet.active===false?'is-inactive':''} ${generic?'is-generic':''}">
    <div class="zwallet-card-head">
      <div>
        <span class="zwallet-type">${esc(zielWalletTypeLabel(wallet.type))}</span>
        <h3>${esc(wallet.name)}</h3>
        <span class="mini">${esc(businessName(wallet.business_id))}</span>
      </div>
      <span class="zwallet-status ${wallet.active===false?'inactive':generic?'attention':'active'}">${wallet.active===false?'Inativa':generic?'Identificar local':'Ativa'}</span>
    </div>
    <div class="zwallet-balance"><span>Saldo registrado</span><strong class="${balance<0?'r':''}">${fmt(balance)}</strong></div>
    <div class="zwallet-meta">
      <span><b>${movements}</b> lançamento${movements===1?'':'s'}</span>
      <span><b>${pending}</b> item${pending===1?'':'s'} bancário${pending===1?'':'s'} pendente${pending===1?'':'s'}</span>
      <span>Saldo inicial: <b>${fmt(wallet.opening_balance)}</b></span>
    </div>
    ${generic&&wallet.active!==false?`<div class="zwallet-warning"><strong>Carteira genérica.</strong> "Pix" é forma de pagamento, não o lugar onde o dinheiro está. Se todo esse saldo estiver em um único banco, renomeie esta carteira. Se estiver dividido, crie as carteiras reais e distribua o saldo por Transferência.</div>`:''}
    <div class="zwallet-actions">
      <button type="button" class="btn btn-soft" data-wallet-edit="${esc(wallet.id)}">Editar</button>
      ${wallet.active!==false?`<button type="button" class="btn btn-soft" data-wallet-toggle="${esc(wallet.id)}" data-wallet-active="1">Desativar</button>`:`<button type="button" class="btn btn-soft" data-wallet-toggle="${esc(wallet.id)}" data-wallet-active="0">Reativar</button>`}
      ${generic&&wallet.active!==false?`<button type="button" class="btn btn-primary" data-wallet-distribute="${esc(wallet.id)}">Distribuir saldo</button>`:''}
    </div>
  </article>`;
}

renderWallets = function(){
  const all=(state.wallets||[]).filter(w=>!state.businessFilter||w.business_id===state.businessFilter);
  const active=all.filter(w=>w.active!==false);
  const generic=active.filter(zielWalletIsGeneric);
  const total=active.reduce((sum,w)=>sum+walletBalance(w),0);

  $('content').innerHTML=setTitle(
    'Carteiras',
    'Cada carteira representa um lugar real onde o dinheiro existe',
    '<button class="btn btn-primary" id="newWallet">+ Nova carteira</button>'
  )+`
    <div class="zwallet-page">
      <div class="zwallet-summary">
        <div><span>Saldo nas carteiras ativas</span><strong>${fmt(total)}</strong><small>${state.businessFilter?'Negócio selecionado':'Todos os negócios'}</small></div>
        <div><span>Carteiras ativas</span><strong>${active.length}</strong><small>Banco, carteira digital ou caixa físico</small></div>
        <div><span>Carteiras genéricas</span><strong class="${generic.length?'r':''}">${generic.length}</strong><small>${generic.length?'Precisam ser identificadas':'Estrutura organizada'}</small></div>
      </div>

      <div class="zwallet-rule">
        <div><strong>Regra do ZIEL:</strong> uma carteira = um local real do dinheiro.</div>
        <p>Exemplos: <b>Bradesco</b>, <b>Mercado Pago</b>, <b>Caixa físico da loja</b>. Pix, boleto, dinheiro e cartão são formas de pagamento; não precisam virar carteiras separadas quando o valor cai no mesmo local.</p>
      </div>

      ${generic.length?`<div class="zwallet-guide">
        <strong>Há ${generic.length} carteira${generic.length===1?'':'s'} "Banco / Pix" para organizar.</strong>
        <span>1. Se o saldo pertence a um único banco, use <b>Editar</b> e coloque o nome real. 2. Se está dividido entre bancos, crie as novas carteiras com saldo inicial zero. 3. Use <b>Transferências</b> para distribuir o saldo da carteira genérica. 4. Quando ela chegar a zero e não houver pendências, desative-a.</span>
      </div>`:''}

      <div class="zwallet-toolbar">
        <div class="field"><label for="zwalletStatus">Exibir</label><select id="zwalletStatus"><option value="active">Ativas</option><option value="all">Todas</option><option value="generic">Somente genéricas</option><option value="inactive">Inativas</option></select></div>
        <div class="field"><label for="zwalletSearch">Buscar carteira</label><input class="input" id="zwalletSearch" type="search" placeholder="Nome, tipo ou negócio"></div>
      </div>
      <div id="zwalletList"></div>
    </div>`;

  const paint=()=>{
    const status=$('zwalletStatus').value;
    const q=zielWalletNormalizeName($('zwalletSearch').value);
    const rows=all.filter(w=>{
      if(status==='active'&&w.active===false)return false;
      if(status==='inactive'&&w.active!==false)return false;
      if(status==='generic'&&(!zielWalletIsGeneric(w)||w.active===false))return false;
      if(q){
        const hay=zielWalletNormalizeName([w.name,w.type,businessName(w.business_id)].join(' '));
        if(!hay.includes(q))return false;
      }
      return true;
    }).sort((a,b)=>{
      if((a.active!==false)!==(b.active!==false))return a.active===false?1:-1;
      if(zielWalletIsGeneric(a)!==zielWalletIsGeneric(b))return zielWalletIsGeneric(a)?-1:1;
      const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
      return biz||a.name.localeCompare(b.name,'pt-BR');
    });

    const groups=[...new Set(rows.map(w=>w.business_id))];
    $('zwalletList').innerHTML=groups.map(id=>{
      const wallets=rows.filter(w=>w.business_id===id);
      return `<section class="zwallet-business">
        <div class="zwallet-business-head"><h3>${esc(businessName(id))}</h3><span>${wallets.length} carteira${wallets.length===1?'':'s'}</span></div>
        <div class="zwallet-grid">${wallets.map(zielWalletCard).join('')}</div>
      </section>`;
    }).join('')||'<div class="empty">Nenhuma carteira encontrada.</div>';

    document.querySelectorAll('[data-wallet-edit]').forEach(btn=>btn.onclick=()=>openWallet(btn.dataset.walletEdit));
    document.querySelectorAll('[data-wallet-toggle]').forEach(btn=>btn.onclick=()=>zielToggleWallet(btn.dataset.walletToggle,btn.dataset.walletActive==='1'));
    document.querySelectorAll('[data-wallet-distribute]').forEach(btn=>btn.onclick=()=>{
      const w=state.wallets.find(x=>x.id===btn.dataset.walletDistribute);
      if(!w)return;
      if(!state.wallets.some(x=>x.active!==false&&x.business_id===w.business_id&&x.id!==w.id)){
        toast('Crie primeiro pelo menos uma carteira real para este negócio.','error');
        return;
      }
      showPage('transferencias');
    });
  };

  $('newWallet').onclick=()=>openWallet('');
  $('zwalletStatus').onchange=paint;
  $('zwalletSearch').oninput=paint;
  paint();
};

openWallet = function(walletId=''){
  const wallet=walletId?(state.wallets||[]).find(w=>w.id===walletId):null;
  if(walletId&&!wallet)return toast('Carteira não encontrada.','error');

  const editing=!!wallet;
  const movements=wallet?zielWalletMovementCount(wallet.id):0;
  const lockedOpening=editing&&movements>0;
  const selectedBusiness=wallet?.business_id||state.businessFilter||state.businesses.find(b=>b.active!==false)?.id||'';
  const selectedType=wallet?.type||'Banco';

  modal(editing?'Editar carteira':'Nova carteira',`
    <form id="walletForm" class="form-grid">
      <div class="field">
        <label>Negócio</label>
        <select id="wBiz" required ${editing?'disabled':''}>${businessOptions(false,selectedBusiness)}</select>
        ${editing?'<div class="mini">O negócio não pode ser trocado em uma carteira já criada.</div>':''}
      </div>
      <div class="field">
        <label>Tipo de local</label>
        <select id="wType">
          <option value="Banco" ${selectedType==='Banco'?'selected':''}>Conta bancária</option>
          <option value="Carteira Digital" ${selectedType==='Carteira Digital'?'selected':''}>Carteira digital</option>
          <option value="Caixa" ${selectedType==='Caixa'?'selected':''}>Caixa físico</option>
        </select>
      </div>
      <div class="field span-2">
        <label>Nome do lugar onde o dinheiro está</label>
        <input class="input" id="wName" maxlength="80" value="${esc(wallet?.name||'')}" placeholder="Ex.: Bradesco, Mercado Pago, Caixa da loja" required>
        <div class="mini">Use o nome da instituição ou do local físico. Evite nomes como "Pix", "Banco / Pix" ou "Recebimentos".</div>
      </div>
      <div class="field">
        <label>Saldo inicial</label>
        <input class="input" id="wOpening" type="number" step="0.01" value="${Number(wallet?.opening_balance||0)}" ${lockedOpening?'readonly':''}>
        <div class="mini">${lockedOpening?'Bloqueado porque esta carteira já possui lançamentos.':'Em carteira nova, deixe zero se o dinheiro já estiver representado em outra carteira do ZIEL.'}</div>
      </div>
      <div class="field zwallet-form-tip">
        <strong>${editing?'Renomear preserva o histórico':'Como começar'}</strong>
        <span>${editing?'Alterar nome ou tipo não cria nem apaga movimentações.':'Se estiver dividindo uma carteira Banco / Pix existente, crie esta com saldo inicial R$ 0,00 e depois use Transferências.'}</span>
      </div>
      <div class="actions span-2"><button class="btn btn-primary" type="submit">${editing?'Salvar alterações':'Criar carteira'}</button></div>
    </form>
  `);

  $('walletForm').onsubmit=async e=>{
    e.preventDefault();
    const businessId=wallet?.business_id||$('wBiz').value;
    const name=$('wName').value.trim().replace(/\s+/g,' ');
    const type=$('wType').value;
    const opening=Number($('wOpening').value||0);

    if(!name)return toast('Informe o nome real da carteira.','error');
    if(!Number.isFinite(opening))return toast('Informe um saldo inicial válido.','error');

    const duplicate=(state.wallets||[]).find(w=>
      w.id!==wallet?.id&&w.business_id===businessId&&zielWalletNormalizeName(w.name)===zielWalletNormalizeName(name)&&w.active!==false
    );
    if(duplicate)return toast('Já existe uma carteira ativa com esse nome neste negócio.','error');

    const payload={name,type};
    if(!editing)Object.assign(payload,{business_id:businessId,opening_balance:opening});
    else if(!lockedOpening)payload.opening_balance=opening;

    await perform(
      ()=>editing
        ?supabase.from('wallets').update(payload).eq('id',wallet.id)
        :supabase.from('wallets').insert(payload),
      editing?'Carteira atualizada.':'Carteira criada.'
    );
  };
};

async function zielToggleWallet(walletId,isActive){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  if(isActive){
    const check=zielWalletCanDeactivate(wallet);
    if(!check.ok){
      const reasons=[];
      if(Math.abs(check.balance)>=.005)reasons.push('saldo atual de '+fmt(check.balance));
      if(check.pending)reasons.push(check.pending+' item(ns) bancário(s) não conciliado(s)');
      return toast('Não é possível desativar: '+reasons.join(' e ')+'. Primeiro organize a carteira.','error');
    }
    if(!confirm('Desativar a carteira "'+wallet.name+'"? O histórico será preservado e ela deixará de aparecer em novos lançamentos.'))return;
    await perform(()=>supabase.from('wallets').update({active:false}).eq('id',wallet.id),'Carteira desativada. O histórico foi preservado.');
  }else{
    const duplicate=(state.wallets||[]).find(w=>w.id!==wallet.id&&w.business_id===wallet.business_id&&w.active!==false&&zielWalletNormalizeName(w.name)===zielWalletNormalizeName(wallet.name));
    if(duplicate)return toast('Já existe uma carteira ativa com esse nome neste negócio. Renomeie antes de reativar.','error');
    await perform(()=>supabase.from('wallets').update({active:true}).eq('id',wallet.id),'Carteira reativada.');
  }
}
