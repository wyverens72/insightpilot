import samples from "./sample-reviews.json";
import {
  classify,
  parseCSV,
  reviewBrief,
  summarize,
  type Review,
} from "./analysis";
import { digest, discover, publicURL, type Research } from "./research";
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function boundedRequest(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max)
        throw new Failure(413, "The request exceeds the free upload limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
const sha = async (s: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const random = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export async function handleAPI(
  request: Request,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
  const url = new URL(request.url);
  const method = request.method;
  let cookie = "";
  try {
    if (!env.DB) throw new Failure(503, "Storage is not available yet.");
    const db = env.DB;
    if (!["GET", "POST"].includes(method))
      throw new Failure(405, "Method not allowed.");
    if (
      method === "POST" &&
      request.headers.get("origin") &&
      request.headers.get("origin") !== url.origin
    )
      throw new Failure(403, "Use the form on this website to continue.");
    let session = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)ip_workspace=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!session) {
      session = random();
      cookie = `ip_workspace=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
    }
    const owner = await sha(session);
    const prefix = "/api";
    const path = url.pathname.slice(prefix.length);
    const out = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...(cookie ? { "Set-Cookie": cookie } : {}),
        },
      });
    const load = async (id: string) => {
      const row = await db
        .prepare("SELECT value FROM workspace_documents WHERE id=? AND owner=?")
        .bind(id, owner)
        .first<{ value: string }>();
      return row ? JSON.parse(row.value) : null;
    };
    const save = async (id: string, kind: string, value: unknown) => {
      const encoded = JSON.stringify(value);
      const size = await db
        .prepare(
          "SELECT COALESCE(SUM(length(CAST(value AS BLOB))),0) AS bytes FROM workspace_documents WHERE id<>?",
        )
        .bind(id)
        .first<{ bytes: number }>();
      if (
        (size?.bytes || 0) + new TextEncoder().encode(encoded).length >
        60000000
      )
        throw new Failure(
          507,
          "Free hosted storage is at capacity. Existing data can still be viewed and exported.",
        );
      await db
        .prepare(
          "INSERT INTO workspace_documents (id,owner,kind,created,value,lease_until) VALUES (?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE owner=excluded.owner",
        )
        .bind(id, owner, kind, new Date().toISOString(), encoded)
        .run();
    };
    const json = async () => {
      if (Number(request.headers.get("content-length") || 0) > 200000)
        throw new Failure(413, "Request is too large.");
      let body: Record<string, any>;
      try {
        body = JSON.parse(
          new TextDecoder().decode(await boundedRequest(request, 200000)),
        );
      } catch {
        throw new Failure(422, "Use a valid JSON request.");
      }
      return body;
    };
    const quota = async () => {
      const day = new Date().toISOString().slice(0, 10);
      for (const [id, max] of [
        [owner + ":" + day, 6],
        ["global:" + day, 40],
      ] as const) {
        const result = await db
          .prepare(
            "INSERT INTO daily_quotas (id,count) VALUES (?,1) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<? RETURNING count",
          )
          .bind(id, max)
          .all();
        if (!result.results.length)
          throw new Failure(
            429,
            "Free search capacity is reached for today. Try again tomorrow.",
          );
      }
      await db
        .prepare("DELETE FROM workspace_documents WHERE created<?")
        .bind(new Date(Date.now() - 30 * 86400000).toISOString())
        .run();
      await db
        .prepare("DELETE FROM daily_quotas WHERE id NOT LIKE ?")
        .bind("%" + day)
        .run();
    };
    const publicDoc = (doc: Research) => {
      const { _candidates, _cursor, ...value } = doc as Research & {
        _candidates?: unknown;
        _cursor?: number;
      };
      return { ...value, sources: doc.sources.map(({ text, ...s }) => s) };
    };
    const progress = (id: string) =>
      ctx.waitUntil(
        (async () => {
          const now = Date.now();
          const lock = await db
            .prepare(
              "UPDATE workspace_documents SET lease_until=? WHERE id=? AND owner=? AND lease_until<?",
            )
            .bind(now + 25000, id, owner, now)
            .run();
          if (!lock.meta.changes) return;
          try {
            const doc = (await load(id)) as Research;
            if (doc?.status === "discovering")
              await discover(doc, async (value) => save(id, "research", value));
          } finally {
            await db
              .prepare(
                "UPDATE workspace_documents SET lease_until=0 WHERE id=? AND owner=?",
              )
              .bind(id, owner)
              .run();
          }
        })(),
      );
    if (path === "/health")
      return out({
        status: "ok",
        ai_configured: false,
        browser_ai: true,
        hosting: "Sites + Cloudflare D1",
        free_mode: true,
      });
    if (path === "/research/settings")
      throw new Failure(
        410,
        "Paid API keys are disabled. Use the free on-device AI option.",
      );
    if (path === "/research" && method === "GET") {
      const { results } = await db
        .prepare(
          "SELECT value FROM workspace_documents WHERE owner=? AND kind='research' ORDER BY created DESC LIMIT 12",
        )
        .bind(owner)
        .all<{ value: string }>();
      return out(
        results.map((r) => {
          const d = JSON.parse(r.value);
          return {
            id: d.id,
            name: d.name,
            url: d.url,
            status: d.status,
            created_at: d.created_at,
          };
        }),
      );
    }
    if (path === "/research/discover" && method === "POST") {
      const body = await json();
      let target: string;
      try {
        target = publicURL(String(body.url || ""));
      } catch {
        throw new Failure(
          422,
          "Enter a public website URL without credentials or an IP address.",
        );
      }
      await quota();
      const id = crypto.randomUUID();
      const doc: Research = {
        id,
        created_at: new Date().toISOString(),
        url: target,
        name: String(
          body.name ||
            new URL(target).hostname.replace(/^www\./, "").split(".")[0],
        )
          .trim()
          .slice(0, 100),
        status: "discovering",
        sources: [],
        warnings: [
          "Public search may be incomplete or old. Check dates and product identity. Discovery resumes while this page is open.",
        ],
        queries: [],
        report: null,
        error: null,
      };
      await save(id, "research", doc);
      progress(id);
      return out(publicDoc(doc), 202);
    }
    const researchMatch = path.match(
      /^\/research\/([\w-]+)(?:\/(analyze|evidence|browser-report))?$/,
    );
    if (researchMatch) {
      const [, id, action] = researchMatch;
      const doc = (await load(id)) as Research | null;
      if (!doc)
        throw new Failure(
          404,
          "This research was not found in your browser workspace.",
        );
      if (!action && method === "GET") {
        if (doc.status === "discovering") progress(id);
        return out(publicDoc(doc));
      }
      if (!["ready", "complete"].includes(doc.status))
        throw new Failure(409, "Wait for source discovery to finish.");
      const body = await json();
      const ids = Array.isArray(body.source_ids)
        ? [...new Set(body.source_ids as string[])]
        : [];
      const selected = doc.sources.filter(
        (s) => ids.includes(s.id) && s.status !== "unavailable",
      );
      if (!ids.length || ids.length > 9 || ids.length !== selected.length)
        throw new Failure(422, "Choose available sources from this research.");
      if (action === "evidence")
        return out({
          name: doc.name,
          url: doc.url,
          sources: selected.map((s) => ({
            id: s.id,
            title: s.title,
            url: s.url,
            kind: s.kind,
            status: s.status,
            text: (s.text || s.excerpt).slice(0, 3200),
          })),
        });
      if (action === "analyze") {
        doc.name = String(body.name || doc.name)
          .trim()
          .slice(0, 100);
        doc.selected_ids = ids;
        doc.report = digest(doc, selected);
        doc.status = "complete";
        await save(id, "research", doc);
        return out(publicDoc(doc));
      }
      if (action === "browser-report") {
        const summaries = Array.isArray(body.summaries) ? body.summaries : [];
        if (
          summaries.length !== selected.length ||
          summaries.some(
            (s: any) =>
              !ids.includes(s.id) ||
              typeof s.summary !== "string" ||
              s.summary.length > 3000,
          )
        )
          throw new Failure(422, "The local summary is incomplete. Try again.");
        doc.name = String(body.name || doc.name).slice(0, 100);
        doc.selected_ids = ids;
        doc.status = "complete";
        doc.report = {
          mode: "browser-ai",
          source_ids: ids,
          notice:
            "Free on-device AI summaries. Model output is not independently verified; check the linked source text. No paid API was used.",
          content:
            `## On-device AI research summary\n\nBased on ${selected.length} selected public sources.\n\n` +
            selected
              .map(
                (s) =>
                  `### [${s.id}](${s.url}) ${s.title}\n\n${s.kind === "official" ? "Company claims" : "Third-party material"} · ${s.status === "read" ? "Page text read" : "Search excerpt only"}\n\n${summaries.find((v: any) => v.id === s.id).summary}`,
              )
              .join("\n\n") +
            "\n\n### Evidence limits\nSummaries use excerpts of up to 3,200 characters per source. The model can omit context or hallucinate; validate claims, dates, and identity. Articles are not a verified individual review dataset, and no sentiment percentage or customer consensus is inferred.",
        };
        await save(id, "research", doc);
        return out(publicDoc(doc));
      }
    }
    const reviewId = "reviews:" + owner;
    const all: Review[] = (await load(reviewId)) || [];
    const source = url.searchParams.get("source"),
      sentiment = url.searchParams.get("sentiment"),
      q = url.searchParams.get("q")?.toLowerCase();
    const rows = all
      .filter(
        (r) =>
          (!source || r.source === source) &&
          (!sentiment || r.sentiment === sentiment) &&
          (!q || r.text.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    if (path === "/dashboard")
      return out({
        ...summarize(rows),
        available_sources: summarize(all).sources,
      });
    if (path === "/reviews") {
      const page = Number(url.searchParams.get("page") || 1),
        size = Number(url.searchParams.get("page_size") || 12);
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(size) ||
        size < 1 ||
        size > 100
      )
        throw new Failure(422, "Invalid review page.");
      return out({
        items: rows.slice((page - 1) * size, page * size),
        total: rows.length,
        page,
        page_size: size,
      });
    }
    if (path === "/brief" && method === "POST") {
      if (!rows.length)
        throw new Failure(422, "Import reviews or broaden the filters first.");
      return out(reviewBrief(rows));
    }
    if ((path === "/demo" || path === "/import") && method === "POST") {
      let imported: Record<string, string>[] = [];
      if (path === "/demo") imported = samples;
      else {
        if (Number(request.headers.get("content-length") || 0) > 2100000)
          throw new Failure(413, "Choose a CSV smaller than 2 MB.");
        const uploadBytes = await boundedRequest(request, 2100000);
        const form = await new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: uploadBytes as unknown as BodyInit,
        }).formData();
        const file = form.get("file");
        if (!file || typeof file === "string" || file.size > 2 * 1024 * 1024)
          throw new Failure(422, "Choose a CSV smaller than 2 MB.");
        let parsed: string[][];
        try {
          const bytes = await file.arrayBuffer();
          parsed = parseCSV(
            new TextDecoder("utf-8", { fatal: true })
              .decode(bytes)
              .replace(/^\uFEFF/, ""),
          );
        } catch (err) {
          throw new Failure(
            422,
            "Use a valid UTF-8 CSV with correctly quoted fields.",
          );
        }
        const headers = parsed.shift() || [];
        if (
          !headers.includes("text") ||
          new Set(headers).size !== headers.length
        )
          throw new Failure(422, "Use unique headers including text.");
        if (!parsed.length || parsed.length > 5000)
          throw new Failure(422, "Import 1–5,000 rows at a time.");
        imported = parsed.map((values) =>
          values.length === headers.length
            ? Object.fromEntries(headers.map((h, i) => [h, values[i]]))
            : { text: "", _bad: "Column count does not match the header." },
        );
      }
      const errors: { row: number; message: string }[] = [];
      let inserted = 0,
        duplicates = 0;
      const fingerprints = new Set(all.map((r) => r.fingerprint));
      const today = new Date().toISOString().slice(0, 10);
      let next = all.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      for (let i = 0; i < imported.length; i++) {
        const row = imported[i];
        try {
          const text = row.text?.trim() || "",
            raw = row.rating?.trim(),
            rating = raw ? Number(raw) : null,
            date = row.date?.trim() || today,
            source = row.source?.trim() || "CSV import";
          if (row._bad) throw new Error(row._bad);
          if (text.length < 3 || text.length > 10000)
            throw new Error("Review text must contain 3–10,000 characters.");
          if (
            rating !== null &&
            (!Number.isInteger(rating) || rating < 1 || rating > 5)
          )
            throw new Error("Rating must be an integer from 1 to 5.");
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            Number.isNaN(Date.parse(date)) ||
            new Date(date).toISOString().slice(0, 10) !== date
          )
            throw new Error("Use a valid date in YYYY-MM-DD format.");
          if (source.length > 80)
            throw new Error("Source must contain at most 80 characters.");
          const fingerprint = await sha(
            JSON.stringify([text, rating, date, source]),
          );
          if (fingerprints.has(fingerprint)) {
            duplicates++;
            continue;
          }
          if (all.length >= 2000)
            throw new Error("The free workspace limit is 2,000 reviews.");
          fingerprints.add(fingerprint);
          all.push({
            id: next++,
            text,
            rating,
            date,
            source,
            ...classify(text, rating),
            fingerprint,
          });
          inserted++;
        } catch (err) {
          errors.push({ row: i + 2, message: (err as Error).message });
        }
      }
      await save(reviewId, "reviews", all);
      return out({
        imported: inserted,
        duplicates,
        rejected: errors.length,
        errors: errors.slice(0, 50),
      });
    }
    throw new Failure(404, "This endpoint was not found.");
  } catch (error) {
    return new Response(
      JSON.stringify({
        detail:
          error instanceof Failure
            ? error.message
            : "The request could not be completed. Try again shortly.",
      }),
      {
        status: error instanceof Failure ? error.status : 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...(cookie ? { "Set-Cookie": cookie } : {}),
        },
      },
    );
  }
}
