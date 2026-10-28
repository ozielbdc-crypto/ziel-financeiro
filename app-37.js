// Renderizador de código de barras para Contas a Pagar via boleto bancário.
// Escopo intencional: somente boletos; não altera Pix, integrações ou Mercado Pago.

function zielBoletoBarcode44(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(digits.length===44)return digits;

  // Linha digitável bancária (47 dígitos) -> código de barras (44 dígitos).
  if(digits.length===47){
    const barcode=
      digits.slice(0,4)+
      digits.slice(32,33)+
      digits.slice(33,47)+
      digits.slice(4,9)+
      digits.slice(10,20)+
      digits.slice(21,31);
    return /^\d{44}$/.test(barcode)?barcode:null;
  }
  return null;
}

function zielBoletoI25Svg(value){
  const code=zielBoletoBarcode44(value);
  if(!code)throw new Error('Código de boleto bancário inválido. Use código de barras com 44 dígitos ou linha digitável com 47 dígitos.');

  const patterns={
    '0':'nnwwn','1':'wnnnw','2':'nwnnw','3':'wwnnn','4':'nnwnw',
    '5':'wnwnn','6':'nwwnn','7':'nnnww','8':'wnnwn','9':'nwnwn'
  };
  const widths={n:1,w:3};
  const quiet=12;
  const bars=[];
  let x=quiet;

  const bar=(w)=>{bars.push(`<rect x="${x}" y="0" width="${w}" height="100"/>`);x+=w;};
  const space=(w)=>{x+=w;};

  // Start I25: barra estreita, espaço estreito, barra estreita, espaço estreito.
  bar(1);space(1);bar(1);space(1);

  for(let i=0;i<code.length;i+=2){
    const bp=patterns[code[i]],sp=patterns[code[i+1]];
    for(let j=0;j<5;j++){
      bar(widths[bp[j]]);
      space(widths[sp[j]]);
    }
  }

  // Stop I25: barra larga, espaço estreito, barra estreita.
  bar(3);space(1);bar(1);
  const total=x+quiet;

  return `<svg class="zboleto-svg" viewBox="0 0 ${total} 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código de barras do boleto" preserveAspectRatio="none">
    <rect width="${total}" height="100" fill="#fff"/>
    <g fill="#000">${bars.join('')}</g>
  </svg>`;
}

async function zielCopyTextValue(value,message='Código copiado.'){
  try{
    await navigator.clipboard.writeText(String(value||''));
    toast(message);
  }catch(_){
    const ta=document.createElement('textarea');
    ta.value=String(value||'');
    ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    document.execCommand('copy');ta.remove();
    toast(message);
  }
}

function zielOpenBoletoBarcode(payableId){
  const p=(state.payables||[]).find(x=>x.id===payableId);
  if(!p)return toast('Conta a pagar não encontrada.','error');
  if(p.payment_method!=='Boleto'||!p.boleto_code)return toast('Esta conta não possui boleto bancário cadastrado.','error');

  const barcode=zielBoletoBarcode44(p.boleto_code);
  if(!barcode)return toast('O código cadastrado não é um boleto bancário válido de 44/47 dígitos.','error');

  const original=String(p.boleto_code||'').replace(/\D/g,'');
  let svg='';
  try{svg=zielBoletoI25Svg(barcode);}
  catch(error){return toast(error.message,'error');}

  modal('Código de barras — Boleto bancário',`
    <div class="zboleto-view">
      <div class="zboleto-summary">
        <div><small>CONTA</small><strong>${esc(p.description||'Boleto')}</strong><span>${esc(p.supplier||'—')} · ${esc(businessName(p.business_id))}</span></div>
        <div><small>VALOR EM ABERTO</small><strong>${fmt(typeof payableOpenAmount==='function'?payableOpenAmount(p):Number(p.amount||0))}</strong></div>
        <div><small>VENCIMENTO</small><strong>${esc(br(p.due_date))}</strong></div>
      </div>

      <div class="zboleto-instruction">
        <strong>Leia este código com o aplicativo do banco no celular.</strong>
        <span>Aumente o brilho do monitor e mantenha a câmera paralela à tela para facilitar a leitura.</span>
      </div>

      <div class="zboleto-display-card" id="zboletoDisplayCard">
        <div class="zboleto-barcode-wrap">${svg}</div>
        <div class="zboleto-human">${esc(barcode.replace(/(.{4})/g,'$1 ').trim())}</div>
      </div>

      <div class="zboleto-actions">
        <button type="button" class="btn btn-primary" id="zboletoFullscreen">⛶ Tela cheia</button>
        <button type="button" class="btn btn-soft" id="zboletoCopy">Copiar ${original.length===47?'linha digitável':'código'}</button>
        <button type="button" class="btn btn-soft" id="zboletoClose">Fechar</button>
      </div>

      <p class="mini zboleto-note">O ZIEL apenas transforma o código já cadastrado em uma imagem I25/ITF para leitura óptica. Confira no aplicativo do banco o favorecido, o valor e o vencimento antes de confirmar o pagamento.</p>
    </div>
  `);

  const modalEl=document.querySelector('#modalWrap .modal');
  if(modalEl)modalEl.classList.add('zboleto-modal');

  $('zboletoClose').onclick=closeModal;
  $('zboletoCopy').onclick=()=>zielCopyTextValue(original,'Código do boleto copiado.');
  $('zboletoFullscreen').onclick=async()=>{
    const card=$('zboletoDisplayCard');
    if(!card)return;
    try{
      if(!document.fullscreenElement){
        await card.requestFullscreen();
        card.classList.add('is-fullscreen');
      }else{
        await document.exitFullscreen();
      }
    }catch(_){
      card.classList.toggle('is-expanded');
      $('zboletoFullscreen').textContent=card.classList.contains('is-expanded')?'Reduzir':'⛶ Tela cheia';
    }
  };
}

