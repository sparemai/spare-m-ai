#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$CloudUrl,[Parameter(Mandatory=$true)][string]$IngestKey,[string]$AgentId=$env:COMPUTERNAME,[int]$IntervalSeconds=30)
$exe=Join-Path $PSScriptRoot 'sparem-collector.exe'; if(-not(Test-Path $exe)){throw 'sparem-collector.exe missing'}
$args="--cloud-url `"$($CloudUrl.TrimEnd('/'))`" --ingest-key `"$IngestKey`" --agent-id `"$AgentId`" --interval ${IntervalSeconds}s"
$action=New-ScheduledTaskAction -Execute $exe -Argument $args
$trigger=New-ScheduledTaskTrigger -AtStartup
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Days 3650) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'SPARE-M Collector' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Host 'Installed SPARE-M Collector scheduled task.' -ForegroundColor Green
