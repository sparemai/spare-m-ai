export const JOURNEY_ORDER=['Search','Select','Login','Book','Payment','Confirm'];
const patterns={
 Search:[/search/i,/find.*journey/i,/journeys?/i,/query.*journey/i],
 Select:[/select.*journey/i,/journey.*detail/i,/load.*journey/i],
 Login:[/login/i,/signin/i,/authenticate/i,/auth\b/i],
 Book:[/booking/i,/book.*journey/i,/reserve/i],
 Payment:[/payment/i,/pay\b/i,/checkout/i,/credit/i],
 Confirm:[/confirm/i,/success/i,/receipt/i,/complete.*book/i]
};
const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
const percentile=(a,p)=>{if(!a.length)return 0; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))];};
export function stageOf(span){
 const explicit=span.attrs?.['sparem.business.step']; if(explicit)return String(explicit);
 if(Number(span.kind)!==2)return null;
 const text=[span.operation,span.attrs?.['http.route'],span.attrs?.['url.path']].filter(Boolean).join(' ');
 for(const step of JOURNEY_ORDER) if((patterns[step]||[]).some(r=>r.test(text)))return step;
 return null;
}
export function buildJourney(spans){
 const map=new Map(JOURNEY_ORDER.map(s=>[s,{name:s,count:0,errors:0,durations:[],services:new Set()}]));
 let explicit=0;
 for(const s of spans){const step=stageOf(s);if(!step)continue;if(s.attrs?.['sparem.business.step'])explicit++;if(!map.has(step))map.set(step,{name:step,count:0,errors:0,durations:[],services:new Set()});const x=map.get(step);x.count++;if(Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500)x.errors++;x.durations.push(Number(s.duration_ms)||0);x.services.add(s.service);}
 const stages=[...map.values()].filter(x=>x.count>0).map(x=>({name:x.name,count:x.count,error_rate:pct(x.errors,x.count),p95_ms:Math.round(percentile(x.durations,.95)),services:[...x.services]}));
 // Rate loss is only a proxy unless custom business-step correlation is present.
 for(let i=0;i<stages.length;i++){const prev=i?stages[i-1].count:stages[i].count;stages[i].leakage_pct=i&&prev?Math.max(0,Math.round((prev-stages[i].count)/prev*1000)/10):0;}
 const problem=[...stages].sort((a,b)=>(b.error_rate*2+b.leakage_pct+b.p95_ms/1000)-(a.error_rate*2+a.leakage_pct+a.p95_ms/1000))[0]||null;
 return {name:'EasyTravel Journey',mode:explicit?'business-semantic':'inferred-proxy',confidence:explicit?95:60,stages,primary_leak:problem};
}
export function buildTechnical(spans){
 const byId=new Map(spans.map(s=>[`${s.trace_id}:${s.span_id}`,s])); const edges=new Map();
 for(const child of spans){if(!child.parent_span_id)continue;const parent=byId.get(`${child.trace_id}:${child.parent_span_id}`);if(!parent)continue;const key=`${parent.service}→${child.service}`;let e=edges.get(key);if(!e){e={from:parent.service,to:child.service,calls:0,errors:0,durations:[]};edges.set(key,e);}e.calls++;if(Number(child.status_code)===2)e.errors++;e.durations.push(Number(child.duration_ms)||0);}
 const list=[...edges.values()].map(e=>({from:e.from,to:e.to,calls:e.calls,error_rate:pct(e.errors,e.calls),p95_ms:Math.round(percentile(e.durations,.95))})).sort((a,b)=>b.calls-a.calls).slice(0,12);
 const ops={}; for(const s of spans){const k=`${s.service} • ${s.operation}`;if(!ops[k])ops[k]={service:s.service,operation:s.operation,count:0,errors:0,durations:[]};const o=ops[k];o.count++;if(Number(s.status_code)===2)o.errors++;o.durations.push(Number(s.duration_ms)||0);}
 const top=Object.values(ops).map(o=>({service:o.service,operation:o.operation,count:o.count,error_rate:pct(o.errors,o.count),p95_ms:Math.round(percentile(o.durations,.95))})).sort((a,b)=>(b.p95_ms+b.error_rate*100)-(a.p95_ms+a.error_rate*100)).slice(0,10);
 return {edges:list,top_operations:top};
}
export function buildInfra(hostRows){
 if(!hostRows.length)return {current:null,baseline:null};const latest=hostRows[0];const baselineRows=hostRows.slice(1);const avg=(k)=>baselineRows.length?baselineRows.reduce((s,r)=>s+Number(r[k]||0),0)/baselineRows.length:0;
 const disks=latest.disks||[];const diskMax=Array.isArray(disks)?disks.reduce((m,d)=>Math.max(m,Number(d.used_percent||0)),0):0;
 return {current:{hostname:latest.hostname,cpu:Number(latest.cpu),memory:Number(latest.memory),disk_max:diskMax,uptime_seconds:Number(latest.uptime_seconds||0),collected_at:latest.collected_at},baseline:{cpu:Math.round(avg('cpu')*10)/10,memory:Math.round(avg('memory')*10)/10,samples:baselineRows.length}};
}
export function summarizeEvidence(journey,technical,infra){
 const observations=[];const actions=[];const leak=journey.primary_leak; if(leak)observations.push(`${leak.name} is the strongest affected journey stage: p95 ${leak.p95_ms} ms, errors ${leak.error_rate}%, proxy leakage ${leak.leakage_pct}%.`);
 if(infra.current){const c=infra.current,b=infra.baseline;if(b?.samples>=3&&b.cpu>0&&c.cpu>b.cpu*1.5)observations.push(`Host CPU ${c.cpu}% is materially above recent cloud baseline ${b.cpu}%.`);if(c.memory>=85)observations.push(`Host memory is elevated at ${c.memory}%.`);if(c.disk_max>=90)observations.push(`At least one fixed disk is ${c.disk_max}% full.`);}
 const top=technical.top_operations?.[0];if(top)observations.push(`Highest-risk sampled operation: ${top.service} • ${top.operation}, p95 ${top.p95_ms} ms, errors ${top.error_rate}%.`);
 if(top)actions.push(`Inspect traces for ${top.operation} and identify the child span consuming the most time.`);if(leak)actions.push(`Validate ${leak.name} with a business correlation attribute before treating proxy leakage as true conversion loss.`);if(!observations.length)observations.push('No strong abnormal evidence in the current sampled window.');
 return {observations,actions};
}
