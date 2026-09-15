export const JOURNEY_ORDER=['Search','Select','Login','Book','Payment','Confirm'];

// Rules are intentionally specific-first. Generic "booking" matching previously
// collapsed payment/confirmation requests into the Book stage.
const journeyRules=[
 {name:'Confirm',patterns:[/orange-booking-finish/i,/confirm/i,/confirmation/i,/success/i,/receipt/i,/complete.*book/i]},
 {name:'Payment',patterns:[/orange-booking-payment/i,/payment/i,/checkout/i,/credit/i,/\bpay\b/i]},
 {name:'Login',patterns:[/login/i,/signin/i,/authenticate/i,/\bauth\b/i]},
 {name:'Select',patterns:[/orange-booking-start/i,/select.*journey/i,/journey.*detail/i,/load.*journey/i]},
 {name:'Book',patterns:[/orange-booking-review/i,/book.*journey/i,/booking/i,/reserve/i]},
 {name:'Search',patterns:[/orange\.xhtml/i,/search/i,/find.*journey/i,/journeys?/i,/query.*journey/i,/CalculateRecommendations/i,/special-offers/i,/recommend/i]}
];

const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
const percentile=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))];};
const isError=s=>Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;
const numeric=v=>Number.isFinite(Number(v))?Number(v):null;

export function stageOf(span){
 const explicit=span.attrs?.['sparem.business.step'];
 if(explicit){const normalized=JOURNEY_ORDER.find(x=>x.toLowerCase()===String(explicit).toLowerCase());return normalized||String(explicit);}
 if(Number(span.kind)!==2)return null;
 const text=[span.operation,span.attrs?.['http.route'],span.attrs?.['url.path'],span.attrs?.['url.full']].filter(Boolean).join(' ');
 for(const rule of journeyRules)if(rule.patterns.some(r=>r.test(text)))return rule.name;
 return null;
}

export function buildJourney(spans){
 const map=new Map(JOURNEY_ORDER.map(s=>[s,{name:s,count:0,errors:0,durations:[],services:new Set(),explicit:0}]));
 let explicitTotal=0,mappedTotal=0;
 for(const s of spans){
  const step=stageOf(s);if(!step||!map.has(step))continue;mappedTotal++;
  const x=map.get(step);x.count++;if(isError(s))x.errors++;x.durations.push(Number(s.duration_ms)||0);if(s.service)x.services.add(s.service);
  if(s.attrs?.['sparem.business.step']){x.explicit++;explicitTotal++;}
 }
 const stages=JOURNEY_ORDER.map(name=>{const x=map.get(name);return {name,count:x.count,observed:x.count>0,error_rate:pct(x.errors,x.count),p95_ms:Math.round(percentile(x.durations,.95)),services:[...x.services],mapping:x.explicit>0?'explicit':'route-inferred'};});
 for(let i=0;i<stages.length;i++){
  if(i===0){stages[i].activity_change_pct=null;continue;}
  const prev=stages[i-1],cur=stages[i];
  stages[i].activity_change_pct=prev.count>0&&cur.count>0?Math.round((cur.count-prev.count)/prev.count*1000)/10:null;
 }
 const observed=stages.filter(x=>x.observed);
 const problem=[...observed].sort((a,b)=>(b.error_rate*3+b.p95_ms/1000)-(a.error_rate*3+a.p95_ms/1000))[0]||null;
 const semanticShare=mappedTotal?explicitTotal/mappedTotal:0;
 return {
  name:'EasyTravel Journey',
  mode:semanticShare>.8?'business-semantic':'route-inferred',
  confidence:semanticShare>.8?95:75,
  stages,
  primary_leak:problem,
  mapping:{strategy:semanticShare>.8?'explicit span attributes':'specific-first server route classification',explicit_share_pct:Math.round(semanticShare*1000)/10,mapped_server_spans:mappedTotal,priority:['Confirm','Payment','Login','Select','Book','Search'],note:'Stage counts are sampled server activity, not unique-user conversion. Add sparem.business.step plus a journey/session correlation id for true conversion.'}
 };
}

