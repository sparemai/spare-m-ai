import OpenAI from 'openai';
import {db} from '../../../lib/db';
import {JOURNEY_ORDER,stageOf,buildInfra,buildCorrelation} from '../../../lib/analytics';
import {buildIntelligence} from '../../../lib/intelligence';
import {ensureExtendedSchema} from '../../../lib/telemetry';
export const runtime='nodejs';
export const maxDuration=60;

const ranges={'15m':15,'1h':60,'6h':360,'24h':1440};
function filterByStage(spans,stage){if(stage==='All')return spans;const ids=new Set(spans.filter(s=>stageOf(s)===stage).map(s=>s.trace_id));return spans.filter(s=>ids.has(s.trace_id));}

function p95(values){const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;return Math.round(a[Math.min(a.length-1,Math.ceil(a.length*.95)-1)]);}
function currentTelemetrySummary(spans){
 const requests=(spans||[]).filter(s=>Number(s.kind)===2);
 const rows=requests.length?requests:(spans||[]);
 const services=new Map();let fourxx=0,fivexx=0;
 for(const s of rows){
  const code=Number(s.attrs?.['http.response.status_code']||s.attrs?.['http.status_code']||0);
  if(code>=400&&code<500)fourxx++;if(code>=500)fivexx++;
  const name=s.service||'unknown';
  if(!services.has(name))services.set(name,{service:name,requests:0,durations:[],fourxx:0,fivexx:0});
  const g=services.get(name);g.requests++;g.durations.push(Number(s.duration_ms)||0);
  if(code>=400&&code<500)g.fourxx++;if(code>=500)g.fivexx++;
 }
 return {
  requests:rows.length,
  p95_ms:p95(rows.map(s=>s.duration_ms)),
  http_4xx:fourxx,
  http_5xx:fivexx,
  services:[...services.values()].map(g=>({service:g.service,requests:g.requests,p95_ms:p95(g.durations),http_4xx:g.fourxx,http_5xx:g.fivexx})).sort((a,b)=>b.http_5xx-a.http_5xx||b.p95_ms-a.p95_ms||b.requests-a.requests).slice(0,20)
 };
}

function summarizeExtended(events,category='all'){
 const rows=(events||[]).filter(e=>category==='all'||String(e.type)===category);
 const counts={};for(const e of events||[])counts[e.type]=(counts[e.type]||0)+1;
 const latest=(type,n=12)=>(events||[]).filter(e=>e.type===type).slice(0,n).map(e=>({time:e.event_time,service:e.service,entity_id:e.entity_id,trace_id:e.trace_id,session_id:e.session_id,transaction_id:e.transaction_id,data:e.data}));
 const processLatest=new Map();
 for(const e of (events||[]).filter(e=>e.type==='process'))if(!processLatest.has(e.entity_id))processLatest.set(e.entity_id,e);
 const topProcesses=[...processLatest.values()].sort((a,b)=>Number(b.data?.cpu_pct||0)-Number(a.data?.cpu_pct||0)||Number(b.data?.memory_bytes||0)-Number(a.data?.memory_bytes||0)).slice(0,12).map(e=>({time:e.event_time,pid:e.data?.pid,process:e.data?.process_name,service:e.service,cpu_pct:e.data?.cpu_pct,memory_bytes:e.data?.memory_bytes,threads:e.data?.threads,io_read_bytes_per_sec:e.data?.io_read_bytes_per_sec,io_write_bytes_per_sec:e.data?.io_write_bytes_per_sec}));
 const runtimeMap=new Map();for(const e of (events||[]).filter(e=>e.type==='runtime')){const k=`${e.service||''}|${e.data?.metric||''}|${JSON.stringify(e.data?.attributes||{})}`;if(!runtimeMap.has(k))runtimeMap.set(k,e);}
 const runtime=[...runtimeMap.values()].slice(0,40).map(e=>({time:e.event_time,service:e.service,metric:e.data?.metric,value:e.data?.value,count:e.data?.count,sum:e.data?.sum,unit:e.data?.unit,attributes:e.data?.attributes}));
 const logs=(events||[]).filter(e=>e.type==='logs'&&/error|fatal|warn/i.test(String(e.data?.severity||''))).slice(0,20).map(e=>({time:e.event_time,service:e.service,severity:e.data?.severity,message:e.data?.message,trace_id:e.trace_id,span_id:e.span_id}));
 const all={counts,top_processes:topProcesses,runtime_metrics:runtime,error_logs:logs,network:latest('network',10),disk:latest('disk',10),changes:latest('change',15),business:latest('business',15),rum:latest('rum',15),database:latest('database',15),kubernetes:latest('kubernetes',10),cloud:latest('cloud',10),profiles:latest('profile',10)};
 if(category==='all')return all;
 if(category==='process')return {count:rows.length,top_processes:topProcesses};
 if(category==='runtime')return {count:rows.length,runtime_metrics:runtime};
 if(category==='logs')return {count:rows.length,error_logs:logs,latest:latest('logs',20)};
 return {count:rows.length,latest:latest(category,30)};
}

