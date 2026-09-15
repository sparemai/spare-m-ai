import {db} from '../../../lib/db';
export const runtime='nodejs';
export async function GET(req){
 try{
  const u=new URL(req.url),id=u.searchParams.get('trace_id');
  if(!id)return Response.json({error:'trace_id required'},{status:400});
  const sql=db();
  const rows=await sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE trace_id=${id} ORDER BY start_time ASC LIMIT 500`;
  if(!rows.length)return Response.json({error:'trace not found',trace_id:id,spans:[]},{status:404});
  const starts=rows.map(s=>new Date(s.start_time).getTime());
  const ends=rows.map((s,i)=>starts[i]+Number(s.duration_ms||0));
  const min=Math.min(...starts),max=Math.max(...ends);
  const services=[...new Set(rows.map(s=>s.service).filter(Boolean))];
  const errors=rows.filter(s=>Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500).length;
  const slowest=rows.reduce((a,b)=>Number(b.duration_ms||0)>Number(a?.duration_ms||0)?b:a,null);
  const root=rows.find(s=>!s.parent_span_id)||rows[0];
  return Response.json({trace_id:id,summary:{duration_ms:Math.max(0,max-min),span_count:rows.length,service_count:services.length,services,error_count:errors,root_operation:root?.operation||null,slowest_span:slowest?{span_id:slowest.span_id,service:slowest.service,operation:slowest.operation,duration_ms:Number(slowest.duration_ms||0)}:null},spans:rows});
 }catch(e){console.error(e);return Response.json({error:e?.message||'trace failed'},{status:500});}
}
