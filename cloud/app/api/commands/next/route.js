import {db} from '../../../../lib/db';
import {ensureExtendedSchema,ingestAuth} from '../../../../lib/telemetry';
export const runtime='nodejs';

export async function GET(req){
 try{
  if(!ingestAuth(req))return Response.json({error:'unauthorized'},{status:401});
  const u=new URL(req.url),agent=u.searchParams.get('agent_id');
  if(!agent)return Response.json({error:'agent_id required'},{status:400});
  const sql=db();await ensureExtendedSchema(sql);
  const rows=await sql.query(`UPDATE collector_commands
   SET status='running',started_at=NOW()
   WHERE id=(SELECT id FROM collector_commands WHERE agent_id=$1 AND status='pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
   RETURNING id,agent_id,action,parameters,created_at,approved_at`,[agent]);
  return Response.json({command:rows[0]||null});
 }catch(e){console.error(e);return Response.json({error:'command poll failed'},{status:500});}
}
