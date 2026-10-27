"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  ExternalLink,
  Globe,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogIn,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { summarizeOnDevice } from "./browser-ai";
type Source = {
  id: string;
  kind: string;
  url: string;
  label: string;
  state: string;
  note: string;
  last_checked: string | null;
  last_success: string | null;
  next_check: string;
  lease_until: number;
  enabled: number;
};
type Review = {
  id: string;
  business_id: string;
  source_id: string;
  body: string;
  title: string;
  author: string;
  rating: number | null;
  sentiment: string;
  topics: string;
  published: string | null;
  first_seen: string;
  external_id?: string;
  url: string;
};
type Stats = {
  all: Count;
  current: Count;
  previous: Count;
  delta: { reviews: number; negative: number; average: number | null };
  undated: number;
  topics: {
    name: string;
    total: number;
    complaints: number;
    current: number;
    previous: number;
    delta: number;
    evidence: string[];
  }[];
  trend: { date: string; total: number; negative: number; positive: number }[];
};
type Count = {
  total: number;
  negative: number;
  positive: number;
  unknown: number;
  rated: number;
  average: number | null;
  negative_share: number | null;
  classified: number;
};
type Business = {
  id: string;
  name: string;
  website: string;
  category: string;
  location: string;
  role: string;
  created: string;
  stats: Stats;
  sources: Source[];
};
type Alert = {
  id: string;
  business_id: string;
  business_name: string;
  title: string;
  body: string;
  evidence: string;
  created: string;
  read_at: string | null;
};
type Data = {
  identity: {
    signed_in: boolean;
    name: string;
    sign_in: string;
    sign_out: string;
  };
  businesses: Business[];
  archived: { id: string; name: string; role: string }[];
  alerts: Alert[];
  settings: {
    min_complaints: number;
    multiplier: number;
    alerts_enabled: number;
  };
  scheduler: { last_run: string; checked: number } | null;
};
type Tab =
  "overview" | "reviews" | "issues" | "competitors" | "sources" | "alerts";
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "reviews", label: "Review inbox", icon: MessageSquareText },
  { id: "issues", label: "Recurring issues", icon: Activity },
  { id: "competitors", label: "Competitors", icon: Users },
  { id: "sources", label: "Sources", icon: Globe },
  { id: "alerts", label: "Alerts", icon: Bell },
] as const;
const categories = [
  "Retail & e-commerce",
  "Restaurants & hospitality",
  "Beauty & wellness",
  "Professional services",
  "Health & fitness",
  "Travel & accommodation",
  "Software & apps",
  "Games & entertainment",
  "Education",
  "Other",
];
const stamp = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not yet";
const number = (v: number | null, suffix = "") =>
  v === null ? "—" : v.toLocaleString("en-GB") + suffix;
