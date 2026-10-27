import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleAPI } from "../work/tests/service.js";
import { classify, parseCSV, summarize } from "../work/tests/analysis.js";
import { extractPage, publicURL, parseFeed } from "../work/tests/research.js";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../drizzle/0000_superb_angel.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) || null;
        },
        async all() {
          const rows = sqlite.prepare(sql).all(...values);
          return { results: rows, meta: { changes: rows.length } };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  const tasks = [];
  const env = { DB: db };
  const ctx = {
    waitUntil(p) {
      tasks.push(p);
    },
  };
  return {
    async call(
      path,
      body,
      cookie = "",
      method = body === undefined ? "GET" : "POST",
    ) {
      const headers = { ...(cookie ? { cookie } : {}) };
      let request;
      if (body instanceof FormData)
        request = new Request("https://insightpilot.example" + path, {
          method,
          headers,
          body,
        });
      else
        request = new Request("https://insightpilot.example" + path, {
          method,
          headers: {
            ...headers,
            ...(body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const response = await handleAPI(request, env, ctx);
      return {
        status: response.status,
        cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie,
        value: await response.json(),
      };
    },
    async flush() {
      while (tasks.length) await tasks.shift();
    },
    sqlite,
  };
}
test("workspaces isolate imports and produce real analytics", async () => {
  const f = fixture();
  const a = await f.call("/api/health");
  assert.equal(a.value.free_mode, true);
  assert.equal(a.value.ai_configured, false);
  assert.equal((await f.call("/api/demo", {}, a.cookie)).value.imported, 36);
  assert.equal((await f.call("/api/demo", {}, a.cookie)).value.duplicates, 36);
  assert.equal(
    (await f.call("/api/dashboard", undefined, a.cookie)).value.total,
    36,
  );
  const b = await f.call("/api/health");
  assert.notEqual(a.cookie, b.cookie);
  assert.equal(
    (await f.call("/api/dashboard", undefined, b.cookie)).value.total,
    0,
  );
  assert.equal(
    (await f.call("/api/brief", {}, a.cookie)).value.review_count,
    36,
  );
});
test("CSV validates rows and retains quoted commas", async () => {
  const f = fixture();
  const session = await f.call("/api/health");
  const form = new FormData();
  form.set(
    "file",
    new File(
      [
        'text,rating,date,source\n"Great support, helpful team",5,2026-10-27,G2\nBad date,2,2026-02-30,G2\nBad rating,9,2026-10-27,G2\n',
      ],
      "reviews.csv",
    ),
  );
  const result = await f.call("/api/import", form, session.cookie);
  assert.equal(result.value.imported, 1);
  assert.equal(result.value.rejected, 2);
  assert.equal(
    (await f.call("/api/reviews?q=helpful", undefined, session.cookie)).value
      .items[0].text,
    "Great support, helpful team",
  );
});
test("rejects private URL forms and preserves functional source queries", () => {
  for (const url of [
    "http://127.0.0.1",
    "http://192.168.1.2",
    "http://localhost",
    "http://example.local",
    "https://user:secret@example.com",
    "http://example.com:8080",
  ])
    assert.throws(() => publicURL(url));
  assert.equal(
    publicURL("https://example.com/?secret=hidden"),
    "https://example.com/",
  );
  assert.equal(
    publicURL("https://example.com/details?id=app&utm_source=tracking", true),
    "https://example.com/details?id=app",
  );
});
test("extracts HTML text without executable content and rejects challenge pages", () => {
  assert.throws(() =>
    extractPage(
      "<title>Verify you are human</title><p>" +
        "Blocked ".repeat(100) +
        "</p>",
    ),
  );
  const page = extractPage(
    "<title>Useful review</title><script>malicious()</script><p>" +
      "A customer discusses the product and its limitations. ".repeat(8) +
      "</p>",
  );
  assert.equal(page.title, "Useful review");
  assert.ok(!page.text.includes("malicious"));
  assert.ok(page.text.length > 120);
});
test("news links resolve to the actual publisher and namesakes are filtered", () => {
  const xml =
    "<rss><channel><item><title>Acme review</title><link>https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Freviews.example.com%2Facme</link><description>Acme review excerpt</description></item><item><title>Other</title><link>https://example.com/other</link></item></channel></rss>";
  assert.equal(
    parseFeed(xml, "Acme")[0].url,
    "https://reviews.example.com/acme",
  );
  assert.equal(parseFeed(xml, "Acme").length, 1);
});
test("research jobs resume in bounded steps, enforce ownership, and cite selected evidence", async () => {
  const f = fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(url);
    if (path.hostname === "www.bing.com")
      return new Response(
        "<rss><channel><item><title>Acme review</title><link>https://reviews.example.com/acme</link><description>Independent review excerpt.</description></item></channel></rss>",
        { headers: { "content-type": "text/xml" } },
      );
    if (path.pathname === "/robots.txt")
      return new Response("User-agent: *\nAllow: /", {
        headers: { "content-type": "text/plain" },
      });
    return new Response(
      "<title>Acme product research</title><p>" +
        "Acme has useful workflows and customers discuss pricing and usability. ".repeat(
          10,
        ) +
        "</p>",
      { headers: { "content-type": "text/html" } },
    );
  };
  try {
    const session = await f.call("/api/health");
    const start = await f.call(
      "/api/research/discover",
      { url: "https://acme.com", name: "Acme" },
      session.cookie,
    );
    assert.equal(start.status, 202);
    await f.flush();
    let doc = (
      await f.call("/api/research/" + start.value.id, undefined, session.cookie)
    ).value;
    await f.flush();
    doc = (
      await f.call("/api/research/" + start.value.id, undefined, session.cookie)
    ).value;
    assert.equal(doc.status, "ready");
    assert.equal(doc.sources.length, 2);
    assert.ok(doc.sources.every((s) => !("text" in s)));
    const stranger = await f.call("/api/health");
    assert.equal(
      (await f.call("/api/research/" + doc.id, undefined, stranger.cookie))
        .status,
      404,
    );
    const report = await f.call(
      "/api/research/" + doc.id + "/analyze",
      { name: "Acme", source_ids: ["S2"] },
      session.cookie,
    );
    assert.equal(report.value.report.mode, "local");
    assert.ok(
      report.value.report.content.includes(
        "[S2](https://reviews.example.com/acme)",
      ),
    );
    assert.ok(!report.value.report.content.includes("[S1]"));
    const evidence = await f.call(
      "/api/research/" + doc.id + "/evidence",
      { source_ids: ["S2"] },
      session.cookie,
    );
    assert.ok(evidence.value.sources[0].text.length > 120);
    const saved = await f.call(
      "/api/research/" + doc.id + "/browser-report",
      {
        name: "Acme",
        source_ids: ["S2"],
        summaries: [
          { id: "S2", summary: "The source discusses pricing and usability." },
        ],
      },
      session.cookie,
    );
    assert.equal(saved.value.report.mode, "browser-ai");
    assert.ok(saved.value.report.notice.includes("No paid API"));
  } finally {
    globalThis.fetch = original;
  }
});
test("paid API key endpoints are disabled", async () => {
  const f = fixture();
  assert.equal(
    (await f.call("/api/research/settings", { key: "not-a-real-key" })).status,
    410,
  );
});
test("rating priority and aggregate counts match the local app", () => {
  assert.equal(classify("Great but slow", 2).sentiment, "negative");
  const stats = summarize([
    {
      id: 1,
      text: "Good",
      rating: 5,
      date: "2026-10-27",
      source: "G2",
      ...classify("Good", 5),
    },
  ]);
  assert.equal(stats.positive_share, 100);
  assert.equal(stats.average_rating, 5);
  assert.deepEqual(parseCSV('text,rating\n"Great, helpful",5')[1], [
    "Great, helpful",
    "5",
  ]);
});

test("article extraction excludes unrelated navigation and decodes punctuation", () => {
  const article =
    "A customer discusses pricing, usability, and the product's limitations. ".repeat(
      12,
    );
  const page = extractPage(
    "<title>Product review</title><nav>Unrelated headlines and promotions.</nav><article><header>Review published in 2026</header><p>" +
      article +
      " It&#x27;s useful.</p></article><footer>Unrelated links</footer>",
  );
  assert.ok(page.text.includes("pricing, usability"));
  assert.ok(!page.text.includes("Unrelated"));
  assert.ok(page.text.includes("It's useful."));
});
test("research deletion is isolated, survives reload, and can be undone", async () => {
  const f = fixture();
  const a = await f.call('/api/health');
  const b = await f.call('/api/health');
  const session = a.cookie.split('=')[1];
  const owner = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session))).toString('hex');
  const doc = {id:'delete-test', name:'Todoist', url:'https://todoist.com/', status:'complete', sources:[], report:null, warnings:[], queries:[]};
  f.sqlite.prepare('INSERT INTO workspace_documents (id,owner,kind,created,value,lease_until) VALUES (?,?,?,?,?,0)').run(doc.id, owner, 'research', new Date().toISOString(), JSON.stringify(doc));
  assert.equal((await f.call('/api/research/delete-test', undefined, a.cookie)).status, 200);
  assert.equal((await f.call('/api/research/delete-test', undefined, b.cookie, 'DELETE')).status, 404);
  assert.equal((await f.call('/api/research/delete-test', undefined, a.cookie, 'DELETE')).status, 200);
  assert.equal((await f.call('/api/research/delete-test', undefined, a.cookie)).status, 404);
  assert.equal((await f.call('/api/research', undefined, a.cookie)).value.length, 0);
  assert.equal((await f.call('/api/research/delete-test', {}, b.cookie)).status, 404);
  assert.equal((await f.call('/api/research/delete-test', {}, a.cookie)).status, 200);
  assert.equal((await f.call('/api/research', undefined, a.cookie)).value.length, 1);
});
