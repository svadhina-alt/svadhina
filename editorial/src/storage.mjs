// Keep each PDF segment below D1's maximum SQLite row size.
const segmentSize = 256 * 1024;
const metadata = row => ({key:row.key, etag:row.etag, customMetadata:JSON.parse(row.metadata)});
export class ManuscriptStore {
  constructor(db) { this.db = db; }
  async head(key) {
    const row = await this.db.prepare('SELECT key,etag,metadata FROM records WHERE key=?').bind(key).first();
    return row ? metadata(row) : null;
  }
  async get(key,{range}={}) {
    const offset=range?.offset??0;
    const end=range?.length===undefined ? Number.MAX_SAFE_INTEGER : offset+range.length;
    const rows=await this.db.prepare(
      'SELECT r.etag,s.offset,s.data FROM records r JOIN segments s ON s.key=r.key WHERE r.key=? AND s.offset>=? AND s.offset<? ORDER BY s.offset'
    ).bind(key,Math.floor(offset/segmentSize)*segmentSize,end).raw();
    if(!rows.length)return null;
    const parts=rows.map(([,start,data])=>new Uint8Array(data).subarray(Math.max(0,offset-start),Math.min(segmentSize,end-start)));
    const response=new Response(new Blob(parts));
    response.etag=rows[0][0];
    return response;
  }
  async put(key,value,{onlyIf,customMetadata={}}={}) {
    const etag=crypto.randomUUID();
    const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
    const expires=/^(login|sessions)\//.test(key)?JSON.parse(value).expires:null;
    const values=[etag,JSON.stringify(customMetadata),expires,key];
    let change;
    if(onlyIf?.etagMatches) {
      change=this.db.prepare('UPDATE records SET etag=?,metadata=?,expires=? WHERE key=? AND etag=?').bind(...values,onlyIf.etagMatches);
    } else {
      const conflict=onlyIf?.etagDoesNotMatch==='*'?'DO NOTHING':'DO UPDATE SET etag=excluded.etag, metadata=excluded.metadata, expires=excluded.expires';
      change=this.db.prepare('INSERT INTO records(etag,metadata,expires,key) VALUES(?,?,?,?) ON CONFLICT(key) '+conflict).bind(...values);
    }
    const statements=[change,this.db.prepare('DELETE FROM segments WHERE key=? AND EXISTS (SELECT 1 FROM records WHERE key=? AND etag=?)').bind(key,key,etag)];
    for(let offset=0;offset<bytes.length;offset+=segmentSize) {
      statements.push(this.db.prepare('INSERT INTO segments(key,offset,data) SELECT key,?,? FROM records WHERE key=? AND etag=?')
        .bind(offset,bytes.slice(offset,offset+segmentSize).buffer,key,etag));
    }
    if(expires)statements.push(this.db.prepare('DELETE FROM records WHERE key IN (SELECT key FROM records WHERE expires<? LIMIT 20)').bind(Date.now()));
    const [result]=await this.db.batch(statements);
    return result.meta.changes ? {key,etag,customMetadata} : null;
  }
  async delete(key) {await this.db.prepare('DELETE FROM records WHERE key=?').bind(key).run();}
  async list({prefix,cursor='',limit}) {
    const rows=await this.db.prepare('SELECT key,etag,metadata FROM records WHERE key>=? AND key<? AND key>? ORDER BY key LIMIT ?')
      .bind(prefix,prefix+'\uffff',cursor,limit+1).all();
    const objects=rows.results.slice(0,limit).map(metadata);
    return {objects,truncated:rows.results.length>limit,cursor:objects.at(-1)?.key};
  }
}
