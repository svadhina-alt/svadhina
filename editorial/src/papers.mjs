import {reply,json,uuid,readInfo} from './common.mjs';
import {published,loadWorkflow,manuscript,updateWorkflow} from './workflow.mjs';
export async function papers(request, env, path, user) {
  if (path === '/api/session') return json({signedIn:Boolean(user)});
  if (path === '/api/publications' || path.startsWith('/api/publications/')) return published(request,env.BUCKET,path);
  if (!user) return reply('Sign in to submit or view a paper.',401);
  const editor = user === env.EDITOR_GITHUB_ID;
  if ((path === '/api/mine' || (path === '/api/editor' && editor)) && request.method === 'GET') {
    const cursor = new URL(request.url).searchParams.get('cursor') || undefined;
    const list = await env.BUCKET.list({prefix:'papers/',limit:5,cursor,include:['customMetadata']});
    const visible=path==='/api/mine'?list.objects.filter(o=>o.customMetadata.owner===user):list.objects;
    return json({papers:await Promise.all(visible.map(async o=>({id:o.key.slice(7),...await readInfo(env.BUCKET,o)}))),next:list.truncated?list.cursor:null});
  }
  if (path === '/api/editor') return reply('Sign in with the designated editorial GitHub account.',403);
  const [, , , id, action] = path.split('/');
  if (!uuid.test(id) || !path.startsWith('/api/papers/')) return reply('Unavailable',404);
  const key = 'papers/' + id;
  const object = await env.BUCKET.head(key);
  if (object && object.customMetadata.owner !== user && !editor) return reply('Unavailable',404);
  if (request.method === 'GET' && object) {
    const info = await readInfo(env.BUCKET,object);
    const {state}=await loadWorkflow(env.BUCKET,id);
    if (action==='pdf') return manuscript(env.BUCKET,object,state);
    return json({id,...info,status:state.status,version:state.version,sequence:state.sequence,publicReview:state.publicReview,owner:object.customMetadata.owner===user,editor,
      events:state.events.map(({at,status,version,role,note})=>({at,status,version,role,note}))});
  }
  if (request.method !== 'POST' || request.headers.get('Origin') !== new URL(request.url).origin) return reply('Unavailable',403);
  if (action==='decision' && object) return updateWorkflow(request,env.BUCKET,id,object,{id:user,editor},await loadWorkflow(env.BUCKET,id));
  if (action) return reply('Unavailable',404);
  if (object) return json({id});
  const limit = 5 * 1024 * 1024;
  const size = Number(request.headers.get('Content-Length'));
  if (!size || size > limit + 32000) return reply('Choose a PDF of 5 MiB or smaller.',413);
  const form = await request.formData();
  const pdf = form.get('pdf');
  if (!pdf || typeof pdf.slice !== 'function' || pdf.size > limit || await pdf.slice(0,5).text() !== '%PDF-') return reply('Choose a valid PDF manuscript.',400);
  const info = {received:new Date().toISOString()};
  for (const [field,max] of Object.entries({title:200,authors:250,format:40,claim:650,disclosure:250,email:200})) {
    const value = form.get(field);
    if (typeof value !== 'string' || value.length > max || (!value.trim() && field !== 'disclosure')) return reply('Check the ' + field + ' field.',400);
    info[field] = value.trim();
  }
  // Store the cover note with the PDF in one atomic write. Keep object metadata small.
  const metadata = new TextEncoder().encode(JSON.stringify(info));
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0,metadata.length);
  const saved = await env.BUCKET.put(key,await new Blob([header,metadata,pdf]).arrayBuffer(),{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{owner:user,header:String(metadata.length)}});
  if (!saved && (await env.BUCKET.head(key))?.customMetadata.owner !== user) return reply('Please retry with a new submission.',409);
  return json({id});
}
