#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$CloudUrl,[Parameter(Mandatory=$true)][string]$IngestKey,[string]$AgentId=$env:COMPUTERNAME)
$exe=Join-Path $PSScriptRoot 'sparem-collector.exe'
& $exe --cloud-url $CloudUrl.TrimEnd('/') --ingest-key $IngestKey --agent-id $AgentId --once
