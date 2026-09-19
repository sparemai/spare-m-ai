import {db} from '../../../../lib/db';
import {allowedTelemetryType,ingestAuth,insertTelemetryEvents} from '../../../../lib/telemetry';
export const runtime='nodejs';
export const maxDuration=30;

export async function POST(req,context){
 try{
  if(!ingestAuth(req))return Response.json({error:'unauthorized'},{status:401});
  const {type}=await context.params;
  if(!allowedTelemetryType(type))return Response.json({error:'unsupported telemetry type'},{status:404});
  const len=Number(req.headers.get('content-length')||0);
  if(len>4_000_000)return Response.json({error:'payload too large'},{status:413});
  const body=await req.json();
  const items=Array.isArray(body)?body:(Array.isArray(body.events)?body.events:[body]);
  const count=await insertTelemetryEvents(db(),type,items);
  return Response.json({ok:true,type,count});
 }catch(e){
  console.error(e);
  return Response.json({error:e?.message||'telemetry ingest failed'},{status:500});
 }
}
