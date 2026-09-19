#Requires -Version 5.1
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IngestKey,
 [string]$AgentId=$env:COMPUTERNAME
)
$ErrorActionPreference='Stop'
$base=$CloudUrl.TrimEnd('/')
$headers=@{'x-sparem-key'=$IngestKey}
function Send([string]$type,$data){
 $body=@{events=@(@{event_time=(Get-Date).ToUniversalTime().ToString('o');agent_id=$AgentId;hostname=$env:COMPUTERNAME;service='easytravel-business-backend';data=$data})}|ConvertTo-Json -Depth 8 -Compress
 $r=Invoke-RestMethod -Method Post -Uri "$base/api/ingest/$type" -Headers $headers -ContentType 'application/json' -Body $body
 Write-Host "$type -> $($r.count)" -ForegroundColor Green
}
Send 'process' @{pid=1234;process_name='java';cpu_pct=12.5;memory_bytes=268435456;threads=42;synthetic_test=$true}
Send 'runtime' @{metric='jvm.memory.used';value=134217728;unit='By';synthetic_test=$true}
Send 'logs' @{severity='WARN';message='SPARE-M synthetic telemetry verification log';synthetic_test=$true}
Send 'network' @{interface='synthetic';rx_bytes_per_sec=1024;tx_bytes_per_sec=2048;tcp_retransmits_per_sec=0;synthetic_test=$true}
Send 'disk' @{read_iops=2;write_iops=1;read_latency_ms=1.2;write_latency_ms=1.5;synthetic_test=$true}
Send 'change' @{kind='deployment';version='synthetic-test';synthetic_test=$true}
Send 'database' @{system='synthetic';query_summary='SELECT booking';duration_ms=8;synthetic_test=$true}
Send 'kubernetes' @{cluster='synthetic';namespace='default';pod='easytravel-test';synthetic_test=$true}
Send 'cloud' @{provider='synthetic';resource='vm';cpu_pct=10;synthetic_test=$true}
Send 'business' @{event='booking_confirmed';transaction_value=100;currency='INR';synthetic_test=$true}
Write-Host 'Synthetic extended telemetry sent. Use only for verification; remove/ignore synthetic_test=true in analysis.' -ForegroundColor Yellow
