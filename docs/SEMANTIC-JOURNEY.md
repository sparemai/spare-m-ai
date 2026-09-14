# Business Journey Semantics

Zero-code tracing understands technical operations, not guaranteed business meaning. v0.5 therefore supports two modes.

## Inferred proxy
The cloud classifies server spans using operation/route names such as search, login, booking, payment and confirmation. Stage volume differences are displayed as **proxy leakage**.

## Business semantic mode
For exact business flow, add attributes such as:
- `sparem.business.journey=Book Journey`
- `sparem.business.step=Payment`
- `sparem.business.outcome=success`

When these are present the UI switches to `Business semantic` mode. The collector does not interpret them; Vercel does.
