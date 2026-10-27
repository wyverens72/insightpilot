# Verification record

Verified locally on October 27, 2026, on macOS with Python 3.9.6 and Node.js 25.9.0.

| Check | Result |
| --- | --- |
| Backend API and service tests | 29 passed |
| React interaction tests | 8 passed |
| Chromium workflows | 2 passed |
| TypeScript and production build | Passed |
| Python lint and formatting | Passed |
| Desktop and mobile layout | Inspected; overflow checks passed |

## URL research

The research API tests cover discovery, official versus third-party classification, readable pages versus excerpts, selected-source analysis, history, URL validation, private-network DNS answers, redirects to private hosts, robots restrictions, AI search payloads, citation validation, and provider fallback. Test keys and HTTP responses are synthetic; no paid provider request is made.

The research browser test uses deterministic API fixtures to exercise the URL form, source selection, access labels, local report rendering, clickable citations, Markdown download, and mobile overflow. It does not claim to test live search availability.

A separate manual check used the running application and real public sources for Todoist. It discovered nine sources, read three pages, labeled the remaining sources as search excerpts, and generated a local digest from the three selected pages. This result is a snapshot, not a guarantee of coverage. One older publication appeared in the results, which is why the product explicitly asks users to verify source dates.

Paid OpenAI synthesis and hosted web search remain covered by mocked contract tests, not a real paid request. The UI makes the key requirement and local fallback visible.

## CSV analytics

The CSV browser workflow uses the built frontend and a real FastAPI server with an isolated SQLite database. It covers sample import, search, scoped local briefs, Markdown download, partial CSV validation, persistence after reload, and a 390-pixel mobile viewport.

The React suite also checks that a late review-brief response is discarded if the feedback scope changes while generation is in progress.

Screenshots show the current dark interface. The GitHub Actions workflow repeats the automated checks on Linux; its remote result is separate from this local record.


## Free public edition

The additional cloud API suite has nine passing tests. TypeScript checks and the deployment build pass. Cloud tests use fresh SQLite databases and mocked public search responses; they do not spend API credits.

A real browser test on the cloud-runtime preview searched for Todoist, read public pages, ran the quantized DistilBART model on a selected source, and persisted a source-linked on-device summary. No OpenAI key or paid model request was used. The same search and genuine browser inference also passed on the public production URL. Native Sites publication confirmed the live URL. See [the public AI result](public-ai.png).

The public edition is implemented under `cloud/`; the original 39-check record above describes the local FastAPI implementation.
