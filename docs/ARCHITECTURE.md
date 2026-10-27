# Architecture

The current public product is a business reputation monitor. Its runtime lives under `cloud/`; the earlier Python implementation remains available for local study.

## Request path

A React client renders account onboarding and the monitoring dashboard. Vinext builds the client and server assets for Cloudflare Workers. The Worker routes `/api/monitor/*` to an explicitly authorized TypeScript service. D1 stores businesses, sources, normalized reviews, collection runs, alert preferences, notifications, and scheduler state.

Sites establishes visitor identity through Sign in with ChatGPT. The API hashes the site-scoped user ID into the resource owner. Anonymous previews instead use a random HttpOnly Secure SameSite=Lax cookie. Owner checks apply to dashboards, review filters, source actions, business archives, notification reads, and evidence endpoints.

## Collection path

Adding a business creates a primary source when its URL is supported. A bounded background task reads the source immediately. Additional profiles require user confirmation. Provider adapters normalize real entries and preserve stable external IDs, original links, ratings, dates, text, and author labels.

A source lease prevents concurrent collection. D1 batches write new or changed records, with unchanged records skipped. Per-source history records fetched, added, and updated counts and failures. Empty feeds and access restrictions remain visible. A 15-minute statistics cache reduces repeated dashboard scans and is invalidated by collection.

The GitHub workflow `monitor.yml` wakes hourly. `scripts/collect-reviews.mjs` signs timestamped, nonce-protected requests with an Ed25519 private key held in GitHub Secrets. The public site's writer verifies the signature against its runtime public key. Each request collects at most two due sources; one workflow drains at most six batches. Sources become eligible every six hours, subject to the shared allowance and provider availability. The writer supplies no visitor identity and cannot read another user's dashboard.

## Analysis path

Stored reviews feed deterministic analytics. The same publication/feed-date windows, rating definitions, and keyword rules apply to the business and its competitors. Unknown text sentiment stays unknown. Star averages exclude unrated feedback. Topic counts may overlap. The application exposes the original records behind a recurring issue or alert.

The first successful source run is a baseline. Later runs containing new reviews evaluate configured complaint thresholds. Alerts use a stable business/topic/day identifier, preventing repeated notifications for the same signal. Notifications remain in the in-app inbox; email and push are not connected.

Optional AI summarizes bounded review excerpts in a browser worker using Transformers.js and a quantized DistilBART model. It is separate from counts, sentiment shares, and alert arithmetic. No paid model provider is called.

## Boundaries

General business categories do not imply universal platform access. Google Business Profile needs approved provider access and authorized locations. Restricted review platforms remain unconnected. Search suggestions are only candidates; they are never expanded into reviews or sentiment counts.

The free deployment has explicit caps and 90-day review/run/alert retention. This is a working bounded application, not an unlimited crawler, ownership-verification service, multilingual sentiment benchmark, or production SLA.
