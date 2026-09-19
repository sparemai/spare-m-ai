import {db} from '../../../lib/db';
import {JOURNEY_ORDER,stageOf,buildJourney,buildTechnical,buildInfra,buildCorrelation,summarizeEvidence} from '../../../lib/analytics';
import {buildIntelligence} from '../../../lib/intelligence';
import {ensureExtendedSchema} from '../../../lib/telemetry';
export const runtime='nodejs';

const ranges={'15m':15,'1h':60,'6h':360,'24h':1440};
const round1=v=>Math.round(Number(v||0)*10)/10;
const deltaPct=(now,base)=>Number(base)>0?round1((Number(now||0)-Number(base))*100/Number(base)):null;
const avg=(rows,key)=>rows.length?rows.reduce((s,r)=>s+Number(r[key]||0),0)/rows.length:null;
const pct95=xs=>{const a=xs.map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;return a[Math.min(a.length-1,Math.floor(a.length*.95))];};
const httpCode=s=>Number(s?.attrs?.['http.response.status_code']||s?.attrs?.['http.status_code']||0);
const statusBucket=c=>c>=500?'5xx':c>=400?'4xx':c>=300?'3xx':c>=200?'2xx':'other';

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
  if(!t){t={trace_id:s.trace_id,start_ms:startMs,end_ms:endMs,error:false,services:new Set(),operations:[],span_count:0,root_operation:null,journeys:new Set(),http_statuses:[]};tm.set(s.trace_id,t);}
  t.start_ms=Math.min(t.start_ms,startMs);t.end_ms=Math.max(t.end_ms,endMs);t.span_count++;
  const hc=httpCode(s);if(hc)t.http_statuses.push(hc);
  t.error=t.error||Number(s.status_code)===2||hc>=500;
  if(s.service)t.services.add(s.service);if(t.operations.length<5&&!t.operations.includes(s.operation))t.operations.push(s.operation);if(!s.parent_span_id&&!t.root_operation)t.root_operation=s.operation;
  const stage=stageOf(s);if(stage)t.journeys.add(stage);
 }
 return [...tm.values()].map(t=>({trace_id:t.trace_id,start_time:new Date(t.start_ms).toISOString(),duration_ms:Math.max(0,t.end_ms-t.start_ms),error:t.error,services:[...t.services],operations:t.operations,span_count:t.span_count,root_operation:t.root_operation,distributed:t.services.size>1,journeys:JOURNEY_ORDER.filter(x=>t.journeys.has(x)),http_status:t.http_statuses.find(x=>x>=500)||t.http_statuses.find(x=>x>=400)||t.http_statuses[0]||null}));
}

function stageTraceCounts(spans){
 const sets=Object.fromEntries(JOURNEY_ORDER.map(x=>[x,new Set()]));
 for(const s of spans){const stage=stageOf(s);if(stage)sets[stage].add(s.trace_id);}
 return Object.fromEntries(JOURNEY_ORDER.map(x=>[x,sets[x].size]));
}

