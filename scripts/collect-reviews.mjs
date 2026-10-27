import { sign, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { collectReviews } from "../cloud/public/review-collector.mjs";
const base =
  process.env.INSIGHTPILOT_URL ||
  "https://insightpilot-research.brightdrum2050.chatgpt.site";
export async function collectorRequest(payload) {
  const privateKey = process.env.INSIGHTPILOT_SCHEDULER_KEY;
  if (!privateKey)
    throw new Error(
      "The scheduler signing key is not configured in GitHub Secrets.",
    );
  if (
    new URL(base).origin !==
    "https://insightpilot-research.brightdrum2050.chatgpt.site"
  )
    throw new Error("Unexpected collector destination.");
  const body = JSON.stringify({
    timestamp: Date.now(),
    nonce: randomUUID(),
    ...payload,
  });
  const signature = sign(null, Buffer.from(body), privateKey).toString(
    "base64",
  );
  const response = await fetch(base + "/api/monitor/tick", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Monitor-Signature": signature,
    },
    body,
    signal: AbortSignal.timeout(55000),
    redirect: "error",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `Collector returned HTTP ${response.status}: ${result.detail || "Unexpected response"}`,
    );
  return result;
}
export async function collectBatches(rounds = 6) {
  let checked = 0;
  for (let batch = 0; batch < rounds; batch++) {
    const claim = await collectorRequest({ action: "claim" });
    const results = await Promise.all(
      (claim.jobs || []).map(async (job) => {
        if (!["appstore", "steam"].includes(job.kind))
          return await collectorRequest({
            action: "edge",
            source_id: job.id,
            lease: job.lease,
          });
        const host = new URL(job.url).hostname;
        if (
          (job.kind === "appstore" && host !== "itunes.apple.com") ||
          (job.kind === "steam" && host !== "store.steampowered.com")
        )
          throw new Error("Unexpected public provider host.");
        let items = [],
          error = "";
        try {
          items = await collectReviews(job);
        } catch (e) {
          error = e.message;
        }
        return await collectorRequest({
          action: "complete",
          source_id: job.id,
          lease: job.lease,
          items,
          error,
        });
      }),
    );
    checked += results.length;
    const failures = results.filter((r) => r.state === "error").length;
    console.log(
      `Batch ${batch + 1}: checked ${results.length} sources; ${failures} source errors; ${claim.remaining_due || 0} still due.`,
    );
    if (!claim.remaining_due) break;
  }
  return { checked };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await collectBatches();
