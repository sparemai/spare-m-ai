const round=v=>Math.round(Number(v||0));
const clamp=v=>Math.max(0,Math.min(100,round(v)));
const sevRank={CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1};

function values(spans,source){
 const out=[];
 for(const s of spans||[]){const obj=s?.[source]||{};for(const [k,v] of Object.entries(obj))out.push([k,v]);}
 return out;
}
function hasKey(spans,keys,source='attrs'){
 const wanted=new Set(keys);
 return (spans||[]).some(s=>Object.keys(s?.[source]||{}).some(k=>wanted.has(k)));
}
function hasPrefix(spans,prefixes,source='resource'){
 return (spans||[]).some(s=>Object.keys(s?.[source]||{}).some(k=>prefixes.some(p=>k.startsWith(p))));
}
function attrValue(spans,keys,source='resource'){
 for(const s of spans||[]){for(const k of keys){const v=s?.[source]?.[k];if(v!==undefined&&v!==null&&String(v)!=='')return String(v);}}
 return null;
}
function containsSql(op){return /^\s*(select|insert|update|delete|merge|call|exec|with)\b/i.test(String(op||''));}
function explicitShare(spans,key){if(!(spans||[]).length)return 0;return clamp(spans.filter(s=>s?.attrs?.[key]!==undefined).length*100/spans.length);}

function fingerprint(spans){
 const runtime=attrValue(spans,['process.runtime.name','process.runtime.description']);
 const language=attrValue(spans,['telemetry.sdk.language']);
 const java=String(runtime||language||'').toLowerCase().includes('java')||hasPrefix(spans,['jvm.'],'attrs');
 const db=(spans||[]).some(s=>hasKey([s],['db.system','db.system.name','db.operation.name','db.statement','db.query.text'])||containsSql(s.operation));
 const messaging=hasKey(spans,['messaging.system','messaging.system.name']);
 const kubernetes=hasPrefix(spans,['k8s.']);
 const cloud=hasPrefix(spans,['cloud.']);
 const browser=hasPrefix(spans,['browser.','webengine.','rum.'])||hasKey(spans,['user_agent.original','browser.language']);
 const technologies=[];
 if(java)technologies.push({name:'Java/JVM',confidence:runtime||language?95:70});
 if(db)technologies.push({name:'Database access',confidence:95});
 if(messaging)technologies.push({name:'Messaging',confidence:95});
 if(kubernetes)technologies.push({name:'Kubernetes',confidence:98});
 if(cloud)technologies.push({name:'Cloud runtime',confidence:95});
 if(browser)technologies.push({name:'Browser/RUM context',confidence:85});
 return {runtime:runtime||language||null,java,db,messaging,kubernetes,cloud,browser,technologies};
}

function signal(id,label,score,status,evidence,prevents){return {id,label,score:clamp(score),status,evidence,prevents};}
function gap(id,title,severity,impact,recommendation,collection,reason){return {id,title,severity,impact,recommendation,collection,reason};}

