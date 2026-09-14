# Security and privacy — lab design

- All transport to Vercel should use HTTPS.
- Ingest routes require `x-sparem-key`.
- The cloud OTLP decoder stores only an allow-list of span/resource attributes.
- Full URLs, request/response bodies, cookies, authorization headers and raw SQL statements are intentionally not stored by v0.5.
- `db.query.summary` may be retained when emitted; raw `db.statement` is not allow-listed.
- The UI does not expose the ingest key.
- The included shared-key authentication is appropriate for a lab. For production, replace it with per-agent credentials/rotation and stronger tenant isolation.
