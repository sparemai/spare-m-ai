import crypto from 'crypto';
import {db} from '../../../../lib/db';
import {insertTelemetryEvents} from '../../../../lib/telemetry';
export const runtime='nodejs';

function verify(raw,signature,secret){
 if(!secret||!signature?.startsWith('sha256='))return false;
 const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
 const a=Buffer.from(expected),b=Buffer.from(signature);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function short(v,n=300){return String(v??'').slice(0,n);}
export async function POST(req){
 try{
  const secret=process.env.GITHUB_WEBHOOK_SECRET;
  if(!secret)return Response.json({error:'GITHUB_WEBHOOK_SECRET not configured'},{status:503});
  const raw=await req.text();
  if(!verify(raw,req.headers.get('x-hub-signature-256'),secret))return Response.json({error:'invalid signature'},{status:401});
  const event=req.headers.get('x-github-event')||'unknown',p=JSON.parse(raw),repo=p.repository?.full_name||p.repository?.name||'unknown';
  const base={agent_id:process.env.SPAREM_GITHUB_AGENT_ID||'github',service:p.repository?.name||null,event_time:new Date().toISOString()};
  const out=[];
  if(event==='push'){
   out.push({...base,data:{kind:'git_push',repository:repo,ref:short(p.ref,200),before:short(p.before,80),after:short(p.after,80),compare:short(p.compare,500),commit_count:Array.isArray(p.commits)?p.commits.length:0,commits:(p.commits||[]).slice(0,20).map(c=>({id:short(c.id,80),message:short(c.message,500),timestamp:c.timestamp||null}))}});
  }else if(event==='deployment'||event==='deployment_status'){
   const d=p.deployment||{};out.push({...base,event_time:p.deployment_status?.created_at||p.deployment?.created_at||base.event_time,data:{kind:event,repository:repo,environment:p.deployment_status?.environment||d.environment||null,ref:short(d.ref,200),sha:short(d.sha,80),status:p.deployment_status?.state||null,target_url:short(p.deployment_status?.target_url,500)}});
  }else if(event==='release'){
   out.push({...base,event_time:p.release?.published_at||p.release?.created_at||base.event_time,data:{kind:'release',repository:repo,tag:short(p.release?.tag_name,200),name:short(p.release?.name,300),prerelease:Boolean(p.release?.prerelease)}});
  }else{
   return Response.json({ok:true,ignored:event});
  }
  const count=await insertTelemetryEvents(db(),'change',out);
  return Response.json({ok:true,event,count});
 }catch(e){console.error(e);return Response.json({error:'github webhook failed'},{status:500});}
}
