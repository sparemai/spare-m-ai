import {db} from '../../../../lib/db';
import {insertTelemetryEvents} from '../../../../lib/telemetry';
export const runtime='nodejs';

function cors(extra={}){return {'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,x-sparem-rum-key',...extra};}
export async function OPTIONS(){return new Response(null,{status:204,headers:cors()});}

export async function POST(req){
 try{
  const configured=process.env.SPAREM_RUM_KEY;
  if(configured&&req.headers.get('x-sparem-rum-key')!==configured)return Response.json({error:'unauthorized'},{status:401,headers:cors()});
  const len=Number(req.headers.get('content-length')||0);
  if(len>300_000)return Response.json({error:'payload too large'},{status:413,headers:cors()});
  const b=await req.json();
  const events=Array.isArray(b)?b:(Array.isArray(b.events)?b.events:[b]);
  const safe=events.slice(0,200).map(e=>({
   ...e,
   agent_id:e.agent_id||e.application||'browser',
   data:{
    ...(e.data||e),
    url:e?.data?.url?String(e.data.url).split('?')[0]:undefined,
    referrer:e?.data?.referrer?String(e.data.referrer).split('?')[0]:undefined
   }
  }));
  const count=await insertTelemetryEvents(db(),'rum',safe);
  return Response.json({ok:true,count},{headers:cors()});
 }catch(e){
  console.error(e);
  return Response.json({error:'rum ingest failed'},{status:500,headers:cors()});
 }
}
