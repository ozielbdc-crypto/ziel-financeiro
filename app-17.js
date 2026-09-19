// Extensão: dados de pagamento em contas a pagar + leitura de código de barras

function zielPaymentFields(prefix, data={}){
  const method=data.payment_method||'';
  const pixType=data.pix_key_type||'';
  const pixKey=data.pix_key||'';
  const boleto=data.boleto_code||'';
  return `
    <div class="span-2 card" style="box-shadow:none;padding:12px;margin-top:4px">
      <div class="section-head"><div><b>Dados de pagamento</b><div class="mini">Opcional</div></div></div>
      <div class="form-grid">
        <div class="field">
          <label>Forma de pagamento</label>
          <select id="${prefix}PayMethod">
            <option value="">Não informado</option>
            <option value="Pix" ${method==='Pix'?'selected':''}>Pix</option>
            <option value="Boleto" ${method==='Boleto'?'selected':''}>Boleto</option>
            <option value="Transferência" ${method==='Transferência'?'selected':''}>Transferência</option>
            <option value="Dinheiro" ${method==='Dinheiro'?'selected':''}>Dinheiro</option>
            <option value="Cartão" ${method==='Cartão'?'selected':''}>Cartão</option>
            <option value="Outro" ${method==='Outro'?'selected':''}>Outro</option>
          </select>
        </div>
        <div class="field ziel-pix-field" data-prefix="${prefix}" style="display:none">
          <label>Tipo de chave Pix</label>
          <select id="${prefix}PixType">
            <option value="">Selecione</option>
            <option value="CPF/CNPJ" ${pixType==='CPF/CNPJ'?'selected':''}>CPF/CNPJ</option>
            <option value="Telefone" ${pixType==='Telefone'?'selected':''}>Telefone</option>
            <option value="E-mail" ${pixType==='E-mail'?'selected':''}>E-mail</option>
            <option value="Aleatória" ${pixType==='Aleatória'?'selected':''}>Aleatória</option>
          </select>
        </div>
        <div class="field span-2 ziel-pix-field" data-prefix="${prefix}" style="display:none">
          <label>Chave Pix</label>
          <div class="actions" style="align-items:center">
            <input class="input" id="${prefix}PixKey" value="${esc(pixKey)}" style="flex:1">
            <button type="button" class="btn btn-soft" data-copy-input="${prefix}PixKey">Copiar chave</button>
          </div>
        </div>
        <div class="field span-2 ziel-boleto-field" data-prefix="${prefix}" style="display:none">
          <label>Código de barras / linha digitável</label>
          <div class="actions" style="align-items:center;flex-wrap:wrap">
            <input class="input" id="${prefix}BoletoCode" value="${esc(boleto)}" style="flex:1;min-width:220px">
            <button type="button" class="btn btn-soft" data-copy-input="${prefix}BoletoCode">Copiar código</button>
            <button type="button" class="btn btn-soft" data-scan-barcode="${prefix}BoletoCode">Ler pela câmera</button>
          </div>
        </div>
      </div>
    </div>`;
}

function zielBindPaymentFields(prefix){
  const sel=document.getElementById(prefix+'PayMethod');
  if(!sel) return;
  const paint=()=>{
    const m=sel.value;
    document.querySelectorAll('.ziel-pix-field[data-prefix="'+prefix+'"]').forEach(x=>x.style.display=m==='Pix'?'':'none');
    document.querySelectorAll('.ziel-boleto-field[data-prefix="'+prefix+'"]').forEach(x=>x.style.display=m==='Boleto'?'':'none');
  };
  sel.onchange=paint;
  paint();
}

function zielPaymentData(prefix){
  const method=document.getElementById(prefix+'PayMethod')?.value||null;
  return {
    payment_method:method||null,
    pix_key_type:method==='Pix'?(document.getElementById(prefix+'PixType')?.value||null):null,
    pix_key:method==='Pix'?(document.getElementById(prefix+'PixKey')?.value.trim()||null):null,
    boleto_code:method==='Boleto'?(document.getElementById(prefix+'BoletoCode')?.value.trim()||null):null
  };
}

async function zielCopyInput(id){
  const el=document.getElementById(id);
  if(!el||!el.value) return toast('Nada para copiar.','error');
  try{
    await navigator.clipboard.writeText(el.value);
    toast('Copiado.');
  }catch(_){
    el.select();
    document.execCommand('copy');
    toast('Copiado.');
  }
}

