import {db} from '../../../../../lib/db';
import {decodeOtlpTraces,sanitizeSpan} from '../../../../../lib/otlp';
export const runtime='nodejs';
function auth(req){return !!process.env.SPAREM_INGEST_KEY && req.headers.get('x-sparem-key')===process.env.SPAREM_INGEST_KEY;}
export async function POST(req){
 try{
  if(!auth(req))return new Response('unauthorized',{status:401});
  const len=Number(req.headers.get('content-length')||0); if(len>4_000_000)return new Response('payload too large',{status:413});
  const ct=req.headers.get('content-type')||''; if(!ct.includes('protobuf')&&!ct.includes('octet-stream'))return new Response('use OTLP/HTTP protobuf',{status:415});
  const body=await req.arrayBuffer(); const raw=decodeOtlpTraces(body); const spans=raw.map(sanitizeSpan).filter(s=>s.trace_id&&s.span_id&&s.start_ms>0).slice(0,2000);
  if(spans.length){
   const sql=db(); const agent=spans.map(s=>s.agent_id), trace=spans.map(s=>s.trace_id), span=spans.map(s=>s.span_id), parent=spans.map(s=>s.parent_span_id||''), service=spans.map(s=>s.service), op=spans.map(s=>s.operation), kind=spans.map(s=>s.kind), start=spans.map(s=>new Date(s.start_ms).toISOString()), dur=spans.map(s=>s.duration_ms), status=spans.map(s=>s.status_code), msg=spans.map(s=>s.status_message||''), attrs=spans.map(s=>JSON.stringify(s.attrs||{})), resource=spans.map(s=>JSON.stringify(s.resource||{}));
   const q=`INSERT INTO spans(agent_id,trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource)
     SELECT a,t,s,p,sv,o,k,st,d,sc,sm,at::jsonb,re::jsonb FROM UNNEST($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::int[],$8::timestamptz[],$9::double precision[],$10::int[],$11::text[],$12::text[],$13::text[]) AS x(a,t,s,p,sv,o,k,st,d,sc,sm,at,re)`;
   await sql.query(q,[agent,trace,span,parent,service,op,kind,start,dur,status,msg,attrs,resource]);
  }
  return new Response(new Uint8Array(0),{status:200,headers:{'content-type':'application/x-protobuf','x-sparem-spans':String(spans.length)}});
 }catch(e){console.error(e);return new Response('trace ingest failed',{status:500});}
}
