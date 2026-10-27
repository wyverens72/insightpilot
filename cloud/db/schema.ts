import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const documents = sqliteTable("workspace_documents", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  kind: text("kind").notNull(),
  created: text("created").notNull(),
  value: text("value").notNull(),
  leaseUntil: integer("lease_until").notNull().default(0),
});
export const quotas = sqliteTable("daily_quotas", {
  id: text("id").primaryKey(),
  count: integer("count").notNull().default(0),
});

export const monitorBusinesses = sqliteTable(
  "monitor_businesses",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    website: text("website").notNull(),
    category: text("category").notNull(),
    location: text("location").notNull(),
    role: text("role").notNull(),
    created: text("created").notNull(),
    archived: integer("archived").notNull().default(0),
  },
  (t) => [index("monitor_business_owner").on(t.owner, t.archived)],
);
export const monitorSources = sqliteTable(
  "monitor_sources",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").notNull(),
    owner: text("owner").notNull(),
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    label: text("label").notNull(),
    state: text("state").notNull(),
    note: text("note").notNull(),
    lastChecked: text("last_checked"),
    lastSuccess: text("last_success"),
    nextCheck: text("next_check").notNull(),
    leaseUntil: integer("lease_until").notNull().default(0),
    enabled: integer("enabled").notNull().default(1),
    created: text("created").notNull(),
  },
  (t) => [
    index("monitor_source_due").on(t.enabled, t.nextCheck),
    index("monitor_source_business").on(t.businessId, t.owner),
  ],
);
export const monitorReviews = sqliteTable(
  "monitor_reviews",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    businessId: text("business_id").notNull(),
    owner: text("owner").notNull(),
    externalId: text("external_id").notNull(),
    author: text("author").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    rating: integer("rating"),
    sentiment: text("sentiment").notNull(),
    topics: text("topics").notNull(),
    published: text("published"),
    firstSeen: text("first_seen").notNull(),
    lastSeen: text("last_seen").notNull(),
    url: text("url").notNull(),
    language: text("language").notNull(),
  },
  (t) => [
    index("monitor_review_business").on(t.businessId, t.owner, t.published),
  ],
);
export const monitorRuns = sqliteTable(
  "monitor_runs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    businessId: text("business_id").notNull(),
    owner: text("owner").notNull(),
    started: text("started").notNull(),
    finished: text("finished").notNull(),
    state: text("state").notNull(),
    added: integer("added").notNull(),
    updated: integer("updated").notNull(),
    fetched: integer("fetched").notNull(),
    note: text("note").notNull(),
  },
  (t) => [index("monitor_runs_source").on(t.sourceId, t.started)],
);
export const monitorAlerts = sqliteTable(
  "monitor_alerts",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").notNull(),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidence: text("evidence").notNull(),
    created: text("created").notNull(),
    readAt: text("read_at"),
    dedupe: text("dedupe").notNull(),
  },
  (t) => [index("monitor_alert_owner").on(t.owner, t.created)],
);
export const monitorSettings = sqliteTable("monitor_settings", {
  owner: text("owner").primaryKey(),
  minComplaints: integer("min_complaints").notNull().default(3),
  multiplier: integer("multiplier").notNull().default(2),
  alertsEnabled: integer("alerts_enabled").notNull().default(1),
});
export const monitorState = sqliteTable("monitor_state", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
});
