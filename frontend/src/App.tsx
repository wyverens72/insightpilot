import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { request } from "./api";
import type { Brief, Dashboard, ImportResult, ReviewPage } from "./api";

type View = "overview" | "reviews" | "brief";
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "reviews", label: "Review explorer", icon: MessageSquareText },
  { id: "brief", label: "Insight brief", icon: Sparkles },
] as const;
const labels: Record<View, string> = {
  overview: "Overview",
  reviews: "Review explorer",
  brief: "Insight brief",
};

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [reviews, setReviews] = useState<ReviewPage | null>(null);
  const [source, setSource] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const briefRequest = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const params = new URLSearchParams({
    ...(source ? { source } : {}),
    ...(sentiment ? { sentiment } : {}),
    ...(query ? { q: query } : {}),
  }).toString();

  useEffect(() => {
    request<{ ai_configured: boolean }>("/health")
      .then((data) => setAiConfigured(data.ai_configured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      request<Dashboard>(`/dashboard?${params}`, { signal: controller.signal }),
      request<ReviewPage>(`/reviews?${params}&page=${page}`, {
        signal: controller.signal,
      }),
    ])
      .then(([data, rows]) => {
        setDashboard(data);
        setReviews(rows);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Unable to connect to the API.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, page, revision]);
  useEffect(() => {
    briefRequest.current += 1;
    setBrief(null);
    setBusy((current) => (current === "brief" ? "" : current));
  }, [params, revision]);
  useEffect(() => {
    if (importOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [importOpen]);

  async function loadDemo() {
    setBusy("demo");
    setError("");
    try {
      setResult(await request<ImportResult>("/demo", { method: "POST" }));
      setSource("");
      setSentiment("");
      setSearch("");
      setPage(1);
      setRevision((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("import");
    setResult(null);
    setError("");
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Choose a CSV file smaller than 2 MB.");
      const body = new FormData();
      body.append("file", file);
      setResult(
        await request<ImportResult>("/import", { method: "POST", body }),
      );
      setPage(1);
      setRevision((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }
  async function generate() {
    const requestId = ++briefRequest.current;
    setBusy("brief");
    setError("");
    try {
      const response = await request<Brief>(`/brief?${params}&demo=${!useAi}`, {
        method: "POST",
      });
      if (requestId === briefRequest.current) setBrief(response);
    } catch (err) {
      if (requestId === briefRequest.current) setError((err as Error).message);
    } finally {
      if (requestId === briefRequest.current) setBusy("");
    }
  }
  const total = dashboard?.total ?? 0;
  const hasFilters = !!(source || sentiment || search);
  const maxTrend = Math.max(1, ...(dashboard?.trend.map((t) => t.count) ?? []));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="InsightPilot home">
          <span className="brand-icon">
            <BarChart3 size={23} />
          </span>
          InsightPilot<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">N</span>
          <div>
            <strong>Northstar workspace</strong>
            <small>Customer intelligence</small>
          </div>
          <span className="workspace-status" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "reviews" && dashboard && (
                <span className="nav-count">{total}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="note-icon">
            <Sparkles size={19} />
          </div>
          <strong>Feedback into focus.</strong>
          <p>
            Find the patterns behind customer opinions and your next product
            move.
          </p>
          <button
            onClick={() => {
              setResult(null);
              setImportOpen(true);
            }}
          >
            Add your reviews <ArrowRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="local-dot" /> Local workspace{" "}
          <span className="version">v1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{labels[view]}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-label">
              <span /> Portfolio edition
            </span>
            <span className="profile">NP</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">LISTEN. UNDERSTAND. IMPROVE.</div>
              <h1>
                {view === "overview"
                  ? "Your customers, in focus."
                  : labels[view]}
              </h1>
              <p>
                {view === "overview"
                  ? "Turn scattered feedback into your next confident decision."
                  : view === "reviews"
                    ? "Read the feedback behind the numbers. Find a signal worth exploring."
                    : "A clear starting point for your next product conversation."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setResult(null);
                setImportOpen(true);
              }}
            >
              <Upload size={17} /> Import reviews
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {result && !importOpen && (
            <div className="alert success" role="status">
              <Check size={17} />
              {result.imported} reviews added · {result.duplicates} duplicates
              skipped · {result.rejected} rejected
              <button
                aria-label="Dismiss import result"
                onClick={() => setResult(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
          <div className="filterbar">
            <div className="filter-label">
              <Activity size={16} /> Feedback scope
            </div>
            <select
              aria-label="Filter by source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sources</option>
              {dashboard?.available_sources.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter by sentiment"
              value={sentiment}
              onChange={(e) => {
                setSentiment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Search reviews"
                placeholder="Search feedback…"
                value={search}
                maxLength={200}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {hasFilters && (
              <button
                className="text-button"
                onClick={() => {
                  setSource("");
                  setSentiment("");
                  setSearch("");
                  setPage(1);
                }}
              >
                Clear
              </button>
            )}
          </div>
          {loading ? (
            <div className="loading" role="status">
              <LoaderCircle className="spin" size={24} /> Loading customer
              feedback…
            </div>
          ) : !dashboard ? (
            <section className="empty panel">
              <Database size={35} />
              <h2>The workspace is unavailable</h2>
              <p>Check that the backend is running, then try again.</p>
              <button
                className="primary"
                onClick={() => setRevision((r) => r + 1)}
              >
                Retry connection
              </button>
            </section>
          ) : total === 0 ? (
            <section className="empty panel">
              <span className="empty-icon">
                <MessageSquareText size={30} />
              </span>
              <div className="eyebrow">A CLEARER PICTURE STARTS HERE</div>
              <h2>
                {hasFilters
                  ? "No reviews match this scope"
                  : "Meet your next product insight."}
              </h2>
              <p>
                {hasFilters
                  ? "Try a different source, sentiment, or search term."
                  : "Import customer reviews to uncover recurring themes, understand sentiment, and build your first insight brief."}
              </p>
              {!hasFilters && (
                <>
                  <button
                    className="primary"
                    onClick={loadDemo}
                    disabled={!!busy}
                  >
                    {busy === "demo" ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    Explore sample workspace
                  </button>
                  <small>
                    36 fictional reviews · no account or API key needed
                  </small>
                </>
              )}
            </section>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <section className="stats" aria-label="Key metrics">
                    <Metric
                      label="Total reviews"
                      value={String(total)}
                      note="In your current scope"
                      icon={<MessageSquareText size={18} />}
                    />
                    <Metric
                      label="Average rating"
                      value={dashboard.average_rating?.toFixed(1) ?? "—"}
                      suffix="/ 5"
                      note="From reviews with a rating"
                      icon={<Star size={18} />}
                    />
                    <Metric
                      label="Positive sentiment"
                      value={`${dashboard.positive_share}%`}
                      note={`${dashboard.sentiments.positive} positive customer voices`}
                      icon={<Activity size={18} />}
                      green
                    />
                    <Metric
                      label="Topics discovered"
                      value={String(dashboard.topics.length)}
                      note="Recurring feedback categories"
                      icon={<FileText size={18} />}
                    />
                  </section>
                  <div className="analytics-grid">
                    <section className="panel trend-panel">
                      <PanelHeading
                        title="Feedback over time"
                        subtitle="Review volume by month"
                      />
                      <div className="legend">
                        <span>
                          <i className="positive" />
                          Positive
                        </span>
                        <span>
                          <i className="neutral" />
                          Neutral
                        </span>
                        <span>
                          <i className="negative" />
                          Negative
                        </span>
                      </div>
                      <div
                        className="chart"
                        role="img"
                        aria-label={dashboard.trend
                          .map((t) => `${t.month}: ${t.count} reviews`)
                          .join("; ")}
                      >
                        <div className="chart-grid">
                          <span>{maxTrend}</span>
                          <span>{Math.round(maxTrend / 2)}</span>
                          <span>0</span>
                        </div>
                        <div className="chart-bars">
                          {dashboard.trend.map((t) => (
                            <div className="chart-column" key={t.month}>
                              <div
                                className="bar-stack"
                                title={`${t.month}: ${t.count} reviews`}
                                style={{
                                  height: `${(t.count / maxTrend) * 100}%`,
                                }}
                              >
                                {(
                                  ["negative", "neutral", "positive"] as const
                                ).map((s) => (
                                  <div
                                    key={s}
                                    className={s}
                                    style={{
                                      height: `${(t[s] / t.count) * 100}%`,
                                    }}
                                  />
                                ))}
                              </div>
                              <span>
                                {new Date(
                                  `${t.month}-02T12:00:00`,
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  year: "2-digit",
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="panel-foot">
                        Monthly volume reflects imported reviews, not your full
                        customer base.
                      </div>
                    </section>
                    <section className="panel sentiment-panel">
                      <PanelHeading
                        title="The sentiment picture"
                        subtitle="How customers feel"
                      />
                      <div
                        className="donut"
                        role="img"
                        aria-label={`${dashboard.positive_share}% positive, ${dashboard.sentiments.neutral} neutral, ${dashboard.sentiments.negative} negative reviews`}
                        style={{
                          background: `conic-gradient(var(--green) 0 ${(dashboard.sentiments.positive / total) * 100}%, #c5c9d7 ${(dashboard.sentiments.positive / total) * 100}% ${((dashboard.sentiments.positive + dashboard.sentiments.neutral) / total) * 100}%, var(--coral) 0)`,
                        }}
                      >
                        <div>
                          <strong>{dashboard.positive_share}%</strong>
                          <span>positive</span>
                        </div>
                      </div>
                      <div className="sentiment-rows">
                        {["positive", "neutral", "negative"].map((s) => (
                          <div key={s}>
                            <span>
                              <i className={s} />
                              {s[0].toUpperCase() + s.slice(1)}
                            </span>
                            <strong>
                              {dashboard.sentiments[s]}{" "}
                              <small>
                                {Math.round(
                                  (dashboard.sentiments[s] / total) * 100,
                                )}
                                %
                              </small>
                            </strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                  <div className="bottom-grid">
                    <section className="panel">
                      <PanelHeading
                        title="What keeps coming up"
                        subtitle="A review can mention more than one topic"
                      />
                      <div className="topic-list">
                        {dashboard.topics.map((t) => (
                          <div className="topic-row" key={t.name}>
                            <div>
                              <strong>{t.name}</strong>
                              <span>{t.count} mentions</span>
                            </div>
                            <div className="topic-track">
                              <span
                                style={{ width: `${(t.count / total) * 100}%` }}
                              />
                            </div>
                            <small>
                              {t.negative > 0
                                ? `${t.negative} negative`
                                : "No negative reviews"}
                            </small>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="brief-promo">
                      <span className="promo-spark">
                        <Sparkles size={22} />
                      </span>
                      <span className="eyebrow">FROM SIGNAL TO NEXT STEP</span>
                      <h2>
                        Less reading.
                        <br />
                        More understanding.
                      </h2>
                      <p>
                        Bring your feedback together in a concise brief, with
                        priorities and the reviews behind them.
                      </p>
                      <button onClick={() => setView("brief")}>
                        Build an insight brief <ArrowRight size={17} />
                      </button>
                      <small>
                        <ShieldCheck size={14} /> Local analysis available. Your
                        choice.
                      </small>
                    </section>
                  </div>
                </>
              )}
              {view === "reviews" && (
                <section className="panel reviews-panel">
                  <PanelHeading
                    title="The voice of your customers"
                    subtitle={`${total} reviews in the current scope`}
                  />
                  <div className="review-list">
                    {reviews?.items.map((r) => (
                      <article className="review" key={r.id}>
                        <div className="review-meta">
                          <span className={`badge ${r.sentiment}`}>
                            {r.sentiment}
                          </span>
                          <span>{r.source}</span>
                          <span>
                            #{r.id} · {r.date}
                          </span>
                          <span className="rating">
                            {r.rating
                              ? `${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}`
                              : "Unrated"}
                          </span>
                        </div>
                        <p>{r.text}</p>
                        <div className="tags">
                          {r.topics.map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="pagination">
                    <span>
                      Page {page} of {Math.max(1, Math.ceil(total / 12))}
                    </span>
                    <div>
                      <button
                        aria-label="Previous page"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <button
                        aria-label="Next page"
                        disabled={page * 12 >= total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {view === "brief" && (
                <section className="panel brief-panel">
                  <div className="brief-heading">
                    <div>
                      <h2>Your product research brief</h2>
                      <p>Based on {total} reviews in the current scope.</p>
                    </div>
                    <span className="badge mode">
                      {brief?.mode === "ai" ? "AI generated" : "Local analysis"}
                    </span>
                  </div>
                  <div className="brief-controls">
                    <label>
                      <input
                        type="checkbox"
                        checked={useAi}
                        disabled={!aiConfigured || !!busy}
                        onChange={(e) => {
                          setUseAi(e.target.checked);
                          setBrief(null);
                        }}
                      />{" "}
                      Use OpenAI{" "}
                      {aiConfigured ? "" : "(API key not configured)"}
                    </label>
                    <p>
                      {useAi
                        ? "Generating will send aggregate metrics and up to 60 recent reviews to OpenAI. Only use feedback you have permission to share."
                        : "A transparent, rule-based brief. No review data leaves this app."}
                    </p>
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={generate}
                    >
                      {busy === "brief" ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <Sparkles size={17} />
                      )}{" "}
                      {busy === "brief"
                        ? "Preparing your brief…"
                        : brief
                          ? "Regenerate brief"
                          : "Generate brief"}
                    </button>
                    {brief && (
                      <button
                        className="secondary"
                        onClick={() =>
                          download(
                            `# InsightPilot\n\n${brief.notice}\n\n${brief.content}`,
                            "insightpilot-brief.md",
                            "text/markdown",
                          )
                        }
                      >
                        <ArrowDownToLine size={17} /> Export Markdown
                      </button>
                    )}
                  </div>
                  {brief ? (
                    <>
                      <div className="brief-notice" role="status">
                        {brief.notice}
                      </div>
                      <article className="markdown">
                        <ReactMarkdown>{brief.content}</ReactMarkdown>
                      </article>
                    </>
                  ) : (
                    <div className="brief-placeholder">
                      <FileText size={35} />
                      <h3>Make space for the bigger picture.</h3>
                      <p>
                        Generate a brief to connect recurring themes with review
                        evidence and practical next steps.
                      </p>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
          <footer className="main-footer">
            <span>Built for thoughtful product decisions.</span>
            <span>
              <ShieldCheck size={14} /> Ratings + transparent topic rules{" "}
              <span className="footer-dot">·</span>{" "}
              <button
                onClick={() => {
                  setResult(null);
                  setImportOpen(true);
                }}
              >
                CSV format guide
              </button>
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="import-title"
        className="import-dialog"
        onCancel={() => setImportOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setImportOpen(false);
        }}
      >
        <div className="dialog-content">
          <button
            className="close-dialog"
            aria-label="Close import dialog"
            onClick={() => setImportOpen(false)}
          >
            <X size={21} />
          </button>
          <div className="eyebrow">BRING YOUR CUSTOMERS INTO FOCUS</div>
          <h2 id="import-title">Import your reviews</h2>
          <p>
            Upload a UTF-8 CSV. Valid rows are saved; invalid rows are reported
            so you can fix them. Existing reviews are skipped.
          </p>
          <div className="upload-zone">
            <Upload size={28} />
            <strong>One file. A clearer picture.</strong>
            <span>CSV · up to 2 MB · 5,000 reviews</span>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={importFile}
              hidden
              aria-label="Choose CSV file"
            />
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy === "import" ? "Importing…" : "Choose CSV file"}
            </button>
          </div>
          <div className="format-guide">
            <strong>Expected columns</strong>
            <code>text,rating,date,source</code>
            <p>
              <b>text</b> is required. Optional: rating (1–5), date
              (YYYY-MM-DD), source. Missing dates use today; missing sources use
              “CSV import”.
            </p>
            <button
              className="text-button"
              onClick={() =>
                download(
                  'text,rating,date,source\n"Easy setup and a helpful support team.",5,2026-10-20,App Store\n',
                  "insightpilot-template.csv",
                  "text/csv",
                )
              }
            >
              Download CSV template <ArrowDownToLine size={14} />
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {result && (
            <div className="import-result" role="status">
              <strong>
                {result.imported} imported · {result.duplicates} duplicates ·{" "}
                {result.rejected} rejected
              </strong>
              {result.errors.length > 0 && (
                <ul>
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              {result.rejected > 50 && (
                <p>Showing the first 50 rejected rows.</p>
              )}
            </div>
          )}
          <div className="dialog-footer">
            <span>Just exploring? Try 36 fictional reviews.</span>
            <button className="secondary" disabled={!!busy} onClick={loadDemo}>
              {busy === "demo" ? "Loading…" : "Load sample data"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  note,
  icon,
  green,
}: {
  label: string;
  value: string;
  suffix?: string;
  note: string;
  icon: React.ReactNode;
  green?: boolean;
}) {
  return (
    <article className="metric panel">
      <div className="metric-top">
        <span>{label}</span>
        <span className={green ? "metric-icon green-icon" : "metric-icon"}>
          {icon}
        </span>
      </div>
      <div className="metric-value">
        {value}
        <small>{suffix}</small>
      </div>
      <p>{note}</p>
    </article>
  );
}
function PanelHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}
