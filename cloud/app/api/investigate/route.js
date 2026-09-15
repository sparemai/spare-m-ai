import OpenAI from 'openai';
import {db} from '../../../lib/db';
import {JOURNEY_ORDER,stageOf,buildInfra,buildCorrelation} from '../../../lib/analytics';
import {buildIntelligence} from '../../../lib/intelligence';
export const runtime='nodejs';
export const maxDuration=60;

const ranges={'15m':15,'1h':60,'6h':360,'24h':1440};
function filterByStage(spans,stage){if(stage==='All')return spans;const ids=new Set(spans.filter(s=>stageOf(s)===stage).map(s=>s.trace_id));return spans.filter(s=>ids.has(s.trace_id));}

const tools=[
 {type:'function',name:'get_journey_intelligence',description:'Inspect inferred business journey structure, stage support, transitions, and transaction-linkage confidence.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_top_anomalies',description:'Inspect current-vs-baseline service and operation anomalies ranked by anomaly score.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:10}},required:['limit']}},
 {type:'function',name:'get_trace_intelligence',description:'Inspect deterministic critical-path/exclusive-time analysis for a specific ranked trace.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{rank:{type:'integer',minimum:1,maximum:20}},required:['rank']}},
 {type:'function',name:'get_infrastructure_context',description:'Inspect aligned host state and application-to-infrastructure correlation.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_evidence_graph',description:'Inspect the cross-layer evidence graph and currently ranked hypotheses.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}},
 {type:'function',name:'get_semantic_catalog',description:'Inspect how SPARE-M semantically classified the most common operations.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:20}},required:['limit']}},
 {type:'function',name:'get_coverage_intelligence',description:'Inspect what telemetry and application context SPARE-M has, what is missing, what questions the gaps prevent, and the recommended evidence-collection plan.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}}
];

function runTool(name,args,intel,infra,correlation){
 switch(name){
  case 'get_journey_intelligence':return intel.journey;
  case 'get_top_anomalies':return {operations:intel.baselines.operations.slice(0,args.limit),services:intel.baselines.services.slice(0,args.limit),baseline_kind:intel.baselines.baseline_kind};
  case 'get_trace_intelligence':return intel.traces[Math.max(0,args.rank-1)]||{error:'trace rank unavailable'};
  case 'get_infrastructure_context':return {infra,correlation};
  case 'get_evidence_graph':return intel.evidence;
  case 'get_semantic_catalog':return intel.semantic.operations.slice(0,args.limit);
  case 'get_coverage_intelligence':return intel.coverage;
  default:return {error:`unknown tool ${name}`};
 }
}

export async function POST(req){
 try{
  const body=await req.json(),rangeKey=ranges[body.range]?body.range:'15m',rangeMinutes=ranges[rangeKey],stage=JOURNEY_ORDER.includes(body.stage)?body.stage:'All';
  const sql=db();let agent=body.agent_id;
  if(!agent){const r=await sql`SELECT agent_id FROM spans ORDER BY start_time DESC LIMIT 1`;agent=r[0]?.agent_id;}
  if(!agent)return Response.json({error:'no telemetry agent available'},{status:404});
  const now=Date.now(),cutoffMs=now-rangeMinutes*60000,prevMs=cutoffMs-rangeMinutes*60000,cutoff=new Date(cutoffMs).toISOString(),previousFrom=new Date(prevMs).toISOString();
  const [hosts,currentAll,previousAll]=await Promise.all([
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent} AND collected_at>=${cutoff} ORDER BY collected_at DESC LIMIT 5000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${cutoff} ORDER BY start_time DESC LIMIT 50000`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent} AND start_time>=${previousFrom} AND start_time<${cutoff} ORDER BY start_time DESC LIMIT 50000`
  ]);
  const spans=filterByStage(currentAll,stage),previousSpans=filterByStage(previousAll,stage),infra=buildInfra(hosts),correlation=buildCorrelation(spans,hosts,rangeMinutes),intel=buildIntelligence({spans,previousSpans,infra,correlation});
  if(!process.env.OPENAI_API_KEY)return Response.json({agent_id:agent,range:rangeKey,stage,agentic:false,reason:'OPENAI_API_KEY not configured',deterministic_assessment:intel.evidence,coverage:intel.coverage,capabilities:intel.capabilities});

  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const model=body.mode==='deep'?'gpt-5.6-sol':'gpt-5.6-luna';
  const format={type:'json_schema',name:'sparem_investigation',strict:true,schema:{type:'object',additionalProperties:false,properties:{summary:{type:'string'},business_assessment:{type:'string'},technical_assessment:{type:'string'},infrastructure_assessment:{type:'string'},leading_hypothesis:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},evidence_for:{type:'array',maxItems:6,items:{type:'string'}},evidence_against:{type:'array',maxItems:5,items:{type:'string'}},next_actions:{type:'array',maxItems:6,items:{type:'string'}},evidence_gaps:{type:'array',maxItems:6,items:{type:'string'}}},required:['summary','business_assessment','technical_assessment','infrastructure_assessment','leading_hypothesis','confidence','evidence_for','evidence_against','next_actions','evidence_gaps']}};
  let input=[{role:'user',content:`Investigate the current SPARE-M reliability state for business journey Booking, stage focus ${stage}, time window ${rangeKey}. Use tools to gather evidence before concluding. Do not assume root cause. Distinguish observed fact, correlation, inference and confirmed cause. If the available evidence cannot answer a diagnostic question, inspect coverage intelligence and recommend the smallest telemetry/configuration change that would close that evidence gap.`}];
  const used=[];let response;
  for(let iteration=0;iteration<7;iteration++){
   response=await client.responses.create({model,store:false,include:['reasoning.encrypted_content'],reasoning:{effort:body.mode==='deep'?'medium':'low'},text:{verbosity:'low',format},instructions:'You are the SPARE-M autonomous reliability investigator. Business impact first, then trace/service evidence, then infrastructure. Use deterministic tool outputs as facts. Never call an inferred journey a confirmed customer transaction when linkage confidence is weak. Prefer exclusive/self-time and baseline deviation over raw inclusive span duration for contributor ranking. Correlation is not causation. Challenge your leading hypothesis with contrary evidence. Before asking for more data, use coverage intelligence to identify exactly which signal is missing, what question it prevents, and the lowest-cost read-only or privacy-safe configuration that would improve confidence. Never claim that telemetry was enabled automatically unless an explicit execution action succeeded.',tools,tool_choice:'auto',input});
   const calls=(response.output||[]).filter(x=>x.type==='function_call');
   if(!calls.length)break;
   const outputs=[];
   for(const call of calls){let args={};try{args=JSON.parse(call.arguments||'{}')}catch{}used.push(call.name);const value=runTool(call.name,args,intel,infra,correlation);outputs.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(value)});}
   input=[...input,...response.output,...outputs];
  }
  let result;try{result=JSON.parse(response?.output_text||'{}')}catch{result={summary:response?.output_text||'Investigation incomplete',business_assessment:'',technical_assessment:'',infrastructure_assessment:'',leading_hypothesis:'Insufficient evidence',confidence:0,evidence_for:[],evidence_against:[],next_actions:[],evidence_gaps:[]};}
  return Response.json({agent_id:agent,range:rangeKey,stage,agentic:true,model,tools_used:[...new Set(used)],response:result,deterministic_leading_hypothesis:intel.evidence.leading_hypothesis,coverage:intel.coverage,capabilities:intel.capabilities});
 }catch(e){console.error(e);return Response.json({error:e?.message||'investigation failed'},{status:500});}
}
