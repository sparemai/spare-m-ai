# SPARE-M Cloud

The cloud folder is the intelligence, storage, API and UI side of SPARE-M. Windows and other adapters collect/export evidence; Vercel performs normalization, correlation, intelligence and AI reasoning.

## Signal paths

### OpenTelemetry
- `POST /api/otlp/v1/traces` — sampled distributed traces
- `POST /api/otlp/v1/metrics` — JVM/runtime and other OTLP metrics
- `POST /api/otlp/v1/logs` — correlated OTLP logs

### Native SPARE-M collection
- `POST /api/ingest/host` — lightweight host CPU/memory/disk-capacity samples
- `POST /api/ingest/{type}` — normalized collector telemetry
  - `process`
  - `runtime`
  - `network`
  - `disk`
  - `logs`
  - `change`
  - `business`
  - `database`
  - `kubernetes`
  - `cloud`
  - `profile`

### Browser / integrations
- `POST /api/ingest/rum` — browser page/action/error/performance evidence
- `POST /api/integrations/events` — trusted external integration events
- `POST /api/integrations/github` — signed GitHub push/release/deployment webhook
- `POST /api/integrations/feature-flags` — normalized flag/config changes

### Diagnostics control plane
- `POST /api/commands` — create an allow-listed diagnostic command
- `GET /api/commands/next` — collector poll
- `POST /api/commands/result` — collector result

Only allow-listed actions are supported: JFR capture, thread dump, process snapshot and targeted log collection. There is no arbitrary remote shell endpoint.

## Storage

Core tables:
- `host_samples`
- `spans`
- `telemetry_events`
- `collector_commands`
- `ai_analysis`

The app creates the extended telemetry/control tables on demand, but `schema.sql` contains the canonical schema.

For a larger production deployment, high-volume traces/metrics/logs/RUM should eventually move to a columnar/time-series store while Postgres retains configuration, entities, incidents, commands and business metadata.

## Environment variables

Required:
- `DATABASE_URL`
- `SPAREM_INGEST_KEY` — collector/OTLP write secret

AI:
- `OPENAI_API_KEY`

Control/integrations:
- `SPAREM_CONTROL_KEY` — diagnostic-control API secret
- `SPAREM_INTEGRATION_KEY` — server-to-server integration write secret
- `SPAREM_RUM_KEY` — optional browser write token; treat it as a public write-only project token, not a control secret
- `GITHUB_WEBHOOK_SECRET` — GitHub webhook HMAC secret
- `SPAREM_GITHUB_AGENT_ID` — optional source ID

Do not reuse the control-plane secret in collectors, browsers or third-party integrations.

## Intelligence

SPARE-M currently calculates:
- trace hierarchy and exclusive/self-time
- service/operation attribution
- request p95 and 4xx/5xx
- current-vs-previous-window baselines
- inferred business stages/journey structure
- evidence graph and competing hypotheses
- telemetry coverage/gap intelligence
- process/runtime/network/disk/log/change/business/DB/RUM/cloud/Kubernetes availability
- Ask SPARE-M tool-driven investigation

Ask SPARE-M uses deterministic SPARE-M evidence as tools. The model should interpret evidence; it should not invent telemetry, transactions, revenue, host ownership or root cause.

Current model mapping:
- quick/copilot: `gpt-5.4-mini`
- deep: `gpt-5.5`

## Trusted business events

When a business application sends stable transaction/session IDs and explicit value/currency, SPARE-M can use them instead of sampled-trace proxies for business counts/value.

Example payload to `/api/integrations/events`:

```json
{
  "type": "business",
  "agent_id": "booking-api",
  "events": [{
    "event_time": "2026-09-19T04:00:00Z",
    "service": "easytravel-business-backend",
    "transaction_id": "B12345",
    "session_id": "S7788",
    "trace_id": "optional-trace-id",
    "data": {
      "event": "booking_confirmed",
      "transaction_value": 12400,
      "currency": "INR"
    }
  }]
}
```

Only send business values whose meaning is defined by the application. SPARE-M must not infer revenue from an ambiguous numeric field.

## RUM

Serve:

```html
<script
  src="https://YOUR-APP.vercel.app/sparem-rum.js"
  data-endpoint="https://YOUR-APP.vercel.app"
  data-key="YOUR_RUM_WRITE_TOKEN"
  data-app="easytravel-web">
</script>
```

The current browser agent collects page/navigation timing, selected user actions, JavaScript errors, fetch timing/status and session correlation. Query strings are removed before upload.

## Data safety

The ingestion layer masks common authorization/token/password/cookie patterns and limits payload size/depth. Database adapters normalize SQL by default. Browser URLs are stored without query strings.

This is still a prototype security model. Before production add tenant isolation, authenticated UI/API sessions, per-source rate limits, retention policies, PII classification, audit logs and secret rotation.
