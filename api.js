(()=>{
const BASE='https://emlofkiqhqkjnplpadvl.supabase.co';
const KEY='sb_publishable_-hTfnICEhwJAnJfUDaI2pw_yXU1wA_0';
const STORE='ziel_session_v1';
let listeners=[];
function saved(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function save(s){if(s)localStorage.setItem(STORE,JSON.stringify(s));else localStorage.removeItem(STORE)}
function errObj(x,status){return {message:x?.message||x?.msg||x?.error_description||x?.error||('Erro '+status)}}
async function refresh(s){if(!s?.refresh_token)return null;try{const r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({refresh_token:s.refresh_token})});const d=await r.json();if(!r.ok)return null;const ns={access_token:d.access_token,refresh_token:d.refresh_token||s.refresh_token,expires_at:Math.floor(Date.now()/1000)+(d.expires_in||3600),user:d.user||s.user};save(ns);return ns}catch{return null}}
async function session(){let s=saved();if(s?.expires_at&&s.expires_at<Math.floor(Date.now()/1000)+60)s=await refresh(s);return s}
async function headers(extra={}){const s=await session();return {'apikey':KEY,'Authorization':'Bearer '+(s?.access_token||KEY),'Content-Type':'application/json',...extra}}
async function parse(r){let d=null;const txt=await r.text();if(txt){try{d=JSON.parse(txt)}catch{d=txt}}return r.ok?{data:d,error:null}:{data:null,error:errObj(d,r.status)}}
function notify(event,s){listeners.forEach(fn=>{try{fn(event,s)}catch{}})}
class Query{
 constructor(table){this.table=table;this.method='GET';this.body=null;this.params=[];this.single=false}
 select(cols='*'){this.method='GET';this.params.push('select='+encodeURIComponent(cols));return this}
 order(col,opt={}){this.params.push('order='+encodeURIComponent(col+'.'+(opt.ascending===false?'desc':'asc')));return this}
 eq(col,val){this.params.push(encodeURIComponent(col)+'=eq.'+encodeURIComponent(val));return this}
 insert(row){this.method='POST';this.body=row;return this}
 update(row){this.method='PATCH';this.body=row;return this}
 delete(){this.method='DELETE';return this}
 maybeSingle(){this.single=true;return this.exec()}
 then(res,rej){return this.exec().then(res,rej)}
 async exec(){const q=this.params.length?'?'+this.params.join('&'):'';const h=await headers(this.method==='POST'?{'Prefer':'return=representation'}:{});const r=await fetch(BASE+'/rest/v1/'+this.table+q,{method:this.method,headers:h,body:this.body==null?undefined:JSON.stringify(this.body)});const out=await parse(r);if(this.single&&Array.isArray(out.data))out.data=out.data[0]||null;return out}
}
const client={
 auth:{
  async getSession(){const s=await session();return {data:{session:s},error:null}},
  async setSession({access_token,refresh_token}){try{const r=await fetch(BASE+'/auth/v1/user',{headers:{'apikey':KEY,'Authorization':'Bearer '+access_token}});const u=await r.json();if(!r.ok)return {data:{session:null},error:errObj(u,r.status)};const s={access_token,refresh_token,expires_at:Math.floor(Date.now()/1000)+3600,user:u};save(s);notify('SIGNED_IN',s);return {data:{session:s},error:null}}catch(e){return {data:{session:null},error:{message:e.message}}}},
  async signOut(){save(null);notify('SIGNED_OUT',null);return {error:null}},
  async resetPasswordForEmail(email,{redirectTo}={}){try{const r=await fetch(BASE+'/auth/v1/recover',{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({email,redirect_to:redirectTo})});const d=await r.text();return r.ok?{data:{},error:null}:{data:null,error:{message:d||'Falha ao enviar recuperação'}}}catch(e){return {data:null,error:{message:e.message}}}},
  onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){listeners=listeners.filter(x=>x!==fn)}}}}}
 },
 from(table){return new Query(table)},
 async rpc(name,args={}){const r=await fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',headers:await headers(),body:JSON.stringify(args||{})});return parse(r)}
};
window.supabase={createClient(){return client}};
})();