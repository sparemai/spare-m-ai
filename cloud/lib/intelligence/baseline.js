const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
const percentile=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))];};
const isError=s=>Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;
const delta=(a,b)=>Number(b)>0?Math.round((Number(a||0)-Number(b))*1000/Number(b))/10:null;

function aggregate(spans,keyFn){
 const m=new Map();
 for(const s of spans||[]){const key=keyFn(s);if(!m.has(key))m.set(key,{key,count:0,errors:0,durations:[],service:s.service||'unknown',operation:s.operation||null});const x=m.get(key);x.count++;if(isError(s))x.errors++;x.durations.push(Number(s.duration_ms)||0);}
 return m;
}

function compare(current,previous){
 const rows=[];
 for(const [key,c] of current){
  const p=previous.get(key),cp95=Math.round(percentile(c.durations,.95)),pp95=p?Math.round(percentile(p.durations,.95)):0;
  const cerr=pct(c.errors,c.count),perr=p?pct(p.errors,p.count):0,p95Delta=delta(cp95,pp95),errorDelta=p?Math.round((cerr-perr)*10)/10:null,countDelta=p?delta(c.count,p.count):null;
  const latencySignal=p95Delta===null?0:Math.min(60,Math.max(0,p95Delta)/5);
  const errorSignal=errorDelta===null?0:Math.min(30,Math.max(0,errorDelta)*5);
  const volumeSignal=countDelta===null?0:Math.min(10,Math.abs(countDelta)/20);
  rows.push({key,service:c.service,operation:c.operation,current:{count:c.count,p95_ms:cp95,error_rate:cerr},baseline:p?{count:p.count,p95_ms:pp95,error_rate:perr}:null,delta:{count_pct:countDelta,p95_pct:p95Delta,error_rate_points:errorDelta},anomaly_score:Math.round(Math.min(100,latencySignal+errorSignal+volumeSignal))});
 }
 return rows.sort((a,b)=>b.anomaly_score-a.anomaly_score||b.current.p95_ms-a.current.p95_ms);
}

export function buildBaselines(currentSpans,previousSpans){
 const currentOps=aggregate(currentSpans,s=>`${s.service||'unknown'} • ${s.operation||'unknown'}`),previousOps=aggregate(previousSpans,s=>`${s.service||'unknown'} • ${s.operation||'unknown'}`);
 const currentSvc=aggregate(currentSpans,s=>s.service||'unknown'),previousSvc=aggregate(previousSpans,s=>s.service||'unknown');
 return {
  operations:compare(currentOps,previousOps).slice(0,30),
  services:compare(currentSvc,previousSvc).slice(0,20),
  baseline_kind:'previous-equivalent-window',
  note:'This MVP compares with the immediately preceding equal-length window. Seasonal learned baselines should replace this for production.'
 };
}
