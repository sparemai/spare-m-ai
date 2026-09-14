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
