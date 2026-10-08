// Integrações por carteira — tokens ficam criptografados no Supabase Vault.
// O frontend recebe apenas metadados e nunca consegue reler o token salvo.

let zielWalletIntegrations=[];
let zielIntegrationRenderSeq=0;

function zielIntegrationProviderLabel(provider){
  return {
    mercado_pago:'Mercado Pago',
    asaas:'Asaas',
    efi:'Efí',
    lytex:'Lytex',
    sgp:'SGP',
    outro:'Outro / API'
  }[provider]||provider||'Integração';
}

function zielIntegrationSuggestedProvider(wallet){
  const name=String(wallet?.name||'').toLocaleLowerCase('pt-BR');
  if(name.includes('mercado pago')||name.includes('mecado pago'))return 'mercado_pago';
  if(name.includes('asaas'))return 'asaas';
  if(name.includes('efi')||name.includes('efí')||name.includes('gerencianet'))return 'efi';
  if(name.includes('lytex'))return 'lytex';
  if(name.includes('sgp'))return 'sgp';
  return 'mercado_pago';
}

function zielIntegrationProviderStatusLabel(status){
  const s=String(status||'').trim().toLowerCase();
  const map={
    approved:'Aprovado',
    pending:'Pendente',
    in_process:'Em processamento',
    rejected:'Rejeitado',
    cancelled:'Cancelado',
    canceled:'Cancelado',
    refunded:'Reembolsado',
    charged_back:'Estornado',
    received:'Recebido',
    confirmed:'Confirmado',
    overdue:'Vencido',
    received_in_cash:'Recebido em dinheiro',
    refund_requested:'Reembolso solicitado',
    refund_in_progress:'Reembolso em andamento'
  };
  return map[s]||status||'—';
}

