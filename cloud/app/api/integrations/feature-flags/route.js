import {db} from '../../../../lib/db';
import {insertTelemetryEvents,sanitizeEventData} from '../../../../lib/telemetry';
export const runtime='nodejs';

function auth(req){
 const key=process.env.SPAREM_INTEGRATION_KEY;
 return !!key && req.headers.get('x-sparem-integration-key')===key;
}
export async function POST(req){
 try{
  if(!auth(req))return Response.json({error:'unauthorized'},{status:401});
  const b=await req.json();
  const rows=Array.isArray(b)?b:(Array.isArray(b.events)?b.events:[b]);
  const events=rows.slice(0,500).map(x=>({
   event_time:x.event_time||x.timestamp||new Date().toISOString(),
   agent_id:x.agent_id||'feature-flags',
   service:x.service||x.application||null,
   entity_id:x.flag_key||x.key||x.config_key||null,
   data:sanitizeEventData({
    kind:x.kind||'feature_flag_change',
    flag_key:x.flag_key||x.key||x.config_key||null,
    environment:x.environment||null,
    old_value:x.old_value,
    new_value:x.new_value??x.value,
    actor:x.actor||null,
    source:x.source||'integration',
    version:x.version||null
   })
  }));
  const count=await insertTelemetryEvents(db(),'change',events);
  return Response.json({ok:true,count});
 }catch(e){console.error(e);return Response.json({error:'feature flag ingest failed'},{status:500});}
}