payableTable = function(arr,actions=true){
  if(!arr.length)return '<div class="empty">Nenhuma conta a pagar.</div>';

  const desktop=`<div class="table-wrap desktop-table"><table class="table"><thead><tr><th>Vencimento</th><th>Empresa</th><th>Favorecido</th><th>Descrição</th><th>Valor em aberto</th><th>Status</th>${actions?'<th></th>':''}</tr></thead><tbody>${arr.map(p=>{
    const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;
    const hasConfigured=!!(p.payment_method||p.pix_key||p.boleto_code);
    const hasHistory=typeof zielPayablePaymentRows==='function'?(zielPayablePaymentRows(p.id).length>0||Number(p.paid_amount||0)>0||p.status==='Pago'):(Number(p.paid_amount||0)>0||p.status==='Pago');
    const hasBoleto=p.payment_method==='Boleto'&&!!p.boleto_code;
    return `<tr>
      <td>${br(p.due_date)}</td>
      <td>${esc(businessName(p.business_id))}</td>
      <td>${esc(p.supplier)}</td>
      <td>${esc(p.description)}${p.payment_method?`<div class="mini">${esc(p.payment_method)}</div>`:''}</td>
      <td><b>${fmt(typeof payableOpenAmount==='function'?payableOpenAmount(p):Number(p.amount||0))}</b></td>
      <td>${badge(st)}</td>
      ${actions?`<td><div class="actions">
        ${hasBoleto?`<button class="btn btn-primary" data-boleto-barcode="${p.id}">Gerar código de barras</button>`:''}
        ${hasConfigured||hasHistory?`<button class="btn btn-soft" data-payment-details="${p.id}">Detalhes do pagamento</button>`:''}
        ${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}
        <button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button>
      </div></td>`:''}
    </tr>`;
  }).join('')}</tbody></table></div>`;

  const mobile=`<div class="mobile-cards">${arr.map(p=>{
    const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;
    const hasConfigured=!!(p.payment_method||p.pix_key||p.boleto_code);
    const hasHistory=typeof zielPayablePaymentRows==='function'?(zielPayablePaymentRows(p.id).length>0||Number(p.paid_amount||0)>0||p.status==='Pago'):(Number(p.paid_amount||0)>0||p.status==='Pago');
    const hasBoleto=p.payment_method==='Boleto'&&!!p.boleto_code;
    return `<div class="mobile-record">
      <div class="mobile-record-head">
        <div class="mobile-record-title">${esc(p.description)}</div>
        <div class="mobile-record-value">${fmt(typeof payableOpenAmount==='function'?payableOpenAmount(p):Number(p.amount||0))}</div>
      </div>
      <div class="mobile-record-grid">
        <div class="mobile-field"><span>Vencimento</span><b>${br(p.due_date)}</b></div>
        <div class="mobile-field"><span>Status</span><div>${badge(st)}</div></div>
        <div class="mobile-field"><span>Empresa</span><b>${esc(businessName(p.business_id))}</b></div>
        <div class="mobile-field"><span>Favorecido</span><b>${esc(p.supplier)}</b></div>
        ${p.payment_method?`<div class="mobile-field"><span>Pagamento</span><b>${esc(p.payment_method)}</b></div>`:''}
      </div>
      ${actions?`<div class="mobile-record-actions">
        ${hasBoleto?`<button class="btn btn-primary" data-boleto-barcode="${p.id}">Gerar código de barras</button>`:''}
        ${hasConfigured||hasHistory?`<button class="btn btn-soft" data-payment-details="${p.id}">Detalhes do pagamento</button>`:''}
        ${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}
        <button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button>
      </div>`:''}
    </div>`;
  }).join('')}</div>`;

  return desktop+mobile;
};

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-boleto-barcode]');
  if(btn)zielOpenBoletoBarcode(btn.dataset.boletoBarcode);
});

document.addEventListener('fullscreenchange',()=>{
  const card=$('zboletoDisplayCard');
  if(card&&!document.fullscreenElement)card.classList.remove('is-fullscreen');
});
