# InsightPilot

**Product research from a URL, with evidence you can inspect.**

[Open the public application](https://insightpilot-research.brightdrum2050.chatgpt.site)

InsightPilot finds public material about a product, distinguishes company claims from third-party sources, and creates source-linked digests or free on-device AI summaries. It also imports review CSVs for a sentiment dashboard and review explorer.

## Try it

1. Open **Web research**, paste a product URL, and optionally enter its exact name.
2. Choose **Find sources** and inspect the available pages. Read pages and search excerpts are labeled separately.
3. Select relevant evidence and build a source digest, or enable **Use free on-device AI**.
4. Check citations, export Markdown, and reopen saved research from history.

For structured review analytics, open **Overview** and load the 36 fictional sample reviews or import your own CSV. The imported review dataset is separate from web research.

## Free AI and hosting

The public edition does not use paid API calls and does not ask for an OpenAI key. Optional AI runs a quantized DistilBART model in a browser worker using Transformers.js. The first run downloads several hundred MB directly to the device and can take a few minutes. Your browser can cache model assets.

The model creates English summaries of individual selected sources. It can omit context, repeat itself, or hallucinate. Check the linked evidence and publication dates. Web pages do not form a representative review dataset, so the app does not invent sentiment percentages or customer consensus.

The site is hosted through Sites with Cloudflare Workers and a persistent D1 database. It stays available when the development laptop is off. Free-use limits are six searches per browser per UTC day, forty across the deployment, 2,000 imported reviews per workspace, and bounded storage. Hosting remains subject to platform availability and resource limits; no paid upgrade or API key was created.

A random secure cookie identifies a browser workspace. Imports and research are isolated between visitors and retained for up to 30 days. Clearing cookies starts a new workspace.

## Project structure

| Directory | Purpose |
| --- | --- |
| `cloud/` | Deployed React/Vinext application, TypeScript edge API, D1 schema, browser AI worker, and cloud API tests |
| `frontend/` | Original React and TypeScript client for local FastAPI development |
| `backend/` | Original Python FastAPI and SQLite implementation, with isolated API tests |
| `sample-data/` | Fictional review CSV for demos |
| `docs/` | Architecture notes, hosting limits, verification, and interview walkthrough |

The original stack was React, TypeScript, FastAPI, and SQLite. To provide persistent hosting without a running paid Python server, the public edition ports the API behavior to TypeScript in Workers and uses SQLite-compatible D1. The original implementation is retained for local development and comparison; production does not proxy to the laptop.

## Develop the public edition

```bash
cd cloud
npm ci
npm test
npx tsc --noEmit
npm run build
```

See [cloud documentation](cloud/README.md) for the runtime, model, privacy, and storage details. Publication uses the Sites manifest and generated migrations in `cloud/`. The editable Sites checkout is maintained separately during development, then mirrored here without credentials, dependencies, or runtime data.

## Run the original FastAPI edition

```bash
./scripts/setup.sh
./scripts/start.sh
```

Open http://127.0.0.1:8000. Run `./scripts/test.sh` for the original backend and client checks. This local edition retains its earlier optional OpenAI integration; it is not used by the free public deployment. See [the original local guide](docs/LOCAL_FASTAPI.md).

## Verification and limits

Cloud API tests cover workspace isolation, CSV validation, repeatable sample imports, analytics, URL validation, access labels, resumable discovery, selected-source reports, citations, and rejection of paid-key configuration. Browser inference was verified with a real Todoist source, not a mocked model response.

Public search can be unavailable or incomplete. Some pages require JavaScript, login, verification, or payment and remain excerpts. Discovery advances in short persisted steps while the research page is open and resumes when reopened. This is a bounded portfolio application, not an unrestricted crawler or a production compliance service.

See [free hosting](docs/FREE_HOSTING.md), [verification](docs/VERIFICATION.md), and [interview notes](docs/INTERVIEW.md).
