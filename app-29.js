// Efí — credenciais Client ID/Secret, teste e integração com consulta manual.
// A credencial composta é serializada em JSON e armazenada no mesmo Vault seguro.

const _zielEfiPrevOpenTokenModal=zielOpenTokenModal;
zielOpenTokenModal=function(walletId,provider=''){
  _zielEfiPrevOpenTokenModal(walletId,provider);

  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  const form=$('zintTokenForm');
  const select=$('zintProvider');
  const token=$('zintToken');
  const help=$('zintProviderHelp');
  if(!wallet||!form||!select||!token)return;

  const tokenField=token.closest('.field');
  if(!tokenField)return;

  const wrap=document.createElement('div');
  wrap.id='zintEfiWrap';
  wrap.className='form-grid hidden';
  wrap.innerHTML=`
    <div class="field">
      <label for="zintEfiClientId">Client ID de produção</label>
      <input class="input" id="zintEfiClientId" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Client_Id da aplicação Efí">
    </div>
    <div class="field">
      <label for="zintEfiClientSecret">Client Secret de produção</label>
      <input class="input" id="zintEfiClientSecret" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Client_Secret da aplicação Efí">
    </div>
    <div class="mini span-2">Use as credenciais de <b>Produção</b> de uma aplicação Efí com a <b>API de Emissão de Cobranças</b> habilitada.</div>
  `;
  tokenField.insertAdjacentElement('afterend',wrap);

  const existing=provider
    ?zielWalletIntegrations.find(i=>i.wallet_id===wallet.id&&i.provider===provider)
    :null;

  const prevChange=select.onchange;
  const paint=()=>{
    const isEfi=select.value==='efi';
    tokenField.classList.toggle('hidden',isEfi);
    wrap.classList.toggle('hidden',!isEfi);
    token.required=!isEfi;
    $('zintEfiClientId').required=isEfi;
    $('zintEfiClientSecret').required=isEfi;

    if(isEfi&&help){
      help.innerHTML='<strong>Efí:</strong> informe o <b>Client ID</b> e o <b>Client Secret de produção</b> da aplicação com a API de Emissão de Cobranças habilitada. O ZIEL obterá o Access Token temporário automaticamente no backend.';
    }
  };
  select.onchange=e=>{
    if(typeof prevChange==='function')prevChange.call(select,e);
    paint();
  };
  paint();

  const prevSubmit=form.onsubmit;
  form.onsubmit=async e=>{
    if(select.value!=='efi'){
      return typeof prevSubmit==='function'?prevSubmit.call(form,e):undefined;
    }

    e.preventDefault();
    const clientId=String($('zintEfiClientId')?.value||'').trim();
    const clientSecret=String($('zintEfiClientSecret')?.value||'').trim();
    if(clientId.length<8||clientSecret.length<8){
      return toast('Informe o Client ID e o Client Secret de produção da Efí.','error');
    }

    const secret=JSON.stringify({
      mode:'billing',
      environment:'production',
      client_id:clientId,
      client_secret:clientSecret
    });

    const btn=$('zintSave');
    if(btn){btn.disabled=true;btn.textContent='Salvando…';}

    try{
      let error;
      if(existing){
        ({error}=await supabase.rpc('replace_wallet_integration_token',{
          p_wallet_id:wallet.id,
          p_current_provider:existing.provider,
          p_new_provider:'efi',
          p_token:secret
        }));
      }else{
        ({error}=await supabase.rpc('save_wallet_integration_token',{
          p_wallet_id:wallet.id,
          p_provider:'efi',
          p_token:secret
        }));
      }
      if(error)throw error;

      $('zintEfiClientId').value='';
      $('zintEfiClientSecret').value='';
      closeModal();
      await zielLoadWalletIntegrations();
      if(document.querySelector('.nav button.active')?.dataset.page==='integracoes')zielPaintIntegrations();
      toast(existing?'Credenciais Efí atualizadas com segurança.':'Credenciais Efí configuradas com segurança.');
    }catch(error){
      toast('Não foi possível salvar a Efí: '+(error?.message||'erro desconhecido'),'error');
      if($('zintSave')){
        $('zintSave').disabled=false;
        $('zintSave').textContent=existing?'Substituir token':'Salvar token';
      }
    }
  };
};

const _zielEfiPrevIntegrationRow=zielIntegrationRow;
zielIntegrationRow=function(wallet,integration){
  let html=_zielEfiPrevIntegrationRow(wallet,integration);
  if(integration.provider==='efi'&&integration.enabled!==false&&!html.includes('data-zint-test=')){
    html=html.replace(
      '<div class="zint-provider-actions">',
      '<div class="zint-provider-actions"><button type="button" class="btn btn-primary" data-zint-test="'+esc(wallet.id)+'" data-zint-provider="efi">Testar conexão</button>'
    );
  }
  return html;
};

const _zielEfiPrevTestIntegration=zielTestIntegration;
zielTestIntegration=async function(walletId,provider){
  if(provider!=='efi')return _zielEfiPrevTestIntegration(walletId,provider);

  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  const button=document.querySelector('[data-zint-test="'+CSS.escape(walletId)+'"][data-zint-provider="efi"]');
  const original=button?.textContent||'Testar conexão';
  if(button){button.disabled=true;button.textContent='Testando…';}

  try{
    const {data,error}=await supabase.functions.invoke('wallet-integration-query-efi',{
      body:{wallet_id:walletId,provider:'efi',test_only:true}
    });

    if(error){
      let message=error.message||'Falha ao testar integração.';
      try{
        const response=error.context;
        if(response&&typeof response.clone==='function'){
          const payload=await response.clone().json();
          if(payload?.error)message=payload.error;
        }
      }catch(_){}
      throw new Error(message);
    }
    if(!data?.ok)throw new Error(data?.error||'A Efí não confirmou a conexão.');

    await zielLoadWalletIntegrations();
    modal('Teste de conexão — Efí',`
      <div class="zint-test-result">
        <div class="zint-test-success">
          <span>✓</span>
          <div><strong>Conexão realizada com sucesso</strong><p>O Client ID e o Client Secret foram aceitos pela API de Cobranças da Efí.</p></div>
        </div>
        <div class="zint-test-wallet">
          <small>CARTEIRA</small>
          <strong>${esc(wallet.name)}</strong>
          <span>${esc(businessName(wallet.business_id))}</span>
        </div>
        <div class="zint-test-grid">
          <div><small>Ambiente</small><strong>Produção</strong></div>
          <div><small>Autenticação</small><strong>OAuth2 · Client Credentials</strong></div>
        </div>
        <p class="mini">Este teste somente autentica a aplicação Efí. Nenhuma cobrança foi importada nem lançada no financeiro.</p>
        <div class="actions"><button type="button" class="btn btn-primary" id="zintTestClose">Fechar</button></div>
      </div>
    `);
    $('zintTestClose').onclick=closeModal;
    toast('Efí conectada com sucesso.');
  }catch(error){
    toast('Teste falhou: '+(error?.message||'erro desconhecido'),'error');
    await zielLoadWalletIntegrations().catch(()=>{});
  }finally{
    if(button&&document.body.contains(button)){
      button.disabled=false;
      button.textContent=original;
    }
  }
};
