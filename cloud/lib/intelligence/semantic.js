const ACTIONS=[
 {name:'Confirm',patterns:[/booking-finish/i,/confirm/i,/confirmation/i,/success/i,/receipt/i,/complete.*book/i]},
 {name:'Payment',patterns:[/booking-payment/i,/payment/i,/checkout/i,/credit/i,/\bpay\b/i]},
 {name:'Login',patterns:[/login/i,/signin/i,/authenticate/i,/\bauth\b/i]},
 {name:'Select',patterns:[/booking-start/i,/select.*journey/i,/journey.*detail/i,/load.*journey/i]},
 {name:'Book',patterns:[/booking-review/i,/book.*journey/i,/booking/i,/reserve/i]},
 {name:'Search',patterns:[/orange\.xhtml/i,/search/i,/find.*journey/i,/journeys?/i,/recommend/i,/special-offers/i]}
];

function technicalRole(span){
 const a=span.attrs||{};
 if(a['db.system']||a['db.system.name']||a['db.operation.name']||a['db.statement'])return 'database';
 if(a['messaging.system']||a['messaging.system.name'])return Number(span.kind)===5?'message-consumer':'message-producer';
 if(Number(span.kind)===2)return 'server-request';
 if(Number(span.kind)===3)return 'outbound-dependency';
 if(Number(span.kind)===4)return 'message-producer';
 if(Number(span.kind)===5)return 'message-consumer';
 return 'internal-execution';
}

export function classifySpan(span){
 const a=span.attrs||{};
 const explicit=a['sparem.business.step'];
 const text=[span.operation,a['http.route'],a['url.path'],a['url.full'],span.service].filter(Boolean).join(' ');
 let action=null,confidence=0,evidence=[];
 if(explicit){action=String(explicit);confidence=99;evidence.push('explicit sparem.business.step');}
 else{
  for(const rule of ACTIONS){if(rule.patterns.some(r=>r.test(text))){action=rule.name;confidence=88;evidence.push(`operation/route semantics matched ${rule.name}`);break;}}
 }
 const role=technicalRole(span);
 if(role==='database')evidence.push('database semantic attributes');
 if(role==='outbound-dependency')evidence.push('client span kind');
 return {
  business_domain:action?'Booking':null,
  business_action:action,
  technical_role:role,
  confidence:action?confidence:role!=='internal-execution'?92:55,
  evidence
 };
}

export function buildSemanticCatalog(spans){
 const groups=new Map();
 for(const s of spans||[]){
  const key=`${s.service||'unknown'} • ${s.operation||'unknown'}`;
  if(!groups.has(key))groups.set(key,{service:s.service||'unknown',operation:s.operation||'unknown',count:0,actions:new Map(),roles:new Map(),confidence:[]});
  const g=groups.get(key),c=classifySpan(s);g.count++;g.confidence.push(c.confidence);
  if(c.business_action)g.actions.set(c.business_action,(g.actions.get(c.business_action)||0)+1);
  g.roles.set(c.technical_role,(g.roles.get(c.technical_role)||0)+1);
 }
 const pick=m=>[...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
 return [...groups.values()].map(g=>({
  service:g.service,operation:g.operation,count:g.count,
  business_domain:g.actions.size?'Booking':null,
  business_action:pick(g.actions),
  technical_role:pick(g.roles),
  confidence:Math.round(g.confidence.reduce((a,x)=>a+x,0)/Math.max(1,g.confidence.length))
 })).sort((a,b)=>b.count-a.count);
}
