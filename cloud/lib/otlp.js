// Minimal OTLP/HTTP protobuf trace decoder for SPARE-M-AI.
// Decoding happens in Vercel; the Windows machine only exports telemetry.
class Reader {
  constructor(buf){ this.b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); this.p=0; }
  eof(){ return this.p>=this.b.length; }
  varint(){ let x=0n,s=0n; while(this.p<this.b.length){ const c=this.b[this.p++]; x|=BigInt(c&0x7f)<<s; if((c&0x80)===0)return x; s+=7n; if(s>70n)throw new Error('invalid varint'); } throw new Error('truncated varint'); }
  len(){ const n=Number(this.varint()); if(n<0||this.p+n>this.b.length)throw new Error('invalid length'); const out=this.b.subarray(this.p,this.p+n); this.p+=n; return out; }
  fixed32(){ if(this.p+4>this.b.length)throw new Error('truncated fixed32'); const d=new DataView(this.b.buffer,this.b.byteOffset+this.p,4); this.p+=4; return d.getUint32(0,true); }
  fixed64(){ if(this.p+8>this.b.length)throw new Error('truncated fixed64'); const d=new DataView(this.b.buffer,this.b.byteOffset+this.p,8); this.p+=8; return d.getBigUint64(0,true); }
  double(){ if(this.p+8>this.b.length)throw new Error('truncated double'); const d=new DataView(this.b.buffer,this.b.byteOffset+this.p,8); this.p+=8; return d.getFloat64(0,true); }
  skip(w){ if(w===0){this.varint();return;} if(w===1){this.p+=8;return;} if(w===2){this.len();return;} if(w===5){this.p+=4;return;} throw new Error(`unsupported wire type ${w}`); }
}
const td=new TextDecoder();
const text=b=>td.decode(b);
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
function fields(buf, fn){ const r=new Reader(buf); while(!r.eof()){ const tag=Number(r.varint()), no=tag>>>3, w=tag&7; fn(r,no,w); } }
function parseAny(buf){ let v=null; fields(buf,(r,n,w)=>{ if(n===1&&w===2)v=text(r.len()); else if(n===2&&w===0)v=Number(r.varint())!==0; else if(n===3&&w===0){const x=r.varint();v=x<=BigInt(Number.MAX_SAFE_INTEGER)?Number(x):x.toString();} else if(n===4&&w===1)v=r.double(); else if(n===7&&w===2)v=hex(r.len()); else r.skip(w); }); return v; }
function parseKV(buf){ let key='',value=null; fields(buf,(r,n,w)=>{ if(n===1&&w===2)key=text(r.len()); else if(n===2&&w===2)value=parseAny(r.len()); else r.skip(w); }); return [key,value]; }
function parseAttrsFromMessage(buf, attrField=1){ const out={}; fields(buf,(r,n,w)=>{ if(n===attrField&&w===2){const [k,v]=parseKV(r.len()); if(k)out[k]=v;} else r.skip(w); }); return out; }
function parseResource(buf){ return parseAttrsFromMessage(buf,1); }
function parseStatus(buf){ let code=0,message=''; fields(buf,(r,n,w)=>{ if(n===2&&w===2)message=text(r.len()); else if(n===3&&w===0)code=Number(r.varint()); else r.skip(w); }); return {code,message}; }
function parseSpan(buf, resource){ const s={trace_id:'',span_id:'',parent_span_id:'',name:'',kind:0,start_ns:0n,end_ns:0n,status_code:0,status_message:'',attrs:{},resource}; fields(buf,(r,n,w)=>{
  if(n===1&&w===2)s.trace_id=hex(r.len());
  else if(n===2&&w===2)s.span_id=hex(r.len());
  else if(n===4&&w===2)s.parent_span_id=hex(r.len());
  else if(n===5&&w===2)s.name=text(r.len());
  else if(n===6&&w===0)s.kind=Number(r.varint());
  else if(n===7&&w===1)s.start_ns=r.fixed64();
  else if(n===8&&w===1)s.end_ns=r.fixed64();
  else if(n===9&&w===2){const [k,v]=parseKV(r.len());if(k)s.attrs[k]=v;}
  else if(n===15&&w===2){const st=parseStatus(r.len());s.status_code=st.code;s.status_message=st.message;}
  else r.skip(w);
 }); return s; }
function parseScopeSpans(buf, resource, out){ fields(buf,(r,n,w)=>{ if(n===2&&w===2)out.push(parseSpan(r.len(),resource)); else r.skip(w); }); }
function parseResourceSpans(buf,out){ let resource={}; const scope=[]; fields(buf,(r,n,w)=>{ if(n===1&&w===2)resource=parseResource(r.len()); else if(n===2&&w===2)scope.push(r.len()); else r.skip(w); }); for(const b of scope)parseScopeSpans(b,resource,out); }
export function decodeOtlpTraces(arrayBuffer){ const out=[]; fields(new Uint8Array(arrayBuffer),(r,n,w)=>{ if(n===1&&w===2)parseResourceSpans(r.len(),out); else r.skip(w); }); return out; }

const SAFE_SPAN_KEYS = new Set([
  'http.request.method','http.response.status_code','http.route','url.path','server.address','server.port',
  'network.protocol.version','db.system.name','db.namespace','db.operation.name','db.query.summary',
  'rpc.system','rpc.method','messaging.system','error.type','code.function.name','code.namespace',
  'sparem.business.journey','sparem.business.step','sparem.business.outcome',
  'sparem.journey.id','sparem.session.id','session.id','enduser.session.id',
  'sparem.transaction.id','sparem.transaction.value','sparem.transaction.currency',
  'business.transaction.value','order.id','order.value','cart.value'
]);
const SAFE_RESOURCE_KEYS = new Set(['service.name','service.version','deployment.environment.name','host.name','os.type','sparem.agent.id']);
export function sanitizeSpan(s){
  const attrs={}; for(const [k,v] of Object.entries(s.attrs||{}))if(SAFE_SPAN_KEYS.has(k))attrs[k]=typeof v==='string'?v.slice(0,500):v;
  const resource={}; for(const [k,v] of Object.entries(s.resource||{}))if(SAFE_RESOURCE_KEYS.has(k))resource[k]=typeof v==='string'?v.slice(0,300):v;
  const start=Number(s.start_ns/1000000n), end=Number(s.end_ns/1000000n);
  return { trace_id:s.trace_id, span_id:s.span_id, parent_span_id:s.parent_span_id||'', service:String(resource['service.name']||'unknown').slice(0,200), agent_id:String(resource['sparem.agent.id']||resource['host.name']||'unknown').slice(0,200), operation:String(s.name||'unknown').slice(0,500), kind:s.kind, start_ms:start, duration_ms:Math.max(0,end-start), status_code:s.status_code, status_message:String(s.status_message||'').slice(0,500), attrs, resource };
}
