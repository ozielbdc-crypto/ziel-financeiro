// Configuração completa da API Pix Efí.
// A Efí exige Client ID + Client Secret + certificado P12 (mTLS).

function zielBufferToBase64(buffer){
  const bytes=new Uint8Array(buffer);
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(binary);
}

function zielOpenEfiCredentialsModal(walletId){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  const existing=(zielWalletIntegrations||[]).find(i=>i.wallet_id===wallet.id&&i.provider==='efi');
  const complete=existing&&existing.credential_profile==='efi_pix';

  const incompleteWarning=existing&&!complete
    ?'<div class="zint-warning"><strong>Configuração anterior incompleta:</strong> há um access token temporário salvo para esta carteira. Ele será substituído pelas credenciais permanentes da aplicação Efí.</div>'
    :'';

  const html=
    '<form id="zefiForm" class="zint-token-form">'+
      '<div class="zint-token-wallet">'+
        '<span>CARTEIRA</span>'+
        '<strong>'+esc(wallet.name)+'</strong>'+
        '<small>'+esc(businessName(wallet.business_id))+' · Efí</small>'+
      '</div>'+
      '<div class="zefi-intro">'+
        '<strong>API Pix Efí</strong>'+
        '<span>A Efí usa OAuth2 com autenticação mTLS. O ZIEL precisa das credenciais da aplicação e do certificado P12 para gerar tokens automaticamente.</span>'+
      '</div>'+
      '<div class="zefi-grid">'+
        '<div class="field">'+
          '<label for="zefiClientId">Client ID</label>'+
          '<input class="input" id="zefiClientId" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Client_Id da aplicação" required>'+
        '</div>'+
        '<div class="field">'+
          '<label for="zefiClientSecret">Client Secret</label>'+
          '<input class="input" id="zefiClientSecret" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Client_Secret da aplicação" required>'+
        '</div>'+
        '<div class="field">'+
          '<label for="zefiEnvironment">Ambiente</label>'+
          '<select id="zefiEnvironment">'+
            '<option value="production" selected>Produção</option>'+
            '<option value="sandbox">Homologação / Sandbox</option>'+
          '</select>'+
        '</div>'+
        '<div class="field">'+
          '<label for="zefiP12Password">Senha do P12 (se houver)</label>'+
          '<input class="input" id="zefiP12Password" type="password" autocomplete="new-password" placeholder="Normalmente fica vazio">'+
        '</div>'+
        '<div class="field span-2">'+
          '<label for="zefiP12">Certificado Efí (.p12 ou .pfx)</label>'+
          '<input class="input zefi-file" id="zefiP12" type="file" accept=".p12,.pfx,application/x-pkcs12" required>'+
          '<div class="mini" id="zefiFileNote">Selecione o certificado de produção correspondente à aplicação Efí.</div>'+
        '</div>'+
      '</div>'+
      '<div class="zint-security">'+
        '<strong>🔒 Credenciais protegidas</strong>'+
        '<span>Client ID, Client Secret e o conteúdo do certificado serão armazenados criptografados no Supabase Vault. O navegador não consegue ler esses dados de volta depois de salvar.</span>'+
      '</div>'+
      incompleteWarning+
      '<div class="zint-warning">'+
        '<strong>Permissão necessária:</strong> a aplicação Efí precisa ter o escopo <b>pix.read</b> para consultar os Pix recebidos.'+
      '</div>'+
      '<div class="actions">'+
        '<button type="button" class="btn btn-soft" id="zefiCancel">Cancelar</button>'+
        '<button type="submit" class="btn btn-primary" id="zefiSave">'+(complete?'Substituir credenciais':'Salvar credenciais Efí')+'</button>'+
      '</div>'+
    '</form>';

  modal(complete?'Atualizar credenciais Efí':'Configurar API Pix Efí',html);

  $('zefiCancel').onclick=closeModal;
  $('zefiP12').onchange=()=>{
    const file=$('zefiP12').files&&$('zefiP12').files[0];
    if(!file){
      $('zefiFileNote').textContent='Selecione o certificado de produção correspondente à aplicação Efí.';
      return;
    }
    $('zefiFileNote').textContent=file.name+' · '+Math.max(1,Math.round(file.size/1024))+' KB';
  };

  $('zefiForm').onsubmit=async e=>{
    e.preventDefault();

    const clientId=$('zefiClientId').value.trim();
    const clientSecret=$('zefiClientSecret').value.trim();
    const file=$('zefiP12').files&&$('zefiP12').files[0];
    const password=$('zefiP12Password').value||'';
    const environment=$('zefiEnvironment').value;

    if(clientId.length<8)return toast('Informe o Client ID da Efí.','error');
    if(clientSecret.length<8)return toast('Informe o Client Secret da Efí.','error');
    if(!file)return toast('Selecione o certificado P12/PFX da Efí.','error');
    if(file.size>1500000)return toast('O certificado está acima do limite de 1,5 MB.','error');

    const btn=$('zefiSave');
    btn.disabled=true;
    btn.textContent='Protegendo credenciais…';

    try{
      const base64=zielBufferToBase64(await file.arrayBuffer());
      const result=await supabase.rpc('save_efi_wallet_credentials',{
        p_wallet_id:wallet.id,
        p_client_id:clientId,
        p_client_secret:clientSecret,
        p_p12_base64:base64,
        p_p12_password:password,
        p_environment:environment
      });
      if(result.error)throw result.error;
      if(!result.data)throw new Error('O backend não confirmou a gravação.');

      $('zefiClientId').value='';
      $('zefiClientSecret').value='';
      $('zefiP12Password').value='';
      closeModal();

      await zielLoadWalletIntegrations();
      if(document.querySelector('.nav button.active')&&document.querySelector('.nav button.active').dataset.page==='integracoes'){
        zielPaintIntegrations();
      }
      toast('Credenciais Efí salvas. A consulta manual de Pix foi habilitada.');
    }catch(error){
      toast('Não foi possível salvar as credenciais Efí: '+(error&&error.message?error.message:'erro desconhecido'),'error');
      if($('zefiSave')){
        $('zefiSave').disabled=false;
        $('zefiSave').textContent=complete?'Substituir credenciais':'Salvar credenciais Efí';
      }
    }
  };
}

