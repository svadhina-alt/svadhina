import {cp,mkdir,rm} from 'node:fs/promises';
await rm('public',{recursive:true,force:true});
await cp('ui','public/open-papers',{recursive:true});
const dest='public/open-papers/pdfjs/';
await mkdir(dest,{recursive:true});
for(const name of ['pdf.min.mjs','pdf.worker.min.mjs'])await cp('node_modules/pdfjs-dist/build/'+name,dest+name);
await cp('node_modules/pdfjs-dist/LICENSE',dest+'LICENSE');
