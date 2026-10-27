import { sign, randomUUID } from "node:crypto";
const privateKey = process.env.INSIGHTPILOT_SCHEDULER_KEY;
const base =
  process.env.INSIGHTPILOT_URL ||
  "https://insightpilot-research.brightdrum2050.chatgpt.site";
if (!privateKey)
  throw new Error(
    "The scheduler signing key is not configured in GitHub Secrets.",
  );
if (
  new URL(base).origin !==
  "https://insightpilot-research.brightdrum2050.chatgpt.site"
)
  throw new Error("Unexpected collector destination.");
for (let batch = 0; batch < 6; batch++) {
  const body = JSON.stringify({ timestamp: Date.now(), nonce: randomUUID() });
  const signature = sign(null, Buffer.from(body), privateKey).toString(
    "base64",
  );
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(base + "/api/monitor/tick", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Monitor-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(55000),
        redirect: "error",
      });
      if (response.ok || response.status < 500) break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  if (!response?.ok)
    throw new Error(
      `Collector returned HTTP ${response?.status ?? "unavailable"}.`,
    );
  const result = await response.json();
  const failures = (result.results || []).filter(
    (r) => r.state === "error",
  ).length;
  console.log(
    `Batch ${batch + 1}: checked ${result.checked || 0} sources; ${failures} source errors; ${result.remaining_due || 0} still due.`,
  );
  if (result.replayed || !result.remaining_due) break;
}