function buildBusinessContext(spans,journey,events=[]){
 const counts=stageTraceCounts(spans),traceStarted=counts.Search||0,traceConfirmed=counts.Confirm||0,tracePayments=counts.Payment||0,traceBooked=counts.Book||0;
 const business=(events||[]).filter(e=>e.type==='business');
 const eventName=e=>String(e?.data?.event||e?.data?.name||e?.data?.kind||'').toLowerCase();
 const uniqueCount=(rows)=>{const ids=new Set(rows.map(e=>e.transaction_id||e.session_id).filter(Boolean));return ids.size||rows.length;};
 const confirmedEvents=business.filter(e=>/booking.*confirm|confirm.*booking|booking_completed|order_completed|purchase/.test(eventName(e)));
 const paymentEvents=business.filter(e=>/payment.*attempt|payment_started|payment_submitted/.test(eventName(e)));
 const bookingEvents=business.filter(e=>/booking.*start|booking_started|booking_review|book/.test(eventName(e))&&!confirmedEvents.includes(e));
 const startedEvents=business.filter(e=>/journey.*start|search|booking_started/.test(eventName(e)));
 const valueOf=e=>{for(const k of ['transaction_value','booking_value','value','amount']){const v=Number(e?.data?.[k]);if(Number.isFinite(v))return v;}return null;};
 const revenueOf=e=>{const v=Number(e?.data?.revenue);return Number.isFinite(v)?v:null;};
 const valuedConfirmed=confirmedEvents.map(e=>({e,v:valueOf(e)})).filter(x=>x.v!==null);
 const revenueConfirmed=confirmedEvents.map(e=>({e,v:revenueOf(e)})).filter(x=>x.v!==null);
 const totalValue=valuedConfirmed.length?round1(valuedConfirmed.reduce((s,x)=>s+x.v,0)):null;
 const totalRevenue=revenueConfirmed.length?round1(revenueConfirmed.reduce((s,x)=>s+x.v,0)):null;
 const currencies=[...new Set([...valuedConfirmed,...revenueConfirmed].map(x=>x.e?.data?.currency).filter(Boolean).map(String))];
 const trusted=business.length>0;
 const started=trusted&&startedEvents.length?uniqueCount(startedEvents):traceStarted;
 const confirmed=trusted&&confirmedEvents.length?uniqueCount(confirmedEvents):traceConfirmed;
 const payments=trusted&&paymentEvents.length?uniqueCount(paymentEvents):tracePayments;
 const booked=trusted&&bookingEvents.length?uniqueCount(bookingEvents):traceBooked;
 return {
  journey:'Booking',
  measurement:trusted?'business_events':'sampled_trace_proxy',
  confidence:trusted?95:Number(journey?.confidence||0),
  trusted_business_events:business.length,
  bookings_observed:confirmed,
  payment_attempts_observed:payments,
  booking_reviews_observed:booked,
  journeys_started_observed:started,
  completion_proxy_pct:started?round1(confirmed*100/started):null,
  transaction_value_observed:totalValue,
  revenue_observed:totalRevenue,
  currency:currencies.length===1?currencies[0]:null,
  stages:JOURNEY_ORDER.map(name=>{const s=journey?.stages?.find(x=>x.name===name)||{};return {name,trace_count:counts[name]||0,p95_ms:Number(s.p95_ms||0),error_rate:Number(s.error_rate||0),observed:Boolean(s.observed)};}),
  note:trusted?'Business counts use trusted application business events when available; technical stage timing still comes from sampled traces.':'Counts are trace-observed journey activity at the current sampling rate. They become true business counts when a stable journey/transaction identifier or business event feed is available.'
 };
}

function buildHttpHealth(spans){
 const server=spans.filter(s=>Number(s.kind)===2),codes={"2xx":0,"3xx":0,"4xx":0,"5xx":0,other:0};
 for(const s of server)codes[statusBucket(httpCode(s))]++;
 const groups=new Map();
 for(const s of server){
  const svc=s.service||'unknown';if(!groups.has(svc))groups.set(svc,[]);groups.get(svc).push(s);
 }
 const services=[...groups].map(([service,rows])=>{
  const sc={"2xx":0,"3xx":0,"4xx":0,"5xx":0,other:0};for(const r of rows)sc[statusBucket(httpCode(r))]++;
  return {service,requests:rows.length,p95_ms:round1(pct95(rows.map(r=>r.duration_ms))),avg_ms:round1(rows.reduce((a,r)=>a+Number(r.duration_ms||0),0)/Math.max(1,rows.length)),...sc,error_rate:round1((sc['4xx']+sc['5xx'])*100/Math.max(1,rows.length))};
 }).sort((a,b)=>b.requests-a.requests);
 const reqGroups=new Map();
 for(const s of server){const key=`${s.service||'unknown'}|${s.operation||'unknown'}`;if(!reqGroups.has(key))reqGroups.set(key,[]);reqGroups.get(key).push(s);}
 const top_requests=[...reqGroups.values()].map(rows=>{const sc={'4xx':0,'5xx':0};for(const r of rows){const b=statusBucket(httpCode(r));if(sc[b]!==undefined)sc[b]++;}return {service:rows[0].service||'unknown',operation:rows[0].operation||'unknown',requests:rows.length,p95_ms:round1(pct95(rows.map(r=>r.duration_ms))),avg_ms:round1(rows.reduce((a,r)=>a+Number(r.duration_ms||0),0)/Math.max(1,rows.length)),...sc};}).sort((a,b)=>b.requests-a.requests||b.p95_ms-a.p95_ms).slice(0,20);
 return {requests:server.length,p95_ms:round1(pct95(server.map(r=>r.duration_ms))),avg_ms:round1(server.reduce((a,r)=>a+Number(r.duration_ms||0),0)/Math.max(1,server.length)),codes,services,top_requests};
}

