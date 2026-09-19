#Requires -Version 5.1
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IngestKey,
 [string]$AgentId=$env:COMPUTERNAME,
 [ValidateRange(15,600)][int]$IntervalSeconds=30,
 [string]$LogFiles=''
)
$script=Join-Path $PSScriptRoot 'sparem-extended-sensors.ps1'
if(-not(Test-Path $script)){throw 'sparem-extended-sensors.ps1 missing'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -CloudUrl $CloudUrl -IngestKey $IngestKey -AgentId $AgentId -IntervalSeconds $IntervalSeconds -LogFiles $LogFiles