const delta = (v: number) => (v > 0 ? `+${v}` : String(v));
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/monitor" + path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value: any = await r.json();
  if (!r.ok)
    throw new Error(value.detail || "The request could not be completed.");
  return value;
}
function download(name: string, content: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ReviewCard({ r, sources }: { r: Review; sources: Source[] }) {
  return (
    <article className="m-review">
      <div className="m-row">
        <span className={`m-pill ${r.sentiment}`}>{r.sentiment}</span>
        <span className="m-dim">
          {r.rating !== null ? `${r.rating} / 5 stars` : "No star rating"} ·{" "}
          {sources.find((s) => s.id === r.source_id)?.label || "Source"}
        </span>
      </div>
      {r.title && <h3>{r.title}</h3>}
      <p>{r.body}</p>
      <div className="m-row m-wrap">
        {JSON.parse(r.topics || "[]").map((t: string) => (
          <span className="m-tag" key={t}>
            {t}
          </span>
        ))}
      </div>
      <div className="m-review-foot">
        <span>
          {r.author} ·{" "}
          {r.published ? stamp(r.published) : "Publication date unavailable"}
        </span>
        <a href={r.url} target="_blank" rel="noreferrer">
          View on source <ExternalLink size={12} />
        </a>
      </div>
    </article>
  );
}
export default function Monitor() {
  const [data, setData] = useState<Data | null>(null),
    [active, setActive] = useState(""),
    [tab, setTab] = useState<Tab>("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [preview, setPreview] = useState(false),
    [wizard, setWizard] = useState(false),
    [archived, setArchived] = useState<string | null>(null);
  const [bName, setBName] = useState(""),
    [website, setWebsite] = useState(""),
    [category, setCategory] = useState(categories[0]),
    [location, setLocation] = useState("");
  const [sourceURL, setSourceURL] = useState(""),
    [sourceKind, setSourceKind] = useState("structured"),
    [sourceLabel, setSourceLabel] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [candidates, setCandidates] = useState<any[]>([]),
    [runs, setRuns] = useState<any[] | null>(null),
    [runsLabel, setRunsLabel] = useState("");
  const [q, setQ] = useState(""),
    [sentiment, setSentiment] = useState(""),
    [topic, setTopic] = useState(""),
    [sourceFilter, setSourceFilter] = useState(""),
    [page, setPage] = useState(1),
    [feed, setFeed] = useState<{ items: Review[]; total: number }>({
      items: [],
      total: 0,
    }),
    [feedBusy, setFeedBusy] = useState(false);
  const [threshold, setThreshold] = useState(3),
    [multiplier, setMultiplier] = useState(2),
    [alertsOn, setAlertsOn] = useState(true),
    [ai, setAi] = useState(""),
    [aiProgress, setAiProgress] = useState("");
  const [alertEvidence, setAlertEvidence] = useState<Record<string, Review[]>>(
    {},
  );
  const abort = useRef<AbortController | null>(null);
  const readSerial = useRef(0);
  const business =
    data?.businesses.find((b) => b.id === active) || data?.businesses[0];
  const own = data?.businesses.find((b) => b.role === "own");
  async function refresh() {
    const result = await api("/dashboard");
    setData(result);
    return result as Data;
  }
  useEffect(() => {
    let alive = true;
    api("/dashboard")
      .then((r) => {
        if (alive) {
          setData(r);
          setThreshold(r.settings.min_complaints);
          setMultiplier(r.settings.multiplier);
          setAlertsOn(!!r.settings.alerts_enabled);
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    const pending = data.businesses.some((b) =>
      b.sources.some(
        (s) => s.state === "pending" || s.lease_until > Date.now(),
      ),
    );
    const timer = setInterval(
      () => {
        refresh().catch(() => {});
      },
      pending ? 4000 : 60000,
    );
    return () => clearInterval(timer);
  }, [
    data?.businesses
      .map((b) => b.sources.map((s) => s.state + ":" + s.lease_until).join())
      .join(),
  ]);
  useEffect(() => {
    setPage(1);
    setAi("");
    setTopic("");
    setSourceFilter("");
    abort.current?.abort();
  }, [business?.id]);
  useEffect(() => {
    if (!business) return;
    const serial = ++readSerial.current;
    let alive = true;
    setFeedBusy(true);
    const params = new URLSearchParams({
      q,
      sentiment,
      topic,
      source: sourceFilter,
      page: String(page),
    });
    api(`/businesses/${business.id}/reviews?${params}`)
      .then((r) => {
        if (alive && serial === readSerial.current) setFeed(r);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setFeedBusy(false));
    return () => {
      alive = false;
    };
  }, [
    business?.id,
    q,
    sentiment,
    topic,
    sourceFilter,
    page,
    business?.stats.all.total,
    business?.sources.map((s) => s.last_checked).join(),
  ]);
  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await act("business", async () => {
      const b = await api("/businesses", "POST", {
        name: bName,
        website,
        category: own?.category || category,
        location,
      });
      setActive(b.id);
      setWizard(false);
      setBName("");
      setWebsite("");
      setLocation("");
      setTab("sources");
      await refresh();
      setNotice(
        "Business added. Its primary source is being checked. Connect review profiles below for wider coverage.",
      );
    });
  }
  function addCompetitor() {
    setCategory(own?.category || categories[0]);
    setWizard(true);
    setBName("");
    setWebsite("");
  }
  async function addSource(event: FormEvent) {
    event.preventDefault();
    if (!business) return;
    await act("source", async () => {
      await api(`/businesses/${business.id}/sources`, "POST", {
        url: sourceURL,
        kind: sourceKind,
        label: sourceLabel,
        confirmed,
      });
      setSourceURL("");
      setConfirmed(false);
      setSourceLabel("");
      await refresh();
      setNotice("Source connected. The first collection is running.");
    });
  }
  async function findProfiles(competitors = false) {
    if (!business) return;
    await act("discover", async () => {
      const r = await api(`/businesses/${business.id}/discover`, "POST", {
        competitors,
      });
      setCandidates(r.candidates);
      setNotice(r.note);
    });
  }
  async function exportBrief() {
    if (!business) return;
    const s = business.stats;
    const lines = [
      `# ${business.name}: reputation report`,
      business.website,
      `Generated ${stamp(new Date().toISOString())}`,
      `Category: ${business.category}. Location: ${business.location || "Not specified"}.`,
      `## Last seven days`,
      `Collected entries: ${s.current.total} (previous seven days: ${s.previous.total})`,
      `Negative: ${s.current.negative} (previous: ${s.previous.negative})`,
      `Average collected star rating: ${number(s.current.average)} from ${s.current.rated} rated entries.`,
      `## Recurring issues`,
      ...s.topics.map(
        (t) =>
          `- ${t.name}: ${t.complaints} negative mentions; this week ${t.current}, previous ${t.previous}.`,
      ),
      "## Source coverage",
      ...business.sources.map(
        (x) =>
          `- ${x.label}: ${x.state}. Last successful check: ${stamp(x.last_success)}. ${x.note}`,
      ),
      "## Evidence",
      ...feed.items.map(
        (r) => `- ${r.body.slice(0, 300)} ([source](${r.url}))`,
      ),
      "## Limits",
      "These statistics describe the collected sample, not all customers or all review platforms. Partial feeds, publication dates, source selection, and rule-based topic matching affect results. Steam recommendations and unrated feed mentions are excluded from star averages. The evidence list is the current inbox page.",
    ];
    download("insightpilot-reputation-report.md", lines.join("\n\n"));
  }
  async function runAi() {
    if (!business) return;
    await act("ai", async () => {
      const items = feed.items.slice(0, 8);
      if (!items.length) throw new Error("Collect reviews first.");
      abort.current = new AbortController();
      const r = await summarizeOnDevice(
        [
          {
            id: business.id,
            title: business.name,
            url: business.website,
            kind: "reviews",
            status: "read",
            text: items
              .map((r, i) => `Review ${i + 1}: ${r.body}`)
              .join("\n")
              .slice(0, 3200),
          },
        ],
        setAiProgress,
        abort.current.signal,
      );
      setAi(r[0]?.summary || "No summary was returned.");
    });
  }
  const unread = data?.alerts.filter((a) => !a.read_at).length || 0;
  const workspaceVisible =
    !!data &&
    (data.identity.signed_in || preview || data.businesses.length > 0);
  const heading = {
    overview: "Your reputation, in perspective.",
    reviews: "Every review has a story.",
    issues: "Find the patterns. Fix the friction.",
    competitors: "Compare on equal terms.",
    sources: "Know where your evidence comes from.",
    alerts: "Catch a change before it grows.",
  }[tab];
  return (
    <div className="monitor-app">
      <aside className="m-sidebar">
        <a href="/" className="m-brand">
          <span>
            <Activity size={22} />
          </span>
          InsightPilot
          <i />
        </a>
        <div className="m-workspace">
          <span className="m-avatar">{(own?.name || "B").slice(0, 1)}</span>
          <div>
            <strong>{own?.name || "Business workspace"}</strong>
            <small>{own?.category || "Reputation monitoring"}</small>
          </div>
        </div>
        <span className="m-nav-label">WORKSPACE</span>
        <nav aria-label="Workspace navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => {
                setTab(n.id);
                setCandidates([]);
                setRuns(null);
              }}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "alerts" && unread > 0 && <b>{unread}</b>}
            </button>
          ))}
        </nav>
        <div className="m-sidebar-note">
          <ShieldCheck size={18} />
          <strong>Evidence over assumptions</strong>
          <p>Real review text. Visible sources. Clear collection limits.</p>
        </div>
        <div className="m-account">
          {data?.identity.signed_in ? (
            <>
              <span>{data.identity.name}</span>
              <a href={data.identity.sign_out} target="_top">
                Sign out
              </a>
            </>
          ) : (
            <>
              <span>Free business edition</span>
              <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                <LogIn size={14} /> Create account / sign in
              </a>
            </>
          )}
        </div>
      </aside>
      <div className="m-main">
        <header className="m-topbar">
          <span>
            Workspace <ChevronRight size={13} />{" "}
            {nav.find((n) => n.id === tab)?.label}
          </span>
          <div>
            <span className="m-live-dot" /> Free monitoring{" "}
            <button
              className="m-icon-btn"
              aria-label="Open alerts"
              onClick={() => setTab("alerts")}
            >
              <Bell size={17} />
              {unread > 0 && <i />}
            </button>
          </div>
        </header>
        <main className="m-content">
          {error && !wizard && (
            <div className="m-banner error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="m-banner" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {archived && (
            <div className="m-banner">
              Business archived. Collection is paused.
              <button
                onClick={() =>
                  act("undo", async () => {
                    await api(`/businesses/${archived}/restore`, "POST");
                    setArchived(null);
                    await refresh();
                  })
                }
              >
                Undo
              </button>
            </div>
          )}
          {!data && !error && (
            <div className="m-empty">
              <LoaderCircle className="spin" /> Loading your workspace…
            </div>
          )}
          {data && !workspaceVisible ? (
            <section className="m-welcome">
              <div className="m-eyebrow">
                BUILT FOR PEOPLE WHO RUN BUSINESSES
              </div>
              <h1>
                Listen continuously.
                <br />
                <em>Act with evidence.</em>
              </h1>
              <p>
                Your business reviews, recurring complaints, weekly changes, and
                competitor context — in one workspace that keeps watching.
              </p>
              <div className="m-row m-wrap">
                <a
                  className="m-primary"
                  href={data.identity.sign_in}
                  target="_top"
                >
                  Create your business workspace <ArrowRight size={17} />
                </a>
                <button
                  className="m-secondary"
                  onClick={() => {
                    setPreview(true);
                    setWizard(true);
                  }}
                >
                  Try in this browser
                </button>
              </div>
              <p className="m-fine">
                Free sign-in with ChatGPT. Account workspaces follow your
                sign-in across devices. Browser previews stay on this device.
              </p>
              <div className="m-feature-grid">
                {[
                  {
                    n: "01",
                    title: "Connect the real sources",
                    body: "Add your business and its review profiles. Supported sources sync automatically; access restrictions stay visible.",
                  },
                  {
                    n: "02",
                    title: "See what changed",
                    body: "Compare the last seven days with the previous week. Open the reviews behind each recurring problem.",
                  },
                  {
                    n: "03",
                    title: "Stay ahead of complaints",
                    body: "Track similar businesses with the same measures. Keep a dedicated inbox for complaint-volume alerts.",
                  },
                ].map((x) => (
                  <div className="m-panel" key={x.n}>
                    <span className="m-eyebrow">{x.n}</span>
                    <h3>{x.title}</h3>
                    <p>{x.body}</p>
                  </div>
                ))}
              </div>
              <div className="m-coverage-strip">
                <Globe size={18} />
                <span>
                  For shops, cafés, salons, local services, software, and more.
                  Coverage depends on the review platforms they use.
                </span>
              </div>
            </section>
          ) : (
            workspaceVisible && (
              <>
                <div className="m-heading">
                  <div>
                    <div className="m-eyebrow">
                      BUSINESS REPUTATION /{" "}
                      {nav.find((n) => n.id === tab)?.label.toUpperCase()}
                    </div>
                    <h1>{heading}</h1>
                    <p>
                      {business
                        ? `${business.name} · ${business.category}${business.location ? " · " + business.location : ""}`
                        : "Start with your business. Add its review profiles to begin monitoring."}
                    </p>
                  </div>
                  <div className="m-row m-wrap">
                    {business && (
                      <button className="m-secondary" onClick={exportBrief}>
                        <ArrowDownToLine size={16} /> Export report
                      </button>
                    )}
                    {data.businesses.length < 4 && (
                      <button className="m-primary" onClick={addCompetitor}>
                        <Plus size={17} />
                        {own ? "Add competitor" : "Add your business"}
                      </button>
                    )}
                  </div>
                </div>
                {data.businesses.length > 0 && (
                  <div className="m-business-switch">
                    <label>
                      <span>Viewing</span>
                      <select
                        aria-label="Active business"
                        value={business?.id}
                        onChange={(e) => {
                          setActive(e.target.value);
                          setCandidates([]);
                          setRuns(null);
                        }}
                      >
                        {data.businesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                            {b.role === "own"
                              ? " · Your business"
                              : " · Competitor"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="m-pill neutral">
                      {business?.role === "own"
                        ? "Your business"
                        : "Competitor"}
                    </span>
                    {business && (
                      <button
                        className="m-text-button"
                        onClick={() =>
                          act("archive", async () => {
                            await api(`/businesses/${business.id}`, "DELETE");
                            setArchived(business.id);
                            setActive("");
                            await refresh();
                          })
                        }
                      >
                        <Trash2 size={14} /> Archive
                      </button>
                    )}
                  </div>
                )}
                {!business && (
                  <div className="m-empty m-panel">
                    <Globe size={32} />
                    <h2>A workspace built around your business.</h2>
                    <p>
                      Add its name, website, category, and location. Then
                      connect the exact review profiles you want to track.
                    </p>
                    <button
                      className="m-primary"
                      onClick={() => setWizard(true)}
                    >
                      <Plus size={16} /> Add your business
                    </button>
                  </div>
                )}
                {business && (
                  <>
                    {tab === "overview" && (
                      <>
                        <div className="m-period">
                          <span>
                            <span className="m-live-dot" /> LAST 7 DAYS{" "}
                            <span className="m-dim">
                              vs previous 7 days · publication dates · rolling
                              UTC windows
                            </span>
                          </span>
                          <span className="m-dim">
                            Monitoring since{" "}
                            {new Date(business.created).toLocaleDateString(
                              "en-GB",
                            )}
                          </span>
                        </div>
                        <div className="m-metrics">
                          {[
                            {
                              label: "Reviews collected",
                              value: business.stats.current.total,
                              change: `${delta(business.stats.delta.reviews)} vs previous week`,
                              tone: "lime",
                              icon: MessageSquareText,
                            },
                            {
                              label: "Average star rating",
                              value: number(business.stats.current.average),
                              change: `${business.stats.current.rated} rated reviews · ${number(business.stats.delta.average)} change`,
                              tone: "blue",
                              icon: BarChart3,
                            },
                            {
                              label: "Negative reviews",
                              value: business.stats.current.negative,
                              change: `${delta(business.stats.delta.negative)} vs previous week`,
                              tone: "terra",
                              icon: TrendingUp,
                            },
                            {
                              label: "Connected sources",
                              value: `${business.sources.filter((s) => s.enabled && s.last_success).length} / ${business.sources.length}`,
                              change: `${business.stats.all.total} entries saved in total`,
                              tone: "sand",
                              icon: Globe,
                            },
                          ].map((m) => (
                            <div className={"m-metric " + m.tone} key={m.label}>
                              <div>
                                {m.label}
                                <m.icon size={18} />
                              </div>
                              <strong>{m.value}</strong>
                              <small>{m.change}</small>
                            </div>
                          ))}
                        </div>
                        <div className="m-two-col">
                          <section className="m-panel">
                            <div className="m-panel-head">
                              <div>
                                <div className="m-eyebrow">
                                  THE LAST TWO WEEKS
                                </div>
                                <h2>Review activity</h2>
                              </div>
                              <span className="m-dim">
                                <i className="m-legend negative" /> Negative{" "}
                                <i className="m-legend positive" /> Other
                              </span>
                            </div>
                            <div
                              className="m-chart"
                              role="img"
                              aria-label="Review counts by publication date for the last fourteen days"
                            >
                              {business.stats.trend.map((d) => (
                                <div
                                  className="m-chart-day"
                                  key={d.date}
                                  title={`${d.date}: ${d.total} reviews, ${d.negative} negative`}
                                >
                                  <span>{d.total || ""}</span>
                                  <div
                                    className="m-chart-bar"
                                    style={{
                                      height: Math.max(
                                        3,
                                        (d.total /
                                          Math.max(
                                            1,
                                            ...business.stats.trend.map(
                                              (t) => t.total,
                                            ),
                                          )) *
                                          120,
                                      ),
                                    }}
                                  >
                                    <i
                                      style={{
                                        height: `${d.total ? (d.negative / d.total) * 100 : 0}%`,
                                      }}
                                    />
                                  </div>
                                  <small>{d.date.slice(8)}</small>
                                </div>
                              ))}
                            </div>
                            <p className="m-fine">
                              Counts reflect the collected sample. A zero can
                              mean no collected entries, not no customer
                              activity.
                            </p>
                          </section>
                          <section className="m-panel">
                            <div className="m-panel-head">
                              <div>
                                <div className="m-eyebrow">
                                  WHERE TO LOOK FIRST
                                </div>
                                <h2>Recurring complaints</h2>
                              </div>
                              <button
                                className="m-text-button"
                                onClick={() => setTab("issues")}
                              >
                                View all <ArrowRight size={14} />
                              </button>
                            </div>
                            {business.stats.topics
                              .filter((t) => t.complaints >= 2)
                              .slice(0, 4)
                              .map((t) => (
                                <button
                                  className="m-topic-row"
                                  key={t.name}
                                  onClick={() => {
                                    setTopic(t.name);
                                    setSentiment("negative");
                                    setPage(1);
                                    setTab("reviews");
                                  }}
                                >
                                  <span>
                                    {t.name}
                                    <small>
                                      {t.current} this week · {t.previous}{" "}
                                      previous week
                                    </small>
                                  </span>
                                  <strong>
                                    {t.complaints}
                                    <ChevronRight size={15} />
                                  </strong>
                                </button>
                              ))}
                            {!business.stats.topics.some(
                              (t) => t.complaints >= 2,
                            ) && (
                              <div className="m-quiet">
                                No repeated complaint pattern in the collected
                                reviews yet. We need at least two matching
                                negative reviews.
                              </div>
                            )}
                          </section>
                        </div>
                        <div className="m-banner m-method">
                          <ShieldCheck size={19} />
                          <span>
                            <strong>Statistics you can inspect.</strong> Ratings
                            and simple text rules classify feedback.{" "}
                            {business.stats.undated} entries have no usable
                            publication date and are excluded from weekly
                            comparisons. Historical feed coverage may be
                            partial.
                          </span>
                        </div>
                        <section className="m-panel">
                          <div className="m-panel-head">
                            <div>
                              <div className="m-eyebrow">COLLECTION HEALTH</div>
                              <h2>Freshness & coverage</h2>
                            </div>
                            <button
                              className="m-text-button"
                              onClick={() => setTab("sources")}
                            >
                              Manage sources <ArrowRight size={14} />
                            </button>
                          </div>
                          {business.sources.length ? (
                            business.sources.map((s) => (
                              <div className="m-source-line" key={s.id}>
                                <Globe size={17} />
                                <div>
                                  <strong>{s.label}</strong>
                                  <small>
                                    {s.kind} · Last successful check:{" "}
                                    {stamp(s.last_success)}
                                  </small>
                                </div>
                                <span
                                  className={
                                    "m-pill " +
                                    (s.state === "error"
                                      ? "negative"
                                      : s.state === "ready"
                                        ? "positive"
                                        : "neutral")
                                  }
                                >
                                  {s.enabled ? s.state : "paused"}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="m-dim">
                              No connected sources. Add a review profile to
                              start collecting.
                            </p>
                          )}
                        </section>
                      </>
                    )}
                    {tab === "reviews" && (
                      <>
                        <div className="m-filters">
                          <label className="m-search">
                            <Search size={16} />
                            <input
                              aria-label="Search reviews"
                              placeholder="Search review text…"
                              value={q}
                              onChange={(e) => {
                                setQ(e.target.value);
                                setPage(1);
                              }}
                            />
                          </label>
                          <select
                            aria-label="Sentiment filter"
                            value={sentiment}
                            onChange={(e) => {
                              setSentiment(e.target.value);
                              setPage(1);
                            }}
                          >
                            <option value="">All sentiment</option>
                            {["negative", "positive", "neutral", "unknown"].map(
                              (v) => (
                                <option key={v}>{v}</option>
                              ),
                            )}
                          </select>
                          <select
                            aria-label="Topic filter"
                            value={topic}
                            onChange={(e) => {
                              setTopic(e.target.value);
                              setPage(1);
                            }}
                          >
                            <option value="">All topics</option>
                            {business.stats.topics.map((t) => (
                              <option key={t.name}>{t.name}</option>
                            ))}
                          </select>
                          <select
                            aria-label="Source filter"
                            value={sourceFilter}
                            onChange={(e) => {
                              setSourceFilter(e.target.value);
                              setPage(1);
                            }}
                          >
                            <option value="">All sources</option>
                            {business.sources.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="m-panel-head">
                          <span className="m-dim">
                            {feed.total} matching entries{" "}
                            {feedBusy ? "· Updating…" : ""}
                          </span>
                          <button
                            className="m-secondary"
                            disabled={!!busy || !feed.items.length}
                            onClick={runAi}
                          >
                            <Sparkles size={16} />
                            {busy === "ai"
                              ? "Summarizing…"
                              : "Summarize this page with free AI"}
                          </button>
                        </div>
                        {busy === "ai" && (
                          <div className="m-banner">
                            {aiProgress || "Starting the on-device model…"}
                            <button onClick={() => abort.current?.abort()}>
                              Cancel
                            </button>
                          </div>
                        )}
                        {ai && (
                          <section className="m-panel">
                            <div className="m-eyebrow">
                              ON-DEVICE SUMMARY · CHECK THE ORIGINAL REVIEWS
                            </div>
                            <p>{ai}</p>
                            <p className="m-fine">
                              Based on excerpts from up to eight reviews on this
                              inbox page. Model output may miss context. Your
                              statistics are computed from stored reviews,
                              independently of this summary.
                            </p>
                          </section>
                        )}
                        <p className="m-fine">
                          Optional AI downloads a model to your device on the
                          first run (several hundred MB). No paid API is used.
                        </p>
                        <div className="m-review-list">
                          {feed.items.map((r) => (
                            <ReviewCard
                              key={r.id}
                              r={r}
                              sources={business.sources}
                            />
                          ))}
                        </div>
                        {!feed.items.length && (
                          <div className="m-empty m-panel">
                            <MessageSquareText size={30} />
                            <h2>No matching reviews yet.</h2>
                            <p>
                              Connect an accessible source or change the
                              filters. Restricted sources do not create sample
                              reviews.
                            </p>
                            <button
                              className="m-secondary"
                              onClick={() => setTab("sources")}
                            >
                              Manage sources <ArrowRight size={15} />
                            </button>
                          </div>
                        )}
                        <div className="m-pagination">
                          <button
                            className="m-secondary"
                            disabled={page <= 1 || feedBusy}
                            onClick={() => setPage((p) => p - 1)}
                          >
                            Previous
                          </button>
                          <span>
                            Page {page} of{" "}
                            {Math.max(1, Math.ceil(feed.total / 20))}
                          </span>
                          <button
                            className="m-secondary"
                            disabled={page * 20 >= feed.total || feedBusy}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            Next
                          </button>
                        </div>
                      </>
                    )}
                    {tab === "issues" && (
                      <>
                        <div className="m-banner">
                          <Activity size={18} />
                          <span>
                            Topics use transparent keyword rules, with ratings
                            taking priority for sentiment. Counts can overlap
                            when a review mentions several topics. Open the
                            evidence to validate a pattern.
                          </span>
                        </div>
                        <div className="m-issue-grid">
                          {business.stats.topics
                            .filter((t) => t.complaints >= 2)
                            .map((t) => (
                              <section className="m-panel" key={t.name}>
                                <div className="m-row m-between">
                                  <span className="m-pill negative">
                                    {t.complaints} negative mentions
                                  </span>
                                  <Activity size={18} />
                                </div>
                                <h2>{t.name}</h2>
                                <p className="m-dim">
                                  {t.current} this week vs {t.previous} last
                                  week · {delta(t.delta)} change
                                </p>
                                <p>
                                  {t.name === "Pricing & billing"
                                    ? "Inspect the recurring payment and pricing complaints before changing policies."
                                    : t.name === "Customer support"
                                      ? "Check the repeated service issues and share the evidence with your team."
                                      : "Review the matching complaints to identify a specific, actionable cause."}
                                </p>
                                <button
                                  className="m-secondary"
                                  onClick={() => {
                                    setTopic(t.name);
                                    setSentiment("negative");
                                    setPage(1);
                                    setTab("reviews");
                                  }}
                                >
                                  Read supporting reviews{" "}
                                  <ArrowRight size={15} />
                                </button>
                              </section>
                            ))}
                        </div>
                        {!business.stats.topics.some(
                          (t) => t.complaints >= 2,
                        ) && (
                          <div className="m-empty m-panel">
                            <Check size={30} />
                            <h2>No recurring issue detected.</h2>
                            <p>
                              Patterns appear after at least two negative
                              reviews match the same topic. This is not proof
                              that your business has no problems.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {tab === "competitors" && (
                      <>
                        <div className="m-banner">
                          <Users size={18} />
                          <span>
                            All businesses use the same seven-day windows and
                            topic rules. Compare similar locations, source
                            types, and storefront countries. Different source
                            samples are not a market ranking.
                          </span>
                        </div>
                        <div className="m-table-wrap m-panel">
                          <table>
                            <thead>
                              <tr>
                                <th>Business</th>
                                <th>7-day reviews</th>
                                <th>Star average</th>
                                <th>Negative</th>
                                <th>WoW change</th>
                                <th>Sources</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.businesses.map((b) => (
                                <tr key={b.id}>
                                  <td>
                                    <button
                                      className="m-text-button"
                                      onClick={() => {
                                        setActive(b.id);
                                        setTab("overview");
                                      }}
                                    >
                                      {b.name}
                                    </button>
                                    <small>
                                      {b.role === "own"
                                        ? "Your business"
                                        : b.category}{" "}
                                      · {b.location || "Location not set"}
                                    </small>
                                  </td>
                                  <td>{b.stats.current.total}</td>
                                  <td>
                                    {number(b.stats.current.average)}
                                    <small>{b.stats.current.rated} rated</small>
                                  </td>
                                  <td>
                                    {b.stats.current.negative}
                                    <small>
                                      {number(
                                        b.stats.current.negative_share,
                                        "%",
                                      )}{" "}
                                      of {b.stats.current.classified} classified
                                    </small>
                                  </td>
                                  <td>
                                    {delta(b.stats.delta.reviews)} reviews
                                  </td>
                                  <td>
                                    {b.sources
                                      .map(
                                        (s) =>
                                          s.kind +
                                          (s.kind === "appstore"
                                            ? " / " +
                                              new URL(s.url).pathname.split(
                                                "/",
                                              )[1]
                                            : ""),
                                      )
                                      .join(", ") || "None"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <section className="m-panel">
                          <div className="m-panel-head">
                            <div>
                              <div className="m-eyebrow">
                                THE SAME CRITERIA FOR EVERY BUSINESS
                              </div>
                              <h2>Complaint topics, this week</h2>
                            </div>
                          </div>
                          <div className="m-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Topic</th>
                                  {data.businesses.map((b) => (
                                    <th key={b.id}>{b.name}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from(
                                  new Set(
                                    data.businesses.flatMap((b) =>
                                      b.stats.topics.map((t) => t.name),
                                    ),
                                  ),
                                ).map((name) => (
                                  <tr key={name}>
                                    <td>{name}</td>
                                    {data.businesses.map((b) => (
                                      <td key={b.id}>
                                        {b.stats.topics.find(
                                          (t) => t.name === name,
                                        )?.current || 0}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                        <section className="m-panel">
                          <h2>Find comparable businesses</h2>
                          <p className="m-dim">
                            Use your category and location as a starting point.
                            Suggestions are public search matches, not verified
                            competitors. Add the exact business and confirm its
                            review profiles.
                          </p>
                          <div className="m-row m-wrap">
                            <a
                              className="m-secondary"
                              href={
                                "https://www.bing.com/search?q=" +
                                encodeURIComponent(
                                  `${own?.category || business.category} ${own?.location || business.location} businesses reviews`,
                                )
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explore similar businesses{" "}
                              <ExternalLink size={14} />
                            </a>
                            <button
                              className="m-secondary"
                              disabled={!!busy}
                              onClick={() => findProfiles(true)}
                            >
                              <Search size={14} /> Find competitor suggestions
                            </button>
                            <button
                              className="m-primary"
                              onClick={addCompetitor}
                            >
                              <Plus size={16} /> Add a competitor
                            </button>
                          </div>
                          {candidates.map((c) => (
                            <div className="m-candidate" key={c.url}>
                              <a href={c.url} target="_blank" rel="noreferrer">
                                {c.title}
                                <ExternalLink size={12} />
                              </a>
                              <p className="m-dim">{c.snippet}</p>
                              <button
                                className="m-text-button"
                                onClick={() => {
                                  addCompetitor();
                                  setWebsite(c.url);
                                  setBName("");
                                }}
                              >
                                Review and add this business{" "}
                                <ArrowRight size={13} />
                              </button>
                            </div>
                          ))}
                          <p className="m-fine">
                            Competitors are added by you after checking their
                            business identity; the app does not guess
                            competitors or import unrelated reviews.
                          </p>
                        </section>
                      </>
                    )}
                    {tab === "sources" && (
                      <>
                        <div className="m-two-col m-sources-layout">
                          <section className="m-panel">
                            <div className="m-panel-head">
                              <div>
                                <div className="m-eyebrow">
                                  CONNECTED TO {business.name.toUpperCase()}
                                </div>
                                <h2>Review sources</h2>
                              </div>
                              <span className="m-pill neutral">
                                {business.sources.length} / 3
                              </span>
                            </div>
                            {business.sources.map((s) => (
                              <article className="m-source-card" key={s.id}>
                                <div className="m-row m-between">
                                  <strong>{s.label}</strong>
                                  <span
                                    className={
                                      "m-pill " +
                                      (s.state === "error"
                                        ? "negative"
                                        : s.state === "ready"
                                          ? "positive"
                                          : "neutral")
                                    }
                                  >
                                    {s.enabled ? s.state : "paused"}
                                  </span>
                                </div>
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="m-source-url"
                                >
                                  {s.url}
                                  <ExternalLink size={12} />
                                </a>
                                <p>{s.note}</p>
                                <dl>
                                  <dt>Last check</dt>
                                  <dd>{stamp(s.last_checked)}</dd>
                                  <dt>Last success</dt>
                                  <dd>{stamp(s.last_success)}</dd>
                                  <dt>Next eligible check</dt>
                                  <dd>
                                    {s.enabled ? stamp(s.next_check) : "Paused"}
                                  </dd>
                                </dl>
                                <div className="m-row m-wrap">
                                  <button
                                    className="m-secondary"
                                    disabled={!!busy || !s.enabled}
                                    onClick={() =>
                                      act(s.id, async () => {
                                        await api(
                                          `/sources/${s.id}/refresh`,
                                          "POST",
                                        );
                                        setNotice(
                                          "Collection queued. The source status will update automatically.",
                                        );
                                        await refresh();
                                      })
                                    }
                                  >
                                    <RefreshCw size={14} /> Check now
                                  </button>
                                  <button
                                    className="m-text-button"
                                    disabled={!!busy}
                                    onClick={() =>
                                      act(s.id, async () => {
                                        await api(`/sources/${s.id}`, "PATCH", {
                                          enabled: !s.enabled,
                                        });
                                        await refresh();
                                      })
                                    }
                                  >
                                    {s.enabled ? "Pause" : "Resume"}
                                  </button>
                                  <button
                                    className="m-text-button"
                                    onClick={() =>
                                      act("runs", async () => {
                                        const r = await api(`/sources/${s.id}`);
                                        setRuns(r.runs);
                                        setRunsLabel(s.label);
                                      })
                                    }
                                  >
                                    Collection history
                                  </button>
                                </div>
                              </article>
                            ))}
                          </section>
                          <section className="m-panel">
                            <div className="m-eyebrow">NO SPREADSHEETS</div>
                            <h2>Connect a review profile</h2>
                            <p className="m-dim">
                              Paste the exact profile or feed URL for this
                              business. App Store and Steam links are detected
                              automatically.
                            </p>
                            <form className="m-form" onSubmit={addSource}>
                              <label>
                                Review profile URL
                                <input
                                  type="url"
                                  required
                                  aria-label="Review profile URL"
                                  placeholder="https://…"
                                  value={sourceURL}
                                  onChange={(e) => setSourceURL(e.target.value)}
                                />
                              </label>
                              <label>
                                Source label
                                <input
                                  maxLength={80}
                                  placeholder="e.g. Store reviews · United Kingdom"
                                  value={sourceLabel}
                                  onChange={(e) =>
                                    setSourceLabel(e.target.value)
                                  }
                                />
                              </label>
                              <label>
                                Page format
                                <select
                                  value={sourceKind}
                                  onChange={(e) =>
                                    setSourceKind(e.target.value)
                                  }
                                >
                                  <option value="structured">
                                    Public page with structured reviews
                                  </option>
                                  <option value="rss">
                                    RSS / Atom feedback feed
                                  </option>
                                </select>
                              </label>
                              <label className="m-checkbox">
                                <input
                                  type="checkbox"
                                  checked={confirmed}
                                  onChange={(e) =>
                                    setConfirmed(e.target.checked)
                                  }
                                  required
                                />{" "}
                                I checked that this profile belongs to{" "}
                                {business.name}.
                              </label>
                              <button
                                className="m-primary"
                                disabled={
                                  !!busy || business.sources.length >= 3
                                }
                              >
                                <Plus size={16} /> Connect source
                              </button>
                            </form>
                            <hr />
                            <h3>Not sure where to start?</h3>
                            <p className="m-dim">
                              Search public profiles by business name and
                              location, then verify the match.
                            </p>
                            <button
                              className="m-secondary"
                              disabled={!!busy}
                              onClick={() => findProfiles()}
                            >
                              <Search size={15} /> Find review profiles
                            </button>
                            {candidates.map((c) => (
                              <div className="m-candidate" key={c.url}>
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {c.title}
                                  <ExternalLink size={12} />
                                </a>
                                <small>{new URL(c.url).hostname}</small>
                                <button
                                  className="m-text-button"
                                  onClick={() => {
                                    setSourceURL(c.url);
                                    setConfirmed(false);
                                    setSourceLabel(new URL(c.url).hostname);
                                  }}
                                >
                                  Use this link <ArrowRight size={13} />
                                </button>
                              </div>
                            ))}
                          </section>
                        </div>
                        <section className="m-panel">
                          <h2>Source availability</h2>
                          <div className="m-adapter-grid">
                            {[
                              {
                                name: "Public review pages",
                                status: "Available when exposed",
                                body: "Reads individual Schema.org Review records. Access policies and robots.txt are respected. Curated testimonials are labeled by their source.",
                              },
                              {
                                name: "RSS / Atom",
                                status: "Available",
                                body: "Collects published feed entries. Unrated entries are mentions and do not contribute to the star average.",
                              },
                              {
                                name: "Apple App Store",
                                status: "Public RSS",
                                body: "Latest 50 written reviews for the chosen storefront country. The feed can be incomplete or temporarily unavailable.",
                              },
                              {
                                name: "Steam",
                                status: "Public Web API",
                                body: "Latest 100 English reviews. Positive and negative recommendations remain separate from star ratings.",
                              },
                              {
                                name: "Google Business Profile",
                                status: "Owner integration required",
                                body: "Requires approved Google API access and authorization to the business location. Not connected in this free edition.",
                              },
                              {
                                name: "Trustpilot, Yelp & other platforms",
                                status: "Provider integration required",
                                body: "Not collected by bypassing platform restrictions. Add an authorized public review feed when available.",
                              },
                            ].map((a) => (
                              <div key={a.name}>
                                <h3>{a.name}</h3>
                                <span className="m-tag">{a.status}</span>
                                <p>{a.body}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                        {runs && (
                          <section className="m-panel">
                            <div className="m-panel-head">
                              <h2>{runsLabel} · Collection history</h2>
                              <button
                                aria-label="Close collection history"
                                className="m-icon-btn"
                                onClick={() => setRuns(null)}
                              >
                                <X size={18} />
                              </button>
                            </div>
                            {runs.length ? (
                              runs.map((r) => (
                                <div className="m-run" key={r.id}>
                                  <strong>
                                    {stamp(r.started)} · {r.state}
                                  </strong>
                                  <p>{r.note}</p>
                                  <small>
                                    {r.added} new · {r.updated} updated ·{" "}
                                    {r.fetched} fetched
                                  </small>
                                </div>
                              ))
                            ) : (
                              <p>No collection runs yet.</p>
                            )}
                          </section>
                        )}
                      </>
                    )}
                    {tab === "alerts" && (
                      <>
                        <div className="m-two-col">
                          <section className="m-panel">
                            <div className="m-panel-head">
                              <div>
                                <div className="m-eyebrow">
                                  YOUR NOTIFICATION INBOX
                                </div>
                                <h2>Complaint signals</h2>
                              </div>
                              <span className="m-pill neutral">
                                {unread} unread
                              </span>
                            </div>
                            {data.alerts.length ? (
                              data.alerts.map((a) => (
                                <article
                                  className={
                                    "m-alert-card " + (a.read_at ? "read" : "")
                                  }
                                  key={a.id}
                                >
                                  <div className="m-row m-between">
                                    <span className="m-pill negative">
                                      {a.business_name}
                                    </span>
                                    <small>{stamp(a.created)}</small>
                                  </div>
                                  <h3>{a.title}</h3>
                                  <p>{a.body}</p>
                                  <div className="m-row m-wrap">
                                    <button
                                      className="m-secondary"
                                      onClick={() =>
                                        act("evidence", async () => {
                                          const r = await api(
                                            `/alerts/${a.id}/evidence`,
                                          );
                                          setAlertEvidence((old) => ({
                                            ...old,
                                            [a.id]: r.items,
                                          }));
                                        })
                                      }
                                    >
                                      Inspect supporting reviews{" "}
                                      <ArrowRight size={14} />
                                    </button>
                                    {!a.read_at && (
                                      <button
                                        className="m-text-button"
                                        onClick={() =>
                                          act(a.id, async () => {
                                            await api(
                                              `/alerts/${a.id}/read`,
                                              "POST",
                                            );
                                            await refresh();
                                          })
                                        }
                                      >
                                        <Check size={14} /> Mark read
                                      </button>
                                    )}
                                  </div>
                                  {alertEvidence[a.id]?.map((r) => (
                                    <ReviewCard
                                      key={r.id}
                                      r={r}
                                      sources={
                                        data.businesses.find(
                                          (b) => b.id === a.business_id,
                                        )?.sources || []
                                      }
                                    />
                                  ))}
                                </article>
                              ))
                            ) : (
                              <div className="m-quiet">
                                <Bell size={25} />
                                <h3>No complaint spike detected.</h3>
                                <p>
                                  Alerts start after the first successful
                                  collection establishes a baseline. A later
                                  collection must bring new reviews and cross
                                  your threshold.
                                </p>
                              </div>
                            )}
                          </section>
                          <section className="m-panel">
                            <Settings2 size={22} />
                            <h2>Alert thresholds</h2>
                            <p className="m-dim">
                              Notify when negative review volume in the last
                              seven days reaches both the minimum count and your
                              chosen increase over the previous week.
                            </p>
                            <form
                              className="m-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                act("settings", async () => {
                                  await api("/settings", "PATCH", {
                                    min_complaints: threshold,
                                    multiplier,
                                    alerts_enabled: alertsOn,
                                  });
                                  await refresh();
                                  setNotice("Alert preferences saved.");
                                });
                              }}
                            >
                              <label>
                                Minimum negative reviews
                                <input
                                  type="number"
                                  min={2}
                                  max={50}
                                  value={threshold}
                                  onChange={(e) =>
                                    setThreshold(Number(e.target.value))
                                  }
                                />
                              </label>
                              <label>
                                Increase over previous week
                                <select
                                  value={multiplier}
                                  onChange={(e) =>
                                    setMultiplier(Number(e.target.value))
                                  }
                                >
                                  {[2, 3, 4, 5].map((n) => (
                                    <option key={n} value={n}>
                                      {n}× as many negative reviews
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="m-checkbox">
                                <input
                                  type="checkbox"
                                  checked={alertsOn}
                                  onChange={(e) =>
                                    setAlertsOn(e.target.checked)
                                  }
                                />{" "}
                                Enable in-app complaint alerts
                              </label>
                              <button className="m-primary" disabled={!!busy}>
                                Save preferences
                              </button>
                            </form>
                            <p className="m-fine">
                              One notification per topic per business per UTC
                              day. If the previous week has zero negatives, the
                              comparison uses a baseline of one. Alerts are
                              delivered in this inbox; email and push delivery
                              are not connected.
                            </p>
                          </section>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )
          )}
          {!!data?.archived?.length && (
            <details className="m-panel">
              <summary>Archived businesses ({data.archived.length})</summary>
              {data.archived.map((b) => (
                <div className="m-source-line" key={b.id}>
                  <strong>{b.name}</strong>
                  <button
                    className="m-text-button"
                    onClick={() =>
                      act("restore", async () => {
                        await api(`/businesses/${b.id}/restore`, "POST");
                        setArchived(null);
                        setPreview(true);
                        await refresh();
                      })
                    }
                  >
                    Restore monitor
                  </button>
                </div>
              ))}
            </details>
          )}
          <footer className="m-footer">
            <span>InsightPilot · Built for everyday business decisions.</span>
            <span>
              {data?.scheduler
                ? `Cloud collector last ran ${stamp(data.scheduler.last_run)}`
                : "Cloud collector: awaiting first scheduled check"}
            </span>
          </footer>
        </main>
      </div>
      {wizard && (
        <div className="m-modal-backdrop">
          <section
            className="m-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="business-title"
          >
            <div className="m-panel-head">
              <div>
                <div className="m-eyebrow">
                  {own
                    ? "YOUR COMPETITIVE LANDSCAPE"
                    : "YOUR BUSINESS WORKSPACE"}
                </div>
                <h2 id="business-title">
                  {own
                    ? "Add a comparable business"
                    : "Start monitoring your business"}
                </h2>
              </div>
              <button
                className="m-icon-btn"
                aria-label="Close business form"
                onClick={() => setWizard(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="m-dim">
              No ownership claim is verified by adding a business. Review
              profiles are confirmed separately.
            </p>
            {error && (
              <div className="m-banner error" role="alert">
                {error}
              </div>
            )}
            <form className="m-form" onSubmit={create}>
              <label>
                Business name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={bName}
                  onChange={(e) => setBName(e.target.value)}
                  placeholder="Your business name"
                />
              </label>
              <label>
                Business website or product profile
                <input
                  type="url"
                  required
                  maxLength={2000}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://your-business.com"
                />
              </label>
              <label>
                Business category
                <select
                  value={own?.category || category}
                  disabled={!!own}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                City or market
                <input
                  maxLength={100}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Vilnius, Lithuania or UK online"
                />
              </label>
              <p className="m-fine">
                One business and up to three competitors. Up to three sources
                and 5,000 saved reviews per business. Source eligibility is
                checked automatically.
              </p>
              <button className="m-primary" disabled={!!busy}>
                <Plus size={16} />
                {busy === "business" ? "Creating…" : "Create business monitor"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
