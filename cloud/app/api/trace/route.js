import {db} from '../../../lib/db';
export const runtime='nodejs';
export async function GET(req){try{const u=new URL(req.url),id=u.searchParams.get('trace_id');if(!id)return Response.json({error:'trace_id required'},{status:400});const sql=db();const rows=await sql`SELECT trace_id,span_id,parent_span_id,service,operation,kind,start_time,duration_ms,status_code,attrs FROM spans WHERE trace_id=${id} ORDER BY start_time ASC LIMIT 500`;return Response.json({trace_id:id,spans:rows});}catch(e){return Response.json({error:e?.message||'trace failed'},{status:500});}}