async function zielLoadZXing(){
  if(window.ZXing?.BrowserMultiFormatReader) return window.ZXing;
  await new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ziel-zxing]');
    if(existing){
      if(window.ZXing?.BrowserMultiFormatReader) return resolve();
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
    s.async=true;
    s.dataset.zielZxing='1';
    s.onload=resolve;
    s.onerror=()=>reject(new Error('Falha ao carregar leitor de código.'));
    document.head.appendChild(s);
  });
  if(!window.ZXing?.BrowserMultiFormatReader) throw new Error('Leitor alternativo indisponível.');
  return window.ZXing;
}

async function zielScanBarcodeToInput(inputId){
  if(!navigator.mediaDevices?.getUserMedia) return toast('A câmera não está disponível neste navegador.','error');

  let stopped=false, zxingReader=null, controls=null;
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px';
  overlay.innerHTML=`<div style="width:min(620px,100%);background:#fff;border-radius:14px;padding:14px">
    <div class="section-head">
      <div><b>Ler código</b><div class="mini">Compatível com boleto e QR Code</div></div>
      <button type="button" class="btn btn-soft" id="zielStopScan">Fechar</button>
    </div>
    <div style="position:relative">
      <video id="zielScanVideo" autoplay playsinline muted style="width:100%;border-radius:10px;background:#000;max-height:68vh;object-fit:contain"></video>
      <div style="position:absolute;left:6%;right:6%;top:38%;height:24%;border:2px solid rgba(255,255,255,.9);border-radius:8px;pointer-events:none"></div>
    </div>
    <div class="mini" id="zielScanStatus" style="margin-top:8px">Carregando leitor...</div>
  </div>`;
  document.body.appendChild(overlay);

  const video=overlay.querySelector('#zielScanVideo');
  const status=overlay.querySelector('#zielScanStatus');

  const stop=()=>{
    if(stopped) return;
    stopped=true;
    try{controls?.stop?.();}catch(_){}
    try{zxingReader?.reset?.();}catch(_){}
    const s=video.srcObject;
    if(s?.getTracks) s.getTracks().forEach(t=>t.stop());
    overlay.remove();
  };

  const accept=value=>{
    value=String(value||'').trim();
    if(!value) return false;
    const input=document.getElementById(inputId);
    if(input) input.value=value;
    stop();
    toast('Código lido com sucesso.');
    return true;
  };

  overlay.querySelector('#zielStopScan').onclick=stop;

  try{
    status.textContent='Carregando mecanismo de leitura...';
    const ZXing=await zielLoadZXing();
    if(stopped) return;

    const formats=[
      ZXing.BarcodeFormat.ITF,
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.CODABAR,
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.QR_CODE
    ].filter(Boolean);

    const hints=new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,formats);
    hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
    try{hints.set(ZXing.DecodeHintType.ALSO_INVERTED,true);}catch(_){}

    zxingReader=new ZXing.BrowserMultiFormatReader(hints,200);

    const constraints={
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:3840,min:1280},
        height:{ideal:2160,min:720},
        aspectRatio:{ideal:16/9}
      },
      audio:false
    };

    status.textContent='Abrindo câmera traseira em alta resolução...';

    const onResult=(result,err)=>{
      if(stopped) return;
      if(result){
        const value=result.getText?result.getText():result.text;
        if(accept(value)) return;
      }
    };

    if(typeof zxingReader.decodeFromConstraints==='function'){
      controls=await zxingReader.decodeFromConstraints(constraints,video,onResult);
    }else{
      controls=await zxingReader.decodeFromVideoDevice(undefined,video,onResult);
    }

    video.addEventListener('loadedmetadata',async()=>{
      if(stopped) return;
      const stream=video.srcObject;
      const track=stream?.getVideoTracks?.()[0];
      try{
        const caps=track?.getCapabilities?.()||{};
        const advanced={};
        if(caps.focusMode?.includes('continuous')) advanced.focusMode='continuous';
        if(caps.zoom){
          const min=Number(caps.zoom.min||1), max=Number(caps.zoom.max||1);
          if(max>min) advanced.zoom=Math.min(max,Math.max(min,1.5));
        }
        if(Object.keys(advanced).length) await track.applyConstraints({advanced:[advanced]});
      }catch(_){}
      const settings=track?.getSettings?.()||{};
      status.textContent=`Leitor ativo · ${settings.width||video.videoWidth||'?'}×${settings.height||video.videoHeight||'?'} · boleto/QR habilitados`;
    },{once:true});

  }catch(e){
    stop();
    toast('Não foi possível iniciar o leitor: '+(e.message||'erro desconhecido'),'error');
  }
}

