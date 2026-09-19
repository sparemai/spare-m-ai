#Requires -Version 5.1
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IngestKey,
 [Parameter(Mandatory=$true)][string]$File,
 [string]$AgentId=$env:COMPUTERNAME,
 [string]$Service='',
 [int]$Pid=0,
 [switch]$IncludeExecutionSamples
)
$ErrorActionPreference='Stop'
if(-not(Test-Path $File)){throw "JFR file not found: $File"}

function Find-Jfr{
 $cmd=Get-Command jfr.exe -ErrorAction SilentlyContinue
 if($cmd){return $cmd.Source}
 $c=@(
  'C:\Program Files\Java\jdk-21\bin\jfr.exe',
  'C:\Program Files\Java\jdk-17\bin\jfr.exe',
  'C:\Program Files\Java\jdk-11\bin\jfr.exe'
 )
 foreach($p in $c){if(Test-Path $p){return $p}}
 return $null
}
function Cap([string]$s,[int]$n=12000){
 if($null -eq $s){return ''}
 if($s.Length -le $n){return $s}
 return $s.Substring(0,$n)
}

$jfr=Find-Jfr
$summary=''
$samples=''
$level='artifact_metadata'
if($jfr){
 try{
  $summary=(& $jfr summary $File 2>&1|Out-String)
  if($summary){$level='summary'}
 }catch{}
 if($IncludeExecutionSamples){
  try{
   $samples=(& $jfr print --events 'jdk.ExecutionSample,jdk.NativeMethodSample,jdk.CPULoad,jdk.GarbageCollection' $File 2>&1|Out-String)
   if($samples){$level='execution_samples'}
  }catch{}
 }
}

$item=Get-Item $File
$event=@{
 event_time=(Get-Date).ToUniversalTime().ToString('o');
 agent_id=$AgentId;
 hostname=$env:COMPUTERNAME;
 service=$Service;
 entity_id=if($Pid -gt 0){[string]$Pid}else{[IO.Path]::GetFileName($File)};
 data=@{
  kind='jfr_profile';
  analysis_level=$level;
  pid=if($Pid -gt 0){$Pid}else{$null};
  file_name=[IO.Path]::GetFileName($File);
  file_size_bytes=[int64]$item.Length;
  modified_utc=$item.LastWriteTimeUtc.ToString('o');
  summary=(Cap $summary);
  execution_samples=(Cap $samples 16000)
 }
}
$headers=@{'x-sparem-key'=$IngestKey}
$body=@{events=@($event)}|ConvertTo-Json -Depth 8 -Compress
$r=Invoke-RestMethod -Method Post -Uri "$($CloudUrl.TrimEnd('/'))/api/ingest/profile" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
Write-Host "JFR evidence ingested: $level ($($r.count) record)." -ForegroundColor Green
