import {db} from '../../../lib/db';
import {JOURNEY_ORDER,stageOf,buildJourney,buildTechnical,buildInfra,buildCorrelation,summarizeEvidence} from '../../../lib/analytics';
import {buildIntelligence} from '../../../lib/intelligence';
export const runtime='nodejs';

const ranges={'15m':15,'1h':60,'6h':360,'24h':1440};
const round1=v=>Math.round(Number(v||0)*10)/10;
const deltaPct=(now,base)=>Number(base)>0?round1((Number(now||0)-Number(base))*100/Number(base)):null;
const avg=(rows,key)=>rows.length?rows.reduce((s,r)=>s+Number(r[key]||0),0)/rows.length:null;

function filterByStage(spans,stage){
 if(stage==='All')return spans;
 const ids=new Set(spans.filter(s=>stageOf(s)===stage).map(s=>s.trace_id));
 return spans.filter(s=>ids.has(s.trace_id));
}

function summarizeTraces(spans){
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
 return [...tm.values()].map(t=>({trace_id:t.trace_id,start_time:new Date(t.start_ms).toISOString(),duration_ms:Math.max(0,t.end_ms-t.start_ms),error:t.error,services:[...t.services],operations:t.operations,span_count:t.span_count,root_operation:t.root_operation,distributed:t.services.size>1,journeys:[...t.journeys]}));
}

function stageForView(journey,stage){
 if(stage!=='All')return journey?.stages?.find(s=>s.name===stage)||null;
 return journey?.primary_leak||journey?.stages?.find(s=>s.observed)||null;
}

