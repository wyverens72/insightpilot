# Verification record

## Business monitoring edition — October 27, 2026

The cloud suite has 17 passing tests: ten retained research checks and seven business-monitoring checks. TypeScript and the Worker production build pass.

Monitoring checks use fresh SQLite databases with every Drizzle migration and deterministic provider responses. They verify:

- Account workspaces remain stable across cookie changes and isolate every business, source, review, and alert from other owners.
- Incremental collection adds new entries, updates changed entries, avoids duplicates, keeps collection history, and creates source-linked complaint alerts only after baseline.
- Weekly periods, undated feedback, unknown sentiment, rated-only averages, classified denominators, and multi-topic counts use consistent definitions.
- Provider parsers accept individual review records and never expand aggregate ratings into invented reviews.
- The scheduled writer rejects missing/invalid authorization, verifies Ed25519 signatures, rejects replay, respects pause/archive state, and records a cloud heartbeat.
- Restricted/empty sources remain empty with explicit status.
- Category consistency, source identity confirmation, archive restoration, and free workspace caps are enforced.

A real local browser check connected the Todoist US App Store feed, collected 50 actual written reviews, displayed weekly activity and source health, and rendered original review text with rating, date, author, and source links. This is a dated availability snapshot, not an all-platform coverage claim.

The earlier optional on-device DistilBART inference was verified with real browser execution on both preview and the public site. Paid model requests are not used.

## Original FastAPI edition

The retained local implementation previously passed 29 Python tests, eight React interaction tests, and two Chromium workflows. Its local build, TypeScript checks, Python lint/formatting, and mobile overflow checks passed. These checks describe the original implementation, not an assertion that Python serves the public application.

GitHub CI results are separate from local results. Live provider availability is checked manually; deterministic tests do not guarantee an upstream feed will always respond.
