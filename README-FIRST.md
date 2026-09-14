# SPARE-M-AI v0.5 — Cloud Intelligence / Windows Collection

This build implements the architecture requested:

**Windows = collection only. Vercel = everything else.**

## 1. Deploy Vercel first
Deploy the `cloud` folder, connect Postgres/Neon, run `cloud/schema.sql`, then set `DATABASE_URL` and `SPAREM_INGEST_KEY`. `OPENAI_API_KEY` is optional.

## 2. Confirm cloud
Open:
`https://YOUR-APP.vercel.app/api/health`

## 3. Send one Windows sample
From `windows`:
```powershell
.\test-collector.ps1 -CloudUrl "https://YOUR-APP.vercel.app" -IngestKey "YOUR_KEY"
```

Open the Vercel app. Infrastructure data should appear.

## 4. Start continuous collection
```powershell
.\start-collector.ps1 -CloudUrl "https://YOUR-APP.vercel.app" -IngestKey "YOUR_KEY"
```

## 5. Attach EasyTravel traces
```powershell
.\easytravel\download-otel-javaagent.ps1
.\easytravel\enable-java-tracing.ps1 -CloudUrl "https://YOUR-APP.vercel.app" -IngestKey "YOUR_KEY" -SamplingRatio 0.05
```
Restart EasyTravel and generate traffic.

## UI model
The Vercel UI is intentionally ordered:
**Business Journey -> Technical Execution -> Infrastructure -> Evidence -> AI Fix Guidance**.

## AI
No LLM is called continuously. `Quick AI` uses GPT-5.6 Luna only when clicked; `Deep investigate` uses GPT-5.6 Sol only when clicked. Identical evidence is cached for 15 minutes. OpenAI API billing is separate from a ChatGPT subscription.