function buildApplicationView(spans,infra,technical,http){
 const firstByService=new Map();for(const s of spans){if(s.service&&!firstByService.has(s.service))firstByService.set(s.service,s);}
 const stats=new Map((http?.services||[]).map(x=>[x.service,x]));
 const services=[...firstByService].map(([name,s])=>{
  const n=name.toLowerCase(),role=n.includes('front')?'Frontend':n.includes('back')?'Backend':n.includes('gateway')?'Gateway':'Application service';
  const r=s.resource||{};
  return {name,role,host:r['host.name']||infra?.current?.hostname||null,runtime:r['process.runtime.name']||r['telemetry.sdk.language']||null,version:r['service.version']||null,instance:r['service.instance.id']||null,...(stats.get(name)||{})};
 });
 const dbDetected=spans.some(s=>s.attrs?.['db.system']||s.attrs?.['db.system.name']||s.attrs?.['db.operation.name']||s.attrs?.['db.statement']||s.attrs?.['db.query.text']);
 return {host:infra?.current?{hostname:infra.current.hostname,cpu:Number(infra.current.cpu||0),memory:Number(infra.current.memory||0),disk:Number(infra.current.disk_max||0)}:null,services,database_detected:dbDetected,edges:(technical?.edges||[]).filter(e=>e.from!==e.to).slice(0,12)};
}

function stageForView(journey,stage){if(stage!=='All')return journey?.stages?.find(s=>s.name===stage)||null;return journey?.primary_leak||journey?.stages?.find(s=>s.observed)||null;}

function buildExtendedTelemetryView(events){
 const counts={};for(const e of events||[])counts[e.type]=(counts[e.type]||0)+1;
 const latest=(type,n=8)=>(events||[]).filter(e=>e.type===type).slice(0,n).map(e=>({time:e.event_time,service:e.service,entity_id:e.entity_id,trace_id:e.trace_id,session_id:e.session_id,transaction_id:e.transaction_id,data:e.data}));
 const latestPer=(type,keyFn)=>{
  const m=new Map();
  for(const e of (events||[]).filter(e=>e.type===type)){const k=keyFn(e);if(k&&!m.has(k))m.set(k,e);}
  return [...m.values()];
 };
 const processes=latestPer('process',e=>e.entity_id||e.data?.pid).sort((a,b)=>Number(b.data?.cpu_pct||0)-Number(a.data?.cpu_pct||0)).slice(0,10).map(e=>({time:e.event_time,pid:e.data?.pid,process:e.data?.process_name,service:e.service,cpu_pct:Number(e.data?.cpu_pct||0),memory_bytes:Number(e.data?.memory_bytes||0),threads:Number(e.data?.threads||0)}));
 const runtime=latestPer('runtime',e=>`${e.service||''}|${e.data?.metric||''}|${JSON.stringify(e.data?.attributes||{})}`).slice(0,16).map(e=>({time:e.event_time,service:e.service,metric:e.data?.metric,value:e.data?.value,count:e.data?.count,sum:e.data?.sum,unit:e.data?.unit,attributes:e.data?.attributes||{}}));
 const logs=(events||[]).filter(e=>e.type==='logs'),errorLogs=logs.filter(e=>/error|fatal/i.test(String(e.data?.severity||''))),warnLogs=logs.filter(e=>/warn/i.test(String(e.data?.severity||'')));
 return {
  counts,
  processes,
  runtime,
  logs:{total:logs.length,errors:errorLogs.length,warnings:warnLogs.length,recent:[...errorLogs,...warnLogs].sort((a,b)=>new Date(b.event_time)-new Date(a.event_time)).slice(0,8).map(e=>({time:e.event_time,service:e.service,severity:e.data?.severity,message:e.data?.message,trace_id:e.trace_id}))},
  network:latest('network',8),
  disk:latest('disk',8),
  changes:latest('change',8),
  business:latest('business',8),
  rum:latest('rum',8),
  database:latest('database',8),
  kubernetes:latest('kubernetes',8),
  cloud:latest('cloud',8),
  profiles:latest('profile',8)
 };
}

