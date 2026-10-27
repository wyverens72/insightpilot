# Free public hosting

The public edition uses Sites, Cloudflare Workers, and a persistent D1 database. Its source lives in `cloud/`. The original local FastAPI version remains in `backend/` and `frontend/` for development and architecture comparison.

No paid OpenAI API key was created. The public edition rejects key configuration and runs its optional AI model on the visitor's device with Transformers.js. Search and the extractive digest work without a model download.

The browser downloads several hundred MB on first AI use. Model execution depends on available memory and browser support. Browser workspace records are scoped by a random secure cookie, stored server-side, and retained for up to 30 days. Clearing cookies starts a new workspace.

Free-use boundaries are six searches per browser per UTC day, forty across the deployment, 2,000 imported reviews per workspace, a shared bounded storage budget, and the hosting platform's availability and usage limits. The app does not buy additional capacity. When limits are reached, it reports that capacity is unavailable.

Discovery is processed in bounded database-backed steps while the research page is open. Reopening a saved research resumes pending steps. No always-on laptop or Python process is required for the hosted site.

## Develop the cloud edition

```bash
cd cloud
npm ci
npm test
npx tsc --noEmit
npm run build
```

Sites provisioning and publication use `.openai/hosting.json`, the generated D1 migrations, and the maintained publishing helpers. No credentials belong in Git.
