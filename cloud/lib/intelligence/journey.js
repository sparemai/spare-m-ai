import {classifySpan} from './semantic';

const ORDER=['Search','Select','Login','Book','Payment','Confirm'];

export function discoverJourneys(spans){
 const byTrace=new Map();
 for(const s of spans||[]){if(!byTrace.has(s.trace_id))byTrace.set(s.trace_id,[]);byTrace.get(s.trace_id).push(s);}
 const transitions=new Map(),stageSupport=new Map(),paths=new Map();
 let tracesWithBusiness=0,totalStages=0,semanticConfidence=0,semanticCount=0;
 for(const rows of byTrace.values()){
  const ordered=[...rows].sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));
  const stages=[];
  for(const s of ordered){
   const c=classifySpan(s);if(!c.business_action)continue;semanticConfidence+=c.confidence;semanticCount++;
   if(stages[stages.length-1]!==c.business_action)stages.push(c.business_action);
  }
  if(!stages.length)continue;tracesWithBusiness++;totalStages+=stages.length;
  for(const stage of new Set(stages))stageSupport.set(stage,(stageSupport.get(stage)||0)+1);
  const key=stages.join(' → ');paths.set(key,(paths.get(key)||0)+1);
  for(let i=1;i<stages.length;i++){const k=`${stages[i-1]}→${stages[i]}`;transitions.set(k,(transitions.get(k)||0)+1);}
 }
 const outgoing=new Map();for(const [k,count] of transitions){const [from]=k.split('→');outgoing.set(from,(outgoing.get(from)||0)+count);}
 const edges=[...transitions.entries()].map(([k,count])=>{const [from,to]=k.split('→');return {from,to,count,probability_pct:Math.round(count/(outgoing.get(from)||count)*1000)/10};}).sort((a,b)=>b.count-a.count);
 const support=ORDER.map(stage=>({stage,traces:stageSupport.get(stage)||0,support_pct:tracesWithBusiness?Math.round((stageSupport.get(stage)||0)/tracesWithBusiness*1000)/10:0}));
 const topPaths=[...paths.entries()].map(([path,count])=>({path,count,share_pct:tracesWithBusiness?Math.round(count/tracesWithBusiness*1000)/10:0})).sort((a,b)=>b.count-a.count).slice(0,10);
 const avgStages=tracesWithBusiness?totalStages/tracesWithBusiness:0;
 const linkageConfidence=Math.min(95,Math.round((avgStages/Math.max(2,ORDER.length))*100));
 const structureConfidence=Math.min(95,Math.round((semanticCount?semanticConfidence/semanticCount:50)*.65+Math.min(30,tracesWithBusiness/5)));
 return {
  name:'Booking',
  inferred_stages:ORDER,
  stage_support:support,
  transitions:edges.slice(0,30),
  common_paths:topPaths,
  structure_confidence:structureConfidence,
  transaction_linkage_confidence:linkageConfidence,
  traces_with_business_semantics:tracesWithBusiness,
  avg_business_stages_per_trace:Math.round(avgStages*10)/10,
  explanation:linkageConfidence<50?'Business structure can be inferred from operation semantics, but individual customer journeys are weakly linked because most traces contain only part of the flow.':'Repeated multi-stage traces provide meaningful transaction-level journey evidence.'
 };
}
