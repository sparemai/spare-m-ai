'use client';
import {useEffect,useMemo,useState} from 'react';

const JOURNEYS=['All','Search','Select','Login','Book','Payment','Confirm'];
const RANGES=[['15m','Last 15 min'],['1h','Last 1 hour'],['6h','Last 6 hours'],['24h','Last 24 hours']];
const ms=v=>Number(v||0)>=1000?`${(Number(v||0)/1000).toFixed(2)} s`:`${Math.round(Number(v||0))} ms`;
const pct=v=>`${Number(v||0).toFixed(1)}%`;
const shortService=v=>String(v||'unknown').replace(/^easytravel-/,'').replaceAll('-',' ');
const when=v=>v?new Date(v).toLocaleString([], {month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const coeff=v=>v===null||v===undefined?'n/a':Number(v).toFixed(2);

function Badge({children,t='neutral'}){return <span className={`badge ${t}`}>{children}</span>}

function Header({data,range,setRange,journey,setJourney,onRefresh,loading}){
 const f=data?.filters;
 return <>
  <header className="topbar"><div className="brand"><div className="mark">M</div><div><b>SPARE-M</b><span>Business Reliability Intelligence</span></div></div><div className="topRight"><div className="live"><i/> {data?.agent_id||'waiting for telemetry'}</div><span className="updated">Updated {when(data?.updated_at)}</span></div></header>
  <div className="controlBar">
   <div className="controlGroup"><label>Time window</label><select value={range} onChange={e=>setRange(e.target.value)}>{RANGES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
   <div className="controlGroup"><label>Journey focus</label><select value={journey} onChange={e=>setJourney(e.target.value)}>{JOURNEYS.map(v=><option key={v}>{v}</option>)}</select></div>
   <div className="controlRange"><span>From</span><b>{when(f?.from)}</b><span>To</span><b>{when(f?.to)}</b></div>
   <button className="refreshBtn" onClick={onRefresh} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button>
  </div>
 </>
}

function Kpis({data}){
 const c=data?.infra?.current,focus=data?.focused_journey?.primary_leak,received=data?.received||{};
 const state=(focus?.error_rate||0)>5?'Critical':(focus?.p95_ms||0)>1500?'Attention':'Healthy';
 return <section className="kpiGrid">
  <div className="kpi primary"><span>Reliability state</span><b>{state}</b><small>{data?.filters?.journey==='All'?'All mapped journeys':`${data?.filters?.journey} journey`} • {data?.filters?.range}</small></div>
  <div className="kpi"><span>Selected traces</span><b>{received.traces||0}</b><small>{received.distributed_traces||0} distributed</small></div>
  <div className="kpi"><span>Application p95</span><b>{ms(focus?.p95_ms||0)}</b><small>{focus?.name||'No mapped stage selected'}</small></div>
  <div className="kpi"><span>Host CPU</span><b>{c?pct(c.cpu):'—'}</b><small>{c?`baseline ${pct(data?.infra?.baseline?.cpu)}`:'no host sample'}</small></div>
  <div className="kpi"><span>Host memory</span><b>{c?pct(c.memory):'—'}</b><small>{c?`baseline ${pct(data?.infra?.baseline?.memory)}`:'no host sample'}</small></div>
 </section>
}

function JourneyPipeline({data,selected,onSelect}){
 const stages=data?.stages||[];const map=data?.mapping||{};
 return <section className="workspaceCard journeyCard">
  <div className="sectionHead"><div><span className="sectionIndex">01</span><div><h2>Business journey pipeline</h2><p>Use the journey as the primary filter. Technical and infrastructure views below follow the selected journey traces.</p></div></div><Badge t={data?.mode==='business-semantic'?'good':'watch'}>{data?.mode==='business-semantic'?'Semantic':'Route inferred'} • {data?.confidence||0}%</Badge></div>
  <div className="journeyPipeline">{stages.map((s,i)=><div className="journeyStepWrap" key={s.name}><button className={`journeyStep ${selected===s.name?'selected':''} ${!s.observed?'emptyStage':''}`} onClick={()=>onSelect(selected===s.name?'All':s.name)}>
   <div className="stepTop"><span>{String(i+1).padStart(2,'0')}</span><b>{s.name}</b></div><strong>{s.count}</strong><small>mapped server spans</small><div className="stepMetrics"><span>p95 <b>{ms(s.p95_ms)}</b></span><span>Errors <b>{pct(s.error_rate)}</b></span></div><em>{s.observed?s.mapping:'no mapped activity'}</em>
  </button>{i<stages.length-1&&<div className="stageConnector"><i/></div>}</div>)}</div>
  <div className="mappingBar"><div><b>How SPARE-M maps this journey</b><span>{map.note||'Waiting for mapping metadata.'}</span></div><div className="mappingMeta"><span>Strategy <b>{map.strategy||'—'}</b></span><span>Mapped spans <b>{map.mapped_server_spans||0}</b></span><span>Explicit share <b>{pct(map.explicit_share_pct||0)}</b></span></div></div>
 </section>
}

function Sparkline({points,dataKey,maxHint}){
 const values=points.map(p=>Number(p[dataKey])).filter(Number.isFinite);const max=Math.max(maxHint||0,...values,1),min=Math.min(...values,0);const range=Math.max(1,max-min);
 const xy=points.map((p,i)=>{const v=Number(p[dataKey]);const x=points.length<=1?0:(i/(points.length-1))*100;const y=Number.isFinite(v)?100-((v-min)/range*100):100;return `${x},${y}`}).join(' ');
 return <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={xy}/></svg>
}

function Correlation({data}){
 const c=data?.correlation||{},points=c.points||[],infra=data?.infra||{};const latest=points[points.length-1]||{};
 return <section className="workspaceCard correlationCard">
  <div className="sectionHead"><div><span className="sectionIndex">02</span><div><h2>Application ↔ infrastructure correlation</h2><p>Aligned time buckets show whether application latency moves with host CPU or memory for the selected journey.</p></div></div><Badge t={c.verdict?.startsWith('strong')?'bad':c.verdict?.startsWith('moderate')?'watch':'good'}>{c.verdict||'no data'}</Badge></div>
  <div className="correlationLayout"><div className="trendStack">
   <div className="trendRow"><div className="trendLabel"><span>Application p95</span><b>{ms(latest.p95_ms||0)}</b></div><div className="trendChart app"><Sparkline points={points} dataKey="p95_ms"/></div></div>
   <div className="trendRow"><div className="trendLabel"><span>Host CPU</span><b>{latest.cpu===null||latest.cpu===undefined?'—':pct(latest.cpu)}</b></div><div className="trendChart cpu"><Sparkline points={points} dataKey="cpu" maxHint={100}/></div></div>
   <div className="trendRow"><div className="trendLabel"><span>Host memory</span><b>{latest.memory===null||latest.memory===undefined?'—':pct(latest.memory)}</b></div><div className="trendChart mem"><Sparkline points={points} dataKey="memory" maxHint={100}/></div></div>
   <div className="timeAxis"><span>{when(points[0]?.time)}</span><span>{when(points[Math.floor(points.length/2)]?.time)}</span><span>{when(points[points.length-1]?.time)}</span></div>
  </div><div className="correlationVerdict">
   <div className="corrMetric"><span>Latency ↔ CPU</span><b>{coeff(c.latency_cpu)}</b></div><div className="corrMetric"><span>Latency ↔ Memory</span><b>{coeff(c.latency_memory)}</b></div>
   <div className="hostSnapshot"><span>Host snapshot</span><b>{infra.current?.hostname||'No host'}</b><small>CPU {infra.current?pct(infra.current.cpu):'—'} • Memory {infra.current?pct(infra.current.memory):'—'} • Disk {infra.current?pct(infra.current.disk_max):'—'}</small></div>
   <p>{c.note||'Correlation is shown only when enough aligned samples exist.'}</p>
  </div></div>
 </section>
}

function ServiceTopology({data,traces,onTrace}){
 const stats=data?.service_stats||[],edges=(data?.edges||[]).filter(e=>e.from!==e.to);
 const sampleFor=e=>(traces||[]).find(t=>(t.services||[]).includes(e.from)&&(t.services||[]).includes(e.to));
 return <section className="workspaceCard">
  <div className="sectionHead"><div><span className="sectionIndex">03</span><div><h2>Service topology</h2><p>Only dependencies observed inside the currently selected journey and time window are shown.</p></div></div><Badge t={edges.length?'good':'watch'}>{edges.length?'Distributed context':'No cross-service edge'}</Badge></div>
  <div className="topologyGrid"><div className="topologyCanvas">{stats.map((s,i)=><div className="serviceNode" key={s.service}><div className="nodeTitle"><i className={`dot d${i%4}`}/><div><b>{shortService(s.service)}</b><small>{s.service}</small></div></div><div className="nodeStats"><span>Traces <b>{s.traces}</b></span><span>p95 <b>{ms(s.p95_ms)}</b></span><span>Errors <b>{pct(s.error_rate)}</b></span></div></div>)}
   <div className="dependencyList">{edges.length?edges.map((e,i)=>{const sample=sampleFor(e);return <button key={i} onClick={()=>sample&&onTrace(sample.trace_id)} disabled={!sample}><span>{shortService(e.from)}</span><b>→</b><span>{shortService(e.to)}</span><em>{e.calls} calls</em><small>p95 {ms(e.p95_ms)} • {pct(e.error_rate)} errors</small></button>}):<div className="emptyMsg">No cross-service dependency for this selection.</div>}</div>
  </div><div className="riskOps"><h3>Highest-risk operations</h3>{(data?.top_operations||[]).slice(0,8).map((o,i)=><div className="riskRow" key={i}><span className="rank">{String(i+1).padStart(2,'0')}</span><div><b>{o.operation}</b><small>{o.service}</small></div><strong>{ms(o.p95_ms)}</strong><em>{pct(o.error_rate)} errors</em></div>)}</div></div>
 </section>
}

function TraceExplorer({traces,onTrace}){
 return <section className="workspaceCard">
  <div className="sectionHead"><div><span className="sectionIndex">04</span><div><h2>Trace explorer</h2><p>Traces are already filtered by the control bar. Open any row for the full span waterfall.</p></div></div><Badge>{traces?.length||0} samples</Badge></div>
  <div className="traceTableWrap"><table className="traceTable"><thead><tr><th>Timestamp</th><th>Journey</th><th>Entry operation</th><th>Service path</th><th>Duration</th><th>Spans</th><th>Status</th></tr></thead><tbody>{(traces||[]).map(t=><tr key={t.trace_id} onClick={()=>onTrace(t.trace_id)}><td>{when(t.start_time)}</td><td><span className="journeyTags">{(t.journeys||[]).length?t.journeys.join(' → '):'Unmapped'}</span></td><td><b>{t.root_operation||t.operations?.[0]||'unknown'}</b><small>{t.trace_id.slice(0,12)}…</small></td><td>{(t.services||[]).map(shortService).join(' → ')}</td><td>{ms(t.duration_ms)}</td><td>{t.span_count}</td><td><Badge t={t.error?'bad':t.distributed?'good':'neutral'}>{t.error?'Error':t.distributed?'Distributed':'Single service'}</Badge></td></tr>)}</tbody></table>{!(traces||[]).length&&<div className="emptyMsg">No traces match this journey/time selection.</div>}</div>
 </section>
}

function Evidence({data}){return <section className="workspaceCard evidenceCard"><div className="sectionHead"><div><span className="sectionIndex">05</span><div><h2>Evidence & next investigation</h2><p>Deterministic findings from the selected business and technical context.</p></div></div></div><div className="evidenceGrid"><div><h3>Observed</h3>{(data?.observations||[]).map((x,i)=><p key={i}>• {x}</p>)}</div><div><h3>Investigate next</h3>{(data?.actions||[]).map((x,i)=><p key={i}>→ {x}</p>)}</div></div></section>}

function TraceDrawer({trace,onClose}){
 if(!trace)return null;if(trace.loading)return <><div className="drawerBackdrop" onClick={onClose}/><aside className="drawer"><div className="drawerHeader"><h2>Trace waterfall</h2><button onClick={onClose}>Close</button></div><div className="emptyMsg">Loading trace…</div></aside></>;
 if(trace.error)return <><div className="drawerBackdrop" onClick={onClose}/><aside className="drawer"><div className="drawerHeader"><h2>Trace waterfall</h2><button onClick={onClose}>Close</button></div><div className="errorBox">{trace.error}</div></aside></>;
 const spans=trace.spans||[],byId=new Map(spans.map(s=>[s.span_id,s])),depth=s=>{let d=0,p=s.parent_span_id,g=0;while(p&&byId.has(p)&&g++<12){d++;p=byId.get(p)?.parent_span_id}return Math.min(d,7)};
 const min=spans.length?Math.min(...spans.map(s=>new Date(s.start_time).getTime())):0,ends=spans.map(s=>new Date(s.start_time).getTime()+Number(s.duration_ms||0)),max=ends.length?Math.max(...ends):min+1,range=Math.max(1,max-min),summary=trace.summary||{};
 return <><div className="drawerBackdrop" onClick={onClose}/><aside className="drawer"><div className="drawerHeader"><div><span>TRACE WATERFALL</span><h2>{summary.root_operation||trace.trace_id}</h2><small>{trace.trace_id}</small></div><button onClick={onClose}>Close</button></div><div className="drawerKpis"><div><span>Total</span><b>{ms(summary.duration_ms||range)}</b></div><div><span>Spans</span><b>{summary.span_count||spans.length}</b></div><div><span>Services</span><b>{summary.service_count||0}</b></div><div><span>Errors</span><b>{summary.error_count||0}</b></div></div>{summary.slowest_span&&<div className="slowSpan"><span>Slowest span</span><b>{summary.slowest_span.operation}</b><small>{shortService(summary.slowest_span.service)} • {ms(summary.slowest_span.duration_ms)}</small></div>}<div className="waterfall">{spans.map(s=>{const start=(new Date(s.start_time).getTime()-min)/range*100,width=Math.max(.6,Number(s.duration_ms||0)/range*100),parent=byId.get(s.parent_span_id),hop=parent&&parent.service!==s.service,error=Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500;return <div className={`wfRow ${hop?'hopRow':''}`} key={s.span_id}><div className="wfLabel" style={{paddingLeft:`${depth(s)*12}px`}}><b>{s.operation}</b><small>{shortService(s.service)} • {ms(s.duration_ms)}{hop?' • service hop':''}</small></div><div className="wfTrack"><i className={error?'error':''} style={{left:`${start}%`,width:`${Math.min(100-start,width)}%`}}/></div></div>})}</div></aside></>;
}

export default function Dashboard(){
 const [range,setRange]=useState('15m'),[journey,setJourney]=useState('All'),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[trace,setTrace]=useState(null);
 async function load(){setLoading(true);try{const r=await fetch(`/api/overview?range=${encodeURIComponent(range)}&journey=${encodeURIComponent(journey)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Failed to load overview');setData(j);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load();const id=setInterval(load,15000);return()=>clearInterval(id)},[range,journey]);
 async function openTrace(id){setTrace({loading:true,trace_id:id});try{const r=await fetch(`/api/trace?trace_id=${encodeURIComponent(id)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Failed to load trace');setTrace(j)}catch(e){setTrace({trace_id:id,error:e.message})}}
 const capped=data?.data_quality?.span_cap_reached;
 return <main className="console"><Header data={data} range={range} setRange={setRange} journey={journey} setJourney={setJourney} onRefresh={load} loading={loading}/>{error&&<div className="errorBox">{error}</div>}{capped&&<div className="warningBox">The selected window reached the 50,000-span query cap. The view is representative but not exhaustive.</div>}<Kpis data={data}/><JourneyPipeline data={data?.journey} selected={journey} onSelect={setJourney}/><Correlation data={data}/><ServiceTopology data={data?.technical} traces={data?.recent_traces} onTrace={openTrace}/><TraceExplorer traces={data?.recent_traces} onTrace={openTrace}/><Evidence data={data?.evidence}/><footer>SPARE-M • Journey-first reliability intelligence • {data?.filters?.journey||'All'} • {data?.filters?.range||range}</footer><TraceDrawer trace={trace} onClose={()=>setTrace(null)}/></main>
}