export function buildCoverageIntelligence({spans=[],infra={},journey={},traces=[],baselines={},evidence={}}={}){
 const tech=fingerprint(spans);
 const spanCount=spans.length;
 const traceIds=new Set(spans.map(s=>s.trace_id).filter(Boolean));
 const services=new Set(spans.map(s=>s.service).filter(Boolean));
 const linked=spans.filter(s=>s.parent_span_id).length;
 const crossService=traces.some(t=>Number(t.service_count||0)>1)||services.size>1&&linked>0;
 const explicitBusiness=explicitShare(spans,'sparem.business.step');
 const journeyIds=hasKey(spans,['sparem.journey.id','sparem.session.id','session.id','enduser.session.id']);
 const transactionValue=hasKey(spans,['sparem.transaction.value','business.transaction.value','order.value','cart.value']);
 const queryText=hasKey(spans,['db.query.text','db.statement'])||spans.some(s=>containsSql(s.operation));
 const dbIdentity=hasKey(spans,['db.system','db.system.name','db.namespace','db.name','server.address']);
 const exceptionDetails=hasKey(spans,['exception.type','exception.message','error.type']);
 const serviceVersion=hasKey(spans,['service.version'],'resource');
 const processIdentity=hasKey(spans,['process.pid','process.executable.name','process.command'],'resource');
 const hostIdentity=hasKey(spans,['host.id','host.name'],'resource')||Boolean(infra?.current?.hostname);
 const k8sIdentity=hasPrefix(spans,['k8s.']);
 const currentErrors=traces.filter(t=>Number(t.error_count||0)>0).length;
 const topTrace=traces[0];
 const selfHeavy=Number(topTrace?.dominant_contributor?.execution_share_pct||0)>=40;
 const topAnomaly=baselines?.operations?.[0];
 const anomalyHigh=Number(topAnomaly?.anomaly_score||0)>=60;
 const journeyStructure=Number(journey?.structure_confidence||0);
 const linkage=Number(journey?.transaction_linkage_confidence||0);

 const signals=[
  signal('distributed_traces','Distributed traces',spanCount?100:0,spanCount?'available':'missing',spanCount?`${spanCount} spans across ${traceIds.size} traces`:'No spans observed',['service execution path','critical path','latency attribution']),
  signal('service_topology','Service topology',crossService?100:services.size?55:0,crossService?'available':services.size?'partial':'missing',`${services.size} services discovered`,['cross-service dependency mapping']),
  signal('host_metrics','Host metrics',infra?.current?100:0,infra?.current?'available':'missing',infra?.current?`Host ${infra.current.hostname||'identified'} reporting CPU/memory/disk`:'No host samples',['resource saturation correlation']),
  signal('process_correlation','Process ↔ service correlation',processIdentity&&hostIdentity?85:processIdentity||hostIdentity?45:0,processIdentity&&hostIdentity?'available':processIdentity||hostIdentity?'partial':'missing',`process identity ${processIdentity?'present':'absent'}; host identity ${hostIdentity?'present':'absent'}`,['exact service → process → host attribution']),
  signal('runtime_metrics','Runtime metrics',0,'missing',tech.java?'Java/JVM detected but JVM runtime metrics are not ingested':'No runtime metric stream is currently ingested',['GC/heap/thread/runtime bottleneck discrimination']),
  signal('application_logs','Application logs',0,'missing','No application log stream is currently ingested',['exception grouping','business failure reason extraction','trace-to-log evidence']),
  signal('error_context','Exception/error context',exceptionDetails?80:0,exceptionDetails?'available':'missing',exceptionDetails?'Exception/error attributes observed':'No structured exception attributes observed',['precise failure classification']),
  signal('database_visibility','Database visibility',tech.db?(dbIdentity?90:60):100,tech.db?(dbIdentity?'available':'partial'):'not_applicable',tech.db?(dbIdentity?'Database identity attributes observed':'Database access inferred but database identity is incomplete'):'No database spans detected',['database dependency attribution']),
  signal('query_visibility','Query visibility',tech.db?(queryText?90:20):100,tech.db?(queryText?'available':'partial'):'not_applicable',tech.db?(queryText?'SQL/query evidence observed':'Database access exists but query text/operation detail is incomplete'):'No database spans detected',['query-level bottleneck and table/entity inference']),
  signal('business_semantics','Business semantics',explicitBusiness>=60?95:explicitBusiness>0?55:journeyStructure?35:0,explicitBusiness>=60?'available':explicitBusiness>0||journeyStructure?'partial':'missing',explicitBusiness?`${explicitBusiness}% of spans carry explicit business-step semantics`:`Business flow is inferred; structure confidence ${journeyStructure}%`,['trusted business-stage attribution']),
  signal('journey_correlation','Journey/session correlation',journeyIds?95:Math.min(45,linkage),journeyIds?'available':linkage?'partial':'missing',journeyIds?'Journey/session correlation identifier observed':`No stable business journey/session id; transaction linkage confidence ${linkage}%`,['true conversion/drop-off','single-customer journey reconstruction']),
  signal('business_value','Business value context',transactionValue?95:0,transactionValue?'available':'missing',transactionValue?'Transaction value attribute observed':'No trusted transaction/order value attribute observed',['revenue/value-at-risk calculations']),
  signal('change_intelligence','Deployment/change context',serviceVersion?45:0,serviceVersion?'partial':'missing',serviceVersion?'Service version metadata exists; deployment/change events are still absent':'No deployment/version/change stream observed',['release-regression correlation','before/after version comparison']),
  signal('profiles','Code profiling',0,'missing','No continuous or targeted profile signal is ingested',['method-level CPU/hot-path attribution']),
  signal('rum','Real-user/browser telemetry',tech.browser?55:0,tech.browser?'partial':'missing',tech.browser?'Browser context detected but a complete RUM signal is not established':'No browser/RUM telemetry observed',['actual user actions','frontend errors','user-visible latency']),
  signal('kubernetes_context','Kubernetes context',tech.kubernetes?(k8sIdentity?90:40):100,tech.kubernetes?(k8sIdentity?'available':'partial'):'not_applicable',tech.kubernetes?'Kubernetes resource attributes detected':'Kubernetes not detected',['workload/pod/node ownership'])
 ];

 const gaps=[];
 if(!journeyIds&&journeyStructure>0)gaps.push(gap('journey_correlation','Journey transaction correlation','HIGH',['Cannot prove that Search → Payment → Confirm belongs to the same customer transaction.','True conversion and drop-off remain inferred.'],'Add or discover a stable privacy-safe journey/session correlation identifier and propagate it across requests.',{mode:'continuous',cost:'low',safety:'application-enrichment',examples:['sparem.journey.id','session.id']},'Business journey structure is visible, but individual transaction linkage is weak.'));
 if(explicitBusiness<60&&journeyStructure>0)gaps.push(gap('business_semantics','Trusted business semantics','MEDIUM',['Stage naming remains inference rather than application ground truth.'],'Keep AI/process-mining inference, but allow discovered stages to be confirmed or enriched with business-step semantics.',{mode:'continuous',cost:'low',safety:'application-enrichment',examples:['sparem.business.step','sparem.business.journey']},'The journey is understood probabilistically rather than explicitly.'));
 if(!transactionValue&&(journey?.stages||[]).some(s=>['Book','Payment','Confirm'].includes(s.name)&&s.count>0))gaps.push(gap('business_value','Business value / transaction amount','HIGH',['SPARE-M cannot calculate revenue, booking value, GMV or value-at-risk without a trusted business measure.'],'Expose an approved, non-sensitive transaction value metric with explicit business meaning and currency; do not infer revenue from an ambiguous amount column.',{mode:'continuous',cost:'low',safety:'business-data-review',examples:['sparem.transaction.value','sparem.transaction.currency']},'Commercial stages are detected but no trusted value attribute exists.'));
 if(!serviceVersion||anomalyHigh)gaps.push(gap('change_intelligence','Deployment and configuration change intelligence',anomalyHigh?'HIGH':'MEDIUM',['Cannot strongly test whether a degradation started after a release, config change or feature flag.'],'Ingest deployment/version/configuration events and associate them with service/environment entities.',{mode:'continuous',cost:'low',safety:'read-only',examples:['service.version','deployment event','feature flag change']},anomalyHigh?'A significant operation anomaly exists and change evidence would materially improve causality.':'Change evidence is absent from the application model.'));
 if(tech.java&&selfHeavy)gaps.push(gap('runtime_metrics','JVM/runtime metrics','HIGH',['High application self-time cannot be separated into GC, heap pressure, thread contention or pure code execution.'],'Enable low-overhead JVM runtime metrics for heap, GC, threads and CPU and correlate them to service.instance.id.',{mode:'continuous',cost:'low',safety:'read-only',examples:['jvm.memory.*','jvm.gc.*','jvm.thread.*']},'Trace intelligence localized material time inside application execution.'));
 else if(tech.java)gaps.push(gap('runtime_metrics','JVM/runtime metrics','MEDIUM',['Future Java runtime incidents would have limited diagnostic depth.'],'Enable low-overhead JVM runtime metrics and service-instance correlation.',{mode:'continuous',cost:'low',safety:'read-only',examples:['jvm.memory.*','jvm.gc.*','jvm.thread.*']},'Java/JVM technology was detected.'));
 if(!processIdentity&&hostIdentity)gaps.push(gap('process_correlation','Process ↔ service ↔ host correlation','MEDIUM',['Host CPU/memory cannot be attributed precisely to the Java/service process.'],'Collect process identity and per-process CPU/memory with stable service/host correlation.',{mode:'continuous',cost:'low',safety:'read-only',examples:['process.pid','process.executable.name','process CPU/memory']},'Host metrics exist but process ownership is incomplete.'));
 if(currentErrors&&!exceptionDetails)gaps.push(gap('application_logs','Application logs and exception context','HIGH',['Errors are visible in traces but root exception families and business failure reasons are not.'],'Ingest structured application logs with trace/span correlation and redact sensitive fields.',{mode:'continuous',cost:'medium',safety:'redaction-required',examples:['trace_id','span_id','severity','exception.type']},'Error traces exist without structured exception/log evidence.'));
 else gaps.push(gap('application_logs','Application logs','MEDIUM',['Future failures may stop at HTTP/span error status without application explanation.'],'Add structured logs with trace/span correlation, retention controls and field redaction.',{mode:'continuous',cost:'medium',safety:'redaction-required',examples:['trace_id','span_id','severity']},'No log stream is currently available to the application brain.'));
 if(tech.db&&!queryText)gaps.push(gap('query_visibility','Database query intelligence','HIGH',['SPARE-M can see database activity but cannot rank individual queries or infer database entities reliably.'],'Capture normalized DB operation/query metadata with bind values removed or redacted.',{mode:'continuous',cost:'low-medium',safety:'redaction-required',examples:['db.operation.name','db.query.summary','normalized SQL']},'Database activity is detected without sufficient query-level evidence.'));
 if(selfHeavy)gaps.push(gap('profiles','Targeted code profiling','HIGH',['Trace self-time identifies application execution but not the hot method/code path.'],'Use on-demand JFR/profiling only for the affected service during a short diagnostic window.',{mode:'on-demand',cost:'medium',safety:'approval-recommended',examples:['5-minute JFR','continuous profile sample']},'The leading trace evidence is dominated by exclusive application execution.'));
 else gaps.push(gap('profiles','Targeted profiling capability','LOW',['Deep code-level attribution will be unavailable when traces end at application self-time.'],'Prepare an on-demand profiling integration; keep it disabled until an investigation requests it.',{mode:'on-demand',cost:'medium',safety:'approval-recommended',examples:['JFR','eBPF profiler']},'Profiling is a future diagnostic capability, not required continuously.'));
 if(!tech.browser)gaps.push(gap('rum','Real-user monitoring / browser journey signal','MEDIUM',['Server traces infer business flow but do not directly observe user actions, frontend errors or abandonment.'],'Add privacy-safe browser/RUM telemetry for applications with human interaction.',{mode:'continuous',cost:'medium',safety:'privacy-review',examples:['page/action timing','frontend error','session correlation']},'The current model is primarily server-side.'));

 const expected=signals.filter(s=>s.status!=='not_applicable');
 const weights={distributed_traces:14,service_topology:8,host_metrics:8,process_correlation:7,runtime_metrics:7,application_logs:7,error_context:4,database_visibility:5,query_visibility:5,business_semantics:10,journey_correlation:10,business_value:8,change_intelligence:8,profiles:3,rum:7,kubernetes_context:4};
 let num=0,den=0;for(const s of expected){const w=weights[s.id]||5;num+=s.score*w;den+=100*w;}
 const overall=den?clamp(num*100/den):0;
 const category=(ids)=>{const a=expected.filter(s=>ids.includes(s.id));return a.length?clamp(a.reduce((n,s)=>n+s.score,0)/a.length):100;};
 const categories={business:category(['business_semantics','journey_correlation','business_value','rum']),technical:category(['distributed_traces','service_topology','database_visibility','query_visibility','application_logs','error_context']),runtime:category(['process_correlation','runtime_metrics','profiles']),infrastructure:category(['host_metrics','kubernetes_context']),change:category(['change_intelligence'])};
 gaps.sort((a,b)=>(sevRank[b.severity]||0)-(sevRank[a.severity]||0));
 const plan=gaps.slice(0,6).map((g,i)=>({priority:i+1,gap_id:g.id,title:g.title,severity:g.severity,why_now:g.reason,action:g.recommendation,collection:g.collection,automatic_execution:false}));
 const critical=gaps.filter(g=>['CRITICAL','HIGH'].includes(g.severity)).length;
 return {
  version:'0.1.0',
  understanding_score:overall,
  categories,
  technology_fingerprint:tech,
  signals,
  gaps,
  planner:{mode:'recommend-only',high_priority_gaps:critical,plan,note:'SPARE-M recommends evidence collection but does not change telemetry configuration automatically. Adaptive collection requires explicit policy and approval controls.'},
  summary:critical?`${critical} high-priority evidence gap${critical===1?'':'s'} currently limit diagnostic or business confidence.`:'No high-priority evidence gap is currently blocking the application model.'
 };
}
