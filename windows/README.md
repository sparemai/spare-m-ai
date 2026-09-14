# SPARE-M Windows Collection v0.5

Windows only collects and exports.

## Local processes
1. `sparem-collector.exe` — native host counters -> Vercel every 30s.
2. OpenTelemetry Java agent inside the selected EasyTravel Java tiers — sampled traces -> Vercel directly.

There is no local SPARE-M database, UI, analytics engine or LLM.

## First test
```powershell
.\test-collector.ps1 -CloudUrl "https://YOUR-APP.vercel.app" -IngestKey "YOUR_KEY"
```

## Continuous host collection
```powershell
.\start-collector.ps1 -CloudUrl "https://YOUR-APP.vercel.app" -IngestKey "YOUR_KEY"
```

Default interval is 30 seconds.

## EasyTravel Java bytecode tracing
Download the OpenTelemetry agent:
```powershell
.\easytravel\download-otel-javaagent.ps1
```

Enable targeted tracing:
```powershell
.\easytravel\enable-java-tracing.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_KEY" `
  -SamplingRatio 0.05
```

Restart the EasyTravel scenario. Only `config.frontendJavaopts` and `config.backendJavaopts` are changed. Launcher/weblauncher options are not changed.

To roll back, run:
```powershell
.\easytravel\restore-config.ps1
```

## Low-overhead defaults
- 5% trace-id sampling
- Java metrics exporter off
- Java logs exporter off
- agent logs off
- max 256 spans/export batch
- max 64 span attributes and 16 span events
- no local telemetry database
- no local analysis
