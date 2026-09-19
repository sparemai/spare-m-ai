import {db} from '../../../lib/db';
import {buildTraceIntelligence} from '../../../lib/intelligence/trace';
import {ensureExtendedSchema} from '../../../lib/telemetry';
export const runtime='nodejs';
export async function GET(req){
 try{
  const u=new URL(req.url),id=u.searchParams.get('trace_id');
  if(!id)return Response.json({error:'trace_id required'},{status:400});
  const sql=db();await ensureExtendedSchema(sql);
  const [rows,logs]=await Promise.all([
   sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,status_message,attrs,resource FROM spans WHERE trace_id=${id} ORDER BY start_time ASC LIMIT 500`,
   sql`SELECT event_time,service,span_id,data FROM telemetry_events WHERE type='logs' AND trace_id=${id} ORDER BY event_time ASC LIMIT 200`
  ]);
  if(!rows.length)return Response.json({error:'trace not found',trace_id:id,spans:[]},{status:404});
  const intelligence=buildTraceIntelligence(rows);
  const services=[...new Set(rows.map(s=>s.service).filter(Boolean))];
  const errors=rows.filter(s=>Number(s.status_code)===2||Number(s.attrs?.['http.response.status_code']||0)>=500).length;
  return Response.json({trace_id:id,summary:{duration_ms:intelligence?.duration_ms||0,span_count:rows.length,service_count:services.length,services,error_count:errors,root_operation:intelligence?.root_operation||null,slowest_span:rows.reduce((a,b)=>Number(b.duration_ms||0)>Number(a?.duration_ms||0)?{span_id:b.span_id,service:b.service,operation:b.operation,duration_ms:Number(b.duration_ms||0)}:a,null)},intelligence,spans:rows,logs});
 }catch(e){console.error(e);return Response.json({error:e?.message||'trace failed'},{status:500});}
}
