'use client';
import {useEffect,useState} from 'react';

const RANGES=[['15m','15 min'],['1h','1 hour'],['6h','6 hours'],['24h','24 hours']];
const STAGES=['All','Search','Select','Login','Book','Payment','Confirm'];
const COPILOT_PROMPTS=['How is my infrastructure health?','Why is Booking slow?','Which service needs attention?','Are 5xx errors increasing?','What should I fix first?','What telemetry am I missing?'];
const ms=v=>Number(v||0)>=1000?`${(Number(v||0)/1000).toFixed(2)} s`:`${Math.round(Number(v||0))} ms`;
const pct=v=>v===null||v===undefined?'—':`${Number(v).toFixed(1)}%`;
const when=v=>v?new Date(v).toLocaleString([], {month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const nice=v=>String(v||'Unknown').replace(/^easytravel-/,'').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
const bytes=v=>{const n=Number(v||0);if(n>=1073741824)return `${(n/1073741824).toFixed(1)} GB`;if(n>=1048576)return `${(n/1048576).toFixed(1)} MB`;if(n>=1024)return `${(n/1024).toFixed(1)} KB`;return `${Math.round(n)} B`;};

function Pill({children,t='neutral'}){return <span className={`pill ${t}`}>{children}</span>}
function tone(status){return status==='HEALTHY'?'good':status==='WATCH'?'watch':'bad'}

function Header({data,range,setRange,stage,setStage,refresh,loading}){
 return <>
  <header className="nav">
   <div className="brand"><div className="brandMark">M</div><div><b>SPARE-M</b><span>Business Reliability Intelligence</span></div></div>
   <nav className="navLinks"><a href="#overview">Overview</a><a href="#telemetry">Telemetry</a><a href="#business">Business</a><a href="#application">Application</a><a href="#services">Services</a><a href="#traces">Traces</a></nav>
   <div className="navRight"><span className="liveDot"/><span>Live</span><b>{data?.agent_id||'—'}</b><button onClick={refresh} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>
  </header>
  <div className="toolbar">
   <div className="appIdentity"><span>Application</span><b>EasyTravel</b><small>Travel booking experience</small></div>
   <label><span>Time range</span><select value={range} onChange={e=>setRange(e.target.value)}>{RANGES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label><span>Business focus</span><select value={stage} onChange={e=>setStage(e.target.value)}>{STAGES.map(v=><option key={v}>{v}</option>)}</select></label>
   <div className="windowText"><span>Current window</span><b>{when(data?.filters?.from)} → {when(data?.filters?.to)}</b></div>
  </div>
 </>
}

function Hero({data,onAI,aiLoading,ai}){
 const e=data?.executive;if(!e)return null;const lead=e.leading_hypothesis;
 const aiText=ai?.response?.summary||e.summary;
 const aiFix=ai?.response?.next_actions?.[0]||e.what_to_fix;
 return <section className="hero" id="overview"><div className="heroMain"><div className="overline">TODAY'S BUSINESS & APPLICATION STATUS</div><div className="heroTitle"><h1>{e.headline}</h1><Pill t={tone(e.status)}>{e.status}</Pill></div><p>{e.summary}</p><div className="heroFacts"><div><span>Business</span><b>Booking</b></div><div><span>Main technical area</span><b>{nice(e.technical?.service||'No issue isolated')}</b></div><div><span>Infrastructure</span><b>{e.infrastructure?.contribution||'LOW'} contribution</b></div><div><span>Confidence</span><b>{e.confidence}%</b></div></div></div><aside className="aiBrief"><div className="aiHead"><div><span>SPARE-M AI BRIEF</span><b>What this means</b></div><button onClick={onAI} disabled={aiLoading}>{aiLoading?'Analyzing…':'Analyze with AI'}</button></div><p>{aiText}</p><div className="fixBox"><span>WHAT TO DO</span><b>{aiFix}</b></div>{lead&&<small>Current evidence: {lead.title} • {lead.confidence}% hypothesis confidence</small>}</aside></section>
}

function AskSpareM({data,question,setQuestion,onAsk,loading,result}){
 const answer=result?.response;
 const fallback=result?.reason||result?.deterministic_assessment?.assessment;
 const ask=q=>{const text=String(q||question||'').trim();if(text)onAsk(text)};
 return <section className="copilot">
  <div className="copilotHead"><div><span>ASK SPARE-M</span><h2>Ask about your application in plain English</h2><p>SPARE-M answers from the telemetry, business journey and infrastructure context currently visible on this page.</p></div><Pill t={result?.agentic?'good':'neutral'}>{result?.agentic?'AI connected':'Evidence grounded'}</Pill></div>
  <form className="copilotForm" onSubmit={e=>{e.preventDefault();ask()}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Example: How is my infrastructure health?" maxLength={1200}/><button disabled={loading||!question.trim()}>{loading?'Thinking…':'Ask'}</button></form>
  <div className="copilotPrompts">{COPILOT_PROMPTS.map(q=><button key={q} onClick={()=>{setQuestion(q);ask(q)}} disabled={loading}>{q}</button>)}</div>
  {(answer||fallback)&&<div className="copilotAnswer"><div className="copilotSummary"><span>SPARE-M ANSWER</span><h3>{answer?.summary||fallback}</h3>{answer?.confidence!==undefined&&<small>Evidence confidence {answer.confidence}%{result?.model?' • '+result.model:''}</small>}</div>
   {answer&&<div className="copilotViews"><div><span>Business</span><p>{answer.business_assessment||'No additional business impact established.'}</p></div><div><span>Technical</span><p>{answer.technical_assessment||'No technical issue isolated.'}</p></div><div><span>Infrastructure</span><p>{answer.infrastructure_assessment||'No infrastructure issue isolated.'}</p></div></div>}
   {answer?.next_actions?.length>0&&<div className="copilotActions"><span>WHAT TO DO</span>{answer.next_actions.slice(0,3).map((x,i)=><b key={i}>{i+1}. {x}</b>)}</div>}
   {answer?.evidence_gaps?.length>0&&<div className="copilotGaps"><span>What SPARE-M still cannot prove</span><p>{answer.evidence_gaps.slice(0,3).join(' • ')}</p></div>}
   {result?.tools_used?.length>0&&<small className="copilotTools">Evidence checked: {result.tools_used.map(x=>x.replaceAll('_',' ')).join(' • ')}</small>}
  </div>}
 </section>
}

function TelemetryCoverage({data}){
 const c=data?.intelligence?.coverage;if(!c)return null;
 const categories=[['Business',c.categories?.business],['Technical',c.categories?.technical],['Runtime',c.categories?.runtime],['Infrastructure',c.categories?.infrastructure],['Change',c.categories?.change]];
 const statusText=s=>s==='available'?'Live':s==='partial'?'Partial':s==='not_applicable'?'N/A':'Missing';
 return <section className="coverageCard" id="telemetry">
  <div className="coverageHeader"><div><span>TELEMETRY & UNDERSTANDING</span><h2>What SPARE-M can see right now</h2><p>Supported features become evidence only when a real signal is reporting. This view separates live telemetry from gaps.</p></div><div className="coverageScore"><b>{c.understanding_score}%</b><span>understanding</span></div></div>
  <div className="categoryGrid">{categories.map(([name,value])=><div key={name}><span>{name}</span><b>{value??0}%</b><i><em style={{width:`${Math.max(0,Math.min(100,Number(value||0)))}%`}}/></i></div>)}</div>
  <div className="signalMatrix">{(c.signals||[]).map(s=><div className={`signalItem ${s.status}`} key={s.id}><div><span>{s.label}</span><small>{s.evidence}</small></div><b>{statusText(s.status)}</b></div>)}</div>
 </section>
}

function TelemetryDetails({data}){
 const t=data?.extended_telemetry||{},p=t.processes||[],r=t.runtime||[],l=t.logs||{},n=t.network||[],d=t.disk||[],changes=t.changes||[];
 const active=(t.total||0)>0;
 const latestNetwork=n[0]?.data||{},latestDisk=d[0]?.data||{};
 return <section className="deepTelemetry">
  <div className="sectionTitle"><div><span>LIVE TECHNICAL SIGNALS</span><h2>Runtime evidence</h2><p>Low-level signals that strengthen root-cause analysis when they are available.</p></div><Pill t={active?'good':'watch'}>{active?(t.total+' events'):'Waiting for signals'}</Pill></div>
  <div className="telemetryTiles">
   <article><span>Processes</span><b>{p.length?p.length:'—'}</b><small>{p[0]?((p[0].process||'process')+' • CPU '+pct(p[0].cpu_pct)+' • '+bytes(p[0].memory_bytes)):'Start extended Windows sensors'}</small></article>
   <article><span>JVM / Runtime</span><b>{r.length?r.length:'—'}</b><small>{r[0]?((r[0].metric||'runtime metric')+(r[0].value!==undefined?(' • '+r[0].value+' '+(r[0].unit||'')):'')):'Enable OTLP metrics on Java agent'}</small></article>
   <article><span>Application logs</span><b>{l.total??0}</b><small>{l.errors||0} errors • {l.warnings||0} warnings</small></article>
   <article><span>Network / TCP</span><b>{n.length?'Live':'—'}</b><small>{n.length?('RX '+bytes(latestNetwork.rx_bytes_per_sec||0)+'/s • TX '+bytes(latestNetwork.tx_bytes_per_sec||0)+'/s'):'No network counters yet'}</small></article>
   <article><span>Disk performance</span><b>{d.length?'Live':'—'}</b><small>{d.length?('Read '+Number(latestDisk.read_iops||0).toFixed(1)+' IOPS • Write '+Number(latestDisk.write_iops||0).toFixed(1)+' IOPS'):'No disk performance counters yet'}</small></article>
   <article><span>Change events</span><b>{changes.length||'—'}</b><small>{changes[0]?((changes[0].data?.kind||'change')+' • '+when(changes[0].time)):'Connect GitHub / CI-CD events'}</small></article>
  </div>
  {l.recent?.length>0&&<div className="recentEvidence"><span>RECENT LOG EVIDENCE</span>{l.recent.slice(0,5).map((x,i)=><div key={i}><Pill t={/error|fatal/i.test(String(x.severity||''))?'bad':'watch'}>{x.severity||'LOG'}</Pill><b>{nice(x.service||'Unknown')}</b><p>{x.message}</p></div>)}</div>}
 </section>
}

function KPIs({data}){
 const b=data?.business_context||{},h=data?.http_health||{};
 const cards=[
  ['Bookings observed',b.bookings_observed??0,'Confirmed-stage traces','business'],
  ['Payment attempts',b.payment_attempts_observed??0,'Payment-stage traces','business'],
  ['Completion proxy',pct(b.completion_proxy_pct),'Search → Confirm','business'],
  ['4xx responses',h.codes?.['4xx']??0,'Client/request failures',(h.codes?.['4xx']||0)>0?'warn':'ok'],
  ['5xx responses',h.codes?.['5xx']??0,'Server failures',(h.codes?.['5xx']||0)>0?'bad':'ok'],
  ['Request p95',ms(h.p95_ms),'Across server requests','tech']
 ];
 return <section className="kpiGrid" aria-label="Business and technical KPIs">{cards.map(([label,value,sub,t])=><article className={`kpi ${t}`} key={label}><span>{label}</span><b>{value}</b><small>{sub}</small></article>)}</section>
}

function BusinessFlow({data}){
 const b=data?.business_context||{},stages=b.stages||[];
 return <section className="card businessCard" id="business"><div className="sectionTitle"><div><span>01 · BUSINESS VIEW</span><h2>Booking flow</h2><p>How customers are moving through the travel booking journey in the selected period.</p></div><Pill>{b.measurement==='sampled_trace_proxy'?'Trace-observed activity':'Business events'}</Pill></div><div className="flow">{stages.map((s,i)=><div className="flowWrap" key={s.name}><div className={`flowStep ${s.error_rate>2?'problem':''}`}><div className="flowTop"><span>{String(i+1).padStart(2,'0')}</span><em>{s.name}</em></div><b>{s.trace_count}</b><small>observed journeys</small><div className="flowMetrics"><em>p95 {ms(s.p95_ms)}</em><em>{pct(s.error_rate)} errors</em></div></div>{i<stages.length-1&&<i className="arrow">→</i>}</div>)}</div><div className="plainNote">{b.note}</div></section>
}

function ApplicationMap({data}){
 const a=data?.application_view||{},host=a.host,services=a.services||[];
 const front=services.filter(s=>s.role==='Frontend'),back=services.filter(s=>s.role==='Backend'),other=services.filter(s=>!['Frontend','Backend'].includes(s.role));
 const Box=({title,items,kind})=><div className={`runtimeBox ${kind}`}><span>{title}</span>{items?.length?items.map(x=><div className="runtimeItem" key={x.name||x.hostname}><b>{nice(x.name||x.hostname)}</b>{x.requests!==undefined&&<small>{x.requests} requests • p95 {ms(x.p95_ms)} • {x['5xx']||0} 5xx</small>}{x.cpu!==undefined&&<small>CPU {pct(x.cpu)} • Memory {pct(x.memory)} • Disk {pct(x.disk)}</small>}{x.runtime&&<small>{x.runtime}{x.version?` • ${x.version}`:''}</small>}</div>):<div className="runtimeItem"><b>Not observed</b><small>No telemetry yet</small></div>}</div>;
 return <section className="card applicationCard" id="application"><div className="sectionTitle"><div><span>02 · APPLICATION VIEW</span><h2>Where EasyTravel runs</h2><p>One simple view of the host, frontend, backend and downstream data layer.</p></div><Pill t={host?'good':'watch'}>{host?'Host connected':'Host unknown'}</Pill></div><div className="runtimeFlow"><Box title="HOST" items={host?[host]:[]} kind="host"/><i>→</i><Box title="FRONTEND" items={front} kind="frontend"/><i>→</i><Box title="BACKEND" items={back.length?back:other} kind="backend"/><i>→</i><Box title="DATA / OTHER" items={a.database_detected?[{name:'Database activity'}]:other.filter(x=>!back.includes(x))} kind="data"/></div><div className="relationshipStrip">{(a.edges||[]).slice(0,6).map((e,i)=><span key={i}><b>{nice(e.from)}</b> calls <b>{nice(e.to)}</b> • {e.calls} calls • p95 {ms(e.p95_ms)}</span>)}</div></section>
}

function ServiceHealth({data}){
 const rows=data?.http_health?.services||[];
 return <section className="card serviceCard" id="services"><div className="sectionTitle"><div><span>03 · TECHNICAL HEALTH</span><h2>Frontend & backend health</h2><p>Request volume, response time and HTTP failures by service.</p></div></div><div className="table"><div className="tr th"><span>Service</span><span>Requests</span><span>p95</span><span>4xx</span><span>5xx</span><span>Health</span></div>{rows.map(r=>{const bad=(r['5xx']||0)>0,watch=!bad&&(r['4xx']||0)>0;return <div className="tr" key={r.service}><span><b>{nice(r.service)}</b><small>{r.service}</small></span><span>{r.requests}</span><span>{ms(r.p95_ms)}</span><span>{r['4xx']}</span><span>{r['5xx']}</span><span><Pill t={bad?'bad':watch?'watch':'good'}>{bad?'Needs attention':watch?'Watch':'Healthy'}</Pill></span></div>})}</div></section>
}

function RequestHealth({data}){
 const rows=data?.http_health?.top_requests||[];
 return <section className="card requestCard"><div className="sectionTitle"><div><span>04 · REQUEST HEALTH</span><h2>Most active application requests</h2><p>The requests customers and services are using most, with latency and failures.</p></div></div><div className="table requestTable"><div className="tr th"><span>Request / operation</span><span>Service</span><span>Volume</span><span>p95</span><span>4xx</span><span>5xx</span></div>{rows.slice(0,12).map((r,i)=><div className="tr" key={`${r.service}-${r.operation}-${i}`}><span><b>{r.operation}</b></span><span>{nice(r.service)}</span><span>{r.requests}</span><span>{ms(r.p95_ms)}</span><span>{r['4xx']}</span><span>{r['5xx']}</span></div>)}</div></section>
}

function FixPanel({data}){
 const e=data?.executive||{},gaps=data?.intelligence?.coverage?.gaps||[],lead=e.leading_hypothesis;
 const items=[];if(e.what_to_fix)items.push({t:'Now',v:e.what_to_fix});if(lead?.evidence_for?.[0])items.push({t:'Why',v:lead.evidence_for[0]});const usefulGap=gaps.find(g=>g.severity==='HIGH');if(usefulGap)items.push({t:'Missing evidence',v:`${usefulGap.title}: ${usefulGap.impact?.[0]||usefulGap.reason}`});
 return <section className="fixPanel"><div><span>WHAT NEEDS ATTENTION</span><h2>{e.status==='HEALTHY'?'No urgent fix required':'Focus on the application path first'}</h2></div><div className="fixItems">{items.map((x,i)=><div key={i}><span>{x.t}</span><b>{x.v}</b></div>)}</div></section>
}

function Traces({data,onOpen}){
 const rows=data?.recent_traces||[];
 return <section className="card tracesCard" id="traces"><div className="sectionTitle"><div><span>05 · DISTRIBUTED TRACES</span><h2>Customer request evidence</h2><p>Open a trace to see the business context, service path and where the response time was spent.</p></div><Pill>{rows.length} traces</Pill></div><div className="table traceTable"><div className="tr th"><span>Time</span><span>Business context</span><span>Service path</span><span>Response</span><span>HTTP</span><span>Status</span></div>{rows.map(t=><button className="tr traceRow" key={t.trace_id} onClick={()=>onOpen(t.trace_id)}><span>{when(t.start_time)}</span><span><b>{(t.journeys||[]).join(' → ')||'Unmapped request'}</b><small>{t.root_operation}</small></span><span>{(t.services||[]).map(nice).join(' → ')}</span><span>{ms(t.duration_ms)}</span><span>{t.http_status||'—'}</span><span><Pill t={t.error?'bad':'good'}>{t.error?'Error':'OK'}</Pill></span></button>)}</div></section>
}

function TraceDrawer({trace,onClose}){
 if(!trace)return null;if(trace.loading)return <><div className="shade" onClick={onClose}/><aside className="drawer"><p>Loading trace context…</p></aside></>;if(trace.error)return <><div className="shade" onClick={onClose}/><aside className="drawer"><button className="close" onClick={onClose}>Close</button><p>{trace.error}</p></aside></>;
 const spans=trace.spans||[],logs=trace.logs||[],ti=trace.intelligence||{},sum=trace.summary||{},byId=new Map(spans.map(s=>[s.span_id,s]));
 const min=spans.length?Math.min(...spans.map(s=>new Date(s.start_time).getTime())):0,max=Math.max(...spans.map(s=>new Date(s.start_time).getTime()+Number(s.duration_ms||0)),min+1),range=Math.max(1,max-min);
 const depth=s=>{let d=0,p=s.parent_span_id,g=0;while(p&&byId.has(p)&&g++<8){d++;p=byId.get(p)?.parent_span_id}return d};
 return <><div className="shade" onClick={onClose}/><aside className="drawer"><button className="close" onClick={onClose}>Close</button><div className="drawerTitle"><span>DISTRIBUTED TRACE</span><h2>{sum.root_operation||trace.trace_id}</h2><small>{trace.trace_id}</small></div><div className="traceContext"><div><span>Total response</span><b>{ms(sum.duration_ms)}</b></div><div><span>Services</span><b>{sum.service_count}</b></div><div><span>Spans</span><b>{sum.span_count}</b></div><div><span>Errors</span><b>{sum.error_count}</b></div></div>{ti.dominant_contributor&&<div className="traceMeaning"><span>WHERE TIME WAS SPENT</span><h3>{nice(ti.dominant_contributor.service)} → {ti.dominant_contributor.operation}</h3><p>{pct(ti.dominant_contributor.execution_share_pct)} of exclusive trace execution • {ms(ti.dominant_contributor.self_time_ms)} self time</p></div>}<div className="serviceShare">{(ti.service_attribution||[]).slice(0,6).map(x=><div key={x.service}><span>{nice(x.service)}</span><i><em style={{width:`${Math.min(100,x.execution_share_pct)}%`}}/></i><b>{pct(x.execution_share_pct)}</b></div>)}</div><div className="drawerSub"><span>REQUEST WATERFALL</span><b>Actual distributed execution</b></div><div className="waterfall">{spans.map(s=>{const start=(new Date(s.start_time).getTime()-min)/range*100,width=Math.max(.5,Number(s.duration_ms||0)/range*100),error=Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;return <div className="wf" key={s.span_id}><div className="wfLabel" style={{paddingLeft:depth(s)*10}}><b>{s.operation}</b><small>{nice(s.service)} • {ms(s.duration_ms)}</small></div><div className="wfTrack"><i className={error?'err':''} style={{left:`${start}%`,width:`${Math.min(100-start,width)}%`}}/></div></div>})}</div>{logs.length>0&&<><div className="drawerSub"><span>CORRELATED LOG EVIDENCE</span><b>{logs.length} records</b></div><div className="traceLogs">{logs.slice(0,30).map((l,i)=><div className="traceLog" key={`${l.event_time}-${i}`}><div><Pill t={/error|fatal/i.test(String(l.data?.severity||''))?'bad':/warn/i.test(String(l.data?.severity||''))?'watch':'neutral'}>{l.data?.severity||'LOG'}</Pill><span>{when(l.event_time)} • {nice(l.service||'Unknown')}</span></div><p>{l.data?.message||'Log record'}</p>{l.span_id&&<small>span {l.span_id}</small>}</div>)}</div></>}</aside></>
}

export default function Dashboard(){
 const [range,setRange]=useState('15m'),[stage,setStage]=useState('All'),[data,setData]=useState(null),[loading,setLoading]=useState(false),[err,setErr]=useState(''),[trace,setTrace]=useState(null),[ai,setAI]=useState(null),[aiLoading,setAILoading]=useState(false),[question,setQuestion]=useState(''),[copilot,setCopilot]=useState(null),[copilotLoading,setCopilotLoading]=useState(false);
 async function load(){setLoading(true);try{const r=await fetch(`/api/overview?range=${range}&stage=${stage}`,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Unable to load');setData(j);setErr('')}catch(e){setErr(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load();const id=setInterval(load,20000);return()=>clearInterval(id)},[range,stage]);
 async function openTrace(id){setTrace({loading:true});try{const r=await fetch(`/api/trace?trace_id=${encodeURIComponent(id)}`,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Trace unavailable');setTrace(j)}catch(e){setTrace({error:e.message})}}
 async function analyze(){if(!data?.agent_id)return;setAILoading(true);try{const r=await fetch('/api/investigate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agent_id:data.agent_id,range,stage,mode:'quick'})}),j=await r.json();if(!r.ok)throw new Error(j.error||'AI analysis failed');setAI(j)}catch(e){setAI({response:{summary:e.message,next_actions:[]}})}finally{setAILoading(false)}}
 async function askSpareM(q){
  if(!data?.agent_id||!q)return;
  setCopilotLoading(true);
  try{
   const context={application:'EasyTravel',journey:'Booking',stage,range,service:data?.executive?.technical?.service||null,host:data?.application_view?.host?.hostname||null};
   const r=await fetch('/api/investigate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agent_id:data.agent_id,range,stage,mode:'quick',question:q,context})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||'SPARE-M could not answer');
   setCopilot(j);
  }catch(e){setCopilot({agentic:false,reason:e.message})}finally{setCopilotLoading(false)}
 }
 return <main><Header data={data} range={range} setRange={setRange} stage={stage} setStage={setStage} refresh={load} loading={loading}/>{err&&<div className="errorBanner">{err}</div>}<Hero data={data} onAI={analyze} aiLoading={aiLoading} ai={ai}/><AskSpareM data={data} question={question} setQuestion={setQuestion} onAsk={askSpareM} loading={copilotLoading} result={copilot}/><KPIs data={data}/><TelemetryCoverage data={data}/><TelemetryDetails data={data}/><BusinessFlow data={data}/><div className="twoCol"><ApplicationMap data={data}/><FixPanel data={data}/></div><ServiceHealth data={data}/><RequestHealth data={data}/><Traces data={data} onOpen={openTrace}/><footer>SPARE-M • Business value → technical health → what to fix</footer><TraceDrawer trace={trace} onClose={()=>setTrace(null)}/></main>
}
