(()=>{try{
 const script=document.currentScript;
 const endpoint=(script?.dataset?.endpoint||'').replace(/\/$/,'')+'/api/ingest/rum';
 const key=script?.dataset?.key||'';
 const app=script?.dataset?.app||location.hostname||'browser';
 const now=()=>new Date().toISOString();
 const rid=()=>{try{return crypto.randomUUID()}catch{return Math.random().toString(36).slice(2)+Date.now().toString(36)}};
 const sessionKey='sparem.session.id';
 let session=sessionStorage.getItem(sessionKey);if(!session){session=rid();sessionStorage.setItem(sessionKey,session);}
 const queue=[];let timer;
 const base={agent_id:app,session_id:session,hostname:location.hostname,service:'browser'};
 function send(){
  clearTimeout(timer);timer=null;if(!queue.length)return;
  const events=queue.splice(0,50);
  const body=JSON.stringify({events});
  if(navigator.sendBeacon&&!key){
   try{if(navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'})))return}catch{}
  }
  fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(key?{'x-sparem-rum-key':key}:{})},body,keepalive:true,credentials:'omit'}).catch(()=>{});
 }
 function emit(kind,data={}){queue.push({...base,event_time:now(),data:{kind,url:location.origin+location.pathname,...data}});if(queue.length>=20)send();else if(!timer)timer=setTimeout(send,1800);}
 function nav(){
  const n=performance.getEntriesByType('navigation')[0];
  if(n)emit('pageview',{navigation_type:n.type,duration_ms:Math.round(n.duration),dom_content_loaded_ms:Math.round(n.domContentLoadedEventEnd),load_ms:Math.round(n.loadEventEnd),response_ms:Math.round(n.responseEnd-n.requestStart)});
  else emit('pageview',{});
 }
 addEventListener('load',()=>setTimeout(nav,0),{once:true});
 addEventListener('error',e=>emit('js_error',{message:String(e.message||'JavaScript error').slice(0,1000),source:e.filename?String(e.filename).split('?')[0]:null,line:e.lineno||null,column:e.colno||null,stack:e.error?.stack?String(e.error.stack).slice(0,4000):null}));
 addEventListener('unhandledrejection',e=>emit('unhandled_rejection',{message:String(e.reason?.message||e.reason||'Unhandled rejection').slice(0,1000),stack:e.reason?.stack?String(e.reason.stack).slice(0,4000):null}));
 addEventListener('click',e=>{
  const el=e.target?.closest?.('[data-sparem-action],button,a,[role="button"]');if(!el)return;
  const action=el.getAttribute('data-sparem-action')||el.id||el.getAttribute('name')||el.tagName?.toLowerCase()||'click';
  emit('user_action',{action:String(action).slice(0,120),element:el.tagName?.toLowerCase()||null});
 },{capture:true});
 if(window.PerformanceObserver){
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())emit('web_vital',{name:e.name,value:Number(e.value||e.duration||0),rating:e.rating||null});}).observe({type:'largest-contentful-paint',buffered:true})}catch{}
 }
 const ofetch=window.fetch;
 if(ofetch)window.fetch=async function(input,init){const start=performance.now();try{const r=await ofetch.apply(this,arguments);emit('fetch',{method:String(init?.method||'GET').toUpperCase(),target:new URL(typeof input==='string'?input:input.url,location.href).pathname,status:r.status,duration_ms:Math.round(performance.now()-start)});return r}catch(err){emit('fetch_error',{target:new URL(typeof input==='string'?input:input.url,location.href).pathname,duration_ms:Math.round(performance.now()-start),message:String(err?.message||err).slice(0,500)});throw err}};
 addEventListener('pagehide',send);
}catch(e){}})();
