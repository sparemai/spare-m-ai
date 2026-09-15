'use client';
import {useEffect,useMemo,useState} from 'react';

const ms=v=>Number(v||0)>=1000?`${(Number(v||0)/1000).toFixed(2)} s`:`${Math.round(Number(v||0))} ms`;
const pct=v=>`${Number(v||0).toFixed(1)}%`;
const shortService=v=>String(v||'unknown').replace(/^easytravel-/,'').replaceAll('-',' ');

function Tone({children,t='neutral'}){return <span className={`tone ${t}`}>{children}</span>}

function Journey({data}){
 const stages=data?.stages||[];
 return <section className="panel hero">
  <div className="panelHead"><div><div className="eyebrow">LAYER 1 • BUSINESS JOURNEY</div><h2>{data?.name||'EasyTravel Journey'}</h2></div><Tone t={data?.mode==='business-semantic'?'good':'watch'}>{data?.mode==='business-semantic'?'Business semantic':'Inferred proxy'}</Tone></div>
  <p className="muted">Follow the customer flow first. The pipe narrows where errors, latency, or stage activity deteriorate.</p>
  <div className="journey">{stages.length?stages.map((s,i)=><div className="stageWrap" key={s.name}><div className={`stage ${s.name===data?.primary_leak?.name?'hot':''}`}><div className="stageName">{s.name}</div><div className="stageValue">{s.count}</div><div className="mini">p95 {ms(s.p95_ms)}</div><div className="mini">errors {pct(s.error_rate)}</div>{i>0&&<div className="leak">↓ {pct(s.leakage_pct)} proxy leak</div>}</div>{i<stages.length-1&&<div className="pipe"><span style={{opacity:Math.max(.25,1-(s.leakage_pct||0)/100)}}/></div>}</div>):<div className="empty">Waiting for application traces…</div>}</div>
  {data?.mode!=='business-semantic'&&<div className="notice">Stage leakage is an estimate from request activity. Add <code>sparem.business.step</code> later for true business conversion measurement.</div>}
 </section>
}

function ServiceMap({data,traces,onTrace}){
 const stats=data?.service_stats||[];
 const edges=data?.edges||[];
 const cross=edges.filter(e=>e.from!==e.to);
 const internal=edges.filter(e=>e.from===e.to);
 const traceFor=(edge)=>(traces||[]).find(t=>(t.services||[]).includes(edge.from)&&(t.services||[]).includes(edge.to));
 return <div className="serviceMap">
  <div className="serviceNodes">{stats.length?stats.map((s,i)=><div className="svcNode" key={s.service}>
   <div className="svcTop"><span className={`svcDot s${i%4}`}/><div><b>{shortService(s.service)}</b><small>{s.service}</small></div></div>
   <div className="svcMetrics"><span><b>{s.traces}</b><small>traces</small></span><span><b>{ms(s.p95_ms)}</b><small>p95</small></span><span><b>{pct(s.error_rate)}</b><small>errors</small></span></div>
  </div>):<div className="empty">Waiting for service spans…</div>}</div>
  <div className="serviceEdges"><div className="mapLabel">Distributed calls</div>{cross.length?cross.map((e,i)=>{const sample=traceFor(e);return <button className="svcEdge" key={`${e.from}-${e.to}-${i}`} disabled={!sample} onClick={()=>sample&&onTrace(sample.trace_id)} title={sample?'Open a distributed trace':'No sampled distributed trace available'}>
   <span className="svcFrom">{shortService(e.from)}</span><span className="arrow"><i/>→</span><span className="svcTo">{shortService(e.to)}</span><strong>{e.calls} calls</strong><small>p95 {ms(e.p95_ms)} • {pct(e.error_rate)} errors{sample?' • open trace':''}</small>
  </button>}):<div className="empty">Cross-service calls will appear when trace context propagates between services.</div>}</div>
  {internal.length>0&&<div className="internalCalls"><span>Internal span relationships</span>{internal.map((e,i)=><small key={i}>{shortService(e.from)}: {e.calls} calls • p95 {ms(e.p95_ms)}</small>)}</div>}
 </div>
}

function Technical({data,onTrace,traces}){
 return <section className="panel">
  <div className="panelHead"><div><div className="eyebrow">LAYER 2 • TECHNICAL EXECUTION</div><h2>Service map & distributed execution</h2></div><Tone t={(data?.edges||[]).some(e=>e.from!==e.to)?'good':'watch'}>{(data?.edges||[]).some(e=>e.from!==e.to)?'Context propagated':'Single-service only'}</Tone></div>
  <p className="muted">See which services participate, how they call each other, and open a real trace directly from the dependency edge.</p>
  <ServiceMap data={data} traces={traces} onTrace={onTrace}/>
  <div className="techGrid"><div><h3>Highest-risk operations</h3><div className="opList">{(data?.top_operations||[]).map((o,i)=><div className="op" key={i}><div><b>{o.operation}</b><span>{o.service}</span></div><div className="right"><strong>{ms(o.p95_ms)}</strong><span>{pct(o.error_rate)} errors</span></div></div>)}</div></div>
  <div><h3>Trace samples</h3><div className="traceGrid">{(traces||[]).map(t=><button className={`traceBtn ${t.distributed?'distributed':''}`} onClick={()=>onTrace(t.trace_id)} key={t.trace_id}><span>{t.error?'Error trace':t.distributed?'Distributed trace':'Trace'}</span><b>{t.root_operation||t.operations?.[0]||t.trace_id.slice(0,12)}</b><small>{(t.services||[]).map(shortService).join(' → ')}</small><em>{t.span_count||0} spans • {ms(t.duration_ms)}</em></button>)}</div></div></div>
 </section>
}