document.addEventListener('click',e=>{
  const copy=e.target.closest('[data-copy-input]');
  if(copy) zielCopyInput(copy.dataset.copyInput);
  const scan=e.target.closest('[data-scan-barcode]');
  if(scan) zielScanBarcodeToInput(scan.dataset.scanBarcode);
});

// Nova conta a pagar / conta a receber
accountForm = function(kind){
  const pay=kind==='pay';
  return `<form id="accountForm" class="form-grid">
    <div class="field"><label>Empresa</label><select id="aBiz" required>${businessOptions(false,state.businessFilter)}</select></div>
    <div class="field"><label>${pay?'Favorecido':'Cliente / Origem'}</label><input class="input" id="aParty" required></div>
    <div class="field"><label>Categoria</label><select id="aCat" required>${categoryOptions(pay?'Saída':'Entrada')}</select></div>
    <div class="field"><label>Valor</label><input class="input" id="aAmount" type="number" step="0.01" min="0" required></div>
    <div class="field span-2"><label>Descrição</label><input class="input" id="aDesc" required></div>
    <div class="field"><label>Emissão</label><input class="input" id="aIssue" type="date" value="${iso()}" required></div>
    <div class="field"><label>Vencimento</label><input class="input" id="aDue" type="date" value="${iso()}" required></div>
    <div class="field"><label>Documento</label><input class="input" id="aDoc"></div>
    ${pay?zielPaymentFields('a'):''}
    <div class="actions span-2"><button class="btn btn-primary">Salvar</button></div>
  </form>`;
};

bindAccount = function(kind){
  const pay=kind==='pay';
  if(pay) zielBindPaymentFields('a');
  $('accountForm').onsubmit=async e=>{
    e.preventDefault();
    const row={
      business_id:$('aBiz').value,
      [pay?'supplier':'customer']:$('aParty').value,
      category:$('aCat').value,
      description:$('aDesc').value,
      document:$('aDoc').value||null,
      amount:Number($('aAmount').value),
      issue_date:$('aIssue').value,
      due_date:$('aDue').value,
      status:'Pendente',
      ...(pay?zielPaymentData('a'):{})
    };
    await perform(()=>supabase.from(pay?'payables':'receivables').insert(row),pay?'Conta a pagar cadastrada.':'Conta a receber cadastrada.');
  };
};

// Conta fixa
openRecurringPayable = function(){
  modal('Nova conta fixa',`<form id="fixedForm" class="form-grid">
    <div class="field"><label>Empresa</label><select id="fBiz" required>${businessOptions(false,state.businessFilter)}</select></div>
    <div class="field"><label>Favorecido</label><input class="input" id="fSupplier" required></div>
    <div class="field"><label>Categoria</label><select id="fCat" required>${categoryOptions('Saída')}</select></div>
    <div class="field"><label>Valor padrão</label><input class="input" id="fAmount" type="number" step="0.01" min="0" required></div>
    <div class="field span-2"><label>Descrição</label><input class="input" id="fDesc" required></div>
    <div class="field"><label>Dia do vencimento</label><input class="input" id="fDay" type="number" min="1" max="31" value="10" required></div>
    <div class="field"><label>Início</label><input class="input" id="fStart" type="date" value="${iso()}" required></div>
    <div class="field"><label>Fim (opcional)</label><input class="input" id="fEnd" type="date"></div>
    <div class="field span-2"><label>Observações</label><textarea id="fNotes"></textarea></div>
    ${zielPaymentFields('f')}
    <div class="actions span-2"><button class="btn btn-primary">Salvar recorrência</button></div>
  </form>`);
  zielBindPaymentFields('f');
  $('fixedForm').onsubmit=async e=>{
    e.preventDefault();
    const p=zielPaymentData('f');
    await perform(()=>supabase.rpc('create_recurring_payable_with_payment',{
      p_business:$('fBiz').value,
      p_supplier:$('fSupplier').value,
      p_category:$('fCat').value,
      p_description:$('fDesc').value,
      p_amount:Number($('fAmount').value),
      p_due_day:Number($('fDay').value),
      p_start_date:$('fStart').value,
      p_end_date:$('fEnd').value||null,
      p_notes:$('fNotes').value||null,
      p_payment_method:p.payment_method,
      p_pix_key_type:p.pix_key_type,
      p_pix_key:p.pix_key,
      p_boleto_code:p.boleto_code
    }),'Conta fixa cadastrada.');
  };
};

