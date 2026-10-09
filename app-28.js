// Pagamentos de contas com juros/acréscimos e histórico de data/hora.

function zielPaymentLocalDatetimeValue(date=new Date()){
  const pad=n=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function zielPayablePaymentRows(payableId){
  return (state.transactions||[])
    .filter(t=>t.source_type==='payable'&&t.source_id===payableId)
    .sort((a,b)=>String(b.payment_occurred_at||b.created_at||'').localeCompare(String(a.payment_occurred_at||a.created_at||'')));
}

function zielPaymentDateTimeLabel(value,fallbackDate=''){
  if(value){
    const d=new Date(value);
    if(!Number.isNaN(d.getTime()))return d.toLocaleString('pt-BR',{
      timeZone:'America/Fortaleza',
      dateStyle:'short',
      timeStyle:'short'
    });
  }
  return fallbackDate?br(fallbackDate):'—';
}

const _zielPreviousOpenSettleInterest = openSettle;
openSettle = function(kind,id){
  if(kind!=='pay')return _zielPreviousOpenSettleInterest(kind,id);

  const item=state.payables.find(x=>x.id===id);
  if(!item)return toast('Registro não encontrado.','error');

  const paid=Number(item.paid_amount||0);
  const total=Number(item.amount||0);
  const remaining=Math.max(0,Math.round((total-paid)*100)/100);
  const businessWallets=state.wallets.filter(w=>w.active!==false&&w.business_id===item.business_id);

  if(!businessWallets.length){
    return toast('Este negócio não possui uma carteira ativa para realizar o pagamento.','error');
  }

  modal('Baixar pagamento',`<form id="settleForm" class="form-grid">
    <div class="field span-2">
      <label>${esc(item.description)}</label>
      <div class="grid three" style="margin-top:8px">
        <div><div class="mini">Valor original</div><strong>${fmt(total)}</strong></div>
        <div><div class="mini">Principal já baixado</div><strong>${fmt(paid)}</strong></div>
        <div><div class="mini">Saldo em aberto</div><strong>${fmt(remaining)}</strong></div>
      </div>
    </div>

    <div class="field">
      <label>Valor efetivamente pago</label>
      <input class="input" id="sAmount" type="number" inputmode="decimal" step="0.01" min="0.01" value="${remaining.toFixed(2)}" required>
      <div class="mini">Pode ser maior que o saldo em aberto. A diferença será registrada como juros/acréscimo.</div>
    </div>

    <div class="field">
      <label>Carteira</label>
      <select id="sWallet" required>${walletOptions(item.business_id)}</select>
    </div>

    <div class="field span-2">
      <div class="wallet-payment-adjustment" id="walletPaymentAdjustment"></div>
    </div>

    <div class="field span-2">
      <div class="wallet-payment-balance" id="walletPaymentBalance" aria-live="polite"></div>
    </div>

    <div class="field">
      <label>Data e hora do pagamento</label>
      <input class="input" id="sPaidAt" type="datetime-local" value="${zielPaymentLocalDatetimeValue()}" required>
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

  const paint=()=>{
    const w=getWallet();
    const amount=Number($('sAmount').value);
    const balanceBox=$('walletPaymentBalance');
    const adjustmentBox=$('walletPaymentAdjustment');
    const submit=$('settleSubmit');

    const validAmount=Number.isFinite(amount)&&amount>0;
    const principal=validAmount?Math.min(amount,remaining):0;
    const interest=validAmount?Math.max(0,Math.round((amount-principal)*100)/100):0;
    const afterOpen=Math.max(0,Math.round((remaining-principal)*100)/100);

    adjustmentBox.innerHTML=`
      <div class="wallet-payment-adjustment-grid">
        <div><small>Principal nesta baixa</small><strong>${validAmount?fmt(principal):'—'}</strong></div>
        <div><small>Juros / acréscimo</small><strong class="${interest>.009?'a':''}">${validAmount?fmt(interest):'—'}</strong></div>
        <div><small>Saldo da conta após baixa</small><strong>${validAmount?(afterOpen>.009?fmt(afterOpen):'Quitada'):'—'}</strong></div>
      </div>
      ${interest>.009?'<div class="wallet-payment-interest-note"><strong>Pagamento com acréscimo.</strong><span>A conta será quitada pelo principal em aberto e a diferença será registrada como juros/acréscimo no pagamento.</span></div>':''}
    `;

    if(!w){
      balanceBox.innerHTML='<div class="wallet-payment-state error"><strong>Carteira não encontrada.</strong></div>';
      submit.disabled=true;
      return;
    }

    const available=Math.round(getBalance(w)*100)/100;
    const after=validAmount?Math.round((available-amount)*100)/100:available;
    const insufficient=validAmount&&available+0.009<amount;
    const missing=insufficient?Math.round((amount-available)*100)/100:0;

    balanceBox.className='wallet-payment-balance '+(insufficient?'insufficient':'sufficient');
    balanceBox.innerHTML=`
      <div class="wallet-payment-title">
        <div><small>CARTEIRA SELECIONADA</small><strong>${esc(w.name)}</strong></div>
        <span>${esc(businessName(w.business_id))}</span>
      </div>
      <div class="wallet-payment-values">
        <div><small>Saldo disponível</small><strong>${fmt(available)}</strong></div>
        <div><small>Pagamento real</small><strong>${validAmount?fmt(amount):'—'}</strong></div>
        <div><small>Saldo após pagar</small><strong class="${insufficient?'r':''}">${validAmount?fmt(after):'—'}</strong></div>
      </div>
      ${insufficient
        ?`<div class="wallet-payment-alert"><strong>Saldo insuficiente.</strong><span>Faltam ${fmt(missing)} nesta carteira.</span></div>`
        :validAmount
          ?'<div class="wallet-payment-ok">Saldo suficiente para realizar este pagamento.</div>'
          :'<div class="wallet-payment-help">Informe um valor válido.</div>'}
      <p class="mini">O saldo considera os lançamentos registrados no ZIEL até hoje. A baixa também é validada no banco.</p>
    `;

    submit.disabled=!validAmount||insufficient||!$('sPaidAt').value;
  };

  $('sWallet').onchange=paint;
  $('sAmount').oninput=paint;
  $('sPaidAt').oninput=paint;
  paint();

  $('settleForm').onsubmit=async e=>{
    e.preventDefault();

    const amount=Number($('sAmount').value);
    if(!Number.isFinite(amount)||amount<=0)return toast('Informe um valor válido.','error');

    const w=getWallet();
    if(!w)return toast('Selecione uma carteira válida.','error');

    const paidAtRaw=$('sPaidAt').value;
    if(!paidAtRaw)return toast('Informe a data e hora do pagamento.','error');
    const paidAt=new Date(paidAtRaw);
    if(Number.isNaN(paidAt.getTime()))return toast('Data e hora do pagamento inválidas.','error');

    const available=Math.round(getBalance(w)*100)/100;
    if(available+0.009<amount){
      return toast('Saldo insuficiente. Disponível: '+fmt(available)+' · Pagamento: '+fmt(amount)+'.','error');
    }

    const interest=Math.max(0,Math.round((amount-Math.min(amount,remaining))*100)/100);
    const principal=Math.min(amount,remaining);

    await perform(
      async()=>supabase.rpc('pay_payable_with_adjustment',{
        p_id:id,
        p_wallet:w.id,
        p_paid_at:paidAt.toISOString(),
        p_method:$('sMethod').value,
        p_amount:amount
      }),
      interest>.009
        ?'Pagamento registrado com '+fmt(interest)+' de juros/acréscimo.'
        :principal<remaining-.009?'Pagamento parcial registrado.':'Pagamento registrado.'
    );
  };
};

zielOpenPaymentDetails = function(id){
  const p=state.payables.find(x=>x.id===id);
  if(!p)return toast('Conta a pagar não encontrada.','error');

  const rows=zielPayablePaymentRows(id);
  const configuredMethod=p.payment_method||'Não informado';
  let credentialDetails='';

  if(p.payment_method==='Pix'&&p.pix_key){
    credentialDetails=`<div class="field"><label>Tipo de chave</label><div>${esc(p.pix_key_type||'—')}</div></div>
      <div class="field"><label>Chave Pix</label><div class="actions"><input class="input" id="viewPixKey" readonly value="${esc(p.pix_key)}" style="flex:1"><button type="button" class="btn btn-soft" data-copy-input="viewPixKey">Copiar chave</button></div></div>`;
  }else if(p.payment_method==='Boleto'&&p.boleto_code){
    credentialDetails=`<div class="field span-2"><label>Código de barras / linha digitável</label><div class="actions"><input class="input" id="viewBoletoCode" readonly value="${esc(p.boleto_code)}" style="flex:1"><button type="button" class="btn btn-soft" data-copy-input="viewBoletoCode">Copiar código</button></div></div>`;
  }

  const totalPaid=rows.reduce((s,t)=>s+Number(t.amount||0),0);
  const totalInterest=rows.reduce((s,t)=>s+Number(t.interest_amount||0),0);

  modal('Detalhes do pagamento',`
    <div class="payment-detail-page">
      <div class="payment-detail-summary">
        <div><small>CONTA</small><strong>${esc(p.description)}</strong><span>${esc(p.supplier||'—')} · ${esc(businessName(p.business_id))}</span></div>
        <div><small>VALOR ORIGINAL</small><strong>${fmt(Number(p.amount||0))}</strong></div>
        <div><small>TOTAL PAGO</small><strong>${rows.length?fmt(totalPaid):'—'}</strong></div>
        <div><small>JUROS / ACRÉSCIMOS</small><strong class="${totalInterest>.009?'a':''}">${rows.length?fmt(totalInterest):'—'}</strong></div>
      </div>

      ${rows.length?`<div class="payment-detail-history">
        <div class="section-head"><h3>Histórico de baixas</h3><span class="mini">${rows.length} pagamento${rows.length===1?'':'s'}</span></div>
        ${rows.map((t,index)=>{
          const interest=Number(t.interest_amount||0);
          const principal=t.principal_amount!=null?Number(t.principal_amount):Math.max(0,Number(t.amount||0)-interest);
          return `<div class="payment-detail-row">
            <div class="payment-detail-row-head"><strong>Pagamento ${rows.length-index}</strong><span>${esc(zielPaymentDateTimeLabel(t.payment_occurred_at||t.created_at,t.transaction_date))}</span></div>
            <div class="payment-detail-grid">
              <div><small>Valor pago</small><strong>${fmt(Number(t.amount||0))}</strong></div>
              <div><small>Principal</small><strong>${fmt(principal)}</strong></div>
              <div><small>Juros / acréscimo</small><strong class="${interest>.009?'a':''}">${fmt(interest)}</strong></div>
              <div><small>Forma</small><strong>${esc(t.method||p.method||'—')}</strong></div>
              <div><small>Carteira</small><strong>${esc(walletName(t.wallet_id))}</strong></div>
              <div><small>Data contábil</small><strong>${esc(br(t.transaction_date))}</strong></div>
            </div>
          </div>`;
        }).join('')}
      </div>`:'<div class="empty">Ainda não há baixa financeira registrada para esta conta.</div>'}

      <div class="payment-detail-credentials">
        <div class="section-head"><h3>Dados cadastrados para pagamento</h3><span class="mini">${esc(configuredMethod)}</span></div>
        <div class="form-grid">
          <div class="field"><label>Forma cadastrada</label><div><b>${esc(configuredMethod)}</b></div></div>
          <div class="field"><label>Favorecido</label><div>${esc(p.supplier||'—')}</div></div>
          ${credentialDetails}
        </div>
      </div>
    </div>
  `);
};

payableTable = function(arr,actions=true){
  if(!arr.length)return '<div class="empty">Nenhuma conta a pagar.</div>';

  const desktop=`<div class="table-wrap desktop-table"><table class="table"><thead><tr><th>Vencimento</th><th>Empresa</th><th>Favorecido</th><th>Descrição</th><th>Valor em aberto</th><th>Status</th>${actions?'<th></th>':''}</tr></thead><tbody>${arr.map(p=>{
    const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;
    const hasConfigured=!!(p.payment_method||p.pix_key||p.boleto_code);
    const hasHistory=zielPayablePaymentRows(p.id).length>0||Number(p.paid_amount||0)>0||p.status==='Pago';
    return `<tr>
      <td>${br(p.due_date)}</td>
      <td>${esc(businessName(p.business_id))}</td>
      <td>${esc(p.supplier)}</td>
      <td>${esc(p.description)}${p.payment_method?`<div class="mini">${esc(p.payment_method)}</div>`:''}</td>
      <td><b>${fmt(payableOpenAmount(p))}</b></td>
      <td>${badge(st)}</td>
      ${actions?`<td><div class="actions">
        ${hasConfigured||hasHistory?`<button class="btn btn-soft" data-payment-details="${p.id}">Detalhes do pagamento</button>`:''}
        ${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}
        <button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button>
      </div></td>`:''}
    </tr>`;
  }).join('')}</tbody></table></div>`;

  const mobile=`<div class="mobile-cards">${arr.map(p=>{
    const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;
    const hasConfigured=!!(p.payment_method||p.pix_key||p.boleto_code);
    const hasHistory=zielPayablePaymentRows(p.id).length>0||Number(p.paid_amount||0)>0||p.status==='Pago';
    return `<div class="mobile-record">
      <div class="mobile-record-head">
        <div class="mobile-record-title">${esc(p.description)}</div>
        <div class="mobile-record-value">${fmt(payableOpenAmount(p))}</div>
      </div>
      <div class="mobile-record-grid">
        <div class="mobile-field"><span>Vencimento</span><b>${br(p.due_date)}</b></div>
        <div class="mobile-field"><span>Status</span><div>${badge(st)}</div></div>
        <div class="mobile-field"><span>Empresa</span><b>${esc(businessName(p.business_id))}</b></div>
        <div class="mobile-field"><span>Favorecido</span><b>${esc(p.supplier)}</b></div>
        ${p.payment_method?`<div class="mobile-field"><span>Pagamento</span><b>${esc(p.payment_method)}</b></div>`:''}
      </div>
      ${actions?`<div class="mobile-record-actions">
        ${hasConfigured||hasHistory?`<button class="btn btn-soft" data-payment-details="${p.id}">Detalhes do pagamento</button>`:''}
        ${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}
        <button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button>
      </div>`:''}
    </div>`;
  }).join('')}</div>`;

  return desktop+mobile;
};
