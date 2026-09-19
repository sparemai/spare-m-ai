import {db} from '../../../../lib/db';
import {ensureExtendedSchema,ingestAuth,sanitizeEventData} from '../../../../lib/telemetry';
export const runtime='nodejs';

export async function POST(req){
 try{
  if(!ingestAuth(req))return Response.json({error:'unauthorized'},{status:401});
  const b=await req.json(),id=Number(b.id);
  if(!id)return Response.json({error:'id required'},{status:400});
  const status=['completed','failed','rejected'].includes(String(b.status))?String(b.status):'completed';
  const sql=db();await ensureExtendedSchema(sql);
  const rows=await sql.query(`UPDATE collector_commands SET status=$2,completed_at=NOW(),result=$3::jsonb WHERE id=$1 RETURNING id,status`,[id,status,JSON.stringify(sanitizeEventData(b.result||{}))]);
  if(!rows.length)return Response.json({error:'command not found'},{status:404});
  return Response.json({ok:true,...rows[0]});
 }catch(e){console.error(e);return Response.json({error:'command result failed'},{status:500});}
}