openEditRecurringPayable = function(id){
  const r=state.recurring_payables.find(x=>x.id===id);
  if(!r) return toast('Conta fixa não encontrada.','error');
  modal('Editar conta fixa',`<form id="editFixedForm" class="form-grid">
    <div class="field"><label>Empresa</label><select id="efBiz" required>${businessOptions(false,r.business_id)}</select></div>
    <div class="field"><label>Favorecido</label><input class="input" id="efSupplier" value="${esc(r.supplier||'')}" required></div>
    <div class="field"><label>Categoria</label><select id="efCat" required>${categoryOptions('Saída',r.category)}</select></div>
    <div class="field"><label>Valor padrão</label><input class="input" id="efAmount" type="number" step="0.01" min="0" value="${Number(r.amount||0)}" required></div>
    <div class="field span-2"><label>Descrição</label><input class="input" id="efDesc" value="${esc(r.description||'')}" required></div>
    <div class="field"><label>Dia do vencimento</label><input class="input" id="efDay" type="number" min="1" max="31" value="${Number(r.due_day||1)}" required></div>
    <div class="field"><label>Início</label><input class="input" id="efStart" type="date" value="${r.start_date||''}" required></div>
    <div class="field"><label>Fim (opcional)</label><input class="input" id="efEnd" type="date" value="${r.end_date||''}"></div>
    <div class="field span-2"><label>Observações</label><textarea id="efNotes">${esc(r.notes||'')}</textarea></div>
    ${zielPaymentFields('ef',r)}
    <div class="span-2 mini">As alterações valem para os próximos vencimentos ainda não gerados. Parcelas já criadas permanecem como estão.</div>
    <div class="actions span-2"><button class="btn btn-primary">Salvar alterações</button></div>
  </form>`);
  zielBindPaymentFields('ef');
  $('editFixedForm').onsubmit=async e=>{
    e.preventDefault();
    const start=$('efStart').value,end=$('efEnd').value||null;
    if(end&&end<start) return toast('A data final não pode ser anterior à data inicial.','error');
    await perform(()=>supabase.from('recurring_payables').update({
      business_id:$('efBiz').value,
      supplier:$('efSupplier').value.trim(),
      category:$('efCat').value,
      amount:Number($('efAmount').value),
      description:$('efDesc').value.trim(),
      due_day:Number($('efDay').value),
      start_date:start,
      end_date:end,
      notes:$('efNotes').value.trim()||null,
      ...zielPaymentData('ef'),
      updated_at:new Date().toISOString()
    }).eq('id',id),'Conta fixa atualizada.');
  };
};

