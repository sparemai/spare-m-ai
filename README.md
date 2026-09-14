# SPARE-M-AI

SPARE-M-AI is an experimental journey-first observability and intelligence lab.

This repository contains:

- `cloud/` — Vercel Next.js UI, ingestion APIs, analytics, journey model, trace drill-down, and optional AI analysis.
- `windows/` — lightweight Windows telemetry collector and EasyTravel Java tracing setup.
- `src/collector/` — Windows collector source.
- `docs/` — architecture, privacy/security, and semantic journey notes.

The Windows side is intentionally collection-only. Processing, storage, analysis, UI, and optional LLM reasoning run in the cloud.

See `README-FIRST.md` for setup instructions.