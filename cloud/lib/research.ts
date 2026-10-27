export type Source = {
  id: string;
  url: string;
  title: string;
  kind: string;
  status: string;
  text: string;
  excerpt: string;
  reason: string | null;
  characters: number;
};
export type Research = {
  id: string;
  created_at: string;
  name: string;
  url: string;
  status: string;
  sources: Source[];
  warnings: string[];
  report: any;
  error: string | null;
  queries: string[];
  selected_ids?: string[];
  _candidates?: { url: string; title: string; snippet: string }[];
  _cursor?: number;
};
const MAX_BYTES = 750000;
export function publicURL(value: string, keepQuery = false) {
  const url = new URL(
    /^https?:\/\//i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`,
  );
  const host = url.hostname.toLowerCase();
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    host.endsWith(".") ||
    /\.(local|localhost|internal|test|invalid)$/.test(host)
  )
    throw new Error(
      "Enter a public website URL without credentials, an IP address, or a custom port.",
    );
  url.hash = "";
  if (!keepQuery) url.search = "";
  else
    for (const key of [...url.searchParams.keys()])
      if (
        key.startsWith("utm_") ||
        ["token", "key", "auth", "api_key", "gclid", "fbclid"].includes(
          key.toLowerCase(),
        )
      )
        url.searchParams.delete(key);
  return url.href;
}
export async function readBounded(url: string) {
  for (let redirects = 0; redirects < 4; redirects++) {
    url = publicURL(url, true);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "InsightPilot/1.0",
        Accept: "text/html,application/xml,text/xml,text/plain",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      url = new URL(response.headers.get("location") || "", url).href;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (
      !/(html|xml|text\/plain)/i.test(
        response.headers.get("content-type") || "",
      )
    )
      throw new Error("Unsupported content type.");
    if (Number(response.headers.get("content-length") || 0) > MAX_BYTES)
      throw new Error("Page exceeds the reading limit.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES)
          throw new Error("Page exceeds the reading limit.");
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
    return { html: new TextDecoder().decode(bytes), url };
  }
  throw new Error("Too many redirects.");
}
function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function plain(value: string) {
  return decode(
    value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}
function field(item: string, name: string) {
  return decode(
    (
      item.match(
        new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
      )?.[1] || ""
    ).replace(/^<!\[CDATA\[|\]\]>$/g, ""),
  );
}
export function parseFeed(xml: string, name: string) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].flatMap(
    ([, item]) => {
      try {
        let raw = field(item, "link");
        const target = new URL(raw);
        if (
          target.hostname === "www.bing.com" &&
          target.pathname === "/news/apiclick.aspx"
        )
          raw = target.searchParams.get("url") || raw;
        const url = publicURL(raw, true),
          title = plain(field(item, "title")),
          snippet = plain(field(item, "description")).slice(0, 1000);
        const words = name.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
        if (
          !words.length ||
          !words.every((w) =>
            (url + " " + title + " " + snippet).toLowerCase().includes(w),
          )
        )
          return [];
        return [{ url, title, snippet }];
      } catch {
        return [];
      }
    },
  );
}
export function extractPage(html: string) {
  const title = plain(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
  );
  if (
    /access denied|just a moment|captcha|verify you are human|sign in|log in/i.test(
      title,
    )
  )
    throw new Error("Verification or sign-in required.");
  const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)]
    .map((match) => match[1])
    .sort((a, b) => b.length - a.length);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const content = articles[0]?.length > 500 ? articles[0] : main || html;
  const text = decode(
    content
      .replace(/<(nav|aside|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<(\/p|\/div|\/li|br|h[1-6]|article|section)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 35)
    .filter((s, i, a) => a.indexOf(s) === i)
    .join("\n")
    .slice(0, 18000);
  if (text.length < 120) throw new Error("Too little readable text.");
  return { title, text };
}
async function robotsAllows(url: string) {
  const origin = new URL(url).origin;
  try {
    const { html } = await readBounded(origin + "/robots.txt");
    let active = false;
    const rules: { path: string; allow: boolean }[] = [];
    for (const line of html.split("\n")) {
      const [key, ...parts] = line.split("#")[0].split(":");
      const value = parts.join(":").trim();
      if (key.trim().toLowerCase() === "user-agent")
        active = value === "*" || value.toLowerCase().includes("insightpilot");
      if (
        active &&
        value &&
        ["allow", "disallow"].includes(key.trim().toLowerCase())
      )
        rules.push({
          path: value,
          allow: key.trim().toLowerCase() === "allow",
        });
    }
    const path = new URL(url).pathname;
    const matching = rules
      .filter((r) => path.startsWith(r.path.replace(/\*.*$/, "")))
      .sort(
        (a, b) =>
          b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
      );
    return !matching.length || matching[0].allow;
  } catch (err) {
    if (/HTTP 404|HTTP 410/.test(String(err))) return true;
    return false;
  }
}
async function collect(
  candidate: { url: string; title: string; snippet: string },
  domain: string,
  index: number,
): Promise<Source> {
  const type = (url: string) => {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === domain || host.endsWith("." + domain)
      ? "official"
      : "independent";
  };
  const source: Source = {
    id: `S${index}`,
    ...candidate,
    kind: type(candidate.url),
    status: candidate.snippet ? "snippet" : "unavailable",
    text: "",
    excerpt: candidate.snippet,
    reason: null,
    characters: 0,
  };
  try {
    if (!(await robotsAllows(candidate.url)))
      throw new Error("Site policy prevents reading.");
    const page = await readBounded(candidate.url);
    const extracted = extractPage(page.html);
    Object.assign(source, {
      url: page.url,
      title: extracted.title || candidate.title,
      status: "read",
      text: extracted.text,
      excerpt: extracted.text.slice(0, 650),
      characters: extracted.text.length,
      kind: type(page.url),
    });
  } catch {
    source.reason =
      "The full page is unavailable or restricted. A search excerpt is not a read page.";
  }
  return source;
}
export async function discover(
  doc: Research,
  save: (doc: Research) => Promise<void>,
) {
  try {
    const domain = new URL(doc.url).hostname.replace(/^www\./, "");
    if (!doc._candidates) {
      const queries = [
        `"${doc.name}" "${domain}" reviews`,
        `"${doc.name}" customer reviews complaints experience`,
        `"${doc.name}" review`,
      ];
      const results = await Promise.all(
        queries.map(async (q, i) => {
          try {
            const feed = await readBounded(
              `https://www.bing.com/${i === 2 ? "news/search" : "search"}?format=rss&cc=us&mkt=en-US&q=${encodeURIComponent(q)}`,
            );
            return parseFeed(feed.html, doc.name);
          } catch {
            doc.warnings.push(
              "One public search query was unavailable; coverage may be incomplete.",
            );
            return [];
          }
        }),
      );
      const candidates = [
        ...new Map(results.flat().map((r) => [r.url, r])).values(),
      ]
        .filter((r) => r.url !== doc.url)
        .sort(
          (a, b) =>
            Number(new URL(a.url).hostname.replace(/^www\./, "") === domain) -
              Number(
                new URL(b.url).hostname.replace(/^www\./, "") === domain,
              ) ||
            Number(!/review/i.test(a.title)) - Number(!/review/i.test(b.title)),
        )
        .slice(0, 8);
      doc._candidates = [
        { url: doc.url, title: doc.name, snippet: "" },
        ...candidates,
      ];
      doc._cursor = 0;
      doc.queries = queries;
      if (!candidates.length)
        doc.warnings.push(
          "No relevant third-party results were found. Try a more specific product name.",
        );
    } else {
      const cursor = doc._cursor || 0;
      const next = await Promise.all(
        doc._candidates
          .slice(cursor, cursor + 2)
          .map((c, i) => collect(c, domain, cursor + i + 1)),
      );
      const unique = new Map(doc.sources.map((s) => [s.url, s]));
      for (const source of next)
        if (!unique.has(source.url)) unique.set(source.url, source);
      doc.sources = [...unique.values()];
      doc._cursor = cursor + next.length;
      if (doc._cursor >= doc._candidates.length) {
        doc.status = "ready";
        delete doc._candidates;
        delete doc._cursor;
        if (!doc.sources.some((s) => s.status === "read"))
          doc.warnings.push(
            "No full pages could be read. Only search excerpts may be available.",
          );
      }
    }
    doc.warnings = [...new Set(doc.warnings)];
    await save(doc);
  } catch {
    doc.status = "failed";
    doc.error = "Discovery could not finish. Check the URL and try again.";
    await save(doc);
  }
}
export function digest(doc: Research, sources: Source[]) {
  const read = sources.filter((s) => s.status === "read");
  return {
    mode: "local",
    source_ids: sources.map((s) => s.id),
    notice:
      "Free extractive digest. Enable on-device AI for model-generated summaries; no paid API is used.",
    content:
      `## Public source digest\n\nSelected ${sources.length} sources; ${read.length} pages were read.\n\n` +
      sources
        .map(
          (s) =>
            `### [${s.id}](${s.url}) ${s.title}\n\n${s.kind === "official" ? "Company claims" : "Third-party material"} · ${s.status === "read" ? "Page text read" : "Search excerpt only"}\n\n${s.excerpt}`,
        )
        .join("\n\n") +
      "\n\n### Evidence limits\nThese are pages, not a verified individual review dataset. Sentiment percentages, average ratings, customer consensus, and causal claims cannot be inferred. Check publication dates and product identity.\n\n### Next steps\nCheck the cited evidence and investigate recurring concerns with customers before prioritizing changes.",
  };
}
