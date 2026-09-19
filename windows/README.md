# SPARE-M Windows Collection

Windows remains a collection/diagnostic node only. The database, intelligence engine, AI and UI run in the cloud.

## Components

1. `sparem-collector.exe`
   - host CPU
   - memory
   - disk capacity
   - uptime

2. OpenTelemetry Java agent for EasyTravel
   - sampled distributed traces
   - JVM/runtime OTLP metrics
   - OTLP application logs when the Java logging instrumentation emits them

3. `sparem-extended-sensors.ps1`
   - per-process CPU/memory/threads/I/O
   - local service/PID inference
   - network throughput/error counters
   - TCP retransmit/connection counters
   - optional active latency/packet-loss probes
   - disk IOPS/throughput/latency
   - optional application log-file tailing with local secret masking
   - optional configuration-file change detection
   - allow-listed diagnostic command polling

## EasyTravel instrumentation

Download the Java agent:

```powershell
.\easytravel\download-otel-javaagent.ps1
```

Enable frontend/backend tracing, metrics and logs:

```powershell
.\easytravel\enable-java-tracing.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_INGEST_KEY" `
  -SamplingRatio 0.05
```

Defaults:
- 5% parent-based trace sampling
- JVM/runtime metrics every ~30s
- OTLP logs exporter enabled
- Java-agent internal logging disabled
- no local telemetry database

Restart the EasyTravel scenario after changing its Java options.

## Start extended sensors immediately

```powershell
.\start-extended-sensors.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_INGEST_KEY"
```

Optional log files, network probes and config watching:

```powershell
.\start-extended-sensors.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_INGEST_KEY" `
  -LogFiles "C:\path\frontend.log;C:\path\backend.log" `
  -ProbeTargets "database.internal;api.internal" `
  -ConfigFiles "C:\Program Files\Dynatrace\easyTravel (x64)\resources\easyTravelConfig.properties"
```

Probe targets are optional because active network checks create extra traffic.

## Install at startup

Run as Administrator:

```powershell
.\install-startup-task.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_INGEST_KEY" `
  -InstallExtended $true
```

The installer creates:
- `SPARE-M Collector`
- `SPARE-M Extended Sensors`

## Verify extended telemetry

```powershell
.\test-extended-telemetry.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_INGEST_KEY"
```

This sends synthetic records marked `synthetic_test=true`. Use it only to validate the ingestion/UI path.

## JFR / code profiling

The extended collector supports an allow-listed `capture_jfr` command. JFR remains on-demand rather than continuous.

After a recording completes, ingest privacy-conscious evidence instead of uploading the binary:

```powershell
.\ingest-jfr-summary.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_INGEST_KEY" `
  -File "C:\ProgramData\SPARE-M-AI\profiles\sparem-123.jfr" `
  -Service "easytravel-business-backend" `
  -Pid 12345 `
  -IncludeExecutionSamples
```

This sends summary/selected execution-sample text with strict size limits. The raw JFR file remains local.

## Log safety

Before sending tailed log lines, the extended sensor masks common:
- bearer/authorization values
- access/refresh tokens
- API keys
- passwords/secrets
- session tokens

File tailing must still be reviewed before production because application-specific PII may require additional masking rules.

## Rollback

Restore the EasyTravel JVM configuration:

```powershell
.\easytravel\restore-config.ps1
```

Remove startup tasks:

```powershell
.\uninstall-startup-task.ps1
```