function Infrastructure({data}){
 const c=data?.current,b=data?.baseline;
 return <section className="panel"><div className="panelHead"><div><div className="eyebrow">LAYER 3 • INFRASTRUCTURE</div><h2>Is the underlying Windows host contributing?</h2></div>{c&&<Tone t={(c.cpu>=90||c.memory>=90)?'bad':(c.cpu>=75||c.memory>=80)?'watch':'good'}>{c.hostname}</Tone>}</div>{c?<div className="metrics"><div><span>CPU</span><strong>{pct(c.cpu)}</strong><small>cloud baseline {pct(b?.cpu)}</small></div><div><span>Memory</span><strong>{pct(c.memory)}</strong><small>cloud baseline {pct(b?.memory)}</small></div><div><span>Disk max</span><strong>{pct(c.disk_max)}</strong><small>highest fixed disk use</small></div><div><span>Uptime</span><strong>{Math.floor(c.uptime_seconds/3600)}h</strong><small>Windows uptime</small></div></div>:<div className="empty">Waiting for Windows host collector…</div>}</section>
}

function TraceDrawer({trace,onClose}){
 if(!trace)return null;
 if(trace.loading)return <><div className="drawerBackdrop" onClick={onClose}/><div className="drawer"><div className="drawerHead"><div><div className="eyebrow">TRACE WATERFALL</div><h2>{trace.trace_id}</h2></div><button onClick={onClose}>Close</button></div><div className="empty">Loading trace spans…</div></div></>;
 if(trace.error)return <><div className="drawerBackdrop" onClick={onClose}/><div className="drawer"><div className="drawerHead"><div><div className="eyebrow">TRACE WATERFALL</div><h2>{trace.trace_id}</h2></div><button onClick={onClose}>Close</button></div><div className="notice badbox">{trace.error}</div></div></>;
 const spans=trace.spans||[];
 const byId=new Map(spans.map(s=>[s.span_id,s]));
 const depthMemo=new Map();
 const depthOf=s=>{if(depthMemo.has(s.span_id))return depthMemo.get(s.span_id);let d=0,p=s.parent_span_id,guard=0;while(p&&byId.has(p)&&guard++<12){d++;p=byId.get(p)?.parent_span_id}depthMemo.set(s.span_id,d);return d};
 const min=spans.length?Math.min(...spans.map(s=>new Date(s.start_time).getTime())):0;
 const ends=spans.map(s=>new Date(s.start_time).getTime()+Number(s.duration_ms||0));
 const max=ends.length?Math.max(...ends):min+1;
 const range=Math.max(1,max-min);
 const summary=trace.summary||{};
 const slow=summary.slowest_span;
 return <><div className="drawerBackdrop" onClick={onClose}/><div className="drawer">
  <div className="drawerHead"><div><div className="eyebrow">TRACE WATERFALL</div><h2>{trace.trace_id}</h2><p>{summary.root_operation||'Distributed request'}</p></div><button onClick={onClose}>Close</button></div>
  <div className="traceSummary"><div><span>Total</span><b>{ms(summary.duration_ms??range)}</b></div><div><span>Spans</span><b>{summary.span_count??spans.length}</b></div><div><span>Services</span><b>{summary.service_count??new Set(spans.map(s=>s.service)).size}</b></div><div><span>Errors</span><b>{summary.error_count??spans.filter(s=>Number(s.status_code)===2).length}</b></div></div>
  {slow&&<div className="slowest"><span>Slowest sampled span</span><b>{slow.operation}</b><small>{shortService(slow.service)} • {ms(slow.duration_ms)}</small></div>}
  <div className="wfLegend"><span>0 ms</span><span>{ms(range*.25)}</span><span>{ms(range*.5)}</span><span>{ms(range*.75)}</span><span>{ms(range)}</span></div>
  <div className="waterfall">{spans.map(s=>{const start=(new Date(s.start_time).getTime()-min)/range*100;const width=Math.max(.7,Number(s.duration_ms||0)/range*100);const parent=byId.get(s.parent_span_id);const cross=parent&&parent.service!==s.service;const error=Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;const depth=Math.min(depthOf(s),7);return <div className={`wf ${cross?'cross':''}`} key={s.span_id}><div className="wfLabel" style={{paddingLeft:`${depth*13}px`}}><div className="wfOp">{depth>0&&<span className="branch">↳</span>}<b title={s.operation}>{s.operation}</b>{cross&&<span className="hop">service hop</span>}</div><span>{shortService(s.service)} • {ms(s.duration_ms)}</span></div><div className="track"><i className={error?'err':''} style={{left:`${Math.max(0,start)}%`,width:`${Math.min(100-start,width)}%`}} title={`${s.service} • ${s.operation} • ${ms(s.duration_ms)}`}/></div></div>})}</div>
 </div></>
}