function zielIntegrationStamp(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

async function zielLoadWalletIntegrations(){
  const {data,error}=await supabase.rpc('list_wallet_integrations');
  if(error)throw error;
  zielWalletIntegrations=Array.isArray(data)?data:[];
  return zielWalletIntegrations;
}

function zielIntegrationRow(wallet,integration){
  const label=zielIntegrationProviderLabel(integration.provider);
  return `<div class="zint-provider ${integration.enabled===false?'is-disabled':''}">
    <div class="zint-provider-main">
      <span class="zint-provider-icon">${integration.provider==='mercado_pago'?'MP':integration.provider==='asaas'?'AS':integration.provider==='efi'?'EFÍ':integration.provider==='lytex'?'LY':integration.provider==='sgp'?'SGP':'API'}</span>
      <div>
        <strong>${esc(label)}</strong>
        <span>${integration.enabled===false?'Token pausado':'Token configurado'} · atualizado em ${esc(zielIntegrationStamp(integration.updated_at))}</span>
      </div>
    </div>
    <div class="zint-provider-actions">
      ${['mercado_pago','asaas'].includes(integration.provider)&&integration.enabled!==false
        ?`<button type="button" class="btn btn-primary" data-zint-test="${esc(wallet.id)}" data-zint-provider="${esc(integration.provider)}">Testar conexão</button>`
        :''}
      <button type="button" class="btn btn-soft" data-zint-edit="${esc(wallet.id)}" data-zint-provider="${esc(integration.provider)}">Atualizar token</button>
      <button type="button" class="btn btn-soft" data-zint-toggle="${esc(wallet.id)}" data-zint-provider="${esc(integration.provider)}" data-zint-enabled="${integration.enabled!==false?'1':'0'}">${integration.enabled!==false?'Pausar':'Ativar'}</button>
      <button type="button" class="btn btn-danger zint-remove" data-zint-remove="${esc(wallet.id)}" data-zint-provider="${esc(integration.provider)}">Remover</button>
    </div>
  </div>`;
}

function zielIntegrationWalletCard(wallet){
  const integrations=zielWalletIntegrations.filter(i=>i.wallet_id===wallet.id);
  const active=wallet.active!==false;
  const current=typeof zielPositionSystemBalance==='function'?zielPositionSystemBalance(wallet):walletBalance(wallet);

  return `<article class="zint-wallet-card ${active?'':'is-inactive'}">
    <div class="zint-wallet-head">
      <div>
        <span class="zint-wallet-type">${esc(zielWalletTypeLabel?zielWalletTypeLabel(wallet.type):wallet.type||'Carteira')}</span>
        <h3>${esc(wallet.name)}</h3>
        <span class="mini">${esc(businessName(wallet.business_id))}</span>
      </div>
      <span class="zint-wallet-status ${active?'active':'inactive'}">${active?'Ativa':'Inativa'}</span>
    </div>
    <div class="zint-wallet-meta">
      <span>Saldo registrado <strong class="${current<0?'r':''}">${fmt(current)}</strong></span>
      <span>${integrations.length} integração${integrations.length===1?'':'ões'} configurada${integrations.length===1?'':'s'}</span>
    </div>
    <div class="zint-provider-list">
      ${integrations.length?integrations.map(i=>zielIntegrationRow(wallet,i)).join(''):'<div class="zint-empty-token"><strong>Nenhum token configurado.</strong><span>O token será guardado de forma criptografada e não ficará visível no navegador.</span></div>'}
    </div>
    <div class="zint-wallet-actions">
      <button type="button" class="btn btn-primary" data-zint-add="${esc(wallet.id)}">+ Configurar token</button>
    </div>
  </article>`;
}

function zielOpenTokenModal(walletId,provider=''){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  const selected=provider||zielIntegrationSuggestedProvider(wallet);
  const existing=provider?zielWalletIntegrations.find(i=>i.wallet_id===wallet.id&&i.provider===provider):null;

  modal(existing?'Atualizar token da carteira':'Configurar token da carteira',`
    <form id="zintTokenForm" class="zint-token-form">
      <div class="zint-token-wallet">
        <span>${esc(zielWalletTypeLabel?zielWalletTypeLabel(wallet.type):wallet.type||'Carteira')}</span>
        <strong>${esc(wallet.name)}</strong>
        <small>${esc(businessName(wallet.business_id))}</small>
      </div>

      <div class="field">
        <label for="zintProvider">Instituição / provedor</label>
        <select id="zintProvider">
          <option value="mercado_pago" ${selected==='mercado_pago'?'selected':''}>Mercado Pago</option>
          <option value="asaas" ${selected==='asaas'?'selected':''}>Asaas</option>
          <option value="efi" ${selected==='efi'?'selected':''}>Efí</option>
          <option value="lytex" ${selected==='lytex'?'selected':''}>Lytex</option>
          <option value="sgp" ${selected==='sgp'?'selected':''}>SGP</option>
          <option value="outro" ${selected==='outro'?'selected':''}>Outro / API</option>
        </select>
        <div class="mini">Informe quem emitiu a credencial. Cada provedor usa endpoints e autenticação próprios.</div>
      </div>

      <div class="field">
        <label for="zintToken">Token / chave privada</label>
        <div class="zint-secret-input">
          <input class="input" id="zintToken" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole o token aqui" required>
          <button type="button" class="btn btn-soft" id="zintToggleSecret">Mostrar</button>
        </div>
        <div class="mini">O token precisa ter pelo menos 20 caracteres. Espaços no início ou no final serão removidos.</div>
      </div>

      <div class="zint-security">
        <strong>🔒 Armazenamento protegido</strong>
        <span>Depois de salvar, o ZIEL mostrará apenas que o token está configurado. O valor completo não será enviado de volta ao navegador nem exibido nesta página.</span>
      </div>

      <div class="zint-warning" id="zintProviderHelp"></div>

      <div class="actions">
        <button type="button" class="btn btn-soft" id="zintCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="zintSave">${existing?'Substituir token':'Salvar token'}</button>
      </div>
    </form>
  `);

  const token=$('zintToken');
  const providerSelect=$('zintProvider');
  const paintProviderHelp=()=>{
    const p=providerSelect.value;
    const messages={
      mercado_pago:'<strong>Mercado Pago:</strong> use o <b>Access Token de produção</b> da conta correspondente a esta carteira.',
      asaas:'<strong>Asaas:</strong> use a credencial da conta Asaas correspondente a esta carteira.',
      efi:'<strong>Efí:</strong> use a credencial da conta Efí correspondente a esta carteira.',
      lytex:'<strong>Lytex:</strong> use a credencial da conta Lytex correspondente a esta carteira.',
      sgp:'<strong>SGP:</strong> use a credencial da integração correspondente a esta carteira.',
      outro:'<strong>Atenção:</strong> confirme que a credencial pertence exatamente à conta representada por esta carteira.'
    };
    $('zintProviderHelp').innerHTML=messages[p]||messages.outro;
  };
  providerSelect.onchange=paintProviderHelp;
  paintProviderHelp();

  $('zintToggleSecret').onclick=()=>{
    const visible=token.type==='text';
    token.type=visible?'password':'text';
    $('zintToggleSecret').textContent=visible?'Mostrar':'Ocultar';
    token.focus();
  };
  $('zintCancel').onclick=closeModal;

  $('zintTokenForm').onsubmit=async e=>{
    e.preventDefault();
    const value=token.value.trim();
    const providerValue=$('zintProvider').value;

    if(value.length<20)return toast('O token informado parece muito curto.','error');

    const btn=$('zintSave');
    btn.disabled=true;
    btn.textContent='Salvando…';
    try{
      let error;
      if(existing){
        ({error}=await supabase.rpc('replace_wallet_integration_token',{
          p_wallet_id:wallet.id,
          p_current_provider:existing.provider,
          p_new_provider:providerValue,
          p_token:value
        }));
      }else{
        ({error}=await supabase.rpc('save_wallet_integration_token',{
          p_wallet_id:wallet.id,
          p_provider:providerValue,
          p_token:value
        }));
      }
      if(error)throw error;
      token.value='';
      closeModal();
      await zielLoadWalletIntegrations();
      if(document.querySelector('.nav button.active')?.dataset.page==='integracoes')zielPaintIntegrations();
      toast(existing
        ?(providerValue!==existing.provider?'Provedor e token atualizados com segurança.':'Token substituído com segurança.')
        :'Token configurado com segurança.');
    }catch(error){
      toast('Não foi possível salvar o token: '+(error?.message||'erro desconhecido'),'error');
      if($('zintSave')){
        $('zintSave').disabled=false;
        $('zintSave').textContent=existing?'Substituir token':'Salvar token';
      }
    }
  };

  token.focus();
}

async function zielTestIntegration(walletId,provider){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return toast('Carteira não encontrada.','error');

  if(!['mercado_pago','asaas'].includes(provider)){
    return toast('O teste automático está disponível para Mercado Pago e Asaas.','error');
  }

  const providerLabel=zielIntegrationProviderLabel(provider);

  const button=document.querySelector(`[data-zint-test="${CSS.escape(walletId)}"][data-zint-provider="${CSS.escape(provider)}"]`);
  const original=button?.textContent||'Testar conexão';
  if(button){
    button.disabled=true;
    button.textContent='Testando…';
  }

  try{
    const {data,error}=await supabase.functions.invoke('wallet-integration-test',{
      body:{wallet_id:walletId,provider}
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

    if(!data?.ok)throw new Error(data?.error||(providerLabel+' não confirmou a conexão.'));

    await zielLoadWalletIntegrations();

    const last=data.last_payment;
    modal('Teste de conexão — '+providerLabel,`
      <div class="zint-test-result">
        <div class="zint-test-success">
          <span>✓</span>
          <div><strong>Conexão realizada com sucesso</strong><p>A credencial desta carteira foi aceita pela API do ${esc(providerLabel)}.</p></div>
        </div>

        <div class="zint-test-wallet">
          <small>CARTEIRA</small>
          <strong>${esc(wallet.name)}</strong>
          <span>${esc(businessName(wallet.business_id))}</span>
        </div>

        <div class="zint-test-grid">
          <div><small>Período consultado</small><strong>${Number(data.searched_period_days||30)} dias</strong></div>
          <div><small>Registros encontrados</small><strong>${Number(data.total_payments_found||0)}</strong></div>
          ${data.environment?'<div><small>Ambiente</small><strong>'+esc(data.environment==='sandbox'?'Sandbox':'Produção')+'</strong></div>':''}
        </div>

        ${last?`<div class="zint-test-payment">
          <div class="section-head"><h3>Pagamento localizado</h3></div>
          <div class="zint-test-grid">
            <div><small>Valor</small><strong>${fmt(Number(last.amount||0))}</strong></div>
            <div><small>Status</small><strong>${esc(zielIntegrationProviderStatusLabel(last.status))}</strong></div>
            <div><small>ID ${esc(providerLabel)}</small><strong>${esc(String(last.id||'—'))}</strong></div>
            <div><small>Data</small><strong>${last.date_created?esc(new Date(last.date_created).toLocaleString('pt-BR')):'—'}</strong></div>
            ${last.payment_method?'<div><small>Método</small><strong>'+esc(String(last.payment_method))+'</strong></div>':''}
          </div>
        </div>`:'<div class="zint-test-empty"><strong>Conexão OK.</strong><span>Nenhum registro foi localizado nos últimos 30 dias, mas a credencial foi autenticada corretamente.</span></div>'}

        <p class="mini">Este teste somente consulta a API. Nenhum pagamento foi importado nem lançado no financeiro.</p>
        <div class="actions"><button type="button" class="btn btn-primary" id="zintTestClose">Fechar</button></div>
      </div>
    `);
    $('zintTestClose').onclick=closeModal;
    toast(providerLabel+' conectado com sucesso.');
  }catch(error){
    toast('Teste falhou: '+(error?.message||'erro desconhecido'),'error');
    await zielLoadWalletIntegrations().catch(()=>{});
  }finally{
    if(button&&document.body.contains(button)){
      button.disabled=false;
      button.textContent=original;
    }
  }
}

async function zielToggleIntegration(walletId,provider,isEnabled){
  const action=isEnabled?'pausar':'ativar';
  if(!confirm((isEnabled?'Pausar':'Ativar')+' a integração '+zielIntegrationProviderLabel(provider)+' nesta carteira?'))return;
  try{
    const {data,error}=await supabase.rpc('set_wallet_integration_enabled',{
      p_wallet_id:walletId,
      p_provider:provider,
      p_enabled:!isEnabled
    });
    if(error)throw error;
    if(!data)throw new Error('Integração não encontrada.');
    await zielLoadWalletIntegrations();
    zielPaintIntegrations();
    toast('Integração '+(isEnabled?'pausada.':'ativada.'));
  }catch(error){
    toast('Não foi possível '+action+': '+(error?.message||'erro desconhecido'),'error');
  }
}

async function zielRemoveIntegration(walletId,provider){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)return;
  if(!confirm('Remover definitivamente o token '+zielIntegrationProviderLabel(provider)+' de "'+wallet.name+'"? A credencial criptografada também será apagada.'))return;

  try{
    const {data,error}=await supabase.rpc('remove_wallet_integration_token',{
      p_wallet_id:walletId,
      p_provider:provider
    });
    if(error)throw error;
    if(!data)throw new Error('Integração não encontrada.');
    await zielLoadWalletIntegrations();
    zielPaintIntegrations();
    toast('Token removido com segurança.');
  }catch(error){
    toast('Não foi possível remover: '+(error?.message||'erro desconhecido'),'error');
  }
}

function zielBindIntegrationActions(){
  document.querySelectorAll('[data-zint-add]').forEach(btn=>btn.onclick=()=>zielOpenTokenModal(btn.dataset.zintAdd));
  document.querySelectorAll('[data-zint-test]').forEach(btn=>btn.onclick=()=>zielTestIntegration(btn.dataset.zintTest,btn.dataset.zintProvider));
  document.querySelectorAll('[data-zint-edit]').forEach(btn=>btn.onclick=()=>zielOpenTokenModal(btn.dataset.zintEdit,btn.dataset.zintProvider));
  document.querySelectorAll('[data-zint-toggle]').forEach(btn=>btn.onclick=()=>zielToggleIntegration(btn.dataset.zintToggle,btn.dataset.zintProvider,btn.dataset.zintEnabled==='1'));
  document.querySelectorAll('[data-zint-remove]').forEach(btn=>btn.onclick=()=>zielRemoveIntegration(btn.dataset.zintRemove,btn.dataset.zintProvider));
}

function zielPaintIntegrations(){
  const host=$('zintWalletList');
  if(!host)return;

  const status=$('zintStatus')?.value||'active';
  const q=String($('zintSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
  const wallets=(state.wallets||[]).filter(w=>{
    if(state.businessFilter&&w.business_id!==state.businessFilter)return false;
    if(status==='active'&&w.active===false)return false;
    if(status==='configured'&&!zielWalletIntegrations.some(i=>i.wallet_id===w.id))return false;
    if(status==='unconfigured'&&zielWalletIntegrations.some(i=>i.wallet_id===w.id))return false;
    if(q){
      const hay=[w.name,w.type,businessName(w.business_id)].join(' ').toLocaleLowerCase('pt-BR');
      if(!hay.includes(q))return false;
    }
    return true;
  }).sort((a,b)=>{
    if((a.active!==false)!==(b.active!==false))return a.active===false?1:-1;
    const biz=businessName(a.business_id).localeCompare(businessName(b.business_id),'pt-BR');
    return biz||a.name.localeCompare(b.name,'pt-BR');
  });

  const groups=[...new Set(wallets.map(w=>w.business_id))];
  host.innerHTML=groups.map(businessId=>{
    const rows=wallets.filter(w=>w.business_id===businessId);
    const configured=rows.filter(w=>zielWalletIntegrations.some(i=>i.wallet_id===w.id)).length;
    return `<section class="zint-business">
      <div class="zint-business-head">
        <div><h3>${esc(businessName(businessId))}</h3><span>${rows.length} carteira${rows.length===1?'':'s'}</span></div>
        <span>${configured} com integração</span>
      </div>
      <div class="zint-wallet-grid">${rows.map(zielIntegrationWalletCard).join('')}</div>
    </section>`;
  }).join('')||'<div class="empty">Nenhuma carteira encontrada para este filtro.</div>';

  zielBindIntegrationActions();
}

async function renderWalletIntegrations(seq=zielIntegrationRenderSeq){
  $('content').innerHTML=setTitle(
    'Integrações / Tokens',
    'Tokens vinculados por carteira e por instituição / provedor'
  )+`
    <div class="zint-page">
      <div class="zint-hero">
        <div>
          <span class="zint-lock">🔐</span>
          <div><strong>Tokens protegidos no backend</strong><p>As credenciais ficam criptografadas no Supabase Vault. Depois de salvar, o navegador não recebe o token de volta.</p></div>
        </div>
        <div class="zint-hero-stat"><span>Integrações configuradas</span><strong id="zintCount">—</strong></div>
      </div>

      <div class="zint-toolbar">
        <div class="field">
          <label for="zintStatus">Exibir</label>
          <select id="zintStatus">
            <option value="active">Carteiras ativas</option>
            <option value="all">Todas as carteiras</option>
            <option value="configured">Com integração</option>
            <option value="unconfigured">Sem integração</option>
          </select>
        </div>
        <div class="field">
          <label for="zintSearch">Buscar carteira</label>
          <input class="input" id="zintSearch" type="search" placeholder="Carteira, tipo ou negócio">
        </div>
      </div>

      <div id="zintWalletList"><div class="empty">Carregando integrações…</div></div>

      <div class="zint-footnote">
        <strong>Importante:</strong> esta página apenas guarda as credenciais. Nenhuma entrada será importada automaticamente até ativarmos o conector específico do provedor.
      </div>
    </div>`;

  try{
    await zielLoadWalletIntegrations();
    if(seq!==zielIntegrationRenderSeq)return;
    if($('zintCount'))$('zintCount').textContent=String(zielWalletIntegrations.filter(i=>i.enabled!==false).length);
    $('zintStatus').onchange=zielPaintIntegrations;
    $('zintSearch').oninput=zielPaintIntegrations;
    zielPaintIntegrations();
  }catch(error){
    if(seq!==zielIntegrationRenderSeq)return;
    const host=$('zintWalletList');
    if(host)host.innerHTML='<div class="message error">Não foi possível carregar as integrações: '+esc(error?.message||'erro desconhecido')+'</div>';
  }
}

const _zielIntegrationsPreviousRenderShell=renderShell;
renderShell=function(){
  _zielIntegrationsPreviousRenderShell();
  const navEl=document.querySelector('.sidebar .nav');
  if(navEl&&!navEl.querySelector('[data-page="integracoes"]')){
    const btn=document.createElement('button');
    btn.dataset.page='integracoes';
    btn.textContent='🔐 Integrações / Tokens';
    btn.onclick=()=>{showPage('integracoes');document.body.classList.remove('menu-open');};
    const configBtn=navEl.querySelector('[data-page="cadastros"]');
    navEl.insertBefore(btn,configBtn||null);
  }
};

const _zielIntegrationsPreviousShowPage=showPage;
showPage=function(page){
  zielIntegrationRenderSeq++;
  const seq=zielIntegrationRenderSeq;
  if(page==='integracoes'){
    activate(page);
    renderWalletIntegrations(seq);
    return;
  }
  return _zielIntegrationsPreviousShowPage(page);
};
