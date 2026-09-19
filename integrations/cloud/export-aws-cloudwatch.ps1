#Requires -Version 7.0
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IntegrationKey,
 [Parameter(Mandatory=$true)][string]$Namespace,
 [Parameter(Mandatory=$true)][string]$MetricName,
 [string]$DimensionsJson='[]',
 [string]$Region='',
 [int]$Minutes=15,
 [int]$PeriodSeconds=60,
 [string]$AgentId='aws'
)
$ErrorActionPreference='Stop'
if(-not(Get-Command aws -ErrorAction SilentlyContinue)){throw 'AWS CLI is required'}
$end=(Get-Date).ToUniversalTime()
$start=$end.AddMinutes(-$Minutes)
$args=@('cloudwatch','get-metric-statistics','--namespace',$Namespace,'--metric-name',$MetricName,'--start-time',$start.ToString('o'),'--end-time',$end.ToString('o'),'--period',[string]$PeriodSeconds,'--statistics','Average','Maximum','Sum','--output','json')
if($Region){$args+=@('--region',$Region)}
$dims=$DimensionsJson|ConvertFrom-Json
foreach($d in @($dims)){$args+=@('--dimensions',"Name=$($d.Name),Value=$($d.Value)")}
$raw=& aws @args
if($LASTEXITCODE -ne 0){throw 'AWS CloudWatch metric collection failed'}
$j=$raw|ConvertFrom-Json
$events=@()
foreach($p in @($j.Datapoints)){
 $events+=@{
  event_time=[string]$p.Timestamp;agent_id=$AgentId;entity_id="$Namespace/$MetricName";
  data=@{kind='cloud_metric';provider='aws';namespace=$Namespace;metric=$MetricName;unit=$p.Unit;average=$p.Average;maximum=$p.Maximum;sum=$p.Sum;dimensions=$dims}
 }
}
$body=@{type='cloud';agent_id=$AgentId;events=$events}|ConvertTo-Json -Depth 10 -Compress
$headers=@{'x-sparem-integration-key'=$IntegrationKey}
$r=Invoke-RestMethod -Method Post -Uri "$($CloudUrl.TrimEnd('/'))/api/integrations/events" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
Write-Host "Sent $($r.count) AWS CloudWatch records." -ForegroundColor Green
