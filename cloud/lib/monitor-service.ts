import {
  collectReviews,
  sourceInput,
  sourceLimits,
  discoverProfiles,
  discoverCompetitors,
  type SourceKind,
  type CollectedReview,
} from "./monitor-sources";
import { publicURL } from "./research";
import {
  reviewStats,
  signals,
  spikeCandidates,
  type StoredReview,
} from "./monitor-analysis";
type DB = D1Database;
const iso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
export const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function all(db: DB, sql: string, ...args: any[]) {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results as any[];
}
async function one(db: DB, sql: string, ...args: any[]) {
  return await db
    .prepare(sql)
    .bind(...args)
    .first<any>();
}
async function run(db: DB, sql: string, ...args: any[]) {
  return await db
    .prepare(sql)
    .bind(...args)
    .run();
}
async function json(request: Request, maxBytes = 16000) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new Problem(413, "The form is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(total);
  let n = 0;
  for (const x of chunks) {
    bytes.set(x, n);
    n += x.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Problem(422, "Use a valid JSON request.");
  }
}
function text(value: any, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function ownedBusiness(
  db: DB,
  id: string,
  owner: string,
  archived = false,
) {
  const b = await one(
    db,
    "SELECT * FROM monitor_businesses WHERE id=? AND owner=? AND archived=?",
    id,
    owner,
    archived ? 1 : 0,
  );
  if (!b) throw new Problem(404, "Business not found in your workspace.");
  return b;
}
async function reviews(db: DB, id: string, owner: string) {
  return (await all(
    db,
    "SELECT * FROM monitor_reviews WHERE business_id=? AND owner=? ORDER BY COALESCE(published,first_seen) DESC LIMIT 5000",
    id,
    owner,
  )) as StoredReview[];
}
async function tickQuota(db: DB) {
  const key = "monitor:" + iso().slice(0, 10);
  const r = await one(
    db,
    "INSERT INTO daily_quotas (id,count) VALUES (?,1) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<160 RETURNING count",
    key,
  );
  if (!r)
    throw new Problem(
      429,
      "The shared free collection allowance is used for today. Saved reviews remain available.",
    );
}
export async function syncSource(
  db: DB,
  id: string,
  force = false,
  delivered?: { items: CollectedReview[]; edge?: boolean; error?: string; lease: number },
) {
  const source = await one(
    db,
    "SELECT s.* FROM monitor_sources s JOIN monitor_businesses b ON b.id=s.business_id WHERE s.id=? AND s.enabled=1 AND b.archived=0",
    id,
  );
  if (!source) return { skipped: true };
  if (!force && Date.parse(source.next_check) > Date.now())
    return { skipped: true };
  if (delivered) {
    if (
      source.lease_until !== delivered.lease ||
      source.lease_until < Date.now()
    )
      throw new Problem(409, "The collection lease has expired.");
  } else {
    const lock = await run(
      db,
      "UPDATE monitor_sources SET lease_until=? WHERE id=? AND lease_until<?",
      Date.now() + 120000,
      id,
      Date.now(),
    );
    if (!lock.meta.changes) return { skipped: true };
  }
  const started = iso();
  let added = 0,
    updated = 0,
    fetched = 0,
    state = "ready",
    note = "";
  try {
    await tickQuota(db);
    if (delivered?.error) throw new Error(delivered.error);
    const incoming =
      delivered && !delivered.edge
        ? delivered.items
        : await collectReviews({
            kind: source.kind as SourceKind,
            url: source.url,
          });
    fetched = incoming.length;
    const total = await one(
      db,
      "SELECT COUNT(*) AS n FROM monitor_reviews WHERE business_id=?",
      source.business_id,
    );
    const globalCount = await one(
      db,
      "SELECT COUNT(*) AS n FROM monitor_reviews",
    );
    let capacity = Math.min(
      5000 - Number(total.n),
      40000 - Number(globalCount.n),
    );
    const stored = await all(
      db,
      "SELECT id,body,rating,title,published,author,url FROM monitor_reviews WHERE source_id=?",
      source.id,
    );
    const existingById = new Map(stored.map((r) => [r.id, r]));
    const statements: D1PreparedStatement[] = [];
    for (const r of incoming) {
      const key = await hash(
        source.id +
          ":" +
          (r.externalId || r.body.toLowerCase().replace(/\s+/g, " ")),
      );
      const existing = existingById.get(key);
      if (!existing && capacity <= 0) continue;
      if (
        existing &&
        existing.body === r.body &&
        existing.rating === r.rating &&
        existing.title === r.title &&
        existing.published === r.published &&
        existing.author === r.author &&
        existing.url === r.url
      )
        continue;
      const signal = signals(r.title + " " + r.body, r.rating, r.sentiment);
      statements.push(
        db
          .prepare(
            "INSERT INTO monitor_reviews (id,source_id,business_id,owner,external_id,author,title,body,rating,sentiment,topics,published,first_seen,last_seen,url,language) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET author=excluded.author,title=excluded.title,body=excluded.body,rating=excluded.rating,sentiment=excluded.sentiment,topics=excluded.topics,published=excluded.published,last_seen=excluded.last_seen,url=excluded.url",
          )
          .bind(
            key,
            source.id,
            source.business_id,
            source.owner,
            r.externalId,
            r.author,
            r.title,
            r.body,
            r.rating,
            signal.sentiment,
            JSON.stringify(signal.topics),
            r.published,
            started,
            started,
            r.url,
            r.language,
          ),
      );
      if (!existing) {
        added++;
        capacity--;
      } else if (existing.body !== r.body || existing.rating !== r.rating)
        updated++;
      existingById.set(key, { id: key, ...r });
    }
    if (statements.length) await db.batch(statements);
    state = incoming.length ? "ready" : "empty";
    note = incoming.length
      ? `${added} new, ${updated} updated; ${incoming.length} entries checked. ${sourceLimits[source.kind as SourceKind]}`
      : "No individual review text was available. No reviews or ratings were invented. " +
        sourceLimits[source.kind as SourceKind];
    if (capacity <= 0)
      note += " The 5,000-review workspace limit has been reached.";
    await run(
      db,
      "UPDATE monitor_sources SET last_success=? WHERE id=?",
      started,
      id,
    );
    if (source.last_success && added) {
      const settings = await one(
        db,
        "SELECT * FROM monitor_settings WHERE owner=?",
        source.owner,
      );
      if (!settings || settings.alerts_enabled) {
        const rows = await reviews(db, source.business_id, source.owner);
        for (const alert of spikeCandidates(
          rows,
          settings?.min_complaints ?? 3,
          settings?.multiplier ?? 2,
        )) {
          const dedupe =
            source.business_id + ":" + started.slice(0, 10) + ":" + alert.key;
          await run(
            db,
            "INSERT OR IGNORE INTO monitor_alerts (id,business_id,owner,title,body,evidence,created,read_at,dedupe) VALUES (?,?,?,?,?,?,?,NULL,?)",
            await hash(dedupe),
            source.business_id,
            source.owner,
            alert.title,
            alert.body,
            JSON.stringify(alert.evidence),
            started,
            dedupe,
          );
        }
      }
    }
  } catch (err) {
    state = "error";
    note = text((err as Error).message, 600);
  }
  await run(
    db,
    "DELETE FROM monitor_state WHERE id=?",
    "stats:" + source.business_id,
  );
  await run(
    db,
    "INSERT INTO monitor_runs (id,source_id,business_id,owner,started,finished,state,added,updated,fetched,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    uid(),
    id,
    source.business_id,
    source.owner,
    started,
    iso(),
    state,
    added,
    updated,
    fetched,
    note,
  );
  await run(
    db,
    "UPDATE monitor_sources SET state=?,note=?,last_checked=?,next_check=?,lease_until=0 WHERE id=?",
    state,
    note,
    started,
    new Date(Date.now() + 6 * 3600000).toISOString(),
    id,
  );
  return { id, state, added, updated, fetched, note };
}
export async function runDueSources(db: DB) {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  await run(db, "DELETE FROM monitor_reviews WHERE first_seen<?", cutoff);
  await run(
    db,
    "DELETE FROM monitor_state WHERE id LIKE 'nonce:%' AND value<?",
    new Date(Date.now() - 86400000).toISOString(),
  );
  await run(db, "DELETE FROM monitor_runs WHERE started<?", cutoff);
  await run(db, "DELETE FROM monitor_alerts WHERE created<?", cutoff);
  const sources = await all(
    db,
    "SELECT s.id FROM monitor_sources s JOIN monitor_businesses b ON b.id=s.business_id WHERE s.enabled=1 AND b.archived=0 AND s.next_check<=? AND s.lease_until<? ORDER BY s.next_check LIMIT 2",
    iso(),
    Date.now(),
  );
  const results = [];
  for (const s of sources) results.push(await syncSource(db, s.id));
  await run(
    db,
    "INSERT INTO monitor_state (id,value) VALUES ('scheduler',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    JSON.stringify({ last_run: iso(), checked: results.length }),
  );
  const pending = await one(
    db,
    "SELECT COUNT(*) AS n FROM monitor_sources s JOIN monitor_businesses b ON b.id=s.business_id WHERE s.enabled=1 AND b.archived=0 AND s.next_check<=? AND s.lease_until<?",
    iso(),
    Date.now(),
  );
  return { checked: results.length, remaining_due: Number(pending.n), results };
}
export async function claimDueSources(db: DB) {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM monitor_reviews WHERE first_seen<?").bind(cutoff),
    db.prepare("DELETE FROM monitor_runs WHERE started<?").bind(cutoff),
    db.prepare("DELETE FROM monitor_alerts WHERE created<?").bind(cutoff),
    db
      .prepare("DELETE FROM monitor_state WHERE id LIKE 'nonce:%' AND value<?")
      .bind(new Date(Date.now() - 86400000).toISOString()),
  ]);
  const quota = await one(
    db,
    "SELECT count FROM daily_quotas WHERE id=?",
    "monitor:" + iso().slice(0, 10),
  );
  if (quota?.count >= 160)
    return { jobs: [], remaining_due: 0, capacity_reached: true };
  const candidates = await all(
    db,
    "SELECT s.id,s.kind,s.url FROM monitor_sources s JOIN monitor_businesses b ON b.id=s.business_id WHERE s.enabled=1 AND b.archived=0 AND s.next_check<=? AND s.lease_until<? ORDER BY s.next_check LIMIT 2",
    iso(),
    Date.now(),
  );
  const jobs = [];
  for (const s of candidates) {
    const lease = Date.now() + 120000;
    const changed = await run(
      db,
      "UPDATE monitor_sources SET lease_until=?,state='pending',note='Cloud collection in progress.' WHERE id=? AND lease_until<?",
      lease,
      s.id,
      Date.now(),
    );
    if (changed.meta.changes) jobs.push({ ...s, lease });
  }
  const pending = await one(
    db,
    "SELECT COUNT(*) AS n FROM monitor_sources s JOIN monitor_businesses b ON b.id=s.business_id WHERE s.enabled=1 AND b.archived=0 AND s.next_check<=? AND s.lease_until<?",
    iso(),
    Date.now(),
  );
  await run(
    db,
    "INSERT INTO monitor_state (id,value) VALUES ('scheduler',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    JSON.stringify({ last_run: iso(), checked: jobs.length }),
  );
  return { jobs, remaining_due: Number(pending.n) };
}
export async function handleMonitor(
  request: Request,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
  const url = new URL(request.url),
    path = url.pathname.replace(/^\/api\/monitor/, "") || "/",
    method = request.method;
  let cookie = "";
  const out = (value: any, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    });
  try {
    if (!env.DB) throw new Problem(503, "Storage is not ready.");
    const db = env.DB;
    if (!["GET", "POST", "DELETE", "PATCH"].includes(method))
      throw new Problem(405, "Method not allowed.");
    if (
      method !== "GET" &&
      request.headers.get("origin") &&
      request.headers.get("origin") !== url.origin
    )
      throw new Problem(403, "Use the form on this website.");
    if (path === "/tick") {
      if (method !== "POST") throw new Problem(405, "Use POST.");
      const signature = request.headers.get("x-monitor-signature") || "";
      if (!env.MONITOR_CRON_PUBLIC_KEY || !signature || signature.length > 150)
        throw new Problem(401, "Scheduler signature is required.");
      const body = await json(request, 1500000);
      if (
        !Number.isFinite(body.timestamp) ||
        Math.abs(Date.now() - body.timestamp) > 300000 ||
        !/^[-a-zA-Z0-9]{16,80}$/.test(body.nonce || "")
      )
        throw new Problem(401, "The scheduler request has expired.");
      let valid = false;
      try {
        const key = await crypto.subtle.importKey(
          "spki",
          Uint8Array.from(atob(env.MONITOR_CRON_PUBLIC_KEY), (c) =>
            c.charCodeAt(0),
          ),
          { name: "Ed25519" },
          false,
          ["verify"],
        );
        valid = await crypto.subtle.verify(
          "Ed25519",
          key,
          Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
          new TextEncoder().encode(JSON.stringify(body)),
        );
      } catch {}
      if (!valid) throw new Problem(401, "The scheduler signature is invalid.");
      const accepted = await one(
        db,
        "INSERT OR IGNORE INTO monitor_state (id,value) VALUES (?,?) RETURNING id",
        "nonce:" + body.nonce,
        iso(),
      );
      if (!accepted) return out({ checked: 0, replayed: true });
      if (body.action === "claim") return out(await claimDueSources(db));
      if (body.action === "edge") {
        const source = await one(
          db,
          "SELECT kind FROM monitor_sources WHERE id=?",
          text(body.source_id),
        );
        if (!source || !["structured", "rss"].includes(source.kind))
          throw new Problem(
            422,
            "This source uses the direct provider collector.",
          );
        return out(
          await syncSource(db, text(body.source_id), true, {
            items: [],
            edge: true,
            lease: Number(body.lease),
          }),
        );
      }
      if (body.action === "complete") {
        if (
          !Array.isArray(body.items) ||
          body.items.length > 100 ||
          typeof body.source_id !== "string" ||
          !Number.isFinite(body.lease)
        )
          throw new Problem(422, "Use a bounded collected review batch.");
        for (const r of body.items) {
          if (
            typeof r.body !== "string" ||
            r.body.length > 3000 ||
            typeof r.externalId !== "string" ||
            r.externalId.length > 2000 ||
            typeof r.title !== "string" ||
            r.title.length > 200 ||
            typeof r.author !== "string" ||
            r.author.length > 80 ||
            typeof r.language !== "string" ||
            r.language.length > 30
          )
            throw new Problem(422, "Invalid review fields.");
          if (
            r.rating !== null &&
            (!Number.isFinite(r.rating) || r.rating < 1 || r.rating > 5)
          )
            throw new Problem(422, "Invalid review rating.");
          try {
            r.url = publicURL(r.url, true);
          } catch {
            throw new Problem(422, "Invalid review source URL.");
          }
          if (r.published !== null && !Number.isFinite(Date.parse(r.published)))
            throw new Problem(422, "Invalid review date.");
        }
        const result = await syncSource(db, body.source_id, true, {
          items: body.items,
          error: text(body.error, 600),
          lease: body.lease,
        });
        await run(
          db,
          "INSERT INTO monitor_state (id,value) VALUES ('scheduler',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
          JSON.stringify({ last_run: iso(), checked: 1 }),
        );
        return out(result);
      }
      return out({ checked: 0 });
    }
    const userId = request.headers.get("oai-authenticated-user-id");
    let session = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)ip_monitor=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!session) {
      session = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      cookie = `ip_monitor=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
    }
    const owner = await hash(
      userId ? "account:" + userId : "browser:" + session,
    );
    const identity = {
      signed_in: !!userId,
      name:
        request.headers.get("oai-authenticated-user-email") ||
        "Browser preview",
      workspace: userId ? "account" : "browser",
      sign_in: "/signin-with-chatgpt?return_to=%2F",
      sign_out: "/signout-with-chatgpt?return_to=%2F",
    };
    if (path === "/session") return out(identity);
    if (path === "/dashboard" && method === "GET") {
      const businesses = await all(
        db,
        "SELECT * FROM monitor_businesses WHERE owner=? AND archived=0 ORDER BY role DESC,created",
        owner,
      );
      const items = [];
      for (const b of businesses) {
        const cached = await one(
          db,
          "SELECT value FROM monitor_state WHERE id=?",
          "stats:" + b.id,
        );
        const snapshot = cached ? JSON.parse(cached.value) : null;
        const stats =
          snapshot && Date.now() - snapshot.at < 15 * 60000
            ? snapshot.stats
            : reviewStats(await reviews(db, b.id, owner));
        if (!snapshot || Date.now() - snapshot.at >= 15 * 60000)
          await run(
            db,
            "INSERT INTO monitor_state (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
            "stats:" + b.id,
            JSON.stringify({ at: Date.now(), stats }),
          );
        const sources = await all(
          db,
          "SELECT * FROM monitor_sources WHERE business_id=? AND owner=? ORDER BY created",
          b.id,
          owner,
        );
        items.push({ ...b, stats, sources });
      }
      const settings = (await one(
        db,
        "SELECT * FROM monitor_settings WHERE owner=?",
        owner,
      )) || { min_complaints: 3, multiplier: 2, alerts_enabled: 1 };
      const alerts = await all(
        db,
        "SELECT a.*,b.name AS business_name FROM monitor_alerts a JOIN monitor_businesses b ON a.business_id=b.id WHERE a.owner=? AND b.archived=0 ORDER BY a.created DESC LIMIT 50",
        owner,
      );
      const scheduler = await one(
        db,
        "SELECT value FROM monitor_state WHERE id='scheduler'",
      );
      return out({
        identity,
        businesses: items,
        archived: await all(
          db,
          "SELECT id,name,role FROM monitor_businesses WHERE owner=? AND archived=1 ORDER BY created DESC LIMIT 20",
          owner,
        ),
        alerts,
        settings,
        scheduler: scheduler ? JSON.parse(scheduler.value) : null,
        limits: {
          businesses: 4,
          sources_per_business: 3,
          reviews_per_business: 5000,
          refresh_hours: 6,
        },
      });
    }
    if (path === "/businesses" && method === "POST") {
      const body = await json(request);
      const name = text(body.name),
        category = text(body.category, 60),
        location = text(body.location, 100);
      if (name.length < 2 || !category)
        throw new Problem(422, "Enter the business name and category.");
      let website;
      try {
        website = publicURL(text(body.website, 2000));
      } catch (err) {
        throw new Problem(422, (err as Error).message);
      }
      const count = await one(
        db,
        "SELECT COUNT(*) AS n FROM monitor_businesses WHERE owner=? AND archived=0",
        owner,
      );
      if (count.n >= 4)
        throw new Problem(
          422,
          "The free workspace supports one business and three competitors.",
        );
      const own = await one(
        db,
        "SELECT id,category FROM monitor_businesses WHERE owner=? AND role='own' AND archived=0",
        owner,
      );
      const role = own ? "competitor" : "own";
      if (own && category !== own.category)
        throw new Problem(
          422,
          "Choose the same category as your business for a consistent comparison.",
        );
      const deploymentCount = await one(
        db,
        "SELECT COUNT(*) AS n FROM monitor_businesses WHERE archived=0",
      );
      if (deploymentCount.n >= 60)
        throw new Problem(
          429,
          "The shared free deployment has reached its active business limit. Existing monitors continue to work.",
        );
      const id = uid();
      await run(
        db,
        "INSERT INTO monitor_businesses (id,owner,name,website,category,location,role,created,archived) VALUES (?,?,?,?,?,?,?,?,0)",
        id,
        owner,
        name,
        website,
        category,
        location,
        role,
        iso(),
      );
      let initial;
      try {
        initial = sourceInput(website);
      } catch {
        initial = null;
      }
      if (initial) {
        const sid = uid();
        await run(
          db,
          "INSERT INTO monitor_sources (id,business_id,owner,kind,url,label,state,note,next_check,lease_until,enabled,created) VALUES (?,?,?,?,?,?,?,?,?,0,1,?)",
          sid,
          id,
          owner,
          initial.kind,
          initial.url,
          "Primary review source",
          "pending",
          "Waiting for the first collection.",
          iso(),
          iso(),
        );
      }
      return out({ id, role }, 201);
    }
    const bm = path.match(
      /^\/businesses\/([\w-]+)(?:\/(reviews|discover|sources|restore))?$/,
    );
    if (bm) {
      const [, id, action] = bm;
      if (action === "restore" && method === "POST") {
        const b = await ownedBusiness(db, id, owner, true);
        const active = await all(
          db,
          "SELECT role FROM monitor_businesses WHERE owner=? AND archived=0",
          owner,
        );
        if (
          active.length >= 4 ||
          (b.role === "own" && active.some((x) => x.role === "own"))
        )
          throw new Problem(
            409,
            "Archive the current business before restoring this one.",
          );
        await run(
          db,
          "UPDATE monitor_businesses SET archived=0 WHERE id=? AND owner=?",
          id,
          owner,
        );
        return out({ restored: true });
      }
      const b = await ownedBusiness(db, id, owner);
      if (!action && method === "DELETE") {
        await run(
          db,
          "UPDATE monitor_businesses SET archived=1 WHERE id=? AND owner=?",
          id,
          owner,
        );
        return out({ archived: true });
      }
      if (action === "reviews" && method === "GET") {
        const clauses = ["business_id=?", "owner=?"];
        const values: any[] = [id, owner];
        const q = text(url.searchParams.get("q"), 200).toLowerCase();
        if (q) {
          clauses.push("instr(lower(title||' '||body),?)>0");
          values.push(q);
        }
        const sentiment = url.searchParams.get("sentiment"),
          source = url.searchParams.get("source"),
          topic = url.searchParams.get("topic");
        if (sentiment) {
          clauses.push("sentiment=?");
          values.push(sentiment);
        }
        if (source) {
          clauses.push("source_id=?");
          values.push(source);
        }
        if (topic) {
          clauses.push(
            "EXISTS (SELECT 1 FROM json_each(monitor_reviews.topics) WHERE value=?)",
          );
          values.push(topic);
        }
        const where = clauses.join(" AND ");
        const count = await one(
          db,
          "SELECT COUNT(*) AS n FROM monitor_reviews WHERE " + where,
          ...values,
        );
        const page = Math.max(
          1,
          Math.min(500, Math.floor(Number(url.searchParams.get("page")) || 1)),
        );
        const items = await all(
          db,
          "SELECT * FROM monitor_reviews WHERE " +
            where +
            " ORDER BY COALESCE(published,first_seen) DESC LIMIT 20 OFFSET ?",
          ...values,
          (page - 1) * 20,
        );
        return out({ total: Number(count.n), page, items });
      }
      if (action === "discover" && method === "POST") {
        const quotaKey = owner + ":profiles:" + iso().slice(0, 10);
        const quota = await one(
          db,
          "INSERT INTO daily_quotas (id,count) VALUES (?,1) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<6 RETURNING count",
          quotaKey,
        );
        if (!quota)
          throw new Problem(
            429,
            "Profile discovery is limited to six searches per day. You can still add a known review link.",
          );
        const body = await json(request);
        const name = body.competitors ? b.category + " alternatives" : b.name;
        try {
          return out({
            candidates: body.competitors
              ? await discoverCompetitors(b.category, b.location, b.website)
              : await discoverProfiles(name, b.website, b.location),
            note: "Search suggestions are not verified business matches. Confirm each profile before connecting it.",
          });
        } catch {
          return out({
            candidates: [],
            note: "Public discovery is unavailable. Add a known review profile link instead.",
          });
        }
      }
      if (action === "sources" && method === "POST") {
        const count = await one(
          db,
          "SELECT COUNT(*) AS n FROM monitor_sources WHERE business_id=?",
          id,
        );
        if (count.n >= 3)
          throw new Problem(
            422,
            "Each business can connect three sources. Remove an unused connection before adding another.",
          );
        const body = await json(request);
        if (!body.confirmed)
          throw new Problem(
            422,
            "Confirm that the profile refers to this exact business.",
          );
        let input;
        try {
          input = sourceInput(text(body.url, 2000), body.kind);
        } catch (err) {
          throw new Problem(422, (err as Error).message);
        }
        const duplicate = await one(
          db,
          "SELECT id FROM monitor_sources WHERE business_id=? AND url=?",
          id,
          input.url,
        );
        if (duplicate)
          throw new Problem(409, "This source is already connected.");
        const sid = uid();
        await run(
          db,
          "INSERT INTO monitor_sources (id,business_id,owner,kind,url,label,state,note,next_check,lease_until,enabled,created) VALUES (?,?,?,?,?,?,?,?,?,0,1,?)",
          sid,
          id,
          owner,
          input.kind,
          input.url,
          text(body.label, 80) || new URL(input.url).hostname,
          "pending",
          "Waiting for collection.",
          iso(),
          iso(),
        );

        return out({ id: sid }, 201);
      }
    }
    const sm = path.match(/^\/sources\/([\w-]+)(?:\/(refresh))?$/);
    if (sm) {
      const [, id, action] = sm;
      const s = await one(
        db,
        "SELECT * FROM monitor_sources WHERE id=? AND owner=?",
        id,
        owner,
      );
      if (!s) throw new Problem(404, "Source not found.");
      await ownedBusiness(db, s.business_id, owner);
      if (action === "refresh" && method === "POST") {
        if (!s.enabled) throw new Problem(409, "Resume this source first.");
        if (
          s.last_checked &&
          Date.now() - Date.parse(s.last_checked) < 15 * 60000
        )
          throw new Problem(
            429,
            "This source was checked recently. Manual refresh is available every 15 minutes.",
          );
        await run(
          db,
          "UPDATE monitor_sources SET state='pending' WHERE id=? AND owner=?",
          id,
          owner,
        );
        await run(
          db,
          "UPDATE monitor_sources SET next_check=?,note=? WHERE id=? AND owner=?",
          iso(),
          "Queued for the next cloud collector run.",
          id,
          owner,
        );
        return out({ queued: true }, 202);
      }
      if (!action && method === "PATCH") {
        const body = await json(request);
        await run(
          db,
          "UPDATE monitor_sources SET enabled=? WHERE id=? AND owner=?",
          body.enabled ? 1 : 0,
          id,
          owner,
        );
        return out({ saved: true });
      }
      if (!action && method === "GET") {
        return out({
          source: s,
          runs: await all(
            db,
            "SELECT * FROM monitor_runs WHERE source_id=? AND owner=? ORDER BY started DESC LIMIT 30",
            id,
            owner,
          ),
        });
      }
    }
    if (path === "/settings" && method === "PATCH") {
      const body = await json(request);
      const min = Number(body.min_complaints),
        multiple = Number(body.multiplier);
      if (
        !Number.isInteger(min) ||
        min < 2 ||
        min > 50 ||
        ![2, 3, 4, 5].includes(multiple)
      )
        throw new Problem(
          422,
          "Use 2–50 complaints and a multiplier between 2 and 5.",
        );
      await run(
        db,
        "INSERT INTO monitor_settings (owner,min_complaints,multiplier,alerts_enabled) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET min_complaints=excluded.min_complaints,multiplier=excluded.multiplier,alerts_enabled=excluded.alerts_enabled",
        owner,
        min,
        multiple,
        body.alerts_enabled ? 1 : 0,
      );
      return out({ saved: true });
    }
    const evidenceMatch = path.match(/^\/alerts\/([\w-]+)\/evidence$/);
    if (evidenceMatch && method === "GET") {
      const alert = await one(
        db,
        "SELECT * FROM monitor_alerts WHERE id=? AND owner=?",
        evidenceMatch[1],
        owner,
      );
      if (!alert) throw new Problem(404, "Alert not found.");
      await ownedBusiness(db, alert.business_id, owner);
      const ids = JSON.parse(alert.evidence) as string[];
      const items = (await reviews(db, alert.business_id, owner)).filter((r) =>
        ids.includes(r.id),
      );
      return out({ items });
    }
    const am = path.match(/^\/alerts\/([\w-]+)\/read$/);
    if (am && method === "POST") {
      const r = await run(
        db,
        "UPDATE monitor_alerts SET read_at=? WHERE id=? AND owner=?",
        iso(),
        am[1],
        owner,
      );
      if (!r.meta.changes) throw new Problem(404, "Alert not found.");
      return out({ saved: true });
    }
    throw new Problem(404, "This monitoring endpoint was not found.");
  } catch (err) {
    return out(
      { detail: (err as Error).message },
      err instanceof Problem ? err.status : 500,
    );
  }
}
