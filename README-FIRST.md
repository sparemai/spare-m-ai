# SPARE-M — Current Architecture

SPARE-M is now structured as a multi-signal application reliability platform.

**Collectors/adapters gather evidence. Cloud intelligence explains business impact, technical health, infrastructure contribution and what to investigate next.**

## Implemented signal families

### Live with the current EasyTravel/Windows lab once enabled
- host CPU / memory / disk capacity / uptime
- distributed traces
- HTTP status / request latency
- JVM/runtime OTLP metrics
- OTLP logs
- file-based application logs
- per-process CPU / memory / threads / I/O
- network throughput / errors / TCP statistics
- optional network latency / packet-loss probes
- disk IOPS / throughput / latency
- configuration-file change detection
- JFR command plumbing + summary/execution-sample ingestion

### Implemented adapters that require a source connection
- browser/RUM
- trusted business events
- GitHub push/release/deployment events
- feature-flag/configuration events
- Kubernetes nodes/pods/events/metrics
- PostgreSQL schema/index/connection/query-stat/EXPLAIN evidence
- Azure Monitor metrics
- AWS CloudWatch metrics

## Cloud endpoints

OpenTelemetry:
- `/api/otlp/v1/traces`
- `/api/otlp/v1/metrics`
- `/api/otlp/v1/logs`

Native ingestion:
- `/api/ingest/host`
- `/api/ingest/{type}`
- `/api/ingest/rum`

Integrations:
- `/api/integrations/events`
- `/api/integrations/github`
- `/api/integrations/feature-flags`

Diagnostics:
- `/api/commands`
- `/api/commands/next`
- `/api/commands/result`

## Quick start

Deploy `cloud` to Vercel, connect Neon/Postgres and set:
- `DATABASE_URL`
- `SPAREM_INGEST_KEY`
- `OPENAI_API_KEY` if using Ask SPARE-M
- `SPAREM_CONTROL_KEY` for diagnostic commands
- `SPAREM_INTEGRATION_KEY` for server-side integrations
- optional `SPAREM_RUM_KEY`
- optional `GITHUB_WEBHOOK_SECRET`

Then on Windows:

```powershell
.\test-collector.ps1 -CloudUrl "https://YOUR-APP.vercel.app" -IngestKey "YOUR_KEY"

.\easytravel\enable-java-tracing.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_KEY" `
  -SamplingRatio 0.05

.\start-extended-sensors.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IngestKey "YOUR_KEY"
```

Restart EasyTravel after enabling the Java agent.

## AI

Ask SPARE-M is tool-driven. It can choose journey, trace, anomaly, infrastructure, coverage and extended-telemetry evidence dynamically.

Current model mapping:
- quick/copilot: `gpt-5.4-mini`
- deep: `gpt-5.5`

The model is not the source of telemetry facts. Deterministic SPARE-M tools provide the evidence.

## Important distinctions

- Trace-observed booking counts are proxies until trusted business events / stable transaction IDs exist.
- Transaction value is not automatically equal to recognized revenue.
- Full SQL and raw logs can contain sensitive data; SPARE-M defaults toward normalized/masked evidence.
- JFR stays on-demand.
- Kubernetes/cloud/database/business adapters do not become “live” simply because the code exists; the relevant source must be connected.
