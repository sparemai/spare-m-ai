#Requires -Version 5.1
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IngestKey,
 [string]$AgentId=$env:COMPUTERNAME,
 [ValidateRange(15,600)][int]$IntervalSeconds=30,
 [string]$LogFiles='',
 [string]$ProbeTargets='',
 [string]$ConfigFiles='',
 [bool]$EnableProcess=$true,
 [bool]$EnableNetwork=$true,
 [bool]$EnableDisk=$true,
 [bool]$EnableLogs=$true,
 [bool]$EnableCommands=$true
)
$ErrorActionPreference='Continue'
$base=$CloudUrl.TrimEnd('/')
$headers=@{'x-sparem-key'=$IngestKey}
$logOffsets=@{}
$configHashes=@{}

function Mask-Log([string]$s){
 if($null -eq $s){return ''}
 $x=$s
 $x=[regex]::Replace($x,'(?i)(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+','$1********')
 $x=[regex]::Replace($x,'(?i)((?:access[_-]?token|refresh[_-]?token|api[_-]?key|password|passwd|secret|session[_-]?token)\s*[:=]\s*[''"]?)[^\s,''";}]+','$1********')
 if($x.Length -gt 16000){$x=$x.Substring(0,16000)}
 return $x
}
function Send-Events([string]$type,$events){
 if($null -eq $events){return}
 $arr=@($events);if($arr.Count -eq 0){return}
 try{
  $payload=@{events=$arr}|ConvertTo-Json -Depth 8 -Compress
  Invoke-RestMethod -Method Post -Uri "$base/api/ingest/$type" -Headers $headers -ContentType 'application/json' -Body $payload -TimeoutSec 12 | Out-Null
 }catch{Write-Warning "SPARE-M $type send failed: $($_.Exception.Message)"}
}
function Infer-Service([string]$name,[string]$cmd){
 $s=("$name $cmd").ToLowerInvariant()
 if($s -match 'customer.*front|frontend'){return 'easytravel-customer-frontend'}
 if($s -match 'business.*back|backend'){return 'easytravel-business-backend'}
 return $null
}
function Collect-Processes{
 try{
  $cmdByPid=@{}
  Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object {$cmdByPid[[int]$_.ProcessId]=[string]$_.CommandLine}
  $now=(Get-Date).ToUniversalTime().ToString('o')
  $rows=Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -ErrorAction Stop | Where-Object {$_.IDProcess -gt 0 -and $_.Name -notin @('_Total','Idle')}
  $out=@()
  foreach($p in $rows){
   $pid=[int]$p.IDProcess;$cmd=$cmdByPid[$pid];$service=Infer-Service ([string]$p.Name) $cmd
   $out+=@{
    event_time=$now;agent_id=$AgentId;hostname=$env:COMPUTERNAME;entity_id=[string]$pid;service=$service
    data=@{
     pid=$pid;process_name=[string]$p.Name;cpu_pct=[double]$p.PercentProcessorTime;
     memory_bytes=[double]$p.WorkingSetPrivate;threads=[int]$p.ThreadCount;
     io_read_bytes_per_sec=[double]$p.IOReadBytesPersec;io_write_bytes_per_sec=[double]$p.IOWriteBytesPersec;
     handle_count=[int]$p.HandleCount;service_inferred=[bool]$service
    }
   }
  }
  return $out
 }catch{Write-Warning "process collection failed: $($_.Exception.Message)";return @()}
}
function Collect-Network{
 $now=(Get-Date).ToUniversalTime().ToString('o');$out=@()
 try{
  $set=Get-Counter -Counter @(
   '\Network Interface(*)\Bytes Received/sec','\Network Interface(*)\Bytes Sent/sec',
   '\Network Interface(*)\Packets Received Errors','\Network Interface(*)\Packets Outbound Errors'
  ) -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
  $groups=$set.CounterSamples|Group-Object InstanceName
  foreach($g in $groups){
   $d=@{};foreach($s in $g.Group){$leaf=($s.Path -split '\\')[-1];$d[$leaf]=[double]$s.CookedValue}
   $out+=@{event_time=$now;agent_id=$AgentId;hostname=$env:COMPUTERNAME;entity_id=[string]$g.Name;data=@{
    interface=[string]$g.Name;rx_bytes_per_sec=$d['Bytes Received/sec'];tx_bytes_per_sec=$d['Bytes Sent/sec'];
    rx_errors=$d['Packets Received Errors'];tx_errors=$d['Packets Outbound Errors']
   }}
  }
 }catch{Write-Warning "network interface counters unavailable: $($_.Exception.Message)"}
 try{
  $tcp=Get-Counter -Counter @('\TCPv4\Segments Retransmitted/sec','\TCPv4\Connections Established') -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
  $d=@{};foreach($s in $tcp.CounterSamples){$leaf=($s.Path -split '\\')[-1];$d[$leaf]=[double]$s.CookedValue}
  $out+=@{event_time=$now;agent_id=$AgentId;hostname=$env:COMPUTERNAME;entity_id='tcpv4';data=@{tcp_retransmits_per_sec=$d['Segments Retransmitted/sec'];tcp_connections_established=$d['Connections Established']}}
 }catch{Write-Warning "TCP counters unavailable: $($_.Exception.Message)"}
 return $out
}
function Collect-Probes{
 if([string]::IsNullOrWhiteSpace($ProbeTargets)){return @()}
 $now=(Get-Date).ToUniversalTime().ToString('o');$out=@()
 foreach($target in ($ProbeTargets -split ';'|Where-Object {$_})){
  try{
   $samples=@(Test-Connection -ComputerName $target -Count 3 -ErrorAction SilentlyContinue)
   $received=$samples.Count;$loss=[Math]::Round((3-$received)*100/3,2)
   $times=@($samples|ForEach-Object {[double]$_.ResponseTime})
   $avg=if($times.Count){[Math]::Round(($times|Measure-Object -Average).Average,2)}else{$null}
   $max=if($times.Count){[Math]::Round(($times|Measure-Object -Maximum).Maximum,2)}else{$null}
   $out+=@{event_time=$now;agent_id=$AgentId;hostname=$env:COMPUTERNAME;entity_id="probe:$target";data=@{kind='active_probe';target=$target;sent=3;received=$received;packet_loss_pct=$loss;latency_avg_ms=$avg;latency_max_ms=$max}}
  }catch{
   $out+=@{event_time=$now;agent_id=$AgentId;hostname=$env:COMPUTERNAME;entity_id="probe:$target";data=@{kind='active_probe';target=$target;sent=3;received=0;packet_loss_pct=100;error=(Mask-Log $_.Exception.Message)}}
  }
 }
 return $out
}
function Collect-Disk{
 try{
  $now=(Get-Date).ToUniversalTime().ToString('o')
  $set=Get-Counter -Counter @(
   '\PhysicalDisk(_Total)\Disk Reads/sec','\PhysicalDisk(_Total)\Disk Writes/sec',
   '\PhysicalDisk(_Total)\Disk Read Bytes/sec','\PhysicalDisk(_Total)\Disk Write Bytes/sec',
   '\PhysicalDisk(_Total)\Avg. Disk sec/Read','\PhysicalDisk(_Total)\Avg. Disk sec/Write'
  ) -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
  $d=@{};foreach($s in $set.CounterSamples){$leaf=($s.Path -split '\\')[-1];$d[$leaf]=[double]$s.CookedValue}
  return @(@{event_time=$now;agent_id=$AgentId;hostname=$env:COMPUTERNAME;entity_id='_Total';data=@{
   read_iops=$d['Disk Reads/sec'];write_iops=$d['Disk Writes/sec'];
   read_bytes_per_sec=$d['Disk Read Bytes/sec'];write_bytes_per_sec=$d['Disk Write Bytes/sec'];
   read_latency_ms=([double]$d['Avg. Disk sec/Read']*1000);write_latency_ms=([double]$d['Avg. Disk sec/Write']*1000)
  }})
 }catch{Write-Warning "disk counters unavailable: $($_.Exception.Message)";return @()}
}
function Read-NewLogs{
 if(-not $EnableLogs -or [string]::IsNullOrWhiteSpace($LogFiles)){return @()}
 $out=@();$files=$LogFiles -split ';'|Where-Object {$_ -and (Test-Path $_)}
 foreach($file in $files){
  try{
   $item=Get-Item $file;$offset=0L
   if($logOffsets.ContainsKey($file)){$offset=[int64]$logOffsets[$file]}else{$offset=[Math]::Max(0L,$item.Length-65536)}
   if($item.Length -lt $offset){$offset=0}
   $fs=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
   try{
    $fs.Seek($offset,[IO.SeekOrigin]::Begin)|Out-Null;$sr=New-Object IO.StreamReader($fs)
    $count=0
    while(-not $sr.EndOfStream -and $count -lt 500){
     $line=$sr.ReadLine();$count++;if([string]::IsNullOrWhiteSpace($line)){continue}
     $sev=if($line -match '(?i)\b(ERROR|FATAL)\b'){'ERROR'}elseif($line -match '(?i)\bWARN(?:ING)?\b'){'WARN'}elseif($line -match '(?i)\bDEBUG\b'){'DEBUG'}else{'INFO'}
     $trace=$null;$span=$null
     if($line -match '(?i)(?:trace[_ -]?id[=: ]+)([0-9a-f]{32})'){$trace=$Matches[1]}
     if($line -match '(?i)(?:span[_ -]?id[=: ]+)([0-9a-f]{16})'){$span=$Matches[1]}
     $service=Infer-Service ([IO.Path]::GetFileName($file)) $file
     $out+=@{event_time=(Get-Date).ToUniversalTime().ToString('o');agent_id=$AgentId;hostname=$env:COMPUTERNAME;service=$service;trace_id=$trace;span_id=$span;data=@{severity=$sev;message=(Mask-Log $line);file=[IO.Path]::GetFileName($file)}}
    }
    $logOffsets[$file]=$fs.Position
   }finally{$fs.Dispose()}
  }catch{Write-Warning "log tail failed for $file : $($_.Exception.Message)"}
 }
 return $out
}
function Check-ConfigChanges{
 if([string]::IsNullOrWhiteSpace($ConfigFiles)){return @()}
 $out=@()
 foreach($file in ($ConfigFiles -split ';'|Where-Object {$_ -and (Test-Path $_)})){
  try{
   $hash=(Get-FileHash -Algorithm SHA256 -Path $file).Hash
   $item=Get-Item $file
   if(-not $configHashes.ContainsKey($file)){
    $configHashes[$file]=$hash
    continue
   }
   if($configHashes[$file] -ne $hash){
    $old=$configHashes[$file];$configHashes[$file]=$hash
    $out+=@{
     event_time=(Get-Date).ToUniversalTime().ToString('o');agent_id=$AgentId;hostname=$env:COMPUTERNAME;entity_id=$file
     data=@{kind='configuration_change';file=[IO.Path]::GetFileName($file);old_sha256=$old;new_sha256=$hash;last_write_utc=$item.LastWriteTimeUtc.ToString('o')}
    }
   }
  }catch{Write-Warning "config watch failed for $file : $($_.Exception.Message)"}
 }
 return $out
}
function Find-Jcmd{
 $cmd=Get-Command jcmd.exe -ErrorAction SilentlyContinue;if($cmd){return $cmd.Source}
 $c=@(
  'C:\Program Files\Dynatrace\easyTravel (x64)\jre\bin\jcmd.exe',
  'C:\Program Files\Java\jdk-21\bin\jcmd.exe',
  'C:\Program Files\Java\jdk-17\bin\jcmd.exe',
  'C:\Program Files\Java\jdk-11\bin\jcmd.exe'
 )
 foreach($p in $c){if(Test-Path $p){return $p}}
 return $null
}
function Send-CommandResult($id,[string]$status,$result){
 try{
  $body=@{id=$id;status=$status;result=$result}|ConvertTo-Json -Depth 8 -Compress
  Invoke-RestMethod -Method Post -Uri "$base/api/commands/result" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 20|Out-Null
 }catch{Write-Warning "command result failed: $($_.Exception.Message)"}
}
function Poll-Command{
 if(-not $EnableCommands){return}
 $id=$null
 try{
  $r=Invoke-RestMethod -Method Get -Uri "$base/api/commands/next?agent_id=$([uri]::EscapeDataString($AgentId))" -Headers $headers -TimeoutSec 10
  $c=$r.command;if($null -eq $c){return}
  $action=[string]$c.action;$p=$c.parameters;$id=[int64]$c.id
  if($action -eq 'process_snapshot'){
   $snap=Collect-Processes|Where-Object {(-not $p.pid) -or $_.data.pid -eq [int]$p.pid}
   Send-CommandResult $id 'completed' @{processes=$snap}
  }elseif($action -eq 'thread_dump'){
   $jcmd=Find-Jcmd;if(-not $jcmd){throw 'jcmd.exe not found'}
   $pid=[int]$p.pid;if($pid -le 0){throw 'pid required'}
   $text=& $jcmd $pid 'Thread.print' 2>&1|Out-String
   Send-CommandResult $id 'completed' @{pid=$pid;thread_dump=(Mask-Log $text)}
  }elseif($action -eq 'capture_jfr'){
   $jcmd=Find-Jcmd;if(-not $jcmd){throw 'jcmd.exe not found'}
   $pid=[int]$p.pid;if($pid -le 0){throw 'pid required'}
   $requested=if($p.duration_seconds){[int]$p.duration_seconds}else{60}
   $duration=[Math]::Min(600,[Math]::Max(30,$requested))
   $dir='C:\ProgramData\SPARE-M-AI\profiles';New-Item -ItemType Directory -Path $dir -Force|Out-Null
   $file=Join-Path $dir "sparem-$id.jfr"
   $arg="name=sparem$id settings=profile duration=${duration}s filename=$file"
   $text=& $jcmd $pid 'JFR.start' $arg 2>&1|Out-String
   Send-CommandResult $id 'completed' @{pid=$pid;duration_seconds=$duration;file=$file;output=(Mask-Log $text);note='JFR capture scheduled locally; upload/analysis adapter can process the artifact after completion.'}
  }elseif($action -eq 'collect_logs'){
   $logs=Read-NewLogs;Send-Events 'logs' $logs;Send-CommandResult $id 'completed' @{lines=@($logs).Count}
  }else{Send-CommandResult $id 'rejected' @{reason='action not allow-listed by extended collector'}}
 }catch{Write-Warning "command execution failed: $($_.Exception.Message)";if($id){Send-CommandResult $id 'failed' @{error=(Mask-Log $_.Exception.Message)}}}
}

Write-Host "SPARE-M extended sensors started for $AgentId" -ForegroundColor Green
Write-Host "Interval: ${IntervalSeconds}s; process=$EnableProcess network=$EnableNetwork disk=$EnableDisk logs=$EnableLogs commands=$EnableCommands"
if($ProbeTargets){Write-Host "Active network probes: $ProbeTargets"}
if($ConfigFiles){Write-Host "Configuration watch enabled for supplied file list."}
while($true){
 $started=Get-Date
 if($EnableProcess){Send-Events 'process' (Collect-Processes)}
 if($EnableNetwork){Send-Events 'network' (Collect-Network);Send-Events 'network' (Collect-Probes)}
 if($EnableDisk){Send-Events 'disk' (Collect-Disk)}
 if($EnableLogs){Send-Events 'logs' (Read-NewLogs)}
 Send-Events 'change' (Check-ConfigChanges)
 Poll-Command
 $elapsed=((Get-Date)-$started).TotalSeconds
 Start-Sleep -Seconds ([Math]::Max(1,$IntervalSeconds-[int]$elapsed))
}
