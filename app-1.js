
const url = 'https://emlofkiqhqkjnplpadvl.supabase.co';
const anon = 'sb_publishable_-hTfnICEhwJAnJfUDaI2pw_yXU1wA_0';

const supabase = window.supabase.createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});


const app=document.getElementById('app');
const fmt=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const br=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'';
const iso=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
let state={session:null,profile:null,businesses:[],wallets:[],categories:[],transactions:[],payables:[],receivables:[],bank:[],transfers:[],recurring_payables:[],businessFilter:'',charts:{}};

function toast(msg,type='ok'){const x=document.createElement('div');x.className='toast '+type;x.textContent=msg;document.body.appendChild(x);setTimeout(()=>x.remove(),3200)}
function loading(msg='Carregando...'){app.innerHTML=`<div class="auth-shell"><div class="auth-card"><img class="auth-logo" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22260%22%20height%3D%2280%22%20viewBox%3D%220%200%20260%2080%22%3E%3Crect%20width%3D%22260%22%20height%3D%2280%22%20rx%3D%2212%22%20fill%3D%22%2317365D%22%2F%3E%3Ctext%20x%3D%2222%22%20y%3D%2238%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2230%22%20font-weight%3D%22700%22%20fill%3D%22white%22%3EZIEL%3C%2Ftext%3E%3Ctext%20x%3D%2222%22%20y%3D%2261%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2213%22%20fill%3D%22white%22%3EGEST%C3%83O%20EMPRESARIAL%3C%2Ftext%3E%3C%2Fsvg%3E"><p>${esc(msg)}</p></div></div>`}
function moneySign(t){return t.type==='Entrada'?Number(t.amount):-Number(t.amount)}
function businessName(id){return state.businesses.find(x=>x.id===id)?.name||'—'}
function walletName(id){return state.wallets.find(x=>x.id===id)?.name||'—'}
function badge(s){let c=/Pago|Recebido|Conciliado/i.test(s)?'green':/Vencid|Divergente|Cancel/i.test(s)?'red':/Pendente|Não conciliado/i.test(s)?'amber':'blue';return `<span class="badge ${c}">${esc(s)}</span>`}
function filtered(arr,key='business_id'){return state.businessFilter?arr.filter(x=>x[key]===state.businessFilter):arr}
function walletBalance(w){return Number(w.opening_balance||0)+state.transactions.filter(t=>t.wallet_id===w.id).reduce((a,t)=>a+moneySign(t),0)}
function businessOptions(all=true,selected=''){return `${all?'<option value="">Todos os negócios</option>':''}`+state.businesses.filter(b=>b.active!==false).map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.name)}</option>`).join('')}
function walletOptions(business='',selected=''){return state.wallets.filter(w=>w.active!==false&&(!business||w.business_id===business)).map(w=>`<option value="${w.id}" ${w.id===selected?'selected':''}>${esc(businessName(w.business_id))} — ${esc(w.name)}</option>`).join('')}
function categoryOptions(type,selected=''){return state.categories.filter(c=>c.active!==false&&(!type||c.type===type)).map(c=>`<option value="${esc(c.name)}" ${c.name===selected?'selected':''}>${esc(c.name)}</option>`).join('')}

function renderAuth(message=''){
 app.innerHTML=`<div class="auth-shell"><div class="auth-card">
 <img class="auth-logo" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22260%22%20height%3D%2280%22%20viewBox%3D%220%200%20260%2080%22%3E%3Crect%20width%3D%22260%22%20height%3D%2280%22%20rx%3D%2212%22%20fill%3D%22%2317365D%22%2F%3E%3Ctext%20x%3D%2222%22%20y%3D%2238%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2230%22%20font-weight%3D%22700%22%20fill%3D%22white%22%3EZIEL%3C%2Ftext%3E%3Ctext%20x%3D%2222%22%20y%3D%2261%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2213%22%20fill%3D%22white%22%3EGEST%C3%83O%20EMPRESARIAL%3C%2Ftext%3E%3C%2Fsvg%3E" alt="ZIEL Gestão Empresarial"><h1>Acesso ao sistema</h1>
 <p>Entre com seu e-mail e senha.</p>
 ${message?`<div class="message ${message.type||'error'}">${esc(message.text)}</div>`:''}
 <div id="authForm">
 <div class="field"><label>E-mail</label><input class="input" id="email" type="email" required autocomplete="email"></div>
 <div class="field"><label>Senha</label><input class="input" id="password" type="password" minlength="6" required autocomplete="current-password"></div>
 <button class="btn btn-primary btn-block" id="authSubmit" type="button">Entrar</button></div>
 <div class="auth-links"><button id="resetPass">Esqueci a senha</button></div>
 </div></div>`;
 document.getElementById('authSubmit').onclick=async()=>{const email=$('email').value.trim(),password=$('password').value;if(!email||!password)return renderAuth({type:'error',text:'Informe e-mail e senha.'});try{const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json','apikey':anon},body:JSON.stringify({email,password})});const data=await r.json();if(!r.ok)throw new Error(data.error_description||data.msg||data.message||'Falha no login');const {error}=await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(error)throw error;}catch(err){return renderAuth({type:'error',text:'Não foi possível entrar: '+err.message});}};
 document.getElementById('resetPass').onclick=async()=>{const email=prompt('Informe seu e-mail:');if(!email)return;const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});toast(error?error.message:'E-mail de recuperação enviado.',error?'error':'ok')};
}
function $(id){return document.getElementById(id)}

async function bootstrap(){
 const {data:{session}}=await supabase.auth.getSession();state.session=session;if(!session)return renderAuth();loading('Preparando seus dados...');
 const {error}=await supabase.rpc('bootstrap_user');if(error){return renderFatal('Não foi possível preparar o banco.',error.message)}
 await loadAll();renderShell();
}
async function loadAll(){
 try{await supabase.rpc('generate_recurring_payables',{p_until:new Date(Date.now()+40*864e5).toISOString().slice(0,10)})}catch(_){}
 const names=['businesses','wallets','categories','transactions','payables','receivables','bank_entries','transfers','recurring_payables'];
 const orders={transactions:['transaction_date',{ascending:false}],payables:['due_date',{ascending:true}],receivables:['due_date',{ascending:true}],bank_entries:['bank_date',{ascending:false}],businesses:['name',{ascending:true}],wallets:['name',{ascending:true}],categories:['name',{ascending:true}],transfers:['transfer_date',{ascending:false}],recurring_payables:['created_at',{ascending:false}]};
 for(const n of names){let q=supabase.from(n).select('*');if(orders[n])q=q.order(orders[n][0],orders[n][1]);const {data,error}=await q;if(error)throw error;state[n==='bank_entries'?'bank':n]=data||[]}
 const {data:p}=await supabase.from('profiles').select('*').maybeSingle();state.profile=p;
}
function renderFatal(title,detail){app.innerHTML=`<div class="auth-shell"><div class="auth-card"><h1>${esc(title)}</h1><div class="message error">${esc(detail)}</div><button class="btn btn-primary btn-block" onclick="location.reload()">Tentar novamente</button></div></div>`}

function renderShell(){
 app.innerHTML=`<div class="layout"><aside class="sidebar" id="sidebar"><div class="brand"><b>ZIEL Gestão Empresarial</b><small>Soluções que conectam o seu negócio</small><button class="mobile-close" id="menuClose" aria-label="Fechar menu">×</button></div><nav class="nav">
 ${nav('dashboard','▦ Dashboard',true)}${nav('lancamentos','＋ Lançamentos')}${nav('pagar','▣ Contas a pagar')}${nav('receber','▤ Contas a receber')}${nav('carteiras','▥ Carteiras')}${nav('transferencias','⇄ Transferências')}${nav('conciliacao','✓ Conciliação bancária')}${nav('relatorios','◫ Relatórios')}${nav('cadastros','⚙ Configurações')}
 </nav><div class="sidebar-foot">Três negócios. Uma visão. Mais resultados.</div></aside><div class="sidebar-backdrop" id="sidebarBackdrop"></div><main class="main"><header class="topbar"><button class="menu-toggle" id="menuToggle" aria-label="Abrir menu">☰</button><div class="top-left"><b>Empresa:</b><select id="globalBusiness">${businessOptions()}</select></div><div class="user"><div class="avatar">${esc((state.profile?.name||state.session.user.email)[0].toUpperCase())}</div><div class="user-meta"><b>${esc(state.profile?.name||'Administrador')}</b><div class="mini">${esc(state.session.user.email)}</div></div><button class="btn btn-soft" id="logout">Sair</button></div></header><div class="content" id="content"></div></main></div><div id="modalRoot"></div>`;
 const closeMenu=()=>document.body.classList.remove('menu-open');
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{showPage(b.dataset.page);closeMenu()});
 $('menuToggle').onclick=()=>document.body.classList.toggle('menu-open');
 $('menuClose').onclick=closeMenu;$('sidebarBackdrop').onclick=closeMenu;
 $('globalBusiness').onchange=e=>{state.businessFilter=e.target.value;showPage(document.querySelector('.nav button.active')?.dataset.page||'dashboard')};$('logout').onclick=()=>supabase.auth.signOut();showPage('dashboard');
}
function nav(id,label,active=false){return `<button data-page="${id}" class="${active?'active':''}">${label}</button>`}
function setTitle(title,sub,action=''){return `<div class="title-row"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>${action}</div>`}
function activate(page){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page))}
function showPage(page){activate(page);({dashboard:renderDashboard,lancamentos:renderTransactions,pagar:renderPayables,receber:renderReceivables,carteiras:renderWallets,transferencias:renderTransfers,conciliacao:renderReconciliation,relatorios:renderReports,cadastros:renderRegisters}[page]||renderDashboard)()}
