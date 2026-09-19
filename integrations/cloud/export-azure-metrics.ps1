#Requires -Version 7.0
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IntegrationKey,
 [Parameter(Mandatory=$true)][string]$ResourceId,
 [string]$Metrics='Percentage CPU,Network In Total,Network Out Total,Disk Read Bytes,Disk Write Bytes',
 [string]$Interval='PT1M',
 [string]$AgentId='azure'
)
$ErrorActionPreference='Stop'
if(-not(Get-Command az -ErrorAction SilentlyContinue)){throw 'Azure CLI (az) is required'}
$raw=az monitor metrics list --resource $ResourceId --metric $Metrics --interval $Interval --aggregation Average Maximum Total -o json
if($LASTEXITCODE -ne 0){throw 'Azure metric collection failed'}
$j=$raw|ConvertFrom-Json
$events=@()
foreach($m in @($j.value)){
 foreach($ts in @($m.timeseries)){
  foreach($d in @($ts.data)){
   $time=if($d.timeStamp){[string]$d.timeStamp}else{(Get-Date).ToUniversalTime().ToString('o')}
   $events+=@{
    event_time=$time;agent_id=$AgentId;entity_id=$ResourceId;
    data=@{kind='cloud_metric';provider='azure';resource_id=$ResourceId;metric=[string]$m.name.value;unit=[string]$m.unit;average=$d.average;maximum=$d.maximum;total=$d.total}
   }
  }
 }
}
$body=@{type='cloud';agent_id=$AgentId;events=$events}|ConvertTo-Json -Depth 10 -Compress
$headers=@{'x-sparem-integration-key'=$IntegrationKey}
$r=Invoke-RestMethod -Method Post -Uri "$($CloudUrl.TrimEnd('/'))/api/integrations/events" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
Write-Host "Sent $($r.count) Azure metric records." -ForegroundColor Green
