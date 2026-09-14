# SPARE-M-AI Cloud v0.5 — Vercel

This folder is the **entire intelligence/application side**. Deploy this folder to Vercel.

## What runs here
- telemetry ingestion APIs
- OTLP/protobuf trace decoding
- safe attribute filtering
- Neon/Postgres storage
- business-journey inference
- technical service/operation graph
- cloud-side host baselines
- trace waterfall API
- deterministic evidence generation
- optional OpenAI reasoning on button click
- the complete UI

## What does NOT run on Windows
No database, no health engine, no journey inference, no UI, no LLM, no trace parsing service.

## Deploy
1. Create a Vercel project using this `cloud` folder as the project root.
2. Add a Postgres database (Neon is a convenient Vercel integration) and expose `DATABASE_URL`.
3. Run `schema.sql` in that database.
4. Set environment variables:
   - `DATABASE_URL`
   - `SPAREM_INGEST_KEY` — long random value; use the same value on Windows
   - `OPENAI_API_KEY` — optional, only needed for Quick AI / Deep AI
5. Redeploy.
6. Confirm `https://YOUR-APP.vercel.app/api/health` returns `ok: true`.

## Data model
Host samples are retained in `host_samples`. Sampled spans are retained in `spans`. AI results are cached in `ai_analysis` for 15 minutes when evidence is unchanged.

## Important lab limitation
Without explicit `sparem.business.step` attributes, the Journey view is inferred from server operation names/routes. The UI labels this `Inferred proxy`; it must not be treated as true user-level conversion loss. This is deliberate.