export function buildTechnical(spans){
 const byId=new Map(spans.map(s=>[`${s.trace_id}:${s.span_id}`,s]));const edges=new Map();
 for(const child of spans){if(!child.parent_span_id)continue;const parent=byId.get(`${child.trace_id}:${child.parent_span_id}`);if(!parent)continue;const key=`${parent.service}→${child.service}`;let e=edges.get(key);if(!e){e={from:parent.service,to:child.service,calls:0,errors:0,durations:[]};edges.set(key,e);}e.calls++;if(isError(child))e.errors++;e.durations.push(Number(child.duration_ms)||0);}
 const list=[...edges.values()].map(e=>({from:e.from,to:e.to,calls:e.calls,error_rate:pct(e.errors,e.calls),p95_ms:Math.round(percentile(e.durations,.95))})).sort((a,b)=>b.calls-a.calls).slice(0,20);
 const ops={},services={};
 for(const s of spans){
  const k=`${s.service} • ${s.operation}`;if(!ops[k])ops[k]={service:s.service,operation:s.operation,count:0,errors:0,durations:[]};const o=ops[k];o.count++;if(isError(s))o.errors++;o.durations.push(Number(s.duration_ms)||0);
  const name=s.service||'unknown';if(!services[name])services[name]={service:name,spans:0,errors:0,durations:[],traces:new Set()};const svc=services[name];svc.spans++;if(isError(s))svc.errors++;svc.durations.push(Number(s.duration_ms)||0);svc.traces.add(s.trace_id);
 }
 const top=Object.values(ops).map(o=>({service:o.service,operation:o.operation,count:o.count,error_rate:pct(o.errors,o.count),p95_ms:Math.round(percentile(o.durations,.95))})).sort((a,b)=>(b.p95_ms+b.error_rate*100)-(a.p95_ms+a.error_rate*100)).slice(0,12);
 const service_stats=Object.values(services).map(s=>({service:s.service,spans:s.spans,traces:s.traces.size,error_rate:pct(s.errors,s.spans),p95_ms:Math.round(percentile(s.durations,.95))})).sort((a,b)=>b.spans-a.spans);
 return {edges:list,top_operations:top,service_stats};
}

export function buildInfra(hostRows){
 if(!hostRows.length)return {current:null,baseline:null};
 const rows=[...hostRows].sort((a,b)=>new Date(b.collected_at)-new Date(a.collected_at));const latest=rows[0],baselineRows=rows.slice(1);const avg=k=>baselineRows.length?baselineRows.reduce((s,r)=>s+Number(r[k]||0),0)/baselineRows.length:0;
 const disks=latest.disks||[];const diskMax=Array.isArray(disks)?disks.reduce((m,d)=>Math.max(m,Number(d.used_percent||0)),0):0;
 return {current:{hostname:latest.hostname,cpu:Number(latest.cpu),memory:Number(latest.memory),disk_max:diskMax,uptime_seconds:Number(latest.uptime_seconds||0),collected_at:latest.collected_at},baseline:{cpu:Math.round(avg('cpu')*10)/10,memory:Math.round(avg('memory')*10)/10,samples:baselineRows.length}};
}

function pearson(points,keyA,keyB){
 const p=points.filter(x=>Number.isFinite(x[keyA])&&Number.isFinite(x[keyB]));if(p.length<4)return null;
 const ma=p.reduce((s,x)=>s+x[keyA],0)/p.length,mb=p.reduce((s,x)=>s+x[keyB],0)/p.length;
 let num=0,da=0,db=0;for(const x of p){const a=x[keyA]-ma,b=x[keyB]-mb;num+=a*b;da+=a*a;db+=b*b;}
 if(!da||!db)return 0;return Math.round(num/Math.sqrt(da*db)*100)/100;
}