const _zielEfiPreviousOpenTokenModal=zielOpenTokenModal;
zielOpenTokenModal=function(walletId,provider=''){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  const selected=provider||(wallet?zielIntegrationSuggestedProvider(wallet):'');
  if(selected==='efi')return zielOpenEfiCredentialsModal(walletId);

  _zielEfiPreviousOpenTokenModal(walletId,provider);

  const select=$('zintProvider');
  if(select&&!select.disabled){
    const previous=select.onchange;
    select.onchange=e=>{
      if(typeof previous==='function')previous.call(select,e);
      if(select.value==='efi'){
        closeModal();
        zielOpenEfiCredentialsModal(walletId);
      }
    };
  }
};

const _zielEfiPreviousIntegrationRow=zielIntegrationRow;
zielIntegrationRow=function(wallet,integration){
  if(integration.provider!=='efi')return _zielEfiPreviousIntegrationRow(wallet,integration);

  const complete=integration.credential_profile==='efi_pix';
  const rowClass='zint-provider '+(integration.enabled===false?'is-disabled ':'')+(complete?'':'zefi-incomplete');
  const statusText=complete
    ?(integration.enabled===false?'API Pix configurada · pausada':'API Pix configurada · mTLS pronto')
    :'Configuração incompleta · token temporário não é suficiente para consulta Pix';

  let actions='<button type="button" class="btn '+(complete?'btn-soft':'btn-primary')+'" data-zint-edit="'+esc(wallet.id)+'" data-zint-provider="efi">'+(complete?'Atualizar credenciais':'Completar configuração Efí')+'</button>';
  if(complete){
    actions+='<button type="button" class="btn btn-soft" data-zint-toggle="'+esc(wallet.id)+'" data-zint-provider="efi" data-zint-enabled="'+(integration.enabled!==false?'1':'0')+'">'+(integration.enabled!==false?'Pausar':'Ativar')+'</button>';
  }
  actions+='<button type="button" class="btn btn-danger zint-remove" data-zint-remove="'+esc(wallet.id)+'" data-zint-provider="efi">Remover</button>';

  return '<div class="'+rowClass+'">'+
    '<div class="zint-provider-main">'+
      '<span class="zint-provider-icon">EFÍ</span>'+
      '<div><strong>Efí</strong><span>'+esc(statusText)+'</span></div>'+
    '</div>'+
    '<div class="zint-provider-actions">'+actions+'</div>'+
  '</div>';
};