function buildExecutive({stage,currentJourney,previousJourney,currentTechnical,previousTechnical,currentInfra,previousHosts,correlation,traces,intelligence}){
 const cur=stageForView(currentJourney,stage),base=cur?previousJourney?.stages?.find(s=>s.name===cur.name):null;
 const traceDominant=intelligence?.traces?.[0]?.dominant_contributor;
 const top=currentTechnical?.top_operations?.find(o=>traceDominant&&o.service===traceDominant.service&&o.operation===traceDominant.operation)||currentTechnical?.top_operations?.[0]||null;
 const topBase=top?previousTechnical?.top_operations?.find(o=>o.service===top.service&&o.operation===top.operation):null;
 const errorTraces=traces.filter(t=>t.error).length,errorTraceRate=traces.length?round1(errorTraces*100/traces.length):0;
 const appDelta=deltaPct(cur?.p95_ms,base?.p95_ms),opDelta=deltaPct(top?.p95_ms,topBase?.p95_ms);
 const prevCpu=avg(previousHosts,'cpu'),prevMemory=avg(previousHosts,'memory'),cpuDelta=deltaPct(currentInfra?.current?.cpu,prevCpu),memoryDelta=deltaPct(currentInfra?.current?.memory,prevMemory);
 const corrMag=Math.max(Math.abs(Number(correlation?.latency_cpu||0)),Math.abs(Number(correlation?.latency_memory||0)));
 const resourceHot=Number(currentInfra?.current?.cpu||0)>=85||Number(currentInfra?.current?.memory||0)>=90;
 const resourceMoved=(cpuDelta!==null&&cpuDelta>=35)||(memoryDelta!==null&&memoryDelta>=25);
 const infraLikelihood=(corrMag>=.7&&(resourceHot||resourceMoved))?'HIGH':((corrMag>=.4)||(resourceHot||resourceMoved))?'MEDIUM':'LOW';
 let status='HEALTHY';
 if(Number(cur?.error_rate||0)>=5||Number(cur?.p95_ms||0)>=3000)status='CRITICAL';
 else if(Number(cur?.error_rate||0)>=1||Number(cur?.p95_ms||0)>=1000||(appDelta!==null&&appDelta>=50))status='DEGRADED';
 else if(appDelta!==null&&appDelta>=25)status='WATCH';
 const distributed=traces.some(t=>t.distributed),hasPrior=Boolean(base||topBase),hasInfra=Boolean(currentInfra?.current),hasCorr=correlation?.latency_cpu!==null||correlation?.latency_memory!==null;
 const deterministicConfidence=Math.min(95,Math.round(Number(currentJourney?.confidence||50)*.45+(distributed?10:0)+(hasPrior?10:0)+(hasInfra?8:0)+(hasCorr?7:0)+(intelligence?.evidence?.evidence_quality||0)*.2));
 const stageName=cur?.name||(stage==='All'?'Booking':stage),technicalLabel=top?`${top.service} • ${top.operation}`:'No technical contributor isolated';
 const infraText=infraLikelihood==='HIGH'?'Infrastructure is a credible contributor.':infraLikelihood==='MEDIUM'?'Infrastructure may be contributing; inspect aligned spikes.':'Infrastructure is not the strongest current contributor.';
 const lead=intelligence?.evidence?.leading_hypothesis;
 const headline=status==='HEALTHY'?`${stageName} is operating normally`:`${stageName} needs attention`;
 const summary=status==='HEALTHY'?`No material degradation is visible in the selected ${stageName} context.`:`${stageName} shows ${cur?.p95_ms?`p95 ${Math.round(cur.p95_ms)} ms`:''}${cur?.error_rate?` and ${cur.error_rate}% errors`:''}. ${lead?`Intelligence ranks ${lead.title.toLowerCase()} as the leading hypothesis (${lead.confidence}% hypothesis confidence).`:`The strongest sampled technical signal is ${technicalLabel}.`} ${infraText}`;
 return {
  status,headline,summary,confidence:deterministicConfidence,
  business:{journey:'Booking',stage:stageName,p95_ms:Number(cur?.p95_ms||0),p95_delta_pct:appDelta,error_rate:Number(cur?.error_rate||0),error_trace_rate:errorTraceRate,selected_traces:traces.length,error_traces:errorTraces,baseline_p95_ms:Number(base?.p95_ms||0)||null,conversion_available:false,revenue_available:false,journey_structure_confidence:intelligence?.journey?.structure_confidence||null,transaction_linkage_confidence:intelligence?.journey?.transaction_linkage_confidence||null},
  technical:{service:top?.service||traceDominant?.service||null,operation:top?.operation||traceDominant?.operation||null,p95_ms:Number(top?.p95_ms||0),p95_delta_pct:opDelta,error_rate:Number(top?.error_rate||0),baseline_p95_ms:Number(topBase?.p95_ms||0)||null,exclusive_execution_share_pct:traceDominant?.execution_share_pct||null,leading_hypothesis:lead||null},
  infrastructure:{contribution:infraLikelihood,hostname:currentInfra?.current?.hostname||null,cpu:Number(currentInfra?.current?.cpu||0),memory:Number(currentInfra?.current?.memory||0),cpu_delta_pct:cpuDelta,memory_delta_pct:memoryDelta,latency_cpu:correlation?.latency_cpu,latency_memory:correlation?.latency_memory},
  path:[{type:'business',label:'Booking journey'},{type:'stage',label:stageName},{type:'service',label:top?.service||traceDominant?.service||'No service isolated'},{type:'operation',label:top?.operation||traceDominant?.operation||'No operation isolated'},{type:'infra',label:`Infrastructure ${infraLikelihood}`}],
  data_gaps:[...(intelligence?.evidence?.limitations||[]),...['Revenue-at-risk requires a business value/order amount attribute.']]
 };
}

