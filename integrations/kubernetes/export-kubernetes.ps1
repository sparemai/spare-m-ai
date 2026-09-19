#Requires -Version 7.0
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IntegrationKey,
 [string]$AgentId='',
 [int]$MaxPods=500,
 [int]$MaxEvents=500
)
$ErrorActionPreference='Stop'
$base=$CloudUrl.TrimEnd('/')
if(-not(Get-Command kubectl -ErrorAction SilentlyContinue)){throw 'kubectl is required'}
$context=(kubectl config current-context 2>$null).Trim()
if(-not $AgentId){$AgentId=if($context){"k8s:$context"}else{'kubernetes'}}
$headers=@{'x-sparem-integration-key'=$IntegrationKey}

function Send-K8s($events){
 $arr=@($events);if(-not $arr.Count){return}
 $body=@{type='kubernetes';agent_id=$AgentId;events=$arr}|ConvertTo-Json -Depth 12 -Compress
 Invoke-RestMethod -Method Post -Uri "$base/api/integrations/events" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30|Out-Null
}
function NowIso{(Get-Date).ToUniversalTime().ToString('o')}

$out=@()
$nodes=(kubectl get nodes -o json|ConvertFrom-Json)
foreach($n in @($nodes.items)){
 $out+=@{
  event_time=NowIso;agent_id=$AgentId;entity_id=[string]$n.metadata.uid
  data=@{
   kind='node';cluster=$context;name=[string]$n.metadata.name;
   labels=$n.metadata.labels;capacity=$n.status.capacity;allocatable=$n.status.allocatable;
   kubelet_version=[string]$n.status.nodeInfo.kubeletVersion;os_image=[string]$n.status.nodeInfo.osImage;
   container_runtime=[string]$n.status.nodeInfo.containerRuntimeVersion;
   conditions=@($n.status.conditions|ForEach-Object {@{type=$_.type;status=$_.status;reason=$_.reason;last_transition=$_.lastTransitionTime}})
  }
 }
}

$pods=(kubectl get pods -A -o json|ConvertFrom-Json)
foreach($p in @($pods.items|Select-Object -First $MaxPods)){
 $containers=@($p.status.containerStatuses)
 $restarts=($containers|Measure-Object -Property restartCount -Sum).Sum
 $out+=@{
  event_time=NowIso;agent_id=$AgentId;entity_id=[string]$p.metadata.uid;
  service=[string]($p.metadata.labels.'app.kubernetes.io/name' ?? $p.metadata.labels.app)
  data=@{
   kind='pod';cluster=$context;namespace=[string]$p.metadata.namespace;name=[string]$p.metadata.name;
   node=[string]$p.spec.nodeName;phase=[string]$p.status.phase;pod_ip=[string]$p.status.podIP;
   restart_count=[int]($restarts ?? 0);labels=$p.metadata.labels;
   containers=@($containers|ForEach-Object {@{name=$_.name;ready=$_.ready;restart_count=$_.restartCount;image=$_.image}})
  }
 }
}

try{
 $events=(kubectl get events -A -o json|ConvertFrom-Json)
 foreach($e in @($events.items|Sort-Object {[datetime]($_.eventTime ?? $_.lastTimestamp ?? $_.metadata.creationTimestamp)} -Descending|Select-Object -First $MaxEvents)){
  $out+=@{
   event_time=[string]($e.eventTime ?? $e.lastTimestamp ?? $e.metadata.creationTimestamp ?? (NowIso));
   agent_id=$AgentId;entity_id=[string]$e.metadata.uid
   data=@{
    kind='event';cluster=$context;namespace=[string]$e.metadata.namespace;type=[string]$e.type;
    reason=[string]$e.reason;message=[string]$e.message;count=[int]($e.count ?? 1);
    involved_kind=[string]$e.involvedObject.kind;involved_name=[string]$e.involvedObject.name
   }
  }
 }
}catch{Write-Warning "Kubernetes events unavailable: $($_.Exception.Message)"}

try{
 $metrics=(kubectl get --raw '/apis/metrics.k8s.io/v1beta1/nodes'|ConvertFrom-Json)
 foreach($m in @($metrics.items)){
  $out+=@{event_time=[string]($m.timestamp ?? (NowIso));agent_id=$AgentId;entity_id=[string]$m.metadata.name;data=@{kind='node_metric';cluster=$context;name=[string]$m.metadata.name;window=[string]$m.window;cpu=[string]$m.usage.cpu;memory=[string]$m.usage.memory}}
 }
}catch{Write-Warning 'metrics-server node metrics unavailable'}

try{
 $metrics=(kubectl get --raw '/apis/metrics.k8s.io/v1beta1/pods'|ConvertFrom-Json)
 foreach($m in @($metrics.items|Select-Object -First $MaxPods)){
  $out+=@{event_time=[string]($m.timestamp ?? (NowIso));agent_id=$AgentId;entity_id=[string]$m.metadata.name;data=@{kind='pod_metric';cluster=$context;namespace=[string]$m.metadata.namespace;name=[string]$m.metadata.name;window=[string]$m.window;containers=@($m.containers|ForEach-Object {@{name=$_.name;cpu=[string]$_.usage.cpu;memory=[string]$_.usage.memory}})}}
 }
}catch{Write-Warning 'metrics-server pod metrics unavailable'}

Send-K8s $out
Write-Host "Sent $($out.Count) Kubernetes records from context '$context'." -ForegroundColor Green
