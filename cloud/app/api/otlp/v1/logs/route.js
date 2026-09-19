import {db} from '../../../../../lib/db';
import {decodeOtlpLogs,safeResource} from '../../../../../lib/otlp-extended';
import {ingestAuth,insertTelemetryEvents,maskText} from '../../../../../lib/telemetry';
export const runtime='nodejs';

export async function POST(req){
 try{
  if(!ingestAuth(req))return new Response('unauthorized',{status:401});
  const len=Number(req.headers.get('content-length')||0);if(len>4_000_000)return new Response('payload too large',{status:413});
  const ct=req.headers.get('content-type')||'';if(!ct.includes('protobuf')&&!ct.includes('octet-stream'))return new Response('use OTLP/HTTP protobuf',{status:415});
  const records=decodeOtlpLogs(await req.arrayBuffer()).slice(0,3000);
  const events=records.map(l=>{
   const r=safeResource(l.resource||{});
   return {
    event_time:new Date(l.time_ms||Date.now()).toISOString(),
    agent_id:String(r['sparem.agent.id']||r['host.name']||'unknown'),
    hostname:r['host.name']||null,
    service:r['service.name']||null,
    entity_id:String(r['service.instance.id']||r['process.pid']||''),
    trace_id:l.trace_id||null,
    span_id:l.span_id||null,
    data:{
     severity_number:l.severity_number,
     severity:l.severity_text||null,
     message:maskText(typeof l.body==='string'?l.body:JSON.stringify(l.body??'')),
     attributes:l.attrs||{},
     resource:r
    }
   };
  });
  const count=await insertTelemetryEvents(db(),'logs',events);
  return new Response(new Uint8Array(0),{status:200,headers:{'content-type':'application/x-protobuf','x-sparem-logs':String(count)}});
 }catch(e){console.error(e);return new Response('logs ingest failed',{status:500});}
}
