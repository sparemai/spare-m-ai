# SPARE-M Integrations

All server-to-server integrations use:

```
x-sparem-integration-key: <SPAREM_INTEGRATION_KEY>
```

Do not expose `SPAREM_CONTROL_KEY` or the Windows collector ingest key to third-party systems.

## Trusted business events

```powershell
.\business\send-business-event.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IntegrationKey "YOUR_INTEGRATION_KEY" `
  -Event "booking_confirmed" `
  -Service "easytravel-business-backend" `
  -TransactionId "B12345" `
  -SessionId "S7788" `
  -Value 12400 `
  -Currency "INR"
```

This is how SPARE-M gets exact booking/session/value context. It should not infer those values from unrelated telemetry.

## Kubernetes

Requires `kubectl` and an already authenticated context.

```powershell
.\kubernetes\export-kubernetes.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IntegrationKey "YOUR_INTEGRATION_KEY"
```

Collects:
- nodes
- pods
- restart/readiness context
- Kubernetes events
- node/pod metrics when metrics-server is available

## PostgreSQL

Requires `psql` and a read-only database account.

```powershell
.\database\export-postgres.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IntegrationKey "YOUR_INTEGRATION_KEY" `
  -Connection "postgresql://READONLY_USER@host/database" `
  -Service "booking-db" `
  -IncludeSchema `
  -IncludeIndexes `
  -IncludeQueryStats
```

Optional read-only planning:

```powershell
-ExplainQuery "SELECT ... "
```

The adapter uses `EXPLAIN ... ANALYZE FALSE`, so it does not intentionally execute the query. SQL is normalized before upload.

## Azure

Uses the currently authenticated Azure CLI session.

```powershell
.\cloud\export-azure-metrics.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IntegrationKey "YOUR_INTEGRATION_KEY" `
  -ResourceId "/subscriptions/.../resourceGroups/.../providers/..."
```

## AWS

Uses the currently configured AWS CLI role/profile.

```powershell
.\cloud\export-aws-cloudwatch.ps1 `
  -CloudUrl "https://YOUR-APP.vercel.app" `
  -IntegrationKey "YOUR_INTEGRATION_KEY" `
  -Namespace "AWS/EC2" `
  -MetricName "CPUUtilization" `
  -DimensionsJson '[{"Name":"InstanceId","Value":"i-..."}]'
```

## GitHub changes

Configure a GitHub webhook to:

```
https://YOUR-APP.vercel.app/api/integrations/github
```

Events currently normalized:
- push/commits
- release
- deployment
- deployment_status

Set the same HMAC secret in GitHub and `GITHUB_WEBHOOK_SECRET`.

## Feature flags / configuration systems

POST to:

```
/api/integrations/feature-flags
```

Example:

```json
{
  "service": "booking-backend",
  "flag_key": "new-pricing-engine",
  "environment": "production",
  "old_value": false,
  "new_value": true,
  "actor": "deployment-pipeline",
  "source": "feature-flag-platform"
}
```

## Generic integration events

For another system, use:

```
POST /api/integrations/events
```

Supported external types:
- `change`
- `business`
- `database`
- `kubernetes`
- `cloud`
- `profile`

SPARE-M Coverage Intelligence marks a feature live only after real events are observed.
