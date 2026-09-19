import {db} from '../../../../../lib/db';
import {decodeOtlpMetrics,safeResource} from '../../../../../lib/otlp-extended';
import {ingestAuth,insertTelemetryEvents} from '../../../../../lib/telemetry';
export const runtime='nodejs';

function typeOf(name=''){
 const n=String(name).toLowerCase();
 if(n.startsWith('jvm.')||n.startsWith('process.runtime.')||n.startsWith('process.cpu')||n.startsWith('process.memory'))return 'runtime';
 if(n.includes('network')||n.startsWith('system.net')||n.startsWith('system.network'))return 'network';
 if(n.includes('disk')||n.startsWith('system.filesystem'))return 'disk';
 if(n.startsWith('k8s.')||n.startsWith('container.'))return 'kubernetes';
 if(n.startsWith('cloud.'))return 'cloud';
 if(n.startsWith('db.')||n.includes('connection.pool'))return 'database';
 return 'runtime';
}

export async function POST(req){
 try{
  if(!ingestAuth(req))return new Response('unauthorized',{status:401});
  const len=Number(req.headers.get('content-length')||0);if(len>4_000_000)return new Response('payload too large',{status:413});
  const ct=req.headers.get('content-type')||'';if(!ct.includes('protobuf')&&!ct.includes('octet-stream'))return new Response('use OTLP/HTTP protobuf',{status:415});
  const metrics=decodeOtlpMetrics(await req.arrayBuffer()).slice(0,5000);
  const groups=new Map();
  for(const m of metrics){
   const r=safeResource(m.resource||{}),type=typeOf(m.name);
   const e={
    event_time:new Date(m.time_ms||Date.now()).toISOString(),
    agent_id:String(r['sparem.agent.id']||r['host.name']||'unknown'),
    hostname:r['host.name']||null,
    service:r['service.name']||null,
    entity_id:String(r['service.instance.id']||r['process.pid']||''),
    data:{metric:m.name,description:m.description||'',unit:m.unit||'',kind:m.kind,value:m.value,count:m.count,sum:m.sum,min:m.min,max:m.max,attributes:m.attrs||{},resource:r}
   };
   if(!groups.has(type))groups.set(type,[]);groups.get(type).push(e);
  }
  const sql=db();let count=0;
  for(const [type,items] of groups)count+=await insertTelemetryEvents(sql,type,items);
  return new Response(new Uint8Array(0),{status:200,headers:{'content-type':'application/x-protobuf','x-sparem-metrics':String(count)}});
 }catch(e){console.error(e);return new Response('metrics ingest failed',{status:500});}
}
