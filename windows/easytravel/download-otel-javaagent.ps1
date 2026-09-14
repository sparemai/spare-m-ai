#Requires -Version 5.1
param([string]$Destination='C:\ProgramData\SPARE-M-AI\opentelemetry-javaagent.jar')
$ErrorActionPreference='Stop';New-Item -ItemType Directory -Force (Split-Path $Destination) | Out-Null
$url='https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar'
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $Destination
Write-Host "Downloaded OpenTelemetry Java agent to $Destination" -ForegroundColor Green
