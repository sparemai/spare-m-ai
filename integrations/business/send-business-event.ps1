#Requires -Version 7.0
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IntegrationKey,
 [Parameter(Mandatory=$true)][string]$Event,
 [string]$AgentId='business-app',
 [string]$Service='',
 [string]$TransactionId='',
 [string]$SessionId='',
 [string]$TraceId='',
 [Nullable[double]]$Value=$null,
 [string]$Currency='',
 [string]$Outcome=''
)
$ErrorActionPreference='Stop'
$data=@{event=$Event}
if($null -ne $Value){$data.transaction_value=[double]$Value}
if($Currency){$data.currency=$Currency}
if($Outcome){$data.outcome=$Outcome}
$event=@{
 event_time=(Get-Date).ToUniversalTime().ToString('o');agent_id=$AgentId;service=$Service;
 transaction_id=$TransactionId;session_id=$SessionId;trace_id=$TraceId;data=$data
}
$body=@{type='business';agent_id=$AgentId;events=@($event)}|ConvertTo-Json -Depth 8 -Compress
$headers=@{'x-sparem-integration-key'=$IntegrationKey}
$r=Invoke-RestMethod -Method Post -Uri "$($CloudUrl.TrimEnd('/'))/api/integrations/events" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 15
Write-Host "Business event '$Event' sent ($($r.count) record)." -ForegroundColor Green
