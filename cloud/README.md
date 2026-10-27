# InsightPilot · free public edition

Research a product from one URL, check the evidence, and summarize selected sources with an open-source model running in your browser. No paid API key, subscription, or payment form is used by this edition.

## Use it

1. Paste a public product URL into **Web research**. Add the exact product name if the domain is ambiguous.
2. Choose **Find sources**. The app searches public web and news feeds, then tries to read up to eight results alongside the product website.
3. Confirm the identity and choose relevant sources. Company claims, third-party material, read pages, and search excerpts are labeled separately.
4. Choose the extractive source digest, or enable **Use free on-device AI** and run model-generated summaries.
5. Check the linked evidence, export Markdown, and reopen research from the recent list.

The AI model is [Xenova/distilbart-cnn-6-6](https://huggingface.co/Xenova/distilbart-cnn-6-6), distributed under Apache 2.0 and run with [Transformers.js](https://huggingface.co/docs/transformers.js/). The quantized model and runtime download directly to the visitor's device on first use. This is several hundred MB and may take a few minutes. The browser can cache model assets. Keep the page open during inference; a cancel button stops the worker. A current desktop browser with sufficient memory is recommended.

Summaries are English and can omit context or hallucinate. Each source is summarized separately from an excerpt of up to 3,200 characters. Citations refer to the underlying selected pages; the app does not claim that a model has independently verified them. A web page is not automatically an individual customer review. No representative sentiment percentage or customer consensus is inferred from articles.

## Review analytics

**Overview**, **Review explorer**, and **Insight brief** retain the CSV workflow: UTF-8 imports, row validation, duplicate detection, rating-based sentiment with a keyword fallback, topic tags, filtered metrics, pagination, and local brief export. Try the 36 fictional sample reviews without uploading a file.

The hosted workspace stores up to 2,000 reviews. Sentiment is a transparent rule, not an AI prediction. An optional rating maps 4–5 to positive, 3 to neutral, and 1–2 to negative. Topics use keyword sets and can overlap.

## Architecture

The original desktop implementation uses React, TypeScript, FastAPI, and SQLite. This deployed edition preserves the React interface and adapts the API to TypeScript in Cloudflare Workers, with SQLite-compatible Cloudflare D1 storage. This avoids an always-running Python process and an ephemeral database on a free server.

Vinext provides the React application runtime and maintained Sites build integration. The browser AI worker is served as a static module. Its model runtime loads only after the visitor requests AI summaries, keeping large model binaries out of the server bundle.

Research is stored between bounded processing steps. Each status poll can resume the next step; a database lease prevents duplicate processing across requests. Discovery pauses when nobody is polling and resumes when the research is reopened. Each step reads at most two sources, within the lifetime of a short Worker request.

## Workspace privacy and retention

Each browser receives a cryptographically random, HTTP-only, secure session cookie. Its hash scopes database reads and writes; research and imports are not shared across visitors. This is a browser workspace, not a cross-device account. Clearing cookies starts a new workspace.

Research and imported reviews are retained for up to 30 days. Expired records are cleaned when a new search is started. There is no claim of a production compliance or backup service.

## Free-use limits

- Six searches per browser per UTC day.
- Forty searches per day across this deployment.
- Up to 2,000 reviews per browser workspace; CSV uploads up to 2 MB and 5,000 rows.
- A bounded shared storage budget; writes stop when capacity is reached.
- At most 750 KB per fetched page and 18,000 extracted characters per source.

Public search feeds are best effort and may be unavailable, stale, or incomplete. Some websites block automated access or require JavaScript, login, or payment; those remain excerpts or unavailable sources. The reader honors the initial site's robots policy and does not bypass restrictions. Literal IP URLs and private host forms are rejected, redirects are revalidated, and outbound traffic uses the hosting platform's fetch boundary.

Hosting remains subject to the Sites platform's availability and resource limits. No paid OpenAI key or hosting upgrade was created. The app does not purchase additional capacity automatically.

## Development

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

The build generates the browser AI worker before creating the deployable artifact. Use `npm run dev` for the maintained local Vinext preview, or preview a built deployment with `npm start -- --port 8787`.

The D1 schema is in `db/schema.ts`; generated migrations are in `drizzle/`. Apply pending local migrations using the commands in the Sites starter documentation. Sites applies hosted migrations at publication.

The cloud API tests use a fresh SQLite database and cover workspace isolation, CSV validation, duplicate imports, sentiment metrics, URL validation, source parsing, resumable discovery, source selection, citations, browser-generated report persistence, and rejection of paid-key configuration. Live retrieval and browser model execution are verified separately; deterministic tests do not download models or spend API credits.
