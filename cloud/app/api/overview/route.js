import {db} from '../../../lib/db';
import {JOURNEY_ORDER,stageOf,buildJourney,buildTechnical,buildInfra,buildCorrelation,summarizeEvidence} from '../../../lib/analytics';
export const runtime='nodejs';

const ranges={
 '15m':15,
 '1h':60,
 '6h':360,
 '24h':1440
};

export async function GET(req){
 try{
  const sql=db();const u=new URL(req.url);let agent=u.searchParams.get('agent_id');
  const rangeKey=ranges[u.searchParams.get('range')]?u.searchParams.get('range'):'15m';
  const rangeMinutes=ranges[rangeKey];
  const requestedJourney=u.searchParams.get('journey')||'All';
  const selectedJourney=JOURNEY_ORDER.includes(requestedJourney)?requestedJourney:'All';
  const cutoff=new Date(Date.now()-rangeMinutes*60000).toISOString();

  if(!agent){
   const r=await sql`SELECT agent_id FROM host_samples ORDER BY collected_at DESC LIMIT 1`;agent=r[0]?.agent_id;
   if(!agent){const s=await sql`SELECT agent_id FROM spans ORDER BY start_time DESC LIMIT 1`;agent=s[0]?.agent_id;}
  }
  if(!agent)return Response.json({agent_id:null,filters:{range:rangeKey,journey:selectedJourney},journey:{stages:[]},technical:{edges:[],top_operations:[],service_stats:[]},infra:{current:null,baseline:null},correlation:{points:[]},evidence:{observations:['Waiting for telemetry.'],actions:[]},recent_traces:[]});

  const [hosts,allSpans]=await Promise.all([
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>=${cutoff} ORDER BY collected_at DESC LIMIT 5000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${cutoff} ORDER BY start_time DESC LIMIT 50000`
  ]);

  const journey=buildJourney(allSpans);
  let spans=allSpans;
  if(selectedJourney!=='All'){
   const matchingTraceIds=new Set(allSpans.filter(s=>stageOf(s)===selectedJourney).map(s=>s.trace_id));
   spans=allSpans.filter(s=>matchingTraceIds.has(s.trace_id));
  }

  const focusedJourney=selectedJourney==='All'?journey:buildJourney(spans);
  const technical=buildTechnical(spans),infra=buildInfra(hosts),correlation=buildCorrelation(spans,hosts,rangeMinutes),evidence=summarizeEvidence(focusedJourney,technical,infra,correlation);
  const services=[...new Set(spans.map(s=>s.service).filter(Boolean))],traceIds=[...new Set(spans.map(s=>s.trace_id))];
  const tm=new Map();
  for(const s of spans){
   const startMs=new Date(s.start_time).getTime(),duration=Number(s.duration_ms)||0,endMs=startMs+duration;
   let t=tm.get(s.trace_id);
   if(!t){t={trace_id:s.trace_id,start_ms:startMs,end_ms:endMs,error:false,services:new Set(),operations:[],span_count:0,root_operation:null,journeys:new Set()};tm.set(s.trace_id,t);}
   t.start_ms=Math.min(t.start_ms,startMs);t.end_ms=Math.max(t.end_ms,endMs);t.span_count++;
   t.error=t.error||Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;
   if(s.service)t.services.add(s.service);if(t.operations.length<5&&!t.operations.includes(s.operation))t.operations.push(s.operation);if(!s.parent_span_id&&!t.root_operation)t.root_operation=s.operation;
   const stage=stageOf(s);if(stage)t.journeys.add(stage);
  }
  const traces=[...tm.values()].map(t=>({trace_id:t.trace_id,start_time:new Date(t.start_ms).toISOString(),duration_ms:Math.max(0,t.end_ms-t.start_ms),error:t.error,services:[...t.services],operations:t.operations,span_count:t.span_count,root_operation:t.root_operation,distributed:t.services.size>1,journeys:[...t.journeys]}));
  const distributedCount=traces.filter(t=>t.distributed).length;
  const recent_traces=traces.sort((a,b)=>Number(b.error)-Number(a.error)||Number(b.distributed)-Number(a.distributed)||b.duration_ms-a.duration_ms||new Date(b.start_time)-new Date(a.start_time)).slice(0,30);

  return Response.json({
   agent_id:agent,
   filters:{range:rangeKey,range_minutes:rangeMinutes,journey:selectedJourney,from:cutoff,to:new Date().toISOString()},
   data_quality:{span_query_cap:50000,span_cap_reached:allSpans.length===50000,journey_mapping:journey.mapping},
   received:{spans:spans.length,traces:traceIds.length,distributed_traces:distributedCount,services},
   journey,
   focused_journey:focusedJourney,
   technical,
   infra,
   correlation,
   evidence,
   recent_traces,
   updated_at:new Date().toISOString()
  });
 }catch(e){console.error(e);return Response.json({error:e?.message||'overview failed'},{status:500});}
}
