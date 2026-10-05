// Proteção de saldo ao baixar contas a pagar.
// A validação visual usa o mesmo conceito do backend: saldo registrado até hoje.

const _zielPreviousOpenSettle = openSettle;

openSettle = function(kind,id){
  if(kind!=='pay') return _zielPreviousOpenSettle(kind,id);

  const item=state.payables.find(x=>x.id===id);
  if(!item) return toast('Registro não encontrado.','error');

  const paid=Number(item.paid_amount||0);
  const total=Number(item.amount||0);
  const remaining=Math.max(0,total-paid);
  const businessWallets=state.wallets.filter(w=>w.active!==false&&w.business_id===item.business_id);

  if(!businessWallets.length){
    return toast('Este negócio não possui uma carteira ativa para realizar o pagamento.','error');
  }

  modal('Baixar pagamento',`<form id="settleForm" class="form-grid">
    <div class="field span-2">
      <label>${esc(item.description)}</label>
      <div class="grid three" style="margin-top:8px">
        <div><div class="mini">Valor total</div><strong>${fmt(total)}</strong></div>
        <div><div class="mini">Já pago</div><strong>${fmt(paid)}</strong></div>
        <div><div class="mini">Saldo em aberto</div><strong>${fmt(remaining)}</strong></div>
      </div>
    </div>

    <div class="field">
      <label>Valor desta baixa</label>
      <input class="input" id="sAmount" type="number" inputmode="decimal" step="0.01" min="0.01" max="${remaining.toFixed(2)}" value="${remaining.toFixed(2)}" required>
    </div>

    <div class="field">
      <label>Carteira</label>
      <select id="sWallet" required>${walletOptions(item.business_id)}</select>
    </div>

    <div class="field span-2">
      <div class="wallet-payment-balance" id="walletPaymentBalance" aria-live="polite"></div>
    </div>

    <div class="field">
      <label>Data</label>
      <input class="input" id="sDate" type="date" value="${iso()}" required>
    </div>

    <div class="field">
      <label>Forma</label>
      <select id="sMethod">
        <option>Pix</option>
        <option>Dinheiro</option>
        <option>Cartão Débito</option>
        <option>Cartão Crédito</option>
        <option>Boleto</option>
        <option>Transferência</option>
      </select>
    </div>

    <div class="actions span-2">
      <button class="btn btn-primary" id="settleSubmit" type="submit">Confirmar baixa</button>
    </div>
  </form>`);

  const getWallet=()=>state.wallets.find(w=>w.id===$('sWallet').value);
  const getBalance=w=>typeof zielPositionSystemBalance==='function'?zielPositionSystemBalance(w):walletBalance(w);

  const paintBalance=()=>{
    const w=getWallet();
    const amount=Number($('sAmount').value);
    const box=$('walletPaymentBalance');
    const submit=$('settleSubmit');

    if(!w){
      box.innerHTML='<div class="wallet-payment-state error"><strong>Carteira não encontrada.</strong></div>';
      submit.disabled=true;
      return;
    }

    const available=Math.round(getBalance(w)*100)/100;
    const validAmount=Number.isFinite(amount)&&amount>0&&amount<=remaining+0.009;
    const after=validAmount?Math.round((available-amount)*100)/100:available;
    const insufficient=validAmount&&available+0.009<amount;
    const missing=insufficient?Math.round((amount-available)*100)/100:0;

    box.className='wallet-payment-balance '+(insufficient?'insufficient':'sufficient');
    box.innerHTML=`
      <div class="wallet-payment-title">
        <div><small>CARTEIRA SELECIONADA</small><strong>${esc(w.name)}</strong></div>
        <span>${esc(businessName(w.business_id))}</span>
      </div>
      <div class="wallet-payment-values">
        <div><small>Saldo disponível</small><strong>${fmt(available)}</strong></div>
        <div><small>Pagamento</small><strong>${validAmount?fmt(amount):'—'}</strong></div>
        <div><small>Saldo após pagar</small><strong class="${insufficient?'r':''}">${validAmount?fmt(after):'—'}</strong></div>
      </div>
      ${insufficient
        ?`<div class="wallet-payment-alert"><strong>Saldo insuficiente.</strong><span>Faltam ${fmt(missing)} nesta carteira. Transfira recursos para ela ou escolha outra carteira.</span></div>`
        :validAmount
          ?'<div class="wallet-payment-ok">Saldo suficiente para realizar este pagamento.</div>'
          :'<div class="wallet-payment-help">Informe um valor válido para verificar o saldo.</div>'}
      <p class="mini">O saldo considera os lançamentos registrados no ZIEL até hoje. A baixa será bloqueada no banco se o saldo não for suficiente.</p>
    `;

    submit.disabled=!validAmount||insufficient;
  };

  $('sWallet').onchange=paintBalance;
  $('sAmount').oninput=paintBalance;
  paintBalance();

  $('settleForm').onsubmit=async e=>{
    e.preventDefault();

    const amount=Number($('sAmount').value);
    if(!Number.isFinite(amount)||amount<=0) return toast('Informe um valor válido.','error');
    if(amount>remaining+0.009) return toast('O valor da baixa não pode ser maior que o saldo em aberto.','error');

    const w=getWallet();
    if(!w) return toast('Selecione uma carteira válida.','error');

    const available=Math.round(getBalance(w)*100)/100;
    if(available+0.009<amount){
      return toast('Saldo insuficiente. Disponível: '+fmt(available)+' · Pagamento: '+fmt(amount)+'.','error');
    }

    await perform(
      async()=>supabase.rpc('pay_payable_partial',{
        p_id:id,
        p_wallet:w.id,
        p_date:$('sDate').value,
        p_method:$('sMethod').value,
        p_amount:amount
      }),
      amount<remaining-0.009?'Pagamento parcial registrado.':'Pagamento registrado.'
    );
  };
};
