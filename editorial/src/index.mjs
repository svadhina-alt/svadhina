import {ManuscriptStore} from './storage.mjs';
import {auth,identity} from './auth.mjs';
import {papers} from './papers.mjs';
export default {
  async fetch(request,bindings) {
    const env={...bindings,BUCKET:new ManuscriptStore(bindings.DB)};
    const url=new URL(request.url);
    if(url.pathname.startsWith('/auth/'))return auth(request,env,url);
    if(url.pathname.startsWith('/api/'))return papers(request,env,url.pathname,await identity(request,env));
    if(url.pathname==='/')return Response.redirect(url.origin+'/open-papers/',302);
    return env.ASSETS.fetch(request);
  }
};
