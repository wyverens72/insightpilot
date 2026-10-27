// lib/research.ts
var MAX_BYTES = 75e4;
function publicURL(value, keepQuery = false) {
  const url = new URL(
    /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  );
  const host = url.hostname.toLowerCase();
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".") || /\.(local|localhost|internal|test|invalid)$/.test(host))
    throw new Error(
      "Enter a public website URL without credentials, an IP address, or a custom port."
    );
  url.hash = "";
  if (!keepQuery) url.search = "";
  else
    for (const key of [...url.searchParams.keys()])
      if (key.startsWith("utm_") || ["token", "key", "auth", "api_key", "gclid", "fbclid"].includes(
        key.toLowerCase()
      ))
        url.searchParams.delete(key);
  return url.href;
}
async function readBounded(url) {
  for (let redirects = 0; redirects < 4; redirects++) {
    url = publicURL(url, true);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8e3),
      headers: {
        "User-Agent": "InsightPilot/1.0",
        Accept: "text/html,application/xml,text/xml,text/plain"
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      url = new URL(response.headers.get("location") || "", url).href;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!/(html|xml|text\/plain)/i.test(
      response.headers.get("content-type") || ""
    ))
      throw new Error("Unsupported content type.");
    if (Number(response.headers.get("content-length") || 0) > MAX_BYTES)
      throw new Error("Page exceeds the reading limit.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response.");
    const chunks = [];
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
function decode(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(
    /&#x([0-9a-f]+);/gi,
    (_, n) => String.fromCodePoint(parseInt(n, 16))
  ).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function plain(value) {
  return decode(
    value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}
function field(item, name) {
  return decode(
    (item.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")
    )?.[1] || "").replace(/^<!\[CDATA\[|\]\]>$/g, "")
  );
}
function parseFeed(xml, name) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].flatMap(
    ([, item]) => {
      try {
        let raw = field(item, "link");
        const target = new URL(raw);
        if (target.hostname === "www.bing.com" && target.pathname === "/news/apiclick.aspx")
          raw = target.searchParams.get("url") || raw;
        const url = publicURL(raw, true), title = plain(field(item, "title")), snippet = plain(field(item, "description")).slice(0, 1e3);
        const words = name.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
        if (!words.length || !words.every(
          (w) => (url + " " + title + " " + snippet).toLowerCase().includes(w)
        ))
          return [];
        return [{ url, title, snippet }];
      } catch {
        return [];
      }
    }
  );
}
async function robotsAllows(url) {
  const origin = new URL(url).origin;
  try {
    const { html } = await readBounded(origin + "/robots.txt");
    let active = false;
    const rules = [];
    for (const line of html.split("\n")) {
      const [key, ...parts] = line.split("#")[0].split(":");
      const value = parts.join(":").trim();
      if (key.trim().toLowerCase() === "user-agent")
        active = value === "*" || value.toLowerCase().includes("insightpilot");
      if (active && value && ["allow", "disallow"].includes(key.trim().toLowerCase()))
        rules.push({
          path: value,
          allow: key.trim().toLowerCase() === "allow"
        });
    }
    const path = new URL(url).pathname;
    const matching = rules.filter((r) => path.startsWith(r.path.replace(/\*.*$/, ""))).sort(
      (a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow)
    );
    return !matching.length || matching[0].allow;
  } catch (err) {
    if (/HTTP 404|HTTP 410/.test(String(err))) return true;
    return false;
  }
}

