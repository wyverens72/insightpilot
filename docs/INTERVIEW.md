# Interview walkthrough

InsightPilot helps business owners track customer feedback over time rather than request a one-off summary. Its value is persistent collection, deduplication, visible source health, comparable weekly measures, and evidence-linked complaint alerts.

## Demonstration

1. Sign in or open a browser preview. Explain the account boundary.
2. Add a business and its exact review profile. A public App Store profile is a useful live example because the feed requires no paid key.
3. Open Sources. Show the latest collection result and collection history.
4. Open Overview. Explain the sample size, seven-day comparison, rating denominator, and gaps in historical coverage.
5. Open Review inbox. Filter negative feedback or a recurring topic and follow its original source.
6. Add a same-category competitor and compare the same definitions. Explain why different sources or storefront countries are a caveat.
7. Open Alerts. Show threshold controls and explain baseline, deduplication, and linked evidence. Do not invent a live spike just to populate the screen.
8. Show the scheduled collector workflow and its actual verified run. It works when the laptop and website are closed.

## Technical choices

The public edition uses React and TypeScript, an edge API on Cloudflare Workers, and D1 persistence. Sites manages account sign-in. A separate GitHub job signs limited collection requests with Ed25519. Bounded D1 batches and explicit caps keep it appropriate for a free deployment.

The original implementation used React, FastAPI, and local SQLite. The Python version remains in the repository, while the deployed service was ported to TypeScript to avoid a running Python server on a paid host.

## Product judgment

The initial URL-to-summary idea duplicated a common chat task. The revised product targets ongoing operational work: a manager should return to an updated evidence set, see changes, and investigate a complaint without reconstructing last week's context.

Source access is the main product constraint. The interface supports different business categories, but Google, Trustpilot, Yelp, and other restricted platforms need authorized integrations. This version does not claim to collect all internet reviews. Its statistics are based on individual collected records and reveal their denominator.

Potential next steps are approved business-platform integrations, team membership, owner authorization, email/push delivery, and language-specific topic validation. These are not presented as already shipped.
