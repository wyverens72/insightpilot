import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  handleMonitor,
  syncSource,
  runDueSources,
} from "../work/tests/monitor-service.js";
import {
  parseApple,
  parseStructured,
  parseSteam,
  parseFeedbackFeed,
  sourceInput,
} from "../work/tests/monitor-sources.js";
import {
  signals,
  reviewStats,
  spikeCandidates,
} from "../work/tests/monitor-analysis.js";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
    );
  const db = {
    async batch(items) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const statement of items) result.push(await statement.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    prepare(sql) {
      let values = [];
      return {
        bind(...v) {
          values = v;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) || null;
        },
        async all() {
          return {
            results: sqlite.prepare(sql).all(...values),
            meta: { changes: 0 },
          };
        },
        async run() {
          const r = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(r.changes) } };
        },
      };
    },
  };
  const tasks = [];
  const keys = generateKeyPairSync("ed25519");
  const env = {
    DB: db,
    MONITOR_CRON_PUBLIC_KEY: keys.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
  };
  const ctx = {
    waitUntil(p) {
      tasks.push(p);
    },
  };
  return {
    db,
    sqlite,
    env,
    signed(payload = {}) {
      const body = {
        timestamp: Date.now(),
        nonce: crypto.randomUUID(),
        ...payload,
      };
      return {
        body,
        user: null,
        headers: {
          "x-monitor-signature": sign(
            null,
            Buffer.from(JSON.stringify(body)),
            keys.privateKey,
          ).toString("base64"),
        },
      };
    },
    async call(
      path,
      {
        body,
        method = body === undefined ? "GET" : "POST",
        user = "alice",
        cookie = "",
        headers = {},
      } = {},
    ) {
      const r = await handleMonitor(
        new Request("https://monitor.example/api/monitor" + path, {
          method,
          headers: {
            ...(user
              ? {
                  "oai-authenticated-user-id": user,
                  "oai-authenticated-user-email": user + "@example.com",
                }
              : {}),
            ...(cookie ? { cookie } : {}),
            ...headers,
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env,
        ctx,
      );
      return {
        status: r.status,
        value: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie,
      };
    },
    async flush() {
      while (tasks.length) await tasks.shift();
    },
  };
}
const published = (days) =>
  new Date(Date.now() - days * 86400000).toISOString();
const review = (id, days, body = "Customer support was rude.", score = 1) => ({
  "@type": "Review",
  "@id": "https://shop.example/reviews/" + id,
  reviewBody: body,
  author: { name: "Customer" },
  datePublished: published(days),
  reviewRating: { ratingValue: score, bestRating: 5 },
});
const originalFetch = globalThis.fetch;
function sourceMock(entries) {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt"))
      return new Response("User-agent: *\nAllow: /", {
        headers: { "content-type": "text/plain" },
      });
    return new Response(
      '<html><title>Customer reviews</title><script type="application/ld+json">' +
        JSON.stringify({ "@graph": entries() }) +
        "</script></html>",
      { headers: { "content-type": "text/html" } },
    );
  };
}
async function business(f, user = "alice", name = "Example shop") {
  const r = await f.call("/businesses", {
    user,
    body: {
      name,
      website: "https://shop.example",
      category: "Retail & e-commerce",
      location: "Vilnius",
    },
  });
  assert.equal(r.status, 201);
  await f.flush();
  const d = await f.call("/dashboard", { user });
  const b = d.value.businesses.find((b) => b.id === r.value.id);
  for (const source of b.sources) await syncSource(f.db, source.id, true);
  return r.value.id;
}
test("account workspaces survive cookie changes and protect every owned resource", async () => {
  sourceMock(() => [review("a", 1)]);
  try {
    const f = fixture();
    const id = await business(f);
    const a = await f.call("/dashboard");
    assert.equal(a.value.businesses[0].stats.all.total, 1);
    assert.equal(a.value.identity.signed_in, true);
    const otherBrowser = await f.call("/dashboard", {
      cookie: "ip_monitor=" + "a".repeat(64),
    });
    assert.equal(otherBrowser.value.businesses[0].id, id);
    assert.equal(
      (await f.call("/dashboard", { user: "bob" })).value.businesses.length,
      0,
    );
    assert.equal(
      (await f.call("/dashboard", { user: null })).value.businesses.length,
      0,
    );
    for (const action of [
      { path: `/businesses/${id}/reviews` },
      { path: `/businesses/${id}`, method: "DELETE" },
      {
        path: `/businesses/${id}/sources`,
        body: { url: "https://other.example", confirmed: true },
      },
      {
        path: `/sources/${a.value.businesses[0].sources[0].id}`,
        method: "PATCH",
        body: { enabled: false },
      },
    ])
      assert.equal(
        (await f.call(action.path, { ...action, user: "bob" })).status,
        404,
      );
    assert.equal(
      (
        await f.call("/businesses", {
          body: {
            name: "Private",
            website: "http://127.0.0.1",
            category: "Other",
          },
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await f.call("/settings", {
          method: "PATCH",
          body: { min_complaints: 1, multiplier: 2, alerts_enabled: true },
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await f.call("/settings", {
          method: "PATCH",
          body: { min_complaints: 3, multiplier: 2 },
          headers: { origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("incremental collection deduplicates, updates, keeps history and emits evidence-linked spikes after baseline", async () => {
  let entries = [review("a", 9), review("b", 2), review("c", 1)];
  sourceMock(() => entries);
  try {
    const f = fixture(),
      id = await business(f);
    let d = (await f.call("/dashboard")).value;
    const sid = d.businesses[0].sources[0].id;
    assert.equal(d.alerts.length, 0);
    assert.equal(d.businesses[0].stats.current.negative, 2);
    entries = [
      review("a", 9, "Support still rude.", 2),
      ...entries.slice(1),
      review("d", 0.9),
      review("e", 0.5),
      review("f", 0.2),
    ];
    const r = await syncSource(f.db, sid, true);
    assert.equal(r.added, 3);
    assert.equal(r.updated, 1);
    d = (await f.call("/dashboard")).value;
    assert.equal(d.businesses[0].stats.all.total, 6);
    assert.equal(d.businesses[0].stats.current.negative, 5);
    assert.equal(d.businesses[0].stats.previous.negative, 1);
    assert.ok(d.alerts.length >= 1);
    const alert = d.alerts[0];
    const evidence = await f.call(`/alerts/${alert.id}/evidence`);
    assert.ok(evidence.value.items.length >= 3);
    assert.ok(
      evidence.value.items.every((r) =>
        r.url.startsWith("https://shop.example/"),
      ),
    );
    assert.equal(
      (await f.call(`/alerts/${alert.id}/evidence`, { user: "bob" })).status,
      404,
    );
    assert.equal(
      (await f.call(`/alerts/${alert.id}/read`, { body: {} })).status,
      200,
    );
    const count = d.alerts.length;
    await syncSource(f.db, sid, true);
    d = (await f.call("/dashboard")).value;
    assert.equal(d.alerts.length, count);
    const history = await f.call(`/sources/${sid}`);
    assert.equal(history.value.runs.length, 3);
    assert.equal(
      history.value.runs.reduce((n, x) => n + x.added, 0),
      6,
    );
    const feed = await f.call(
      `/businesses/${id}/reviews?sentiment=negative&topic=Customer+support&q=rude`,
    );
    assert.equal(feed.value.total, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("same rules compare weekly periods, unknown sentiment, unrated entries and multi-topic evidence", () => {
  const now = Date.now();
  const rows = [
    {
      id: "1",
      body: "Rude support, expensive subscription",
      rating: 1,
      sentiment: "negative",
      published: published(1),
      topics: JSON.stringify(["Customer support", "Pricing & billing"]),
    },
    {
      id: "2",
      rating: 5,
      sentiment: "positive",
      published: published(10),
      topics: "[]",
    },
    {
      id: "3",
      rating: null,
      sentiment: "unknown",
      published: published(2),
      topics: "[]",
    },
    {
      id: "4",
      rating: 2,
      sentiment: "negative",
      published: null,
      topics: "[]",
    },
  ];
  const s = reviewStats(rows, now);
  assert.equal(s.current.total, 2);
  assert.equal(s.previous.total, 1);
  assert.equal(s.current.average, 1);
  assert.equal(s.current.negative_share, 100);
  assert.equal(s.current.unknown, 1);
  assert.equal(s.undated, 1);
  assert.equal(s.topics.length, 2);
  assert.equal(s.trend.length, 14);
  assert.equal(spikeCandidates(rows, 3, 2, now).length, 0);
  assert.equal(signals("Great", 1).sentiment, "negative");
  assert.equal(signals("文字だけです", null).sentiment, "unknown");
  assert.equal(signals("Amazing", null, "negative").sentiment, "negative");
});
test("adapters accept explicit reviews only, preserve source links, and do not manufacture ratings or dates", () => {
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify([
      { "@type": "AggregateRating", ratingValue: 4.8, reviewCount: 900 },
      review("a", 1),
      {
        "@type": "Review",
        reviewBody: "Undated customer feedback with enough text",
        reviewRating: { ratingValue: 8, bestRating: 10, worstRating: 0 },
      },
    ]) +
    "</script>";
  const parsed = parseStructured(html, "https://shop.example/");
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].rating, 1);
  assert.equal(parsed[1].published, null);
  assert.equal(parsed[1].rating, 4.2);
  const apple = parseApple(
    {
      feed: {
        entry: [
          {
            id: { label: "123" },
            content: { label: "Actual review" },
            title: { label: "Good" },
            "im:rating": { label: "4" },
            updated: { label: published(1) },
          },
        ],
      },
    },
    "https://itunes.apple.com/us/rss/customerreviews/page=1/id=123456/sortby=mostrecent/json",
  );
  assert.equal(apple[0].rating, 4);
  assert.deepEqual(parseApple({ feed: {} }, "https://itunes.apple.com/"), []);
  const steam = parseSteam(
    {
      response: {
        reviews: [
          {
            recommendationid: "r",
            review: "Crashes after update",
            timestamp_created: Math.floor(Date.now() / 1000),
            voted_up: false,
            author: { steamid: "123" },
          },
        ],
      },
    },
    "https://store.steampowered.com/app/730/",
  );
  assert.equal(steam[0].rating, null);
  assert.equal(steam[0].sentiment, "negative");
  const rss = parseFeedbackFeed(
    "<rss><item><guid>1</guid><description>Helpful customer feedback</description><link>https://shop.example/r/1</link></item></rss>",
    "https://shop.example/feed",
  );
  assert.equal(rss[0].rating, null);
  assert.equal(rss[0].published, null);
  assert.equal(
    sourceInput("https://apps.apple.com/gb/app/name/id572688855").kind,
    "appstore",
  );
  assert.equal(
    sourceInput("https://store.steampowered.com/app/730/").kind,
    "steam",
  );
  assert.throws(
    () => sourceInput("https://www.trustpilot.com/review/example.com"),
    /integration/,
  );
  assert.throws(() => sourceInput("http://localhost/"));
});
test("scheduled writer requires its own credential, respects pause/archive, and records cloud heartbeat", async () => {
  sourceMock(() => [review("a", 1)]);
  try {
    const f = fixture(),
      id = await business(f);
    const d = (await f.call("/dashboard")).value;
    const sid = d.businesses[0].sources[0].id;
    assert.equal((await f.call("/tick", { body: {}, user: null })).status, 401);
    assert.equal(
      (
        await f.call("/tick", {
          body: {},
          headers: { authorization: "Bearer bad" },
        })
      ).status,
      401,
    );
    f.sqlite
      .prepare("UPDATE monitor_sources SET next_check=?")
      .run(published(1));
    assert.equal(
      (await f.call(`/sources/${sid}/refresh`, { body: {} })).status,
      429,
    );
    await f.call(`/sources/${sid}`, {
      method: "PATCH",
      body: { enabled: false },
    });
    assert.equal((await runDueSources(f.db)).checked, 0);
    await f.call(`/sources/${sid}`, {
      method: "PATCH",
      body: { enabled: true },
    });
    await f.call(`/businesses/${id}`, { method: "DELETE" });
    assert.equal((await runDueSources(f.db)).checked, 0);
    assert.equal(
      (await f.call(`/businesses/${id}/restore`, { body: {} })).status,
      200,
    );
    const signed = f.signed({ action: "claim" });
    const tick = await f.call("/tick", signed);
    assert.equal((await f.call("/tick", signed)).value.replayed, true);
    assert.equal(tick.status, 200);
    assert.equal(tick.value.jobs.length, 1);
    const job = tick.value.jobs[0];
    const result = await f.call(
      "/tick",
      f.signed({
        action: "complete",
        source_id: job.id,
        lease: job.lease,
        items: [],
        error: "",
      }),
    );
    assert.equal(result.status, 200);
    assert.equal(result.value.state, "empty");
    const stale = await f.call(
      "/tick",
      f.signed({
        action: "complete",
        source_id: job.id,
        lease: job.lease,
        items: [],
      }),
    );
    assert.equal(stale.status, 409);
    const expired = await f.call(
      "/tick",
      f.signed({ action: "claim", timestamp: Date.now() - 3600000 }),
    );
    assert.equal(expired.status, 401);
    assert.ok((await f.call("/dashboard")).value.scheduler.last_run);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("restricted and empty sources stay visible without invented customer statistics", async () => {
  globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
  try {
    const f = fixture();
    await business(f);
    const d = (await f.call("/dashboard")).value;
    assert.equal(d.businesses[0].sources[0].state, "error");
    assert.equal(d.businesses[0].stats.all.total, 0);
    assert.equal(d.businesses[0].stats.all.average, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("competitors share category and free caps, while duplicates require explicit identity confirmation", async () => {
  sourceMock(() => []);
  try {
    const f = fixture(),
      id = await business(f);
    assert.equal(
      (
        await f.call(`/businesses/${id}/sources`, {
          body: { url: "https://other.example" },
        })
      ).status,
      422,
    );
    const mismatch = await f.call("/businesses", {
      body: {
        name: "Other",
        website: "https://other.example",
        category: "Other",
      },
    });
    assert.equal(mismatch.status, 422);
    for (let i = 0; i < 3; i++) await business(f, "alice", "Competitor " + i);
    assert.equal((await f.call("/dashboard")).value.businesses.length, 4);
    assert.equal(
      (
        await f.call("/businesses", {
          body: {
            name: "Fifth",
            website: "https://fifth.example",
            category: "Retail & e-commerce",
          },
        })
      ).status,
      422,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
