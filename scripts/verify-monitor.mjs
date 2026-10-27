import { collectBatches } from "./collect-reviews.mjs";
const base =
  "https://insightpilot-research.brightdrum2050.chatgpt.site/api/monitor";
let cookie = "";
const cookieJar = new Map();
async function call(
  path,
  { method = "GET", body, status = 200, useCookie = true } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(useCookie && cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  if (useCookie) {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0];
      const divider = pair.indexOf("=");
      if (divider > 0)
        cookieJar.set(pair.slice(0, divider), pair.slice(divider + 1));
    }
    cookie = [...cookieJar].map(([key, value]) => key + "=" + value).join("; ");
  }
  const data = await response.json();
  if (response.status !== status)
    throw new Error(
      `${path}: expected HTTP ${status}, got ${response.status}: ${data.detail || "Unexpected response"}`,
    );
  return data;
}
const ids = [];
try {
  await call("/session");
  if (!cookieJar.has("ip_monitor"))
    throw new Error(
      "The hosted API did not establish the browser-preview cookie.",
    );
  for (const profile of [
    {
      name: "Automated App Store verification",
      url: "https://apps.apple.com/us/app/todoist-to-do-list-planner/id572688855",
      kind: "appstore",
    },
    {
      name: "Automated Steam verification",
      url: "https://store.steampowered.com/app/730/",
      kind: "steam",
    },
  ]) {
    const business = await call("/businesses", {
      method: "POST",
      status: 201,
      body: {
        name: profile.name,
        website: profile.url,
        category: "Software & apps",
        location: "Automated verification workspace",
      },
    });
    ids.push(business.id);
    await collectBatches(6);
    let item;
    for (let attempt = 0; attempt < 25; attempt++) {
      const data = await call("/dashboard");
      item = data.businesses.find((b) => b.id === business.id);
      if (
        item.sources[0].state !== "pending" &&
        item.sources[0].lease_until < Date.now()
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const source = item.sources[0];
    if (source.state !== "ready" || item.stats.all.total < 1)
      throw new Error(`${profile.kind} collection failed: ${source.note}`);
    const feed = await call(`/businesses/${business.id}/reviews`);
    if (feed.total !== item.stats.all.total || !feed.items.length)
      throw new Error("Inbox and analytics disagree.");
    const history = await call(`/sources/${source.id}`);
    if (!history.runs.length || history.runs[0].added < 1)
      throw new Error("Collection history was not persisted.");
    await call(`/businesses/${business.id}/reviews`, {
      status: 404,
      useCookie: false,
    });
    if (profile.kind === "steam" && item.stats.all.average !== null)
      throw new Error(
        "Steam recommendations must not be turned into star ratings.",
      );
    console.log(
      `${profile.kind}: ${feed.total} real reviews stored; ${feed.items.length} entries on the first page; source history and workspace isolation verified.`,
    );
  }
  const dashboard = await call("/dashboard");
  if (dashboard.businesses.length !== 2)
    throw new Error("Business and competitor were not persisted together.");
  console.log(
    "Production collection, review evidence, common comparison metrics, and isolated workspaces passed.",
  );
} finally {
  for (const id of ids) {
    try {
      await call(`/businesses/${id}`, { method: "DELETE" });
    } catch (error) {
      console.error(
        "Temporary monitor archive could not be confirmed: " + error.message,
      );
    }
  }
  console.log(
    "Temporary verification monitors archived. No user browser or account workspace was modified.",
  );
}
