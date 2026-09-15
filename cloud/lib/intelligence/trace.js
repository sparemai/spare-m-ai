const num=v=>Number(v||0);
const isError=s=>Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;

function intervalUnionMs(intervals){
 if(!intervals.length)return 0;
 const xs=intervals.filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]);
 if(!xs.length)return 0;
 let total=0,[start,end]=xs[0];
 for(let i=1;i<xs.length;i++){
  const [s,e]=xs[i];
  if(s<=end)end=Math.max(end,e);else{total+=end-start;start=s;end=e;}
 }
 return total+(end-start);
}

function spanRole(s){
 const a=s.attrs||{};
 if(a['db.system']||a['db.system.name']||a['db.operation.name']||a['db.statement'])return 'database';
 if(a['messaging.system']||a['messaging.system.name'])return 'messaging';
 if(Number(s.kind)===3)return 'client';
 if(Number(s.kind)===2)return 'server';
 if(Number(s.kind)===4)return 'producer';
 if(Number(s.kind)===5)return 'consumer';
 return 'internal';
}

export function buildTraceIntelligence(spans){
 if(!spans?.length)return null;
 const normalized=spans.map(s=>{
  const start=new Date(s.start_time).getTime(),duration=Math.max(0,num(s.duration_ms));
  return {...s,_start:start,_end:start+duration,_duration:duration,_children:[],_role:spanRole(s)};
 });
 const byId=new Map(normalized.map(s=>[s.span_id,s]));
 const roots=[];
 for(const s of normalized){
  const parent=byId.get(s.parent_span_id);
  if(parent)parent._children.push(s);else roots.push(s);
 }
 for(const s of normalized){
  const occupied=intervalUnionMs(s._children.map(c=>[Math.max(s._start,c._start),Math.min(s._end,c._end)]));
  s._self=Math.max(0,s._duration-occupied);
 }
 const traceStart=Math.min(...normalized.map(s=>s._start)),traceEnd=Math.max(...normalized.map(s=>s._end)),traceDuration=Math.max(0,traceEnd-traceStart);
 const serviceAgg=new Map(),operationAgg=new Map();
 for(const s of normalized){
  const svc=s.service||'unknown';
  if(!serviceAgg.has(svc))serviceAgg.set(svc,{service:svc,self_time_ms:0,inclusive_time_ms:0,spans:0,errors:0});
  const sa=serviceAgg.get(svc);sa.self_time_ms+=s._self;sa.inclusive_time_ms+=s._duration;sa.spans++;if(isError(s))sa.errors++;
  const key=`${svc} • ${s.operation}`;
  if(!operationAgg.has(key))operationAgg.set(key,{service:svc,operation:s.operation,self_time_ms:0,inclusive_time_ms:0,spans:0,errors:0,role:s._role});
  const oa=operationAgg.get(key);oa.self_time_ms+=s._self;oa.inclusive_time_ms+=s._duration;oa.spans++;if(isError(s))oa.errors++;
 }
 const totalSelf=[...operationAgg.values()].reduce((a,x)=>a+x.self_time_ms,0)||1;
 const services=[...serviceAgg.values()].map(x=>({...x,execution_share_pct:Math.round(x.self_time_ms/totalSelf*1000)/10})).sort((a,b)=>b.self_time_ms-a.self_time_ms);
 const operations=[...operationAgg.values()].map(x=>({...x,execution_share_pct:Math.round(x.self_time_ms/totalSelf*1000)/10})).sort((a,b)=>b.self_time_ms-a.self_time_ms);

 const scoreMemo=new Map();
 function chainScore(s){
  if(scoreMemo.has(s.span_id))return scoreMemo.get(s.span_id);
  const childScores=s._children.map(c=>[c,chainScore(c)]).sort((a,b)=>b[1]-a[1]);
  const score=s._self+(childScores[0]?.[1]||0);scoreMemo.set(s.span_id,score);return score;
 }
 let root=[...roots].sort((a,b)=>chainScore(b)-chainScore(a))[0]||normalized[0];
 const critical=[];
 while(root){critical.push(root);root=[...root._children].sort((a,b)=>chainScore(b)-chainScore(a))[0]||null;}
 const criticalPath=critical.map(s=>({span_id:s.span_id,service:s.service,operation:s.operation,role:s._role,duration_ms:Math.round(s._duration),self_time_ms:Math.round(s._self),error:isError(s)}));
 const hops=normalized.filter(s=>{const p=byId.get(s.parent_span_id);return p&&p.service!==s.service;}).map(s=>{const p=byId.get(s.parent_span_id);return {from:p.service,to:s.service,operation:s.operation,duration_ms:Math.round(s._duration),error:isError(s)};});
 const errors=normalized.filter(isError).map(s=>({span_id:s.span_id,service:s.service,operation:s.operation,status_code:s.status_code,status_message:s.status_message||null,duration_ms:Math.round(s._duration)}));
 const dominant=operations[0]||null;
 return {
  trace_id:normalized[0].trace_id,
  duration_ms:Math.round(traceDuration),
  span_count:normalized.length,
  service_count:new Set(normalized.map(s=>s.service).filter(Boolean)).size,
  error_count:errors.length,
  root_operation:(roots.sort((a,b)=>b._duration-a._duration)[0]||normalized[0])?.operation||null,
  dominant_contributor:dominant?{service:dominant.service,operation:dominant.operation,role:dominant.role,self_time_ms:Math.round(dominant.self_time_ms),execution_share_pct:dominant.execution_share_pct}:null,
  service_attribution:services.slice(0,12).map(x=>({...x,self_time_ms:Math.round(x.self_time_ms),inclusive_time_ms:Math.round(x.inclusive_time_ms)})),
  operation_attribution:operations.slice(0,15).map(x=>({...x,self_time_ms:Math.round(x.self_time_ms),inclusive_time_ms:Math.round(x.inclusive_time_ms)})),
  critical_path:criticalPath,
  service_hops:hops,
  errors,
  evidence_quality:{tree_coverage_pct:Math.round(normalized.filter(s=>!s.parent_span_id||byId.has(s.parent_span_id)).length/normalized.length*1000)/10,distributed:hops.length>0}
 };
}

export function buildTraceIntelligenceSet(spans,limit=40){
 const groups=new Map();for(const s of spans||[]){if(!groups.has(s.trace_id))groups.set(s.trace_id,[]);groups.get(s.trace_id).push(s);}
 const out=[];for(const rows of groups.values()){const x=buildTraceIntelligence(rows);if(x)out.push(x);}
 return out.sort((a,b)=>Number(b.error_count>0)-Number(a.error_count>0)||b.duration_ms-a.duration_ms).slice(0,limit);
}
