import {reply} from './common.mjs';

const cookie = (name,value,age) => '__Host-'+name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
function token(request,name) {
  const entry=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-'+name+'='));
  const value=entry?.split('=')[1];
  return /^[a-f0-9-]{36}$/.test(value)?value:null;
}
async function digest(value) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function redirect(path,cookies=[]) {
  const headers=new Headers({Location:path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  for(const c of cookies) headers.append('Set-Cookie',c);
  return new Response(null,{status:303,headers});
}
export async function identity(request,env) {
  const session=token(request,'session');
  if(!session)return null;
  const record=await env.BUCKET.get('sessions/'+await digest(session));
  if(!record)return null;
  const {user,expires}=await record.json();
  if(expires<=Date.now())return null;
  return user;
}
export async function auth(request,env,url) {
  if(request.method!=='GET')return reply('Method unavailable',405);
  const callback=url.origin+'/auth/callback';
  if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET)return reply('GitHub sign-in requires host configuration.',503);
  if(url.pathname==='/auth/login'){
    const state=crypto.randomUUID();
    const target=new URL(url.searchParams.get('return_to')||'/open-papers/',url.origin);
    const after=target.origin===url.origin && target.pathname.startsWith('/open-papers/')?target.pathname+target.search:'/open-papers/';
    await env.BUCKET.put('login/'+await digest(state),JSON.stringify({after,expires:Date.now()+600000}));
    const authorize=new URL('https://github.com/login/oauth/authorize');
    authorize.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:callback,state}).toString();
    return redirect(authorize.href,[cookie('login',state,600)]);
  }
  const state=token(request,'login');
  if(url.pathname!=='/auth/callback'||!state||state!==url.searchParams.get('state')||!url.searchParams.get('code'))return reply('Sign-in expired. Return to Open Papers to try again.',400);
  const key='login/'+await digest(state);
  const record=await env.BUCKET.get(key);
  if(!record)return reply('Sign-in expired.',400);
  const flow=await record.json();
  await env.BUCKET.delete(key);
  if(flow.expires<=Date.now())return reply('Sign-in expired.',400);
  const grant=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json'},body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:callback})});
  const access=await grant.json();
  if(!grant.ok||!access.access_token)return reply('GitHub sign-in failed. Please try again.',401);
  const profile=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+access.access_token,'User-Agent':'SVADHINA-Open-Papers',Accept:'application/vnd.github+json'}});
  const user=await profile.json();
  if(!profile.ok||!Number.isSafeInteger(user.id))return reply('GitHub could not verify the account.',401);
  const session=crypto.randomUUID(),age=8*3600;
  await env.BUCKET.put('sessions/'+await digest(session),JSON.stringify({user:String(user.id),expires:Date.now()+age*1000}));
  return redirect(flow.after,[cookie('login','',0),cookie('session',session,age)]);
}
