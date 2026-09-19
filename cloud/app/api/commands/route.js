import {db} from '../../../lib/db';
import {ensureExtendedSchema,sanitizeEventData} from '../../../lib/telemetry';
export const runtime='nodejs';

const ALLOWED_ACTIONS=new Set(['capture_jfr','thread_dump','process_snapshot','collect_logs']);
function auth(req){return !!process.env.SPAREM_CONTROL_KEY&&req.headers.get('x-sparem-control-key')===process.env.SPAREM_CONTROL_KEY;}

export async function POST(req){
 try{
  if(!auth(req))return Response.json({error:'unauthorized'},{status:401});
  const b=await req.json(),agent=String(b.agent_id||''),action=String(b.action||'');
  if(!agent||!ALLOWED_ACTIONS.has(action))return Response.json({error:'invalid agent_id/action'},{status:400});
  const parameters=sanitizeEventData(b.parameters||{});
  const sql=db();await ensureExtendedSchema(sql);
  const rows=await sql.query(`INSERT INTO collector_commands(agent_id,action,parameters,status,approved_at) VALUES($1,$2,$3::jsonb,'pending',NOW()) RETURNING id,agent_id,action,parameters,status,created_at`,[agent,action,JSON.stringify(parameters)]);
  return Response.json({ok:true,command:rows[0]});
 }catch(e){console.error(e);return Response.json({error:'command create failed'},{status:500});}
}
export async function GET(req){
 try{
  if(!auth(req))return Response.json({error:'unauthorized'},{status:401});
  const u=new URL(req.url),agent=u.searchParams.get('agent_id');
  const sql=db();await ensureExtendedSchema(sql);
  const rows=agent?await sql.query(`SELECT id,agent_id,action,status,parameters,created_at,started_at,completed_at,result FROM collector_commands WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 50`,[agent]):await sql.query(`SELECT id,agent_id,action,status,parameters,created_at,started_at,completed_at,result FROM collector_commands ORDER BY created_at DESC LIMIT 50`);
  return Response.json({commands:rows});
 }catch(e){console.error(e);return Response.json({error:'command list failed'},{status:500});}
}
