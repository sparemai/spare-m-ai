class Reader{
 constructor(buf){this.b=buf instanceof Uint8Array?buf:new Uint8Array(buf);this.p=0;}
 eof(){return this.p>=this.b.length;}
 varint(){let x=0n,s=0n;while(this.p<this.b.length){const c=this.b[this.p++];x|=BigInt(c&0x7f)<<s;if((c&0x80)===0)return x;s+=7n;if(s>70n)throw new Error('invalid varint');}throw new Error('truncated varint');}
 len(){const n=Number(this.varint());if(n<0||this.p+n>this.b.length)throw new Error('invalid length');const out=this.b.subarray(this.p,this.p+n);this.p+=n;return out;}
 fixed64(){if(this.p+8>this.b.length)throw new Error('truncated fixed64');const d=new DataView(this.b.buffer,this.b.byteOffset+this.p,8);this.p+=8;return d.getBigUint64(0,true);}
 double(){if(this.p+8>this.b.length)throw new Error('truncated double');const d=new DataView(this.b.buffer,this.b.byteOffset+this.p,8);this.p+=8;return d.getFloat64(0,true);}
 skip(w){if(w===0){this.varint();return;}if(w===1){this.p+=8;return;}if(w===2){this.len();return;}if(w===5){this.p+=4;return;}throw new Error('unsupported wire type '+w);}
}
const td=new TextDecoder();
const text=b=>td.decode(b);
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
function fields(buf,fn){const r=new Reader(buf);while(!r.eof()){const tag=Number(r.varint()),no=tag>>>3,w=tag&7;fn(r,no,w);}}
function parseAny(buf){let v=null;fields(buf,(r,n,w)=>{if(n===1&&w===2)v=text(r.len());else if(n===2&&w===0)v=Number(r.varint())!==0;else if(n===3&&w===0){const x=r.varint();v=x<=BigInt(Number.MAX_SAFE_INTEGER)?Number(x):x.toString();}else if(n===4&&w===1)v=r.double();else if(n===7&&w===2)v=hex(r.len());else r.skip(w);});return v;}
function parseKV(buf){let key='',value=null;fields(buf,(r,n,w)=>{if(n===1&&w===2)key=text(r.len());else if(n===2&&w===2)value=parseAny(r.len());else r.skip(w);});return [key,value];}
function parseAttrs(buf,fieldNo){const out={};fields(buf,(r,n,w)=>{if(n===fieldNo&&w===2){const [k,v]=parseKV(r.len());if(k)out[k]=v;}else r.skip(w);});return out;}
function parseResource(buf){return parseAttrs(buf,1);}
function toMs(ns){if(!ns)return Date.now();return Number(ns/1000000n);}
function parseNumberPoint(buf){
 const p={attrs:{},time_ns:0n,start_ns:0n,value:null};
 fields(buf,(r,n,w)=>{
  if(n===7&&w===2){const [k,v]=parseKV(r.len());if(k)p.attrs[k]=v;}
  else if(n===2&&w===1)p.start_ns=r.fixed64();
  else if(n===3&&w===1)p.time_ns=r.fixed64();
  else if(n===4&&w===1)p.value=r.double();
  else if(n===6&&w===1){const x=r.fixed64();p.value=x<=BigInt(Number.MAX_SAFE_INTEGER)?Number(x):x.toString();}
  else r.skip(w);
 });
 return p;
}
function parseGaugeOrSum(buf){const out=[];fields(buf,(r,n,w)=>{if(n===1&&w===2)out.push(parseNumberPoint(r.len()));else r.skip(w);});return out;}
function parseHistogramPoint(buf){
 const p={attrs:{},time_ns:0n,start_ns:0n,count:0,sum:null,min:null,max:null};
 fields(buf,(r,n,w)=>{
  if(n===9&&w===2){const [k,v]=parseKV(r.len());if(k)p.attrs[k]=v;}
  else if(n===2&&w===1)p.start_ns=r.fixed64();
  else if(n===3&&w===1)p.time_ns=r.fixed64();
  else if(n===4&&w===1)p.count=Number(r.fixed64());
  else if(n===5&&w===1)p.sum=r.double();
  else if(n===11&&w===1)p.min=r.double();
  else if(n===12&&w===1)p.max=r.double();
  else r.skip(w);
 });
 return p;
}
function parseHistogram(buf){const out=[];fields(buf,(r,n,w)=>{if(n===1&&w===2)out.push(parseHistogramPoint(r.len()));else r.skip(w);});return out;}
function parseMetric(buf,resource){
 let name='',description='',unit='',points=[],kind='unknown';
 fields(buf,(r,n,w)=>{
  if(n===1&&w===2)name=text(r.len());
  else if(n===2&&w===2)description=text(r.len());
  else if(n===3&&w===2)unit=text(r.len());
  else if(n===5&&w===2){kind='gauge';points=parseGaugeOrSum(r.len());}
  else if(n===7&&w===2){kind='sum';points=parseGaugeOrSum(r.len());}
  else if(n===9&&w===2){kind='histogram';points=parseHistogram(r.len());}
  else r.skip(w);
 });
 return points.map(p=>({name,description,unit,kind,resource,...p,time_ms:toMs(p.time_ns)}));
}
function parseScopeMetrics(buf,resource,out){fields(buf,(r,n,w)=>{if(n===2&&w===2)out.push(...parseMetric(r.len(),resource));else r.skip(w);});}
function parseResourceMetrics(buf,out){let resource={};const scopes=[];fields(buf,(r,n,w)=>{if(n===1&&w===2)resource=parseResource(r.len());else if(n===2&&w===2)scopes.push(r.len());else r.skip(w);});for(const s of scopes)parseScopeMetrics(s,resource,out);}
export function decodeOtlpMetrics(arrayBuffer){const out=[];fields(new Uint8Array(arrayBuffer),(r,n,w)=>{if(n===1&&w===2)parseResourceMetrics(r.len(),out);else r.skip(w);});return out;}