// Contas parceladas
openInstallmentPayables = function(){
  modal('Contas a pagar parcelado',`<form id="installmentPayForm" class="form-grid">
    <div class="field"><label>Empresa</label><select id="ipBiz" required>${businessOptions(false,state.businessFilter)}</select></div>
    <div class="field"><label>Favorecido</label><input class="input" id="ipSupplier" required></div>
    <div class="field"><label>Categoria</label><select id="ipCat" required>${categoryOptions('Saída')}</select></div>
    <div class="field"><label>Valor total da compra</label><input class="input" id="ipTotal" type="number" step="0.01" min="0.01" required></div>
    <div class="field span-2"><label>Descrição</label><input class="input" id="ipDesc" required></div>
    <div class="field"><label>Data da compra / emissão</label><input class="input" id="ipIssue" type="date" value="${iso()}" required></div>
    <div class="field"><label>Documento / NF</label><input class="input" id="ipDoc"></div>
    <div class="field span-2"><label>Forma de pagamento</label><select id="ipPayMethod"><option value="">Não informado</option><option>Pix</option><option>Boleto</option><option>Transferência</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select></div>
    <div id="ipPixCommon" class="span-2" style="display:none">
      <div class="form-grid">
        <div class="field"><label>Tipo de chave Pix</label><select id="ipPixType"><option value="">Selecione</option><option>CPF/CNPJ</option><option>Telefone</option><option>E-mail</option><option>Aleatória</option></select></div>
        <div class="field"><label>Chave Pix</label><div class="actions"><input class="input" id="ipPixKey" style="flex:1"><button type="button" class="btn btn-soft" data-copy-input="ipPixKey">Copiar chave</button></div></div>
      </div>
    </div>
    <div class="span-2"><div class="section-head"><div><h3>Parcelas</h3><span class="mini">Informe vencimento e valor de cada parcela.</span></div><button type="button" class="btn btn-soft" id="addInstallmentRow">+ Adicionar parcela</button></div><div id="installmentRows"></div></div>
    <div class="span-2 card" style="box-shadow:none"><div class="section-head"><span><b>Total informado</b><div class="mini" id="ipTotalLabel">R$ 0,00</div></span><span><b>Soma das parcelas</b><div class="mini" id="ipSumLabel">R$ 0,00</div></span><span><b>Diferença</b><div class="mini" id="ipDiffLabel">R$ 0,00</div></span></div></div>
    <div class="actions span-2"><button class="btn btn-primary">Salvar todos</button></div>
  </form>`);

  const rows=$('installmentRows');
  const payMethod=$('ipPayMethod');
  const paintCommon=()=>{$('ipPixCommon').style.display=payMethod.value==='Pix'?'':'none'; paintRows();};

  const addRow=(due='',amount='')=>{
    const n=rows.querySelectorAll('.installment-row').length+1;
    const div=document.createElement('div');
    div.className='installment-row card';
    div.style.cssText='box-shadow:none;margin-bottom:10px;padding:12px';
    div.innerHTML=`<div class="form-grid">
      <div class="field"><label>Parcela ${n} - Vencimento</label><input class="input ipDue" type="date" value="${due}" required></div>
      <div class="field"><label>Valor</label><input class="input ipAmount" type="number" step="0.01" min="0.01" value="${amount}" required></div>
      <div class="field span-2 ipBoletoWrap" style="display:none"><label>Código de barras / linha digitável</label><div class="actions" style="flex-wrap:wrap"><input class="input ipBoletoCode" style="flex:1;min-width:220px"><button type="button" class="btn btn-soft ipCopyBoleto">Copiar código</button><button type="button" class="btn btn-soft ipScanBoleto">Ler pela câmera</button></div></div>
      <div class="actions span-2" style="margin-top:0"><button type="button" class="btn btn-soft removeInstallment">Remover</button></div>
    </div>`;
    rows.appendChild(div);
    div.querySelector('.removeInstallment').onclick=()=>{if(rows.querySelectorAll('.installment-row').length>1){div.remove();renumber();updateTotals();}};
    div.querySelector('.ipAmount').oninput=updateTotals;
    div.querySelector('.ipCopyBoleto').onclick=async()=>{const input=div.querySelector('.ipBoletoCode'); if(!input.value)return toast('Nada para copiar.','error'); try{await navigator.clipboard.writeText(input.value);toast('Copiado.');}catch(_){input.select();document.execCommand('copy');toast('Copiado.');}};
    div.querySelector('.ipScanBoleto').onclick=()=>{const input=div.querySelector('.ipBoletoCode'); if(!input.id)input.id='ipBoleto'+Date.now()+Math.random().toString(16).slice(2); zielScanBarcodeToInput(input.id);};
    updateTotals();paintRows();
  };
  const paintRows=()=>rows?.querySelectorAll('.ipBoletoWrap').forEach(x=>x.style.display=payMethod.value==='Boleto'?'':'none');
  const renumber=()=>rows.querySelectorAll('.installment-row').forEach((r,i)=>{const l=r.querySelector('label');if(l)l.textContent=`Parcela ${i+1} - Vencimento`;});
  const updateTotals=()=>{
    const total=Number($('ipTotal').value||0);
    const sum=[...rows.querySelectorAll('.ipAmount')].reduce((a,x)=>a+Number(x.value||0),0);
    const diff=total-sum;
    $('ipTotalLabel').textContent=fmt(total);$('ipSumLabel').textContent=fmt(sum);$('ipDiffLabel').textContent=fmt(diff);
    $('ipDiffLabel').className='mini '+(Math.abs(diff)<0.01?'g':'r');
  };
  $('ipTotal').oninput=updateTotals;
  $('addInstallmentRow').onclick=()=>addRow();
  payMethod.onchange=paintCommon;
  addRow();addRow();paintCommon();

  $('installmentPayForm').onsubmit=async e=>{
    e.preventDefault();
    const total=Number($('ipTotal').value||0);
    const method=payMethod.value||null;
    const installments=[...rows.querySelectorAll('.installment-row')].map((r,i)=>({
      index:i+1,
      due:r.querySelector('.ipDue').value,
      amount:Number(r.querySelector('.ipAmount').value||0),
      boleto_code:method==='Boleto'?(r.querySelector('.ipBoletoCode').value.trim()||null):null
    }));
    if(installments.some(x=>!x.due||x.amount<=0)) return toast('Preencha vencimento e valor de todas as parcelas.','error');
    const sum=installments.reduce((a,x)=>a+x.amount,0);
    if(Math.abs(total-sum)>=0.01) return toast(`A soma das parcelas (${fmt(sum)}) precisa ser igual ao total da compra (${fmt(total)}).`,'error');
    const description=$('ipDesc').value.trim(),doc=$('ipDoc').value.trim()||null,issue=$('ipIssue').value,supplier=$('ipSupplier').value.trim(),biz=$('ipBiz').value,cat=$('ipCat').value;
    const count=installments.length;
    const pixType=method==='Pix'?($('ipPixType').value||null):null;
    const pixKey=method==='Pix'?($('ipPixKey').value.trim()||null):null;
    const data=installments.map(x=>({
      business_id:biz,supplier,category:cat,description:`${description} - Parcela ${x.index}/${count}`,
      document:doc,amount:x.amount,issue_date:issue,due_date:x.due,status:'Pendente',
      notes:`Conta parcelada ${x.index}/${count} · Total da compra: ${fmt(total)}`,
      payment_method:method,pix_key_type:pixType,pix_key:pixKey,boleto_code:x.boleto_code
    }));
    await perform(()=>supabase.from('payables').insert(data),`${count} contas a pagar cadastradas.`);
  };
};

