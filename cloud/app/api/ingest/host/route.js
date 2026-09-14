import {db} from '../../../../lib/db';
export const runtime='nodejs';
function auth(req){return !!process.env.SPAREM_INGEST_KEY && req.headers.get('x-sparem-key')===process.env.SPAREM_INGEST_KEY;}
export async function POST(req){
 try{
  if(!auth(req))return Response.json({error:'unauthorized'},{status:401});
  const b=await req.json(); if(!b.agent_id||!b.collected_at)return Response.json({error:'invalid host sample'},{status:400});
  const sql=db(); await sql`INSERT INTO host_samples(agent_id,hostname,collected_at,collector_version,cpu,memory,uptime_seconds,disks,payload) VALUES (${String(b.agent_id)},${String(b.hostname||b.agent_id)},${b.collected_at},${String(b.collector_version||'')},${Number(b.cpu?.usage_percent||0)},${Number(b.memory?.used_percent||0)},${Number(b.uptime_seconds||0)},${JSON.stringify(b.disks||[])}::jsonb,${JSON.stringify(b)}::jsonb)`;
  return Response.json({ok:true});
 }catch(e){console.error(e);return Response.json({error:'host ingest failed'},{status:500});}
}
