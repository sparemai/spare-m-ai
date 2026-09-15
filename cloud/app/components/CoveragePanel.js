'use client';
import {useEffect,useState} from 'react';

const palette={bg:'#09141d',panel:'#0c1923',panel2:'#0f1e2a',line:'#263b49',text:'#eef5f8',muted:'#8ea3b1',subtle:'#60798a',good:'#6fd5ad',warn:'#e2b96f',bad:'#e8797f',blue:'#7da8e8'};
const pct=v=>`${Math.round(Number(v||0))}%`;
const severityColor=v=>v==='CRITICAL'||v==='HIGH'?palette.bad:v==='MEDIUM'?palette.warn:palette.muted;
const label=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

function Bar({value}){return <div style={{height:6,borderRadius:99,background:'#152633',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:`${Math.max(0,Math.min(100,Number(value||0)))}%`,background:Number(value)>=75?palette.good:Number(value)>=45?palette.warn:palette.bad}}/></div>}

export default function CoveragePanel(){
 const [data,setData]=useState(null),[error,setError]=useState('');
 async function load(){try{const r=await fetch('/api/overview?range=15m&journey=Booking&stage=All',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'coverage load failed');setData(j?.intelligence?.coverage||null);setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{load();const id=setInterval(load,30000);return()=>clearInterval(id)},[]);
 if(!data&&!error)return null;
 const gaps=(data?.gaps||[]).slice(0,6),plan=data?.planner?.plan||[],tech=data?.technology_fingerprint?.technologies||[];
 return <section style={{width:'min(1440px,calc(100% - 36px))',margin:'18px auto 60px',border:`1px solid ${palette.line}`,borderRadius:15,background:palette.bg,color:palette.text,overflow:'hidden',fontFamily:'Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif'}}>
  <div style={{display:'grid',gridTemplateColumns:'1fr 210px',gap:24,padding:'24px 28px',borderBottom:`1px solid ${palette.line}`,background:'linear-gradient(180deg,#0d1b26,#09141d)'}}>
   <div><span style={{fontSize:9,letterSpacing:'.16em',fontWeight:800,color:'#7892a3'}}>APPLICATION BRAIN • COVERAGE INTELLIGENCE</span><h2 style={{margin:'7px 0 6px',fontSize:24}}>What SPARE-M knows — and what it still needs</h2><p style={{margin:0,maxWidth:950,color:palette.muted,fontSize:11,lineHeight:1.55}}>{data?.summary||'Evaluating application understanding.'} Missing signals are converted into explicit diagnostic limitations and a configuration plan instead of being silently ignored.</p></div>
   <div style={{borderLeft:`1px solid ${palette.line}`,paddingLeft:22,alignSelf:'center'}}><span style={{display:'block',fontSize:8,textTransform:'uppercase',letterSpacing:'.1em',color:palette.subtle}}>Application understanding</span><b style={{display:'block',fontSize:38,margin:'4px 0'}}>{pct(data?.understanding_score)}</b><small style={{color:palette.muted}}>Evidence coverage, not application health</small></div>
  </div>

  {error&&<div style={{padding:14,color:palette.bad}}>{error}</div>}
  <div style={{display:'grid',gridTemplateColumns:'1.1fr 1.9fr',gap:1,background:palette.line}}>
   <div style={{background:palette.bg,padding:22}}>
    <h3 style={{margin:'0 0 14px',fontSize:10,letterSpacing:'.12em',color:palette.subtle}}>UNDERSTANDING BY LAYER</h3>
    {Object.entries(data?.categories||{}).map(([k,v])=><div key={k} style={{margin:'0 0 14px'}}><div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:6}}><span>{label(k)}</span><b>{pct(v)}</b></div><Bar value={v}/></div>)}
    <h3 style={{margin:'24px 0 10px',fontSize:10,letterSpacing:'.12em',color:palette.subtle}}>TECHNOLOGY FINGERPRINT</h3>
    <div style={{display:'flex',flexWrap:'wrap',gap:7}}>{tech.length?tech.map((t,i)=><span key={i} style={{fontSize:9,padding:'6px 8px',border:`1px solid ${palette.line}`,borderRadius:999,background:palette.panel}}>{t.name} • {t.confidence}%</span>):<span style={{fontSize:9,color:palette.muted}}>No specific technology fingerprint yet.</span>}</div>
   </div>

   <div style={{background:palette.bg,padding:22}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}><div><h3 style={{margin:0,fontSize:10,letterSpacing:'.12em',color:palette.subtle}}>CONFIGURATION / EVIDENCE GAPS</h3><p style={{margin:'5px 0 0',fontSize:9,color:palette.muted}}>Each gap says exactly what SPARE-M cannot prove today.</p></div><span style={{fontSize:9,padding:'6px 8px',border:`1px solid ${palette.line}`,borderRadius:999,color:palette.warn}}>{data?.planner?.high_priority_gaps||0} high priority</span></div>
    <div style={{display:'grid',gap:8}}>{gaps.map(g=><article key={g.id} style={{display:'grid',gridTemplateColumns:'105px 1fr',gap:12,padding:13,border:`1px solid ${palette.line}`,borderRadius:9,background:palette.panel}}><div><b style={{display:'inline-block',fontSize:8,letterSpacing:'.08em',color:severityColor(g.severity)}}>{g.severity}</b><span style={{display:'block',fontSize:8,color:palette.subtle,marginTop:5}}>{label(g.id)}</span></div><div><b style={{display:'block',fontSize:11}}>{g.title}</b><p style={{margin:'5px 0',fontSize:9,lineHeight:1.45,color:palette.muted}}>{g.reason}</p><div style={{fontSize:9,lineHeight:1.5,color:'#b8c7cf'}}>{(g.impact||[]).slice(0,2).map((x,i)=><div key={i}>Blocks: {x}</div>)}</div><div style={{marginTop:7,paddingTop:7,borderTop:'1px solid #1d303d',fontSize:9,color:palette.blue}}>Next: {g.recommendation}</div></div></article>)}</div>
   </div>
  </div>

  <div style={{padding:22,borderTop:`1px solid ${palette.line}`}}><div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'end',marginBottom:12}}><div><h3 style={{margin:0,fontSize:10,letterSpacing:'.12em',color:palette.subtle}}>TELEMETRY PLANNER</h3><p style={{margin:'5px 0 0',fontSize:9,color:palette.muted}}>Recommended only. SPARE-M does not change telemetry automatically.</p></div><span style={{fontSize:9,color:palette.muted}}>{data?.planner?.mode||'recommend-only'}</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:8}}>{plan.slice(0,6).map(p=><div key={p.priority} style={{padding:12,border:`1px solid ${palette.line}`,borderRadius:9,background:palette.panel2}}><span style={{fontSize:8,color:palette.subtle}}>PRIORITY {p.priority} • {p.severity}</span><b style={{display:'block',fontSize:10,margin:'5px 0'}}>{p.title}</b><p style={{fontSize:9,color:palette.muted,lineHeight:1.45,margin:'0 0 7px'}}>{p.why_now}</p><small style={{fontSize:8,color:'#b6c5ce'}}>Collection: {p.collection?.mode} • Cost {p.collection?.cost} • {p.collection?.safety}</small></div>)}</div></div>
 </section>
}
