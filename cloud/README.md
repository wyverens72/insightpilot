# InsightPilot — cloud application

Business reputation monitoring with account workspaces, source collection, weekly comparisons, recurring complaint topics, competitors, and in-app alerts.

## Run locally

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
npm start
```

The Worker uses persistent D1 storage. For a new local database, apply the SQL files under `drizzle/` in filename order with Wrangler D1 execute against the generated `dist/server/wrangler.json` configuration. Hosted Sites publication applies Drizzle migrations; do not edit applied files.

## Account boundary

Sign in with ChatGPT uses Sites-managed identity. The edge platform injects the site-scoped authenticated user ID; the API hashes it before storing workspace ownership. Every business, review, source, alert, and history read checks that owner. A random HttpOnly Secure SameSite=Lax cookie provides a separate browser preview. Signing in opens the account workspace; browser-preview data is not silently merged. Adding a business does not verify ownership of it.

## Data sources

- App Store: public Apple RSS, latest 50 written reviews for a specific storefront country. Availability and historical coverage are not guaranteed.
- Steam: `IUserReviewsService/GetAppReviews/v1`, latest 100 English reviews, using the Recent enum and all purchase types. Recommendations are not converted into five-star ratings.
- Public review pages: individual Schema.org Review records in JSON-LD, subject to robots.txt and access restrictions. Aggregate rating counts are never expanded into invented reviews.
- RSS/Atom: published feedback entries. Unrated mentions do not contribute to star averages.

Google Business Profile requires approved API access and authorized locations. Trustpilot, Yelp, Facebook, Google Play, and similar restricted platforms are not connected. Their content is not bypassed or inferred from search snippets. Source discovery provides candidate links for the user to verify; it does not guarantee identity or import articles as customer reviews.

## Collection and history

Sources become eligible every six hours. A free GitHub Actions workflow wakes hourly and drains up to six bounded batches of two sources; timing can be delayed by GitHub or shared capacity. Manual checks have a 15-minute cooldown. A lease prevents overlapping collection. Stable source review IDs deduplicate entries; changed text or ratings update existing records. Review upserts use D1 batches to stay within free invocation limits.

The first successful run establishes a baseline. Subsequent runs with newly collected reviews evaluate alert thresholds. Collection outcomes and errors remain visible even if a source becomes unavailable. Pausing a source or archiving a business stops future checks. Archiving can be undone.

The scheduler signs short-lived timestamped requests with Ed25519. Its private key lives only in GitHub Secrets as `INSIGHTPILOT_SCHEDULER_KEY`; Sites stores only the public SPKI verification key in `MONITOR_CRON_PUBLIC_KEY`. Signed requests expire after five minutes and nonces prevent replay. The scheduler can claim a bounded list of due source URLs and submit results for its expiring leases. It has no visitor identity and cannot read account dashboards. App Store and Steam are read directly by the GitHub runner from fixed public provider hosts; public pages and RSS are read by the edge Worker. Every new connection waits for the next hourly collector run.

## Analytics

The last seven days and preceding seven days use publication timestamps and rolling UTC windows. Undated and future entries are excluded. Averages use available star ratings only; sentiment shares use classified entries, with the denominator shown. Topics and unrated text sentiment use explicit keyword rules, not a claim of full language understanding. Rating-derived sentiment takes priority; unknown text is retained as unknown. One review may mention several topics.

Topic patterns link to supporting original reviews. Complaint alerts require both a minimum negative count and a multiplier over the prior week, with a floor of one for an empty baseline. One alert per business/topic/UTC day is saved in the notification inbox. Email and push delivery are not connected.

Optional DistilBART summaries run in a browser worker through Transformers.js. The first use downloads several hundred MB from Hugging Face/CDN. Summaries use bounded excerpts from up to eight reviews on the current page and can omit context; statistics never depend on generated text. There is no paid AI API.

## Free limits

One main business and three competitors per workspace, three sources per business, 5,000 reviews per business, 40,000 across the deployment, 60 active businesses across the deployment, and 160 source checks per UTC day. Free deployment capacity is shared; these are portfolio-scale bounds, not an unlimited service promise. Reviews, collection history, and alerts are retained for up to 90 days by the collector. First-seen timestamps remain separate from publication timestamps.

## Tests

`npm test` runs both the retained research suite and the monitoring suite against fresh SQLite databases and source fixtures. It covers ownership, account continuity, incremental ingestion, deduplication, updates, weekly arithmetic, alert evidence, signed scheduler access/replay, pause/archive behavior, source failures, caps, and parser safety.

New connections and manual refreshes are queued for the next hourly cloud task rather than promising an immediate result. The direct provider collector is restricted to the fixed Apple and Steam domains; arbitrary user-submitted domains stay on the edge fetch path and are not fetched from the GitHub runner.
