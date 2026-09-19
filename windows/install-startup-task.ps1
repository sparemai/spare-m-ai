#Requires -RunAsAdministrator
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IngestKey,
 [string]$AgentId=$env:COMPUTERNAME,
 [int]$IntervalSeconds=30,
 [bool]$InstallExtended=$true,
 [string]$LogFiles='',
 [string]$ProbeTargets='',
 [string]$ConfigFiles=''
)
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'sparem-collector.exe'
if(-not(Test-Path $exe)){throw 'sparem-collector.exe missing'}
$args="--cloud-url `"$($CloudUrl.TrimEnd('/'))`" --ingest-key `"$IngestKey`" --agent-id `"$AgentId`" --interval $($IntervalSeconds)s"
$action=New-ScheduledTaskAction -Execute $exe -Argument $args
$trigger=New-ScheduledTaskTrigger -AtStartup
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Days 3650) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'SPARE-M Collector' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Host 'Installed SPARE-M Collector scheduled task.' -ForegroundColor Green

if($InstallExtended){
 $script=Join-Path $PSScriptRoot 'sparem-extended-sensors.ps1'
 if(-not(Test-Path $script)){throw 'sparem-extended-sensors.ps1 missing'}
 $escapedLogs=$LogFiles.Replace('"','')
 $psArgs="-NoProfile -ExecutionPolicy Bypass -File `"$script`" -CloudUrl `"$($CloudUrl.TrimEnd('/'))`" -IngestKey `"$IngestKey`" -AgentId `"$AgentId`" -IntervalSeconds $IntervalSeconds"
 if($escapedLogs){$psArgs+=" -LogFiles `"$escapedLogs`""}
 $extendedAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
 Register-ScheduledTask -TaskName 'SPARE-M Extended Sensors' -Action $extendedAction -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
 Write-Host 'Installed SPARE-M Extended Sensors scheduled task.' -ForegroundColor Green
 if(-not $LogFiles){Write-Host 'Log file tailing is enabled but no -LogFiles paths were supplied; OTLP Java logs can still be collected.' -ForegroundColor Yellow}
}
