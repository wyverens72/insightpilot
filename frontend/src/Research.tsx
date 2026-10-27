import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  LoaderCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { request } from "./api";

type Source = {
  id: string;
  url: string;
  title: string;
  kind: "official" | "independent";
  status: "read" | "snippet" | "unavailable";
  excerpt: string;
  reason: string | null;
  characters: number;
};
type Report = {
  mode: "ai" | "local";
  content: string;
  notice: string;
  source_ids: string[];
};
type Session = {
  id: string;
  name: string;
  url: string;
  status: "discovering" | "ready" | "analyzing" | "complete" | "failed";
  created_at: string;
  sources: Source[];
  selected_ids?: string[];
  warnings: string[];
  error: string | null;
  report: Report | null;
  queries: string[];
};
type HistoryItem = Pick<
  Session,
  "id" | "name" | "url" | "status" | "created_at"
>;

function savedResearch(action: "get" | "set" | "remove", id?: string) {
  try {
    if (action === "get")
      return window.localStorage.getItem?.("insightpilot:last-research");
    if (action === "set")
      window.localStorage.setItem?.("insightpilot:last-research", id!);
    if (action === "remove")
      window.localStorage.removeItem?.("insightpilot:last-research");
  } catch {
    /* Recent research is still available when browser storage is disabled. */
  }
  return null;
}