function parseLogRecord(buf,resource){
 const l={resource,attrs:{},time_ns:0n,observed_ns:0n,severity_number:0,severity_text:'',body:null,trace_id:'',span_id:''};
 fields(buf,(r,n,w)=>{
  if(n===1&&w===1)l.time_ns=r.fixed64();
  else if(n===11&&w===1)l.observed_ns=r.fixed64();
  else if(n===2&&w===0)l.severity_number=Number(r.varint());
  else if(n===3&&w===2)l.severity_text=text(r.len());
  else if(n===5&&w===2)l.body=parseAny(r.len());
  else if(n===6&&w===2){const [k,v]=parseKV(r.len());if(k)l.attrs[k]=v;}
  else if(n===9&&w===2)l.trace_id=hex(r.len());
  else if(n===10&&w===2)l.span_id=hex(r.len());
  else r.skip(w);
 });
 l.time_ms=toMs(l.time_ns||l.observed_ns);return l;
}
function parseScopeLogs(buf,resource,out){fields(buf,(r,n,w)=>{if(n===2&&w===2)out.push(parseLogRecord(r.len(),resource));else r.skip(w);});}
function parseResourceLogs(buf,out){let resource={};const scopes=[];fields(buf,(r,n,w)=>{if(n===1&&w===2)resource=parseResource(r.len());else if(n===2&&w===2)scopes.push(r.len());else r.skip(w);});for(const s of scopes)parseScopeLogs(s,resource,out);}
export function decodeOtlpLogs(arrayBuffer){const out=[];fields(new Uint8Array(arrayBuffer),(r,n,w)=>{if(n===1&&w===2)parseResourceLogs(r.len(),out);else r.skip(w);});return out;}

export function safeResource(resource={}){
 const out={};for(const [k,v] of Object.entries(resource||{})){
  if(k==='service.name'||k==='service.version'||k==='service.instance.id'||k==='host.name'||k==='os.type'||k==='sparem.agent.id'||k==='process.pid'||k==='process.executable.name'||k==='deployment.environment.name'||k.startsWith('k8s.')||k.startsWith('cloud.'))out[k]=v;
 }return out;
}