export async function GET(req){
 try{
  const sql=db(),u=new URL(req.url);let agent=u.searchParams.get('agent_id');
  const rangeKey=ranges[u.searchParams.get('range')]?u.searchParams.get('range'):'15m',rangeMinutes=ranges[rangeKey];
  const legacy=u.searchParams.get('journey'),stageParam=u.searchParams.get('stage')||(JOURNEY_ORDER.includes(legacy)?legacy:'All');
  const selectedStage=JOURNEY_ORDER.includes(stageParam)?stageParam:'All';
  const now=Date.now(),cutoffMs=now-rangeMinutes*60000,previousFromMs=cutoffMs-rangeMinutes*60000;
  const cutoff=new Date(cutoffMs).toISOString(),previousFrom=new Date(previousFromMs).toISOString(),to=new Date(now).toISOString();
  if(!agent){const r=await sql`SELECT agent_id FROM host_samples ORDER BY collected_at DESC LIMIT 1`;agent=r[0]?.agent_id;if(!agent){const s=await sql`SELECT agent_id FROM spans ORDER BY start_time DESC LIMIT 1`;agent=s[0]?.agent_id;}}
  if(!agent)return Response.json({agent_id:null,filters:{range:rangeKey,journey:'Booking',stage:selectedStage},executive:null,intelligence:null,journey:{stages:[]},technical:{edges:[],top_operations:[],service_stats:[]},infra:{current:null,baseline:null},correlation:{points:[]},evidence:{observations:['Waiting for telemetry.'],actions:[]},recent_traces:[]});

  const [hosts,allSpans,previousHosts,previousAllSpans]=await Promise.all([
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>=${cutoff} ORDER BY collected_at DESC LIMIT 5000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${cutoff} ORDER BY start_time DESC LIMIT 50000`,
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>=${previousFrom} AND collected_at<${cutoff} ORDER BY collected_at DESC LIMIT 5000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${previousFrom} AND start_time<${cutoff} ORDER BY start_time DESC LIMIT 50000`
  ]);

  const journey=buildJourney(allSpans),previousJourneyAll=buildJourney(previousAllSpans);
  const spans=filterByStage(allSpans,selectedStage),previousSpans=filterByStage(previousAllSpans,selectedStage);
  const focusedJourney=selectedStage==='All'?journey:buildJourney(spans),previousFocusedJourney=selectedStage==='All'?previousJourneyAll:buildJourney(previousSpans);
  const technical=buildTechnical(spans),previousTechnical=buildTechnical(previousSpans),infra=buildInfra(hosts),correlation=buildCorrelation(spans,hosts,rangeMinutes),evidence=summarizeEvidence(focusedJourney,technical,infra,correlation);
  const intelligence=buildIntelligence({spans,previousSpans,infra,correlation});
  const services=[...new Set(spans.map(s=>s.service).filter(Boolean))],traceIds=[...new Set(spans.map(s=>s.trace_id))],traces=summarizeTraces(spans);
  const distributedCount=traces.filter(t=>t.distributed).length,recent_traces=[...traces].sort((a,b)=>Number(b.error)-Number(a.error)||Number(b.distributed)-Number(a.distributed)||b.duration_ms-a.duration_ms||new Date(b.start_time)-new Date(a.start_time)).slice(0,30);
  const executive=buildExecutive({stage:selectedStage,currentJourney:focusedJourney,previousJourney:previousFocusedJourney,currentTechnical:technical,previousTechnical,currentInfra:infra,previousHosts,correlation,traces,intelligence});

  return Response.json({agent_id:agent,filters:{range:rangeKey,range_minutes:rangeMinutes,journey:'Booking',stage:selectedStage,from:cutoff,to,baseline_from:previousFrom,baseline_to:cutoff},data_quality:{span_query_cap:50000,span_cap_reached:allSpans.length===50000,baseline_span_cap_reached:previousAllSpans.length===50000,journey_mapping:journey.mapping},executive,intelligence,received:{spans:spans.length,traces:traceIds.length,distributed_traces:distributedCount,services},journey,focused_journey:focusedJourney,technical,infra,correlation,evidence,recent_traces,updated_at:new Date().toISOString()});
 }catch(e){console.error(e);return Response.json({error:e?.message||'overview failed'},{status:500});}
}
