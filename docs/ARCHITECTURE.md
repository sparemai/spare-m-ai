# SPARE-M-AI v0.5 Architecture

```text
WINDOWS                                      VERCEL
-------                                      ------
Native host collector --------------------> /api/ingest/host
  CPU/RAM/disk/uptime                         |
                                              v
EasyTravel Java tiers                       Neon/Postgres
  OpenTelemetry javaagent                     |
  5% sampled traces ----------------------> /api/otlp/v1/traces
                                              |
                                              v
                                      Cloud processing only
                                      - protobuf decoding
                                      - safe filtering
                                      - service graph
                                      - journey inference
                                      - baselines
                                      - evidence
                                      - trace waterfall
                                      - optional LLM
                                              |
                                              v
                                        SPARE-M-AI UI
                         Journey -> Technical -> Infrastructure -> Fix
```

The Windows machine does not perform health scoring, correlation, anomaly analysis, journey logic, database writes, UI rendering or LLM calls.
