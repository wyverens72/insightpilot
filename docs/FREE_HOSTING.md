# Free hosting and collection

The public application is hosted through Sites with Cloudflare Workers and a persistent D1 database. It does not proxy to a laptop.

The public GitHub repository runs an hourly collection workflow on standard hosted Linux runners. Sources are eligible every six hours; each run drains up to six batches of two sources. Actual timing can vary with GitHub scheduling, source failures, and the shared allowance. The most recent collector heartbeat appears in the dashboard footer.

A GitHub secret named `INSIGHTPILOT_SCHEDULER_KEY` holds the Ed25519 private key. `MONITOR_CRON_PUBLIC_KEY` in the Sites runtime contains only the public SPKI key. No private key is stored in source, browser code, workflow text, or the site runtime. Requests expire after five minutes and use single-use nonces.

`workflow_dispatch` permits an immediate operational check. An HTTP 200 response alone is not proof of reviews collected: inspect source history for fetched/new/updated counts and errors. The collector does not have account-dashboard access.

Limits are one primary business and three competitors per workspace, three sources per business, 5,000 reviews per business, 40,000 reviews and 60 active businesses across the deployment, and 160 source checks per UTC day. The collector applies 90-day review, collection-history, and alert retention. Free hosting and provider availability are not an SLA.

AI is optional and runs in the browser after downloading model assets. No OpenAI key, paid API, subscription, custom domain, or hosting upgrade is needed for this edition.
