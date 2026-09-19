CREATE TABLE IF NOT EXISTS host_samples (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  collector_version TEXT,
  cpu DOUBLE PRECISION NOT NULL,
  memory DOUBLE PRECISION NOT NULL,
  uptime_seconds BIGINT,
  disks JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS host_samples_agent_time ON host_samples(agent_id,collected_at DESC);

CREATE TABLE IF NOT EXISTS spans (
  id BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  service TEXT NOT NULL,
  operation TEXT NOT NULL,
  kind INT NOT NULL DEFAULT 0,
  start_time TIMESTAMPTZ NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL,
  status_code INT NOT NULL DEFAULT 0,
  status_message TEXT,
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
  resource JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS spans_agent_time ON spans(agent_id,start_time DESC);
CREATE INDEX IF NOT EXISTS spans_trace ON spans(trace_id);
CREATE INDEX IF NOT EXISTS spans_service_time ON spans(service,start_time DESC);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  response JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_analysis_cache ON ai_analysis(agent_id,fingerprint,created_at DESC);


-- Extended normalized telemetry. High-volume production deployments can move
-- these event families to a columnar/time-series store without changing the APIs.
CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_time TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  hostname TEXT,
  service TEXT,
  entity_id TEXT,
  trace_id TEXT,
  span_id TEXT,
  session_id TEXT,
  transaction_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS telemetry_events_type_time ON telemetry_events(type,event_time DESC);
CREATE INDEX IF NOT EXISTS telemetry_events_agent_time ON telemetry_events(agent_id,event_time DESC);
CREATE INDEX IF NOT EXISTS telemetry_events_service_time ON telemetry_events(service,event_time DESC);
CREATE INDEX IF NOT EXISTS telemetry_events_trace ON telemetry_events(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telemetry_events_transaction ON telemetry_events(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS collector_commands (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB
);
CREATE INDEX IF NOT EXISTS collector_commands_agent_status ON collector_commands(agent_id,status,created_at);
