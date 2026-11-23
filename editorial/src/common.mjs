export const reply = (body, status = 200) => new Response(body, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const json = value => Response.json(value, {headers:{'Cache-Control':'no-store'}});
export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export async function readInfo(bucket,object) {
  const record = await bucket.get(object.key,{range:{offset:4,length:Number(object.customMetadata.header)}});
  return record.json();
}