function AI({agent}){
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false);
 async function run(mode){setLoading(true);setResult(null);try{const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agent_id:agent,mode})});setResult(await r.json())}finally{setLoading(false)}}
 const a=result?.response;
 return <section className="panel ai"><div className="panelHead"><div><div className="eyebrow">SPARE-M AI</div><h2>Explain impact → cause candidates → next fix</h2></div><div className="actions"><button disabled={!agent||loading} onClick={()=>run('quick')}>Quick AI</button><button className="secondary" disabled={!agent||loading} onClick={()=>run('deep')}>Deep investigate</button></div></div>{loading&&<div className="empty">Reasoning over the compact evidence graph…</div>}{result?.error&&<div className="notice badbox">{result.error}</div>}{a&&<div className="aiBody"><div className="aiSummary"><strong>{a.summary}</strong><Tone t={a.confidence>=80?'good':a.confidence>=60?'watch':'neutral'}>{a.confidence}% confidence</Tone></div><div className="aiCols"><div><h3>Business impact</h3><p>{a.business_impact}</p><h3>Technical</h3><p>{a.technical_assessment}</p><h3>Infrastructure</h3><p>{a.infrastructure_assessment}</p></div><div><h3>Next actions</h3>{(a.next_actions||[]).map((x,i)=><p className="action" key={i}>{i+1}. {x}</p>)}<h3>Evidence gaps</h3>{(a.evidence_gaps||[]).map((x,i)=><p className="gap" key={i}>{x}</p>)}</div></div></div>}</section>
}

export default function Dashboard(){
 const [d,setD]=useState(null),[err,setErr]=useState(''),[trace,setTrace]=useState(null);
 async function load(){try{const r=await fetch('/api/overview',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'load failed');setD(j);setErr('')}catch(e){setErr(e.message)}}
 useEffect(()=>{load();const i=setInterval(load,15000);return()=>clearInterval(i)},[]);
 async function openTrace(id){setTrace({loading:true,trace_id:id});try{const r=await fetch(`/api/trace?trace_id=${encodeURIComponent(id)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'trace load failed');setTrace(j)}catch(e){setTrace({error:e.message,trace_id:id})}}
 const health=useMemo(()=>{const c=d?.infra?.current,l=d?.journey?.primary_leak;if(!c&&!l)return'Waiting';if((l?.error_rate||0)>10||(c?.cpu||0)>95)return'Critical';if((l?.p95_ms||0)>1500||(l?.error_rate||0)>3||(c?.cpu||0)>80)return'Attention';return'Healthy'},[d]);
 return <main><header><div className="brand"><div className="mark">M</div><div><b>SPARE-M-AI</b><span>Business-to-infrastructure intelligence</span></div></div><div className="live"><i/> {d?.agent_id||'waiting for collector'}</div></header>
 <div className="overview"><div><div className="eyebrow">CURRENT ASSESSMENT</div><h1>{health}</h1><p>{d?.evidence?.observations?.[0]||'Connect the Windows collector and EasyTravel tracing.'}</p></div><div className="overviewStats"><div><span>Services</span><b>{d?.received?.services?.length||0}</b></div><div><span>Traces / 15m</span><b>{d?.received?.traces||0}</b></div><div><span>Distributed</span><b>{d?.received?.distributed_traces||0}</b></div><div><span>Spans / 15m</span><b>{d?.received?.spans||0}</b></div></div></div>
 {err&&<div className="notice badbox">{err}</div>}
 <Journey data={d?.journey}/>
 <Technical data={d?.technical} traces={d?.recent_traces} onTrace={openTrace}/>
 <Infrastructure data={d?.infra}/>
 <section className="panel evidence"><div className="eyebrow">EVIDENCE, NOT NOISE</div><div className="evidenceCols"><div><h3>What we know</h3>{(d?.evidence?.observations||[]).map((x,i)=><p key={i}>• {x}</p>)}</div><div><h3>What to inspect next</h3>{(d?.evidence?.actions||[]).map((x,i)=><p key={i}>→ {x}</p>)}</div></div></section>
 <AI agent={d?.agent_id}/><footer>All analytics, baselines, journey inference and AI run in Vercel. Windows only collects and exports telemetry.</footer><TraceDrawer trace={trace} onClose={()=>setTrace(null)}/></main>
}