// lib/monitor-sources.ts
var sourceLimits = {
  appstore: "Latest 50 written reviews for the selected country. Public Apple RSS feed; availability is not guaranteed.",
  steam: "Latest 100 reviews from the Steam Web API, English only. Recommendations are not star ratings.",
  structured: "Individual Review records in public Schema.org JSON-LD. Not all pages expose review text; company testimonials may be curated.",
  rss: "Latest 100 feed entries. Entries are feedback mentions unless they explicitly include a review rating."
};
function sourceInput(value, kind) {
  const url = new URL(publicURL(value, true));
  if (url.hostname === "apps.apple.com" || url.hostname === "itunes.apple.com") {
    const appId = url.pathname.match(/(?:id[=/]?)(\d{5,12})/i)?.[1];
    if (!appId)
      throw new Error(
        "Use an App Store product link containing its numeric app ID."
      );
    const country = url.pathname.split("/").filter(Boolean)[0];
    if (!/^[a-z]{2}$/.test(country))
      throw new Error("Include the two-letter App Store country in the link.");
    return {
      kind: "appstore",
      url: `https://itunes.apple.com/${country}/rss/customerreviews/page=1/id=${appId}/sortby=mostrecent/json`
    };
  }
  if (url.hostname === "store.steampowered.com") {
    const id = url.pathname.match(/^\/app\/(\d+)/)?.[1];
    if (!id)
      throw new Error(
        "Use a Steam product link containing /app/ and its numeric ID."
      );
    return { kind: "steam", url: `https://store.steampowered.com/app/${id}/` };
  }
  if (/(^|\.)(google\.[a-z.]+|tripadvisor\.[a-z.]+|yelp\.[a-z.]+|trustpilot\.com|facebook\.com|instagram\.com|play\.google\.com)$/.test(
    url.hostname
  ))
    throw new Error(
      "This platform needs an approved integration or owner authorization. Direct collection is not enabled; no reviews have been imported."
    );
  if (kind && !["structured", "rss"].includes(kind))
    throw new Error("Choose a public review page or feedback feed.");
  return { kind: kind === "rss" ? "rss" : "structured", url: url.href };
}
var plain2 = (v) => String(v ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
function date(v) {
  const n = Date.parse(String(v || ""));
  return Number.isFinite(n) && n <= Date.now() + 864e5 ? new Date(n).toISOString() : null;
}
function safeLink(v, fallback) {
  try {
    return publicURL(new URL(String(v || ""), fallback).href, true);
  } catch {
    return fallback;
  }
}
function rating(v) {
  const n = Number(v?.ratingValue ?? v);
  const low = Number(v?.worstRating ?? 1), high = Number(v?.bestRating ?? 5);
  return n >= low && n <= high && high > low ? Math.round((1 + 4 * (n - low) / (high - low)) * 10) / 10 : null;
}
function parseStructured(html, url) {
  const result = [];
  function visit(v, depth = 0) {
    if (!v || typeof v !== "object" || depth > 15 || result.length >= 100)
      return;
    if (Array.isArray(v)) {
      v.slice(0, 200).forEach((x) => visit(x, depth + 1));
      return;
    }
    const types = Array.isArray(v["@type"]) ? v["@type"] : [v["@type"]];
    if (types.some((t) => /(?:^|\/)Review$/.test(String(t)))) {
      const body = plain2(v.reviewBody ?? v.description).slice(0, 3e3);
      if (body.length >= 12)
        result.push({
          externalId: String(v["@id"] ?? v.identifier ?? ""),
          author: plain2(v.author?.name ?? v.author ?? "Anonymous").slice(0, 80),
          title: plain2(v.name).slice(0, 200),
          body,
          rating: rating(v.reviewRating),
          published: date(v.datePublished),
          url: safeLink(v.url ?? v["@id"], url),
          language: plain2(v.inLanguage || "unknown").slice(0, 30)
        });
    }
    for (const [key, x] of Object.entries(v))
      if (!["author", "reviewRating"].includes(key)) visit(x, depth + 1);
  }
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
    }
  }
  return result;
}
function parseApple(data, url) {
  const entries = data?.feed?.entry;
  return (Array.isArray(entries) ? entries : []).slice(0, 50).flatMap((r) => {
    const body = plain2(r.content?.label).slice(0, 3e3);
    if (!r["im:rating"] || body.length < 3) return [];
    return [
      {
        externalId: String(r.id?.label || ""),
        author: plain2(r.author?.name?.label || "Anonymous").slice(0, 80),
        title: plain2(r.title?.label).slice(0, 200),
        body,
        rating: rating(r["im:rating"].label),
        published: date(r.updated?.label),
        url: safeLink(r.link?.attributes?.href, url),
        language: new URL(url).pathname.split("/")[1]
      }
    ];
  });
}
function parseSteam(data, url) {
  const obj = data?.response ?? data;
  if (Number(obj?.success) !== 1 && !Array.isArray(obj?.reviews))
    throw new Error(
      "Steam did not return a review list. The source may require publisher access."
    );
  return (obj.reviews || []).slice(0, 100).flatMap((r) => {
    const body = plain2(r.review).slice(0, 3e3);
    if (body.length < 3) return [];
    return [
      {
        externalId: String(r.recommendationid || ""),
        author: "Steam reviewer",
        title: "",
        body,
        rating: null,
        sentiment: r.voted_up ? "positive" : "negative",
        published: date(
          new Date(Number(r.timestamp_created) * 1e3).toISOString()
        ),
        url: `https://steamcommunity.com/profiles/${encodeURIComponent(String(r.author?.steamid || ""))}/recommended/${new URL(url).pathname.match(/\/app\/(\d+)/)?.[1]}/`,
        language: String(r.language || "unknown")
      }
    ];
  });
}
function parseFeedbackFeed(xml, url) {
  const items = [
    ...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)
  ].slice(0, 100);
  const field2 = (s, k) => s.match(new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${k}>`, "i"))?.[1] || "";
  return items.flatMap(([, , item]) => {
    const body = plain2(
      field2(item, "content:encoded") || field2(item, "content") || field2(item, "description") || field2(item, "summary")
    ).slice(0, 3e3);
    if (body.length < 12) return [];
    const link = field2(item, "link") || item.match(/<link[^>]*href=["']([^"']+)/i)?.[1];
    return [
      {
        externalId: plain2(field2(item, "guid") || field2(item, "id")),
        author: plain2(
          field2(item, "author") || field2(item, "dc:creator") || "Anonymous"
        ).slice(0, 80),
        title: plain2(field2(item, "title")).slice(0, 200),
        body,
        rating: null,
        published: date(
          field2(item, "pubDate") || field2(item, "published") || field2(item, "updated")
        ),
        url: safeLink(link, url),
        language: "unknown"
      }
    ];
  });
}
async function jsonGet(url) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12e3),
    headers: { Accept: "application/json", "User-Agent": "InsightPilot/2.0" }
  });
  if (!response.ok)
    throw new Error(
      `Source returned HTTP ${response.status}; no bypass was attempted.`
    );
  if (Number(response.headers.get("content-length") || 0) > 15e5)
    throw new Error("Source response is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty source response.");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 15e5)
        throw new Error("Source response exceeds the reading limit.");
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
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function collectReviews(source) {
  if (source.kind === "appstore")
    return parseApple(await jsonGet(source.url), source.url);
  if (source.kind === "steam") {
    const appid = Number(
      new URL(source.url).pathname.match(/\/app\/(\d+)/)?.[1]
    );
    const input = {
      appid,
      filter: 1,
      languages: ["english"],
      review_type: 0,
      purchase_type: 1,
      num_per_page: 100,
      cursor: "*",
      filter_offtopic_activity: true
    };
    return parseSteam(
      await jsonGet(
        "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=" + encodeURIComponent(JSON.stringify(input))
      ),
      source.url
    );
  }
  if (!await robotsAllows(source.url))
    throw new Error(
      "Collection is restricted by robots.txt or its policy could not be checked."
    );
  const page = await readBounded(source.url);
  if (/captcha|just a moment|access denied|verify you are human/i.test(
    page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""
  ))
    throw new Error(
      "The source requires verification. Collection was stopped."
    );
  return source.kind === "rss" ? parseFeedbackFeed(page.html, page.url) : parseStructured(page.html, page.url);
}
async function discoverProfiles(name, website, location) {
  const query = `${name} ${location} reviews`;
  const { html } = await readBounded(
    "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query)
  );
  return parseFeed(html, name).filter(
    (x) => !/(^|\.)(bing\.com|microsoft\.com)$/.test(new URL(x.url).hostname) && new URL(x.url).hostname !== new URL(website).hostname
  ).slice(0, 8).map((x) => ({ ...x, requires_confirmation: true }));
}
async function discoverCompetitors(category, location, website) {
  const terms = {
    "Retail & e-commerce": "shops stores",
    "Restaurants & hospitality": "restaurants cafes",
    "Beauty & wellness": "salons beauty",
    "Professional services": "professional services",
    "Health & fitness": "gyms fitness",
    "Travel & accommodation": "hotels accommodation",
    "Software & apps": "software apps",
    "Games & entertainment": "games entertainment",
    Education: "education courses",
    Other: "business services"
  };
  const query = `${terms[category] || category} ${location} reviews businesses`;
  const { html } = await readBounded(
    "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query)
  );
  return [...html.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const get = (tag) => plain2(
      item.match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
      )?.[1]
    );
    try {
      const url = publicURL(get("link"), true);
      if (new URL(url).hostname === new URL(website).hostname) return [];
      return [
        {
          title: get("title"),
          url,
          snippet: get("description").slice(0, 300),
          requires_confirmation: true
        }
      ];
    } catch {
      return [];
    }
  }).slice(0, 6);
}
export {
  collectReviews,
  discoverCompetitors,
  discoverProfiles,
  parseApple,
  parseFeedbackFeed,
  parseSteam,
  parseStructured,
  sourceInput,
  sourceLimits
};
