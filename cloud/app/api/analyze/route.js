import crypto from 'node:crypto';
import OpenAI from 'openai';
import {db} from '../../../lib/db';
import {buildJourney,buildTechnical,buildInfra,summarizeEvidence} from '../../../lib/analytics';
export const runtime='nodejs';
export const maxDuration=60;
function compact(journey,technical,infra,evidence){return {journey:{name:journey.name,mode:journey.mode,confidence:journey.confidence,stages:journey.stages,primary_leak:journey.primary_leak},technical:{edges:technical.edges?.slice(0,8),top_operations:technical.top_operations?.slice(0,6)},infrastructure:infra,evidence};}
export async function POST(req){
 try{
  const {agent_id,mode='quick'}=await req.json(); if(!agent_id)return Response.json({error:'agent_id required'},{status:400}); if(!process.env.OPENAI_API_KEY)return Response.json({error:'OPENAI_API_KEY not configured'},{status:400});
  const sql=db(); const [hosts,spans]=await Promise.all([
   sql`SELECT agent_id,hostname,collected_at,cpu,memory,uptime_seconds,disks FROM host_samples WHERE agent_id=${agent_id} AND collected_at>NOW()-INTERVAL '2 hours' ORDER BY collected_at DESC LIMIT 120`,
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE agent_id=${agent_id} AND start_time>NOW()-INTERVAL '15 minutes' ORDER BY start_time DESC LIMIT 2500`
  ]);
  if(!hosts.length&&!spans.length)return Response.json({error:'no telemetry'},{status:404});
  const journey=buildJourney(spans),technical=buildTechnical(spans),infra=buildInfra(hosts),evidence=summarizeEvidence(journey,technical,infra),ctx=compact(journey,technical,infra,evidence);
  const deep=mode==='deep'; const fp=crypto.createHash('sha256').update(JSON.stringify({mode,ctx})).digest('hex');
  const cached=(await sql`SELECT model,input_tokens,output_tokens,response,created_at FROM ai_analysis WHERE agent_id=${agent_id} AND fingerprint=${fp} AND created_at>NOW()-INTERVAL '15 minutes' ORDER BY created_at DESC LIMIT 1`)[0]; if(cached)return Response.json({...cached,cached:true});
  const model=deep?'gpt-5.6-sol':'gpt-5.6-luna'; const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const response=await client.responses.create({model,store:false,reasoning:{effort:deep?'medium':'low'},text:{verbosity:'low',format:{type:'json_schema',name:'sparem_assessment',strict:true,schema:{type:'object',additionalProperties:false,properties:{summary:{type:'string'},business_impact:{type:'string'},technical_assessment:{type:'string'},infrastructure_assessment:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},hypotheses:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,properties:{text:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},evidence_for:{type:'array',items:{type:'string'},maxItems:4},evidence_against:{type:'array',items:{type:'string'},maxItems:3}},required:['text','confidence','evidence_for','evidence_against']}},next_actions:{type:'array',items:{type:'string'},maxItems:6},evidence_gaps:{type:'array',items:{type:'string'},maxItems:5}},required:['summary','business_impact','technical_assessment','infrastructure_assessment','confidence','hypotheses','next_actions','evidence_gaps']}}},max_output_tokens:deep?900:450,instructions:`You are SPARE-M-AI. Explain business journey impact first, then technical flow, then infrastructure. Use ONLY supplied evidence. Distinguish observations, correlations, hypotheses and confirmed causes. Never convert proxy journey leakage into true business conversion loss unless journey mode is business-semantic. Never claim causality without evidence. Recommend the smallest next diagnostic step. Do not recommend CPU/RAM scaling solely from utilization. Keep the answer concise and operational.`,input:JSON.stringify(ctx)});
  let parsed; try{parsed=JSON.parse(response.output_text)}catch{parsed={summary:response.output_text,business_impact:'',technical_assessment:'',infrastructure_assessment:'',confidence:0,hypotheses:[],next_actions:[],evidence_gaps:[]};}
  const inputTokens=response.usage?.input_tokens||0,outputTokens=response.usage?.output_tokens||0; await sql`INSERT INTO ai_analysis(agent_id,fingerprint,model,input_tokens,output_tokens,response) VALUES (${agent_id},${fp},${model},${inputTokens},${outputTokens},${JSON.stringify(parsed)}::jsonb)`;
  return Response.json({model,input_tokens:inputTokens,output_tokens:outputTokens,response:parsed,cached:false});
 }catch(e){console.error(e);return Response.json({error:e?.message||'AI analysis failed'},{status:500});}
}
