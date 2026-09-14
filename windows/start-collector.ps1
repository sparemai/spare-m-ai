#Requires -Version 5.1
param(
  [Parameter(Mandatory=$true)][string]$CloudUrl,
  [Parameter(Mandatory=$true)][string]$IngestKey,
  [string]$AgentId = $env:COMPUTERNAME,
  [int]$IntervalSeconds = 30
)
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'sparem-collector.exe'
if(-not (Test-Path $exe)){throw "Collector not found: $exe"}
$CloudUrl=$CloudUrl.TrimEnd('/')
Write-Host "SPARE-M collector only: no local analytics, DB, UI or AI." -ForegroundColor Cyan
Write-Host "Cloud: $CloudUrl"
Write-Host "Agent: $AgentId"
& $exe --cloud-url $CloudUrl --ingest-key $IngestKey --agent-id $AgentId --interval "${IntervalSeconds}s"
