import crypto from 'crypto';

const ALLOWED_TYPES=new Set(['logs','process','runtime','network','disk','change','business','kubernetes','cloud','database','profile']);
let schemaPromise;

export function ingestAuth(req){
 return !!process.env.SPAREM_INGEST_KEY && req.headers.get('x-sparem-key')===process.env.SPAREM_INGEST_KEY;
}

export function allowedTelemetryType(type){return ALLOWED_TYPES.has(String(type||'').toLowerCase());}

const SECRET_PATTERNS=[
 /(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/ig,
 /((?:access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|password|passwd|secret|session[_-]?token)\s*[:=]\s*['"]?)[^\s,'";}]+/ig,
 /((?:cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/ig
];
export function maskText(value){
 let s=String(value??'');
 for(const re of SECRET_PATTERNS)s=s.replace(re,'$1********');
 return s.slice(0,16000);
}
function clean(v,depth=0){
 if(depth>6)return '[depth-limited]';
 if(v===null||v===undefined)return v;
 if(typeof v==='string')return maskText(v);
 if(typeof v==='number'||typeof v==='boolean')return v;
 if(Array.isArray(v))return v.slice(0,200).map(x=>clean(x,depth+1));
 if(typeof v==='object'){
  const out={};let n=0;
  for(const [k,val] of Object.entries(v)){
   if(n++>=200)break;
   const key=String(k).slice(0,160);
   if(/password|passwd|secret|token|authorization|cookie|api[_-]?key/i.test(key))out[key]='********';
   else out[key]=clean(val,depth+1);
  }
  return out;
 }
 return String(v).slice(0,2000);
}
export function sanitizeEventData(v){return clean(v);}

export async function ensureExtendedSchema(sql){
 if(schemaPromise)return schemaPromise;
 schemaPromise=(async()=>{
  await sql.query(`CREATE TABLE IF NOT EXISTS telemetry_events (
   id BIGSERIAL PRIMARY KEY,
   received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   event_time TIMESTAMPTZ NOT NULL,
   type TEXT NOT NULL,
   agent_id TEXT NOT NULL,
   hostname TEXT,
   service TEXT,
   entity_id TEXT,
   trace_id TEXT,
   span_id TEXT,
   session_id TEXT,
   transaction_id TEXT,
   data JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await sql.query(`CREATE INDEX IF NOT EXISTS telemetry_events_type_time ON telemetry_events(type,event_time DESC)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS telemetry_events_agent_time ON telemetry_events(agent_id,event_time DESC)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS telemetry_events_service_time ON telemetry_events(service,event_time DESC)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS telemetry_events_trace ON telemetry_events(trace_id) WHERE trace_id IS NOT NULL`);
  await sql.query(`CREATE INDEX IF NOT EXISTS telemetry_events_transaction ON telemetry_events(transaction_id) WHERE transaction_id IS NOT NULL`);
  await sql.query(`CREATE TABLE IF NOT EXISTS collector_commands (
   id BIGSERIAL PRIMARY KEY,
   agent_id TEXT NOT NULL,
   action TEXT NOT NULL,
   parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
   status TEXT NOT NULL DEFAULT 'pending',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   approved_at TIMESTAMPTZ,
   started_at TIMESTAMPTZ,
   completed_at TIMESTAMPTZ,
   result JSONB
  )`);
  await sql.query(`CREATE INDEX IF NOT EXISTS collector_commands_agent_status ON collector_commands(agent_id,status,created_at)`);
 })().catch(e=>{schemaPromise=null;throw e;});
 return schemaPromise;
}

function first(...xs){for(const x of xs)if(x!==undefined&&x!==null&&String(x)!=='')return String(x);return null;}
export function normalizeEvent(type,body,defaults={}){
 const b=body&&typeof body==='object'?body:{value:body};
 const data=sanitizeEventData(b.data??b);
 const eventTime=first(b.event_time,b.timestamp,b.time,defaults.event_time)||new Date().toISOString();
 return {
  type:String(type).toLowerCase(),
  event_time:eventTime,
  agent_id:first(b.agent_id,defaults.agent_id)||'unknown',
  hostname:first(b.hostname,b.host,defaults.hostname),
  service:first(b.service,b.service_name,defaults.service),
  entity_id:first(b.entity_id,b.pid,b.resource_id,b.pod,b.instance_id),
  trace_id:first(b.trace_id,b.traceId),
  span_id:first(b.span_id,b.spanId),
  session_id:first(b.session_id,b.journey_id,b.sessionId),
  transaction_id:first(b.transaction_id,b.booking_id,b.order_id,b.transactionId),
  data
 };
}
export async function insertTelemetryEvents(sql,type,items,defaults={}){
 await ensureExtendedSchema(sql);
 const events=(Array.isArray(items)?items:[items]).slice(0,1000).map(x=>normalizeEvent(type,x,defaults));
 if(!events.length)return 0;
 const t=events.map(e=>e.type),time=events.map(e=>e.event_time),agent=events.map(e=>e.agent_id),host=events.map(e=>e.hostname||''),service=events.map(e=>e.service||''),entity=events.map(e=>e.entity_id||''),trace=events.map(e=>e.trace_id||''),span=events.map(e=>e.span_id||''),session=events.map(e=>e.session_id||''),txn=events.map(e=>e.transaction_id||''),data=events.map(e=>JSON.stringify(e.data||{}));
 const q=`INSERT INTO telemetry_events(type,event_time,agent_id,hostname,service,entity_id,trace_id,span_id,session_id,transaction_id,data)
 SELECT ty,tm,a,NULLIF(h,''),NULLIF(sv,''),NULLIF(en,''),NULLIF(tr,''),NULLIF(sp,''),NULLIF(se,''),NULLIF(tx,''),d::jsonb
 FROM UNNEST($1::text[],$2::timestamptz[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[],$10::text[],$11::text[]) AS x(ty,tm,a,h,sv,en,tr,sp,se,tx,d)`;
 await sql.query(q,[t,time,agent,host,service,entity,trace,span,session,txn,data]);
 return events.length;
}

export function commandToken(){
 return crypto.randomBytes(12).toString('hex');
}