function zielOpenPaymentDetails(id){
  const p=state.payables.find(x=>x.id===id);
  if(!p) return;
  const method=p.payment_method||'Não informado';
  let details='<div class="empty">Nenhum dado de pagamento cadastrado.</div>';
  if(p.payment_method==='Pix'&&p.pix_key){
    details=`<div class="field"><label>Tipo de chave</label><div>${esc(p.pix_key_type||'—')}</div></div><div class="field"><label>Chave Pix</label><div class="actions"><input class="input" id="viewPixKey" readonly value="${esc(p.pix_key)}" style="flex:1"><button type="button" class="btn btn-soft" data-copy-input="viewPixKey">Copiar chave</button></div></div>`;
  }else if(p.payment_method==='Boleto'&&p.boleto_code){
    details=`<div class="field"><label>Código de barras / linha digitável</label><div class="actions"><input class="input" id="viewBoletoCode" readonly value="${esc(p.boleto_code)}" style="flex:1"><button type="button" class="btn btn-soft" data-copy-input="viewBoletoCode">Copiar código</button></div></div>`;
  }
  modal('Dados de pagamento',`<div class="form-grid"><div class="field"><label>Forma de pagamento</label><div><b>${esc(method)}</b></div></div><div class="field"><label>Favorecido</label><div>${esc(p.supplier||'—')}</div></div><div class="span-2">${details}</div></div>`);
}

payableTable = function(arr, actions=true){
  if(!arr.length) return '<div class="empty">Nenhuma conta a pagar.</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Vencimento</th><th>Empresa</th><th>Favorecido</th><th>Descrição</th><th>Valor</th><th>Status</th>${actions?'<th></th>':''}</tr></thead><tbody>${arr.map(p=>{
    const st=p.status==='Pendente'&&p.due_date<iso()?'Vencido':p.status;
    const hasPayment=!!(p.payment_method||p.pix_key||p.boleto_code);
    return `<tr><td>${br(p.due_date)}</td><td>${esc(businessName(p.business_id))}</td><td>${esc(p.supplier)}</td><td>${esc(p.description)}${p.payment_method?`<div class="mini">${esc(p.payment_method)}</div>`:''}</td><td><b>${fmt(p.amount)}</b></td><td>${badge(st)}</td>${actions?`<td><div class="actions">${hasPayment?`<button class="btn btn-soft" data-payment-details="${p.id}">Dados de pagamento</button>`:''}${p.status==='Pendente'?`<button class="btn btn-green" data-pay="${p.id}">Pagar</button>`:''}<button class="btn btn-soft" data-del-pay="${p.id}">Excluir</button></div></td>`:''}</tr>`;
  }).join('')}</tbody></table></div>`;
};

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-payment-details]');
  if(b) zielOpenPaymentDetails(b.dataset.paymentDetails);
});