function buildExecutive({stage,currentJourney,previousJourney,currentTechnical,previousTechnical,currentInfra,previousHosts,correlation,traces,intelligence,business,http}){
 const cur=stageForView(currentJourney,stage),base=cur?previousJourney?.stages?.find(s=>s.name===cur.name):null;
 const traceDominant=intelligence?.traces?.[0]?.dominant_contributor;
 const top=currentTechnical?.top_operations?.find(o=>traceDominant&&o.service===traceDominant.service&&o.operation===traceDominant.operation)||currentTechnical?.top_operations?.[0]||null;
 const topBase=top?previousTechnical?.top_operations?.find(o=>o.service===top.service&&o.operation===top.operation):null;
 const errorTraces=traces.filter(t=>t.error).length,appDelta=deltaPct(cur?.p95_ms,base?.p95_ms),opDelta=deltaPct(top?.p95_ms,topBase?.p95_ms);
 const prevCpu=avg(previousHosts,'cpu'),prevMemory=avg(previousHosts,'memory'),cpuDelta=deltaPct(currentInfra?.current?.cpu,prevCpu),memoryDelta=deltaPct(currentInfra?.current?.memory,prevMemory);
 const corrMag=Math.max(Math.abs(Number(correlation?.latency_cpu||0)),Math.abs(Number(correlation?.latency_memory||0))),resourceHot=Number(currentInfra?.current?.cpu||0)>=85||Number(currentInfra?.current?.memory||0)>=90;
 const infraLikelihood=(corrMag>=.7&&resourceHot)?'HIGH':(corrMag>=.4||resourceHot)?'MEDIUM':'LOW';
 let status='HEALTHY';if((http?.codes?.['5xx']||0)>0||Number(cur?.error_rate||0)>=5||Number(cur?.p95_ms||0)>=3000)status='CRITICAL';else if((http?.codes?.['4xx']||0)>0||Number(cur?.error_rate||0)>=1||Number(cur?.p95_ms||0)>=1000||(appDelta!==null&&appDelta>=50))status='DEGRADED';else if(appDelta!==null&&appDelta>=25)status='WATCH';
 const lead=intelligence?.evidence?.leading_hypothesis,stageName=cur?.name||(stage==='All'?'Booking':stage);
 const confidence=Math.min(95,Math.round(Number(currentJourney?.confidence||50)*.5+(traces.some(t=>t.distributed)?10:0)+(base||topBase?10:0)+(currentInfra?.current?8:0)+(intelligence?.evidence?.evidence_quality||0)*.2));
 const headline=status==='HEALTHY'?'Booking flow is operating normally':'Booking flow needs attention';
 const summary=status==='HEALTHY'?`Booking activity is flowing across ${business?.stages?.filter(s=>s.observed).length||0} observed stages with ${http?.codes?.['5xx']||0} server errors in this window.`:`The strongest issue is around ${stageName}. ${lead?lead.title:'Application response degradation'} is the current leading explanation; infrastructure contribution is ${infraLikelihood.toLowerCase()}.`;
 return {status,headline,summary,confidence,what_to_fix:lead?.next_step||(status==='HEALTHY'?'No immediate corrective action. Continue observing the booking flow.':'Inspect the slowest application operation before changing infrastructure.'),business:{...business,stage:stageName},technical:{service:top?.service||traceDominant?.service||null,operation:top?.operation||traceDominant?.operation||null,p95_ms:Number(top?.p95_ms||0),p95_delta_pct:opDelta,exclusive_execution_share_pct:traceDominant?.execution_share_pct||null,http_4xx:http?.codes?.['4xx']||0,http_5xx:http?.codes?.['5xx']||0,request_p95_ms:http?.p95_ms||0},infrastructure:{contribution:infraLikelihood,hostname:currentInfra?.current?.hostname||null,cpu:Number(currentInfra?.current?.cpu||0),memory:Number(currentInfra?.current?.memory||0),cpu_delta_pct:cpuDelta,memory_delta_pct:memoryDelta},error_traces:errorTraces,leading_hypothesis:lead||null};
}

