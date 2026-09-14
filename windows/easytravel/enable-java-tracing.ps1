#Requires -Version 5.1
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IngestKey,
 [string]$EasyTravelDir='',
 [string]$JavaAgentJar='C:\ProgramData\SPARE-M-AI\opentelemetry-javaagent.jar',
 [string]$AgentId=$env:COMPUTERNAME,
 [ValidateRange(0.001,1.0)][double]$SamplingRatio=0.05
)
$ErrorActionPreference='Stop'
function Find-EasyTravel{
 $c=@('C:\Program Files\Dynatrace\easyTravel (x64)','C:\Program Files (x86)\Dynatrace\easyTravel','C:\Program Files\Dynatrace\easyTravel')
 foreach($p in $c){if(Test-Path (Join-Path $p 'resources\easyTravelConfig.properties')){return $p}};return $null
}
if(-not $EasyTravelDir){$EasyTravelDir=Find-EasyTravel};if(-not $EasyTravelDir){throw 'EasyTravel directory not found. Pass -EasyTravelDir.'}
if(-not(Test-Path $JavaAgentJar)){throw "Java agent missing: $JavaAgentJar"}
$config=Join-Path $EasyTravelDir 'resources\easyTravelConfig.properties';if(-not(Test-Path $config)){throw "Config missing: $config"}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss';$backup="$config.sparem-backup-$stamp";Copy-Item $config $backup -Force
$traceEndpoint=$CloudUrl.TrimEnd('/')+'/api/otlp/v1/traces'
function Set-Opts([string[]]$lines,[string]$key,[string]$service){
 $prefix="$key=";$found=$false;$out=@()
 foreach($line in $lines){
  if($line.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){
   $found=$true;$existing=$line.Substring($prefix.Length)
   $parts=@($existing -split ',' | Where-Object {$_ -and $_ -notmatch '^-javaagent:.*opentelemetry-javaagent\.jar' -and $_ -notmatch '^-Dotel\.'})
   $otel=@("-javaagent:$JavaAgentJar","-Dotel.service.name=$service","-Dotel.resource.attributes=deployment.environment.name=lab,sparem.agent.id=$AgentId","-Dotel.exporter.otlp.traces.endpoint=$traceEndpoint",'-Dotel.exporter.otlp.traces.protocol=http/protobuf',"-Dotel.exporter.otlp.headers=x-sparem-key=$IngestKey",'-Dotel.metrics.exporter=none','-Dotel.logs.exporter=none','-Dotel.traces.sampler=parentbased_traceidratio',"-Dotel.traces.sampler.arg=$SamplingRatio",'-Dotel.bsp.max.export.batch.size=256','-Dotel.bsp.schedule.delay=5000','-Dotel.span.attribute.count.limit=64','-Dotel.span.event.count.limit=16','-Dotel.javaagent.logging=none')
   $out += $prefix+(($parts+$otel)-join ',')
  }else{$out+=$line}
 }
 if(-not $found){$out += $prefix+(@("-javaagent:$JavaAgentJar","-Dotel.service.name=$service","-Dotel.resource.attributes=deployment.environment.name=lab,sparem.agent.id=$AgentId","-Dotel.exporter.otlp.traces.endpoint=$traceEndpoint",'-Dotel.exporter.otlp.traces.protocol=http/protobuf',"-Dotel.exporter.otlp.headers=x-sparem-key=$IngestKey",'-Dotel.metrics.exporter=none','-Dotel.logs.exporter=none','-Dotel.traces.sampler=parentbased_traceidratio',"-Dotel.traces.sampler.arg=$SamplingRatio",'-Dotel.bsp.max.export.batch.size=256','-Dotel.bsp.schedule.delay=5000','-Dotel.span.attribute.count.limit=64','-Dotel.span.event.count.limit=16','-Dotel.javaagent.logging=none')-join ',')}
 return ,$out
}
$lines=Get-Content $config;$lines=Set-Opts $lines 'config.frontendJavaopts' 'easytravel-customer-frontend';$lines=Set-Opts $lines 'config.backendJavaopts' 'easytravel-business-backend';Set-Content $config $lines -Encoding ASCII
Write-Host 'Enabled targeted EasyTravel Java bytecode tracing directly to Vercel.' -ForegroundColor Green
Write-Host "Endpoint: $traceEndpoint";Write-Host "Sampling: $SamplingRatio";Write-Host "Backup: $backup";Write-Host 'Restart the EasyTravel scenario. Launcher/weblauncher were not instrumented.'
