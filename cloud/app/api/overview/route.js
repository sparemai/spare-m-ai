import {db} from '../../../lib/db';
import {buildJourney,buildTechnical,buildInfra,summarizeEvidence} from '../../../lib/analytics';
export const runtime='nodejs';
export async function GET(req){
 try{
  const sql=db(); const u=new URL(req.url); let agent=u.searchParams.get('agent_id');
  if(!agent){const r=await sql`SELECT agent_id FROM host_samples ORDER BY collected_at DESC LIMIT 1`;agent=r[0]?.agent_id;if(!agent){const s=await sql`SELECT agent_id FROM spans ORDER BY start_time DESC LIMIT 1`;agent=s[0]?.agent_id;}}
  if(!agent)return Response.json({agent_id:null,journey:{stages:[]},technical:{edges:[],top_operations:[],service_stats:[]},infra:{current:null,baseline:null},evidence:{observations:['Waiting for telemetry.'],actions:[]}});
  const [hosts,spans]=await Promise.all([
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>NOW()-INTERVAL '2 hours' ORDER BY collected_at DESC LIMIT 240`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>NOW()-INTERVAL '15 minutes' ORDER BY start_time DESC LIMIT 5000`
  ]);
  const journey=buildJourney(spans), technical=buildTechnical(spans), infra=buildInfra(hosts), evidence=summarizeEvidence(journey,technical,infra);
  const services=[...new Set(spans.map(s=>s.service).filter(Boolean))]; const traceIds=[...new Set(spans.map(s=>s.trace_id))];
  const tm=new Map();
  for(const s of spans){
   const startMs=new Date(s.start_time).getTime(); const duration=Number(s.duration_ms)||0; const endMs=startMs+duration;
   let t=tm.get(s.trace_id);
   if(!t){t={trace_id:s.trace_id,start_ms:startMs,end_ms:endMs,error:false,services:new Set(),operations:[],span_count:0,root_operation:null};tm.set(s.trace_id,t);}
   t.start_ms=Math.min(t.start_ms,startMs);t.end_ms=Math.max(t.end_ms,endMs);t.span_count++;
   t.error=t.error||Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;
   if(s.service)t.services.add(s.service);if(t.operations.length<5&&!t.operations.includes(s.operation))t.operations.push(s.operation);if(!s.parent_span_id&&!t.root_operation)t.root_operation=s.operation;
  }
  const traces=[...tm.values()].map(t=>({trace_id:t.trace_id,start_time:new Date(t.start_ms).toISOString(),duration_ms:Math.max(0,t.end_ms-t.start_ms),error:t.error,services:[...t.services],operations:t.operations,span_count:t.span_count,root_operation:t.root_operation,distributed:t.services.size>1}));
  const distributedCount=traces.filter(t=>t.distributed).length;
  const recent_traces=traces.sort((a,b)=>Number(b.distributed)-Number(a.distributed)||Number(b.error)-Number(a.error)||new Date(b.start_time)-new Date(a.start_time)).slice(0,10);
  return Response.json({agent_id:agent,window:'15m',received:{spans:spans.length,traces:traceIds.length,distributed_traces:distributedCount,services},journey,technical,infra,evidence,recent_traces,updated_at:new Date().toISOString()});
 }catch(e){console.error(e);return Response.json({error:e?.message||'overview failed'},{status:500});}
}