export async function GET(req){
 try{
  const sql=db(),u=new URL(req.url);await ensureExtendedSchema(sql);let agent=u.searchParams.get('agent_id');
  const rangeKey=ranges[u.searchParams.get('range')]?u.searchParams.get('range'):'15m',rangeMinutes=ranges[rangeKey];
  const legacy=u.searchParams.get('journey'),stageParam=u.searchParams.get('stage')||(JOURNEY_ORDER.includes(legacy)?legacy:'All'),selectedStage=JOURNEY_ORDER.includes(stageParam)?stageParam:'All';
  const now=Date.now(),cutoffMs=now-rangeMinutes*60000,previousFromMs=cutoffMs-rangeMinutes*60000,cutoff=new Date(cutoffMs).toISOString(),previousFrom=new Date(previousFromMs).toISOString(),to=new Date(now).toISOString();
  if(!agent){const r=await sql`SELECT agent_id FROM host_samples ORDER BY collected_at DESC LIMIT 1`;agent=r[0]?.agent_id;if(!agent){const s=await sql`SELECT agent_id FROM spans ORDER BY start_time DESC LIMIT 1`;agent=s[0]?.agent_id;}}
  if(!agent)return Response.json({agent_id:null,filters:{range:rangeKey,journey:'Booking',stage:selectedStage},executive:null,business_context:null,http_health:null,application_view:null,recent_traces:[]});
  const [hosts,allSpans,previousHosts,previousAllSpans,events]=await Promise.all([
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>=${cutoff} ORDER BY collected_at DESC LIMIT 5000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${cutoff} ORDER BY start_time DESC LIMIT 50000`,
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>=${previousFrom} AND collected_at<${cutoff} ORDER BY collected_at DESC LIMIT 5000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${previousFrom} AND start_time<${cutoff} ORDER BY start_time DESC LIMIT 50000`,
   sql`SELECT type,event_time,agent_id,hostname,service,entity_id,trace_id,span_id,session_id,transaction_id,data FROM telemetry_events WHERE agent_id=${agent} AND event_time>=${cutoff} ORDER BY event_time DESC LIMIT 20000`
  ]);
  const journey=buildJourney(allSpans),previousJourneyAll=buildJourney(previousAllSpans),business_context=buildBusinessContext(allSpans,journey,events),http_health=buildHttpHealth(allSpans);
  const spans=filterByStage(allSpans,selectedStage),previousSpans=filterByStage(previousAllSpans,selectedStage),focusedJourney=selectedStage==='All'?journey:buildJourney(spans),previousFocusedJourney=selectedStage==='All'?previousJourneyAll:buildJourney(previousSpans);
  const technical=buildTechnical(spans),previousTechnical=buildTechnical(previousSpans),infra=buildInfra(hosts),correlation=buildCorrelation(spans,hosts,rangeMinutes),evidence=summarizeEvidence(focusedJourney,technical,infra,correlation),intelligence=buildIntelligence({spans,previousSpans,infra,correlation,events});
  const application_view=buildApplicationView(allSpans,infra,buildTechnical(allSpans),http_health),traces=summarizeTraces(spans),recent_traces=[...traces].sort((a,b)=>Number(b.error)-Number(a.error)||b.duration_ms-a.duration_ms||new Date(b.start_time)-new Date(a.start_time)).slice(0,30);
  const executive=buildExecutive({stage:selectedStage,currentJourney:focusedJourney,previousJourney:previousFocusedJourney,currentTechnical:technical,previousTechnical,currentInfra:infra,previousHosts,correlation,traces,intelligence,business:business_context,http:http_health});
  const extended_telemetry={total:events.length,...buildExtendedTelemetryView(events)};
  return Response.json({agent_id:agent,filters:{range:rangeKey,range_minutes:rangeMinutes,journey:'Booking',stage:selectedStage,from:cutoff,to,baseline_from:previousFrom,baseline_to:cutoff},executive,business_context,http_health,application_view,intelligence,extended_telemetry,journey,focused_journey:focusedJourney,technical,infra,correlation,evidence,recent_traces,updated_at:new Date().toISOString()});
 }catch(e){console.error(e);return Response.json({error:e?.message||'overview failed'},{status:500});}
}
