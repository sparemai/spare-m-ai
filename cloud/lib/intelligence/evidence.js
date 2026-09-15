function confidenceFromEvidence(forCount,againstCount,quality=70){
 return Math.max(20,Math.min(96,Math.round(quality+forCount*6-againstCount*8)));
}

export function buildEvidenceGraph({journeyDiscovery,semanticCatalog,traceIntelligence,baselines,infra,correlation}){
 const nodes=[],edges=[];
 const addNode=(id,type,label,meta={})=>{if(!nodes.some(n=>n.id===id))nodes.push({id,type,label,...meta});};
 const addEdge=(from,to,type,evidence={})=>edges.push({from,to,type,...evidence});
 addNode('journey:booking','journey','Booking',{confidence:journeyDiscovery?.structure_confidence||0});
 for(const s of journeyDiscovery?.stage_support||[]){if(!s.traces)continue;const id=`stage:${s.stage}`;addNode(id,'stage',s.stage,{support_pct:s.support_pct});addEdge('journey:booking',id,'HAS_STAGE');}
 const topTrace=traceIntelligence?.[0]||null,dominant=topTrace?.dominant_contributor||null;
 if(dominant){
  const sid=`service:${dominant.service}`,oid=`operation:${dominant.service}:${dominant.operation}`;
  addNode(sid,'service',dominant.service);addNode(oid,'operation',dominant.operation,{execution_share_pct:dominant.execution_share_pct,self_time_ms:dominant.self_time_ms});
  addEdge('journey:booking',sid,'EXECUTED_BY',{source:'trace-intelligence'});addEdge(sid,oid,'CONTAINS',{source:'trace-intelligence'});
 }
 for(const hop of topTrace?.service_hops||[]){const a=`service:${hop.from}`,b=`service:${hop.to}`;addNode(a,'service',hop.from);addNode(b,'service',hop.to);addEdge(a,b,'CALLS',{duration_ms:hop.duration_ms,error:hop.error});}
 if(infra?.current){const hid=`host:${infra.current.hostname}`;addNode(hid,'host',infra.current.hostname,{cpu:infra.current.cpu,memory:infra.current.memory,disk_max:infra.current.disk_max});if(dominant)addEdge(`service:${dominant.service}`,hid,'RUNS_WITH_HOST_CONTEXT',{note:'Host/service ownership is inferred from shared agent context in this MVP.'});}

 const hypotheses=[];
 const topOpBaseline=dominant?baselines?.operations?.find(x=>x.service===dominant.service&&x.operation===dominant.operation):baselines?.operations?.[0];
 const p95Delta=Number(topOpBaseline?.delta?.p95_pct||0),share=Number(dominant?.execution_share_pct||0),corr=Math.max(Math.abs(Number(correlation?.latency_cpu||0)),Math.abs(Number(correlation?.latency_memory||0)));
 const hotInfra=Number(infra?.current?.cpu||0)>=85||Number(infra?.current?.memory||0)>=90;
 if(dominant){
  const support=[];const against=[];
  if(share>=40)support.push(`Dominant operation accounts for ${share}% of trace exclusive execution.`);
  if(p95Delta>=50)support.push(`Operation p95 is ${p95Delta}% above the prior window.`);
  if(corr<.4)against.push('Application latency has weak temporal correlation with host CPU/memory.');
  if(!hotInfra)against.push('Host CPU and memory are not saturated.');
  hypotheses.push({id:'application-execution',title:'Application execution regression',target:`${dominant.service} • ${dominant.operation}`,confidence:confidenceFromEvidence(support.length,0,58+Math.min(20,share/4)+Math.min(12,Math.max(0,p95Delta)/25)),evidence_for:support,evidence_against:against,next_step:`Inspect code/profile evidence around ${dominant.operation} and compare affected traces with normal traces.`});
 }
 if(infra?.current){
  const support=[];const against=[];
  if(hotInfra)support.push(`Host resources are elevated: CPU ${infra.current.cpu}%, memory ${infra.current.memory}%.`);else against.push(`Host resources are not saturated: CPU ${infra.current.cpu}%, memory ${infra.current.memory}%.`);
  if(corr>=.7)support.push(`Latency/resource temporal correlation is strong (${corr.toFixed(2)}).`);else if(corr<.4)against.push(`Latency/resource correlation is weak (${corr.toFixed(2)}).`);
  hypotheses.push({id:'infrastructure-pressure',title:'Infrastructure resource pressure',target:infra.current.hostname,confidence:confidenceFromEvidence(support.length,against.length,hotInfra?58:38),evidence_for:support,evidence_against:against,next_step:'Inspect process/JVM-level CPU, GC, memory and I/O before considering capacity changes.'});
 }
 const ranked=hypotheses.sort((a,b)=>b.confidence-a.confidence);
 const winner=ranked[0]||null;
 const qualitySignals=[journeyDiscovery?.structure_confidence||0,topTrace?.evidence_quality?.tree_coverage_pct||0,baselines?.operations?.length?80:45,infra?.current?85:35];
 const evidenceQuality=Math.round(qualitySignals.reduce((a,x)=>a+x,0)/qualitySignals.length);
 return {
  graph:{nodes,edges},
  hypotheses:ranked,
  leading_hypothesis:winner,
  evidence_quality:evidenceQuality,
  assessment:winner?`${winner.title} is currently the strongest evidence-backed hypothesis.`:'Insufficient evidence to rank a technical hypothesis.',
  limitations:[
   ...(journeyDiscovery?.transaction_linkage_confidence<50?['Journey structure is inferred, but individual user/session linkage is weak.']:[]),
   ...(!infra?.current?['No aligned infrastructure sample is available.']:[]),
   'Hypotheses are evidence rankings, not confirmed causal conclusions.'
  ]
 };
}
