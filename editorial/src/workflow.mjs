import {reply,json,uuid,readInfo} from './common.mjs';
const stages = {
  start: ['editor',['Received','Review complete'],'Under review'],
  revise: ['editor',['Under review'],'Revision requested'],
  decline: ['editor',['Received','Under review'],'Declined'],
  accept: ['editor',['Under review','Review complete'],'Awaiting author approval'],
  upload: ['author',['Revision requested'],'Under review'],
  approve: ['author',['Awaiting author approval'],'Author approved'],
  release: ['editor',['Author approved'],'Published'],
  withdraw: ['editor',['Published'],'Withdrawn']
};
export async function loadWorkflow(bucket,id) {
  const record = await bucket.get('workflow/'+id);
  if (record) return {state:await record.json(),etag:record.etag};
  const legacy = await bucket.get('status/'+id);
  return {state:{status:legacy ? await legacy.text() : 'Received',version:1,revisionKey:null,sequence:0,events:[]},etag:null};
}
export async function manuscript(bucket,original,state) {
  const file = state.revisionKey ? await bucket.get(state.revisionKey) : await bucket.get(original.key,{range:{offset:4+Number(original.customMetadata.header)}});
  return new Response(file.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="manuscript.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function updateWorkflow(request,bucket,id,original,actor,loaded) {
  const {state,etag}=loaded;
  const size=Number(request.headers.get('content-length'));
  if (!size || size>5*1024*1024+32000) return reply('Invalid request size.',413);
  const data=await request.formData();
  const operation=data.get('operation');
  const transition=Object.hasOwn(stages,operation) && stages[operation];
  if (!transition || !transition[1].includes(state.status)) return reply('This action is unavailable at the current stage.',409);
  if (!(transition[0]==='editor' ? actor.editor : original.customMetadata.owner===actor.id)) return reply('Access denied.',403);
  if (String(state.sequence)!==data.get('sequence')) return reply('The record changed. Refresh before continuing.',409);
  const note=data.get('note') || '';
  if (typeof note!=='string' || note.length>4000 || (['accept','revise','decline','withdraw','upload'].includes(operation) && !note.trim())) return reply('Include a short written reason or response.',400);
  let uploaded;
  if (operation==='upload') {
    const pdf=data.get('pdf');
    if (!pdf || typeof pdf.slice!=='function' || pdf.size>5*1024*1024 || await pdf.slice(0,5).text()!=='%PDF-') return reply('Choose a PDF up to 5 MiB.',400);
    uploaded='revisions/'+id+'/'+crypto.randomUUID();
    await bucket.put(uploaded,await pdf.arrayBuffer());
    state.revisionKey=uploaded;
    state.version++;
  }
  if (operation==='accept') state.publicReview=note.trim();
  state.status=transition[2];
  state.sequence++;
  const at=new Date().toISOString();
  state.events.push({at,status:state.status,version:state.version,role:transition[0],actor:actor.id,note:note.trim(),revisionKey:state.revisionKey});
  if (operation==='release') state.published=at;
  const saved=await bucket.put('workflow/'+id,JSON.stringify(state),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});
  if (!saved) {
    if(uploaded)await bucket.delete(uploaded);
    return reply('Another update was saved first. Refresh the page.',409);
  }
  return json({status:state.status});
}
export async function published(request,bucket,path) {
  if(request.method!=='GET')return reply('Method unavailable',405);
  const [, , ,id,action]=path.split('/');
  if(!id){
    const cursor=new URL(request.url).searchParams.get('cursor')||undefined;
    const objects=await bucket.list({prefix:'workflow/',limit:5,cursor});
    const entries=await Promise.all(objects.objects.map(async o=>{
      const key=o.key.slice(9);
      const {state}=await loadWorkflow(bucket,key);
      if(state.status!=='Published')return null;
      const info=await readInfo(bucket,await bucket.head('papers/'+key));
      return {id:key,title:info.title,authors:info.authors};
    }));
    return json({papers:entries.filter(Boolean),next:objects.truncated?objects.cursor:null});
  }
  if(!uuid.test(id))return reply('Unavailable',404);
  const {state}=await loadWorkflow(bucket,id);
  if(state.status!=='Published')return reply('Unavailable',404);
  const original=await bucket.head('papers/'+id);
  if(action==='pdf')return manuscript(bucket,original,state);
  const info=await readInfo(bucket,original);
  return json({title:info.title,authors:info.authors,format:info.format,claim:info.claim,review:state.publicReview,version:state.version,published:state.published});
}