export function buildCorrelation(spans,hostRows,rangeMinutes=15){
 const bucketCount=rangeMinutes<=60?15:rangeMinutes<=360?24:24;
 const now=Date.now(),start=now-rangeMinutes*60000,bucketMs=Math.max(60000,Math.ceil((rangeMinutes*60000)/bucketCount));
 const buckets=[];for(let t=start;t<=now;t+=bucketMs)buckets.push({time:new Date(t).toISOString(),start:t,end:t+bucketMs,durations:[],requests:0,errors:0,cpuVals:[],memoryVals:[]});
 const server=spans.filter(s=>Number(s.kind)===2);const appRows=server.length?server:spans;
 for(const s of appRows){const t=new Date(s.start_time).getTime();const b=buckets.find(x=>t>=x.start&&t<x.end);if(!b)continue;b.requests++;b.durations.push(Number(s.duration_ms)||0);if(isError(s))b.errors++;}
 for(const h of hostRows){const t=new Date(h.collected_at).getTime();const b=buckets.find(x=>t>=x.start&&t<x.end);if(!b)continue;const c=numeric(h.cpu),m=numeric(h.memory);if(c!==null)b.cpuVals.push(c);if(m!==null)b.memoryVals.push(m);}
 const points=buckets.map(b=>({time:b.time,requests:b.requests,p95_ms:b.durations.length?Math.round(percentile(b.durations,.95)):0,error_rate:pct(b.errors,b.requests),cpu:b.cpuVals.length?Math.round(b.cpuVals.reduce((a,c)=>a+c,0)/b.cpuVals.length*10)/10:null,memory:b.memoryVals.length?Math.round(b.memoryVals.reduce((a,c)=>a+c,0)/b.memoryVals.length*10)/10:null}));
 const latencyCpu=pearson(points.filter(x=>x.requests>0&&x.cpu!==null),'p95_ms','cpu');
 const latencyMemory=pearson(points.filter(x=>x.requests>0&&x.memory!==null),'p95_ms','memory');
 const magnitude=Math.max(Math.abs(latencyCpu||0),Math.abs(latencyMemory||0));
 const verdict=magnitude>=.7?'strong relationship':magnitude>=.4?'moderate relationship':'weak/no relationship';
 return {points,latency_cpu:latencyCpu,latency_memory:latencyMemory,verdict,note:'Correlation is temporal association only; it is not proof of causation.'};
}

export function summarizeEvidence(journey,technical,infra,correlation){
 const observations=[],actions=[];const issue=journey.primary_leak;
 if(issue)observations.push(`${issue.name} is the highest-risk mapped stage: p95 ${issue.p95_ms} ms, errors ${issue.error_rate}%.`);
 if(infra.current){const c=infra.current,b=infra.baseline;if(b?.samples>=3&&b.cpu>0&&c.cpu>b.cpu*1.5)observations.push(`Host CPU ${c.cpu}% is materially above recent baseline ${b.cpu}%.`);if(c.memory>=85)observations.push(`Host memory is elevated at ${c.memory}%.`);if(c.disk_max>=90)observations.push(`At least one fixed disk is ${c.disk_max}% full.`);}
 if(correlation?.latency_cpu!==null)observations.push(`Latency↔CPU correlation is ${correlation.latency_cpu}; ${correlation.verdict}.`);
 const top=technical.top_operations?.[0];if(top)observations.push(`Highest-risk sampled operation: ${top.service} • ${top.operation}, p95 ${top.p95_ms} ms, errors ${top.error_rate}%.`);
 if(top)actions.push(`Open a slow distributed trace for ${top.operation} and inspect the longest child path.`);if(journey.mode!=='business-semantic')actions.push('Add sparem.business.step and a journey/session correlation id to move from route inference to true business conversion.');if(!observations.length)observations.push('No strong abnormal evidence in the selected window.');
 return {observations,actions};
}