export default function Research({
  aiConfigured,
  onAiConfigured,
}: {
  aiConfigured: boolean;
  onAiConfigured: () => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [job, setJob] = useState<Session | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [product, setProduct] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const running = job?.status === "discovering" || job?.status === "analyzing";

  function accept(doc: Session) {
    setJob(doc);
    setProduct(doc.name);
    const readable = doc.sources.filter((s) => s.status === "read");
    setSelected(
      doc.selected_ids ??
        (readable.length
          ? readable
          : doc.sources.filter((s) => s.status === "snippet")
        ).map((s) => s.id),
    );
    savedResearch("set", doc.id);
  }
  function refreshHistory() {
    request<HistoryItem[]>("/research")
      .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }
  useEffect(() => {
    refreshHistory();
    const id = savedResearch("get");
    if (id)
      request<Session>(`/research/${id}`)
        .then(accept)
        .catch(() => savedResearch("remove"));
  }, []);
  useEffect(() => {
    if (!job || !running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      try {
        const next = await request<Session>(`/research/${job!.id}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setJob(next);
        failures = 0;
        if (next.status === "discovering" || next.status === "analyzing")
          timer = setTimeout(poll, 1500);
        else {
          accept(next);
          refreshHistory();
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          if (++failures < 4) timer = setTimeout(poll, 2500);
          else {
            setError(
              `Could not refresh research progress: ${(err as Error).message}. Reopen it from recent research to retry.`,
            );
            refreshHistory();
          }
        }
      }
    }
    timer = setTimeout(poll, 750);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [job?.id, running]);

  async function discover(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      accept(
        await request<Session>("/research/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, name, use_ai: useAi }),
        }),
      );
      refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  async function analyze() {
    if (!job) return;
    setError("");
    setSubmitting(true);
    try {
      setJob(
        await request<Session>(`/research/${job.id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: product,
            source_ids: selected,
            use_ai: useAi,
          }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  async function configure(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSavingKey(true);
    try {
      await request("/research/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKey }),
      });
      setApiKey("");
      onAiConfigured();
      setUseAi(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingKey(false);
    }
  }
  async function reopen(id: string) {
    setError("");
    try {
      accept(await request<Session>(`/research/${id}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function exportReport() {
    if (!job?.report) return;
    const content =
      `# ${job.name}: public research\n\n${job.url}\n\n${job.report.notice}\n\n${job.report.content}\n\n## Sources\n` +
      job.sources
        .filter((s) => job.report!.source_ids.includes(s.id))
        .map((s) => `- [${s.id}] ${s.title}: ${s.url} (${s.status})`)
        .join("\n");
    const objectUrl = URL.createObjectURL(
      new Blob([content], { type: "text/markdown" }),
    );
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "insightpilot-research.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  const ready = job && ["ready", "complete"].includes(job.status);
  return (
    <div className="research-workspace">
      <section className="research-entry panel">
        <div className="research-intro">
          <span className="research-symbol">
            <Globe size={28} />
          </span>
          <div>
            <h2>One link. A wider perspective.</h2>
            <p>
              Discover public reviews, articles, and discussions about a
              product. Check the sources, then build your research brief.
            </p>
          </div>
        </div>
        <form className="research-form" onSubmit={discover}>
          <label className="research-url">
            <Link2 size={18} />
            <input
              aria-label="Product website URL"
              placeholder="https://product.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              maxLength={2000}
            />
          </label>
          <input
            className="research-name"
            aria-label="Product name (optional)"
            placeholder="Product name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
          <button className="primary" disabled={running || submitting}>
            <Search size={17} /> Find sources
          </button>
        </form>
        {aiConfigured && (
          <label className="ai-choice">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              disabled={running}
            />{" "}
            Use AI-assisted web search and synthesis. Provider charges may
            apply.
          </label>
        )}
        <div className="research-footnote">
          <ShieldCheck size={14} />
          <span>
            Public pages only. No login or CSV needed. The website address and
            product name are sent to public search; URL query parameters are
            removed.
          </span>
        </div>
      </section>
      <div className="research-steps" aria-label="Research stages">
        {["Discover sources", "Confirm & select", "Build your brief"].map(
          (s, i) => (
            <span
              key={s}
              className={
                (i === 0 && (!job || job.status === "discovering")) ||
                (i === 1 && job?.status === "ready") ||
                (i === 2 &&
                  ["analyzing", "complete"].includes(job?.status ?? ""))
                  ? "current"
                  : ""
              }
            >
              <b>0{i + 1}</b>
              {s}
              {i < 2 && <ArrowRight size={14} />}
            </span>
          ),
        )}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {running && (
        <div className="research-progress panel" role="status">
          <LoaderCircle className="spin" size={24} />
          <div>
            <strong>
              {job.status === "discovering"
                ? "Finding and reading public sources…"
                : "Building a brief from your selected evidence…"}
            </strong>
            <p>
              {job.status === "discovering"
                ? "Checking the website, searching by product name, and reading accessible results. Restricted pages will be labeled. This can take about a minute."
                : "Your source selection is preserved. You can return to this research from the recent list."}
            </p>
          </div>
        </div>
      )}
      {job?.status === "failed" && (
        <div className="alert error" role="alert">
          {job.error}
        </div>
      )}
      {job && job.sources.length > 0 && (
        <>
          <section className="source-section">
            <div className="source-heading">
              <div>
                <div className="eyebrow">EVIDENCE BEFORE CONCLUSIONS</div>
                <h2>Check the product. Choose the evidence.</h2>
                <a href={job.url} target="_blank" rel="noreferrer">
                  {job.url} <ExternalLink size={12} />
                </a>
              </div>
              <div className="source-counts">
                <strong>
                  {job.sources.length}
                  <span>sources found</span>
                </strong>
                <strong>
                  {job.sources.filter((s) => s.status === "read").length}
                  <span>pages read</span>
                </strong>
                <strong>
                  {job.sources.filter((s) => s.kind === "independent").length}
                  <span>third-party sources</span>
                </strong>
              </div>
            </div>
            {job.warnings.map((warning, i) => (
              <p className="research-warning" key={i}>
                {warning}
              </p>
            ))}
            <label className="product-confirm">
              Confirm product name
              <input
                aria-label="Confirm product name"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                maxLength={100}
                disabled={running}
              />
              <span>
                The name is a starting guess. Exclude namesakes and irrelevant
                results before analysis. Change the name above and search again
                to refine discovery.
              </span>
            </label>
            <div className="source-grid">
              {job.sources.map((s) => (
                <article
                  key={s.id}
                  className={`source-card panel ${selected.includes(s.id) ? "selected" : ""}`}
                >
                  <div className="source-card-top">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Include ${s.id}`}
                        checked={selected.includes(s.id)}
                        disabled={s.status === "unavailable" || running}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, s.id]
                              : ids.filter((id) => id !== s.id),
                          )
                        }
                      />
                      <span>{s.id}</span>
                    </label>
                    <span className={`source-access ${s.status}`}>
                      {s.status === "read"
                        ? "Page text read"
                        : s.status === "snippet"
                          ? "Search excerpt only"
                          : "Unavailable"}
                    </span>
                  </div>
                  <span className="source-kind">
                    {s.kind === "official"
                      ? "Company website · company claims"
                      : "Third-party source · verify relevance"}
                  </span>
                  <h3>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title || new URL(s.url).hostname}
                      <ExternalLink size={13} />
                    </a>
                  </h3>
                  <div className="source-domain">{new URL(s.url).hostname}</div>
                  <p>{s.excerpt || "No readable content available."}</p>
                  {s.reason && <small>{s.reason}</small>}
                  <details>
                    <summary>Extraction details</summary>
                    <p>
                      {s.characters.toLocaleString()} characters extracted.
                      Pages may be truncated; JavaScript content and individual
                      reviews are not automatically extracted. A read page is
                      not proof of a customer review.
                    </p>
                  </details>
                </article>
              ))}
            </div>
            {ready && (
              <div className="research-actions panel">
                <div>
                  <strong>{selected.length} sources selected</strong>
                  <label className="ai-choice">
                    <input
                      type="checkbox"
                      checked={useAi}
                      disabled={!aiConfigured}
                      onChange={(e) => setUseAi(e.target.checked)}
                    />{" "}
                    Use AI synthesis {aiConfigured ? "" : "(configure below)"}
                  </label>
                  <p>
                    {useAi
                      ? "Selected source text and product identity will be sent to OpenAI when you build the brief."
                      : "Local mode creates an extractive source digest. It does not interpret customer sentiment."}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={analyze}
                  disabled={submitting || !selected.length || !product.trim()}
                >
                  {useAi ? "Analyze selected sources" : "Build source digest"}
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
          </section>
          {job.report && (
            <section className="panel research-report">
              <div className="brief-heading">
                <div>
                  <div className="eyebrow">
                    {job.report.mode === "ai"
                      ? "AI RESEARCH BRIEF"
                      : "EXTRACTIVE SOURCE DIGEST"}
                  </div>
                  <h2>{job.name}</h2>
                </div>
                <button className="secondary" onClick={exportReport}>
                  <ArrowDownToLine size={16} /> Export research
                </button>
              </div>
              <div className="brief-notice">{job.report.notice}</div>
              <article className="markdown">
                <ReactMarkdown>{job.report.content}</ReactMarkdown>
              </article>
            </section>
          )}
          <details className="search-details">
            <summary>Search queries & coverage</summary>
            {job.queries.map((q) => (
              <code key={q}>{q}</code>
            ))}
            <p>
              Public search results can be incomplete, stale, or refer to a
              namesake. At most eight search results are read alongside the
              submitted website. No sentiment percentage is calculated from web
              pages. Research stays separate from the imported review dataset.
            </p>
          </details>
        </>
      )}
      <details className="ai-settings panel">
        <summary>
          <KeyRound size={16} />
          {aiConfigured ? "AI synthesis is configured" : "Enable AI synthesis"}
          {aiConfigured && <Check size={15} />}
        </summary>
        <p>
          Connect your OpenAI API key to interpret the collected evidence. The
          key stays in server memory until restart; it is not stored in the
          browser or database. Search and the local source digest work without a
          key. Provider charges may apply.
        </p>
        <form onSubmit={configure}>
          <input
            type="password"
            aria-label="OpenAI API key"
            autoComplete="off"
            placeholder="OpenAI API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            minLength={20}
          />
          <button className="secondary" disabled={savingKey}>
            {savingKey ? "Saving…" : "Enable for this session"}
          </button>
        </form>
      </details>
      {history.length > 0 && (
        <section className="research-history">
          <h2>Recent research</h2>
          <div>
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => reopen(h.id)}
                disabled={running || submitting}
              >
                <Globe size={17} />
                <strong>{h.name}</strong>
                <span>{h.status}</span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