const tools=[
 {type:'function',name:'get_journey_intelligence',description:'Inspect inferred business journey structure, stage support, transitions, and transaction-linkage confidence.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_top_anomalies',description:'Inspect current-vs-baseline service and operation anomalies ranked by anomaly score.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:10}},required:['limit']}},
 {type:'function',name:'get_trace_intelligence',description:'Inspect deterministic critical-path/exclusive-time analysis for a specific ranked trace.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{rank:{type:'integer',minimum:1,maximum:20}},required:['rank']}},
 {type:'function',name:'get_infrastructure_context',description:'Inspect aligned host state and application-to-infrastructure correlation.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_evidence_graph',description:'Inspect the cross-layer evidence graph and currently ranked hypotheses.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_semantic_catalog',description:'Inspect how SPARE-M semantically classified the most common operations.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:20}},required:['limit']}},
 {type:'function',name:'get_coverage_intelligence',description:'Inspect what telemetry and application context SPARE-M has, what is missing, what questions the gaps prevent, and the recommended evidence-collection plan.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_current_telemetry_summary',description:'Inspect current request volume, p95 latency, HTTP 4xx/5xx counts, and per-service health for the selected time and business context.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_extended_telemetry',description:'Inspect process, JVM/runtime, logs, network, disk, change, business, RUM, database, Kubernetes, cloud, or profile telemetry currently available to SPARE-M.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{category:{type:'string',enum:['all','process','runtime','logs','network','disk','change','business','rum','database','kubernetes','cloud','profile']}},required:['category']}}
];

function runTool(name,args,intel,infra,correlation,telemetry,events){
 switch(name){
  case 'get_journey_intelligence':return intel.journey;
  case 'get_top_anomalies':return {operations:intel.baselines.operations.slice(0,args.limit),services:intel.baselines.services.slice(0,args.limit),baseline_kind:intel.baselines.baseline_kind};
  case 'get_trace_intelligence':return intel.traces[Math.max(0,args.rank-1)]||{error:'trace rank unavailable'};
  case 'get_infrastructure_context':return {infra,correlation,extended:{process:summarizeExtended(events,'process'),network:summarizeExtended(events,'network'),disk:summarizeExtended(events,'disk'),runtime:summarizeExtended(events,'runtime')}};
  case 'get_evidence_graph':return intel.evidence;
  case 'get_semantic_catalog':return intel.semantic.operations.slice(0,args.limit);
  case 'get_coverage_intelligence':return intel.coverage;
  case 'get_current_telemetry_summary':return telemetry;
  case 'get_extended_telemetry':return summarizeExtended(events,args.category||'all');
  default:return {error:`unknown tool ${name}`};
 }
}

export async function POST(req){
 try{
  const body=await req.json(),rangeKey=ranges[body.range]?body.range:'15m',rangeMinutes=ranges[rangeKey],stage=JOURNEY_ORDER.includes(body.stage)?body.stage:'All';
  const question=String(body.question||'').trim().slice(0,1200);
  const context={
   application:String(body.context?.application||'EasyTravel').slice(0,120),
   journey:String(body.context?.journey||'Booking').slice(0,120),
   stage,
   range:rangeKey,
   service:body.context?.service?String(body.context.service).slice(0,160):null,
   host:body.context?.host?String(body.context.host).slice(0,160):null,
   trace_id:body.context?.trace_id?String(body.context.trace_id).slice(0,160):null
  };
  const sql=db();await ensureExtendedSchema(sql);let agent=body.agent_id;
  if(!agent){const r=await sql`SELECT agent_id FROM spans ORDER BY start_time DESC LIMIT 1`;agent=r[0]?.agent_id;}
  if(!agent)return Response.json({error:'no telemetry agent available'},{status:404});
  const now=Date.now(),cutoffMs=now-rangeMinutes*60000,prevMs=cutoffMs-rangeMinutes*60000,cutoff=new Date(cutoffMs).toISOString(),previousFrom=new Date(prevMs).toISOString();
  const [hosts,currentAll,previousAll,events]=await Promise.all([
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>=${cutoff} ORDER BY collected_at DESC LIMIT 5000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${cutoff} ORDER BY start_time DESC LIMIT 50000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${previousFrom} AND start_time<${cutoff} ORDER BY start_time DESC LIMIT 50000`,
   sql`SELECT type,event_time,agent_id,hostname,service,entity_id,trace_id,span_id,session_id,transaction_id,data FROM telemetry_events WHERE agent_id=${agent} AND event_time>=${cutoff} ORDER BY event_time DESC LIMIT 20000`
  ]);
  const spans=filterByStage(currentAll,stage),previousSpans=filterByStage(previousAll,stage),infra=buildInfra(hosts),correlation=buildCorrelation(spans,hosts,rangeMinutes),intel=buildIntelligence({spans,previousSpans,infra,correlation,events}),telemetry=currentTelemetrySummary(spans);
  if(!process.env.OPENAI_API_KEY)return Response.json({agent_id:agent,range:rangeKey,stage,question,context,agentic:false,reason:'OPENAI_API_KEY not configured',deterministic_assessment:intel.evidence,coverage:intel.coverage,telemetry,extended_telemetry:summarizeExtended(events,'all'),capabilities:intel.capabilities});

  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const model=body.mode==='deep'?'gpt-5.5':'gpt-5.4-mini';
  const format={type:'json_schema',name:'sparem_investigation',strict:true,schema:{type:'object',additionalProperties:false,properties:{summary:{type:'string'},business_assessment:{type:'string'},technical_assessment:{type:'string'},infrastructure_assessment:{type:'string'},leading_hypothesis:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},evidence_for:{type:'array',maxItems:6,items:{type:'string'}},evidence_against:{type:'array',maxItems:5,items:{type:'string'}},next_actions:{type:'array',maxItems:6,items:{type:'string'}},evidence_gaps:{type:'array',maxItems:6,items:{type:'string'}}},required:['summary','business_assessment','technical_assessment','infrastructure_assessment','leading_hypothesis','confidence','evidence_for','evidence_against','next_actions','evidence_gaps']}};
  const userRequest=question||`Investigate the current SPARE-M reliability state for business journey Booking, stage focus ${stage}, time window ${rangeKey}.`;
  let input=[{role:'user',content:`User question: ${userRequest}\nCurrent UI context: ${JSON.stringify(context)}\nUse SPARE-M tools to answer from observed telemetry. Distinguish observed fact, correlation, inference and confirmed cause. If the evidence cannot answer the question, inspect coverage intelligence and state exactly what is missing.`}];
  const used=[];let response;
  for(let iteration=0;iteration<7;iteration++){
   response=await client.responses.create({model,store:false,include:['reasoning.encrypted_content'],reasoning:{effort:body.mode==='deep'?'medium':'low'},text:{verbosity:'low',format},instructions:'You are SPARE-M Copilot, an evidence-grounded business reliability assistant. Answer the user\'s exact question first in plain language. Use the current UI context as scope, not as proof of causality. Select only the SPARE-M tools needed for the question. For infrastructure questions, inspect infrastructure context, process/runtime/network/disk telemetry, and current request telemetry before concluding. For service/error questions, inspect current telemetry, anomalies, runtime metrics and correlated logs when available. For business questions, inspect journey intelligence and trusted business/RUM events when available. Use deterministic tool outputs as facts. Never invent bookings, revenue, users, host ownership, query meaning, or root cause. Never call an inferred journey a confirmed customer transaction when linkage confidence is weak. Prefer exclusive/self-time and baseline deviation over raw inclusive span duration for contributor ranking. Correlation is not causation. Challenge important hypotheses with contrary evidence. If evidence is insufficient, use coverage intelligence to say exactly what signal is missing and the smallest safe configuration change that would improve confidence. Never claim telemetry was enabled automatically unless an explicit execution action succeeded.',tools,tool_choice:'auto',input});
   const calls=(response.output||[]).filter(x=>x.type==='function_call');
   if(!calls.length)break;
   const outputs=[];
   for(const call of calls){let args={};try{args=JSON.parse(call.arguments||'{}')}catch{}used.push(call.name);const value=runTool(call.name,args,intel,infra,correlation,telemetry,events);outputs.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(value)});}
   input=[...input,...response.output,...outputs];
  }
  let result;try{result=JSON.parse(response?.output_text||'{}')}catch{result={summary:response?.output_text||'Investigation incomplete',business_assessment:'',technical_assessment:'',infrastructure_assessment:'',leading_hypothesis:'Insufficient evidence',confidence:0,evidence_for:[],evidence_against:[],next_actions:[],evidence_gaps:[]};}
  return Response.json({agent_id:agent,range:rangeKey,stage,question,context,agentic:true,model,tools_used:[...new Set(used)],response:result,deterministic_leading_hypothesis:intel.evidence.leading_hypothesis,coverage:intel.coverage,telemetry,capabilities:intel.capabilities});
 }catch(e){console.error(e);return Response.json({error:e?.message||'investigation failed'},{status:500});}
}
