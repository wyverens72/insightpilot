# InsightPilot

**A review monitoring workspace for business owners and managers.**

[Open InsightPilot](https://insightpilot-research.brightdrum2050.chatgpt.site)

InsightPilot keeps customer feedback, recurring complaints, weekly changes, and competitor context in one account workspace. Connect the exact review profiles for a business, let the collector check supported sources, and inspect the reviews behind each signal.

## The workflow

1. Create a workspace with Sign in with ChatGPT, or try a separate browser preview.
2. Add the business name, website, category, and location. The same workspace supports shops, cafés, salons, services, software, games, and other businesses.
3. Connect and confirm its review profiles. The primary website is checked automatically; public profile search can help find additional sources.
4. Follow weekly review activity, star ratings, recurring complaint topics, and original source links.
5. Add up to three comparable businesses in the same category. Compare the same time windows and topic definitions, with source differences visible.
6. Set a complaint-volume threshold. Later collection runs save matching notifications in the alert inbox.

No review spreadsheet or paid AI key is required.

## What works today

- Account-owned workspaces using Sites-managed identity; separate anonymous browser previews.
- Automatic collection from public App Store RSS, Steam's current reviews Web API, individual Schema.org reviews on accessible pages, and RSS/Atom feedback feeds.
- Deduplication by source record, updates to changed reviews, persisted collection runs, source health, pause/resume, and reversible business archiving.
- Last-seven-day versus previous-seven-day comparisons, a fourteen-day activity chart, rated-only averages, classified-sample sentiment shares, and recurring complaint topics with supporting evidence.
- Business and competitor dashboards, profile and competitor discovery suggestions requiring identity confirmation, review text/topic/source filters, pagination, and Markdown reports.
- In-app complaint spike alerts with adjustable thresholds, evidence, read state, and daily deduplication.
- An unattended collector through free GitHub Actions. Sources become eligible every six hours; an hourly task processes a bounded queue. GitHub scheduling and shared capacity can delay a check.
- Optional free on-device summaries of selected review excerpts. The model does not compute the statistics.

## Coverage is explicit

This is not an all-platform review firehose. A business category is unrestricted; a source's access rules still apply.

| Source | Collection | Important limit |
| --- | --- | --- |
| Apple App Store | Public customer review RSS | Latest 50 written reviews for one storefront country; availability and dates may reflect edits |
| Steam | Current `IUserReviewsService/GetAppReviews/v1` API | Latest 100 English reviews; recommendations are not star ratings |
| Public review pages | Individual Schema.org Review JSON-LD | Only exposed text, subject to access policies and robots.txt; testimonials may be curated |
| RSS / Atom | Published feedback entries | Unrated entries are mentions, not rated customer reviews |
| Google Business Profile | Not connected | Requires approved API access and location-owner authorization |
| Trustpilot, Yelp, Facebook, Google Play, other restricted platforms | Not connected | Requires a permitted provider integration; no verification or access controls are bypassed |

Search suggestions are not verified business identities and are not counted as reviews. Empty or restricted sources show their status rather than sample data. Averages and trends describe the collected sample, not all customers, all locations, or market share. Businesses with different source types or countries should not be treated as a direct ranking.

## Accounts, history, and notifications

Sign in with ChatGPT supplies the account identity. API reads and writes authorize each resource against its workspace owner. Browser previews use an isolated secure cookie; signing in opens the account workspace without silently merging preview data. Adding a business does not verify legal ownership of it.

The collector runs independently of an open browser or development laptop. Ed25519 signatures authorize its bounded write endpoint. The private signing key stays in GitHub Secrets; the site holds only the public verification key. Timestamps and single-use nonces prevent replay.

A first successful source collection establishes a baseline. Subsequent checks with new entries evaluate complaint thresholds against the preceding week. Alerts appear inside the application. Email and push delivery are not connected. Reviews, collection history, and alerts have a 90-day retention limit.

## Analysis and AI

Star ratings take priority for sentiment. Unrated text uses visible, simple keyword rules; unrecognized text stays unknown. Topics can overlap. Undated feedback is retained but excluded from weekly comparisons. Apple RSS dates may be last-update dates. Low sample sizes, truncated feeds, edited reviews, and source selection affect results.

Optional DistilBART summaries run on the user's device through Transformers.js. The first use downloads several hundred MB and can take minutes. Generated text can omit context or repeat itself; original reviews remain available. No OpenAI key or paid model request is used.

## Develop

```bash
cd cloud
npm ci
npm test
npx tsc --noEmit
npm run build
npm start
```

The deployed edition uses React, TypeScript, Vinext, Cloudflare Workers, and a persistent SQLite-compatible D1 database. [Cloud documentation](cloud/README.md) covers the runtime and scheduler. [Architecture](docs/ARCHITECTURE.md), [verification](docs/VERIFICATION.md), and [interview walkthrough](docs/INTERVIEW.md) describe the implementation and its limits.

The original React/FastAPI/SQLite project remains under `frontend/` and `backend/` for local development and comparison. It is not the production API. See the [original local guide](docs/LOCAL_FASTAPI.md).

## Free capacity

One main business and three competitors per workspace; three sources and 5,000 saved reviews per business. Shared deployment limits are 60 active businesses, 40,000 review records, and 160 source checks per UTC day. These limits protect the free public edition and are shown honestly; availability is subject to hosting and upstream platforms.
