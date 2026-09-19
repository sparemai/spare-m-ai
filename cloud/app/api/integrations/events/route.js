import {db} from '../../../../lib/db';
import {allowedTelemetryType,insertTelemetryEvents} from '../../../../lib/telemetry';
export const runtime='nodejs';

const INTEGRATION_TYPES=new Set(['change','business','kubernetes','cloud','database','profile']);
function auth(req){
 const key=process.env.SPAREM_INTEGRATION_KEY;
 return !!key && req.headers.get('x-sparem-integration-key')===key;
}
export async function POST(req){
 try{
  if(!auth(req))return Response.json({error:'unauthorized'},{status:401});
  const len=Number(req.headers.get('content-length')||0);if(len>2_000_000)return Response.json({error:'payload too large'},{status:413});
  const b=await req.json(),type=String(b.type||'').toLowerCase();
  if(!allowedTelemetryType(type)||!INTEGRATION_TYPES.has(type))return Response.json({error:'unsupported integration type'},{status:400});
  const items=Array.isArray(b.events)?b.events:Array.isArray(b.data)?b.data:[b.event||b.data||b];
  const count=await insertTelemetryEvents(db(),type,items,{agent_id:b.agent_id||'integration'});
  return Response.json({ok:true,type,count});
 }catch(e){console.error(e);return Response.json({error:e?.message||'integration ingest failed'},{status:500});}
}
