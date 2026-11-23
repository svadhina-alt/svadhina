import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from './src/index.mjs';
const objects=new Map();
const bucket={
 head:async k=>objects.get(k),
 get:async(k,opts)=>{const o=objects.get(k);if(!o)return null; const r=opts?.range; const response=new Response(r?o.bytes.subarray(r.offset,r.length?r.offset+r.length:undefined):o.bytes);response.etag=o.etag;return response;},
 put:async(k,data,opts={})=>{const old=objects.get(k);if(opts.onlyIf?.etagDoesNotMatch==='*'&&old||opts.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;const o={key:k,etag:crypto.randomUUID(),bytes:Buffer.from(data),customMetadata:opts.customMetadata};objects.set(k,o);return o;},
 list:async({prefix})=>({objects:[...objects.values()].filter(o=>o.key.startsWith(prefix))}),delete:async k=>objects.delete(k)
};
const id=crypto.randomUUID(),base='/api/papers/'+id,publicPath='/api/publications/'+id;
const cookies={};
for(const user of ['author','other','editor']){
  const token=crypto.randomUUID();
  await bucket.put('sessions/'+createHash('sha256').update(token).digest('hex'),JSON.stringify({user,expires:Date.now()+60000}));
  cookies[user]='__Host-session='+token;
}
function call(path,user,fields){const headers=user?{Cookie:cookies[user]}:{};
let body;if(fields){body=new FormData();for(const [k,v]of Object.entries(fields))body.set(k,v);headers.origin='https://unit.test';headers['content-length']='1200';}
return worker.fetch(new Request('https://unit.test'+path,{headers,body,method:body?'POST':'GET'}),{BUCKET:bucket,EDITOR_GITHUB_ID:'editor'});}
const pdf=s=>new Blob(['%PDF-'+s]);const input={title:'A',authors:'B',claim:'C',format:'Essay',email:'b@example.org',disclosure:'',pdf:pdf('original')};
assert.equal((await call(base,null,input)).status,401);assert.equal((await call(base,'author',input)).status,200);assert.equal((await call(base,'author',input)).status,200);
assert.equal((await call(base,'other')).status,404);assert.equal((await call(publicPath)).status,404);assert.equal((await call('/api/editor','other')).status,403);
let seq=0;
async function act(op,user,expect=200,extras={}){
 const r=await call(base+'/decision',user,{operation:op,sequence:String(seq),note:'Editorial note',...extras});assert.equal(r.status,expect,op);if(expect===200)seq++;
}
await act('release','editor',409);await act('start','author',403);await act('start','editor');
await act('revise','editor');await act('upload','author',400,{pdf:new Blob(['wrong'])});
await act('upload','author',200,{pdf:pdf('revision')});await act('accept','editor',409,{sequence:'0'});await act('accept','editor');
await act('approve','editor',403);await act('approve','author');await act('release','editor');
const released=await (await call(publicPath)).json();assert.equal(released.version,2);assert.equal(released.email,undefined);assert.equal(released.events,undefined);
assert.equal(await (await call(publicPath+'/pdf')).text(),'%PDF-revision');assert.equal((await (await call('/api/publications')).json()).papers.length,1);
await act('withdraw','editor');assert.equal((await call(publicPath+'/pdf')).status,404);assert.equal((await (await call('/api/publications')).json()).papers.length,0);
console.log('Verified submit, retry, authorization, revisions, stale updates, author proof, release and withdrawal.');
