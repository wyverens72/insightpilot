import { publicURL, readBounded, parseFeed, robotsAllows } from "./research";
export type SourceKind = "appstore" | "steam" | "structured" | "rss";
export type CollectedReview = {
  externalId: string;
  author: string;
  title: string;
  body: string;
  rating: number | null;
  sentiment?: string;
  published: string | null;
  url: string;
  language: string;
};
export type SourceInput = { kind: SourceKind; url: string };
export const sourceLimits = {
  appstore:
    "Latest 50 written reviews for the selected country. Public Apple RSS feed; availability is not guaranteed.",
  steam:
    "Latest 100 reviews from the Steam Web API, English only. Recommendations are not star ratings.",
  structured:
    "Individual Review records in public Schema.org JSON-LD. Not all pages expose review text; company testimonials may be curated.",
  rss: "Latest 100 feed entries. Entries are feedback mentions unless they explicitly include a review rating.",
};
export function sourceInput(value: string, kind?: string): SourceInput {
  const url = new URL(publicURL(value, true));
  if (
    url.hostname === "apps.apple.com" ||
    url.hostname === "itunes.apple.com"
  ) {
    const appId = url.pathname.match(/(?:id[=/]?)(\d{5,12})/i)?.[1];
    if (!appId)
      throw new Error(
        "Use an App Store product link containing its numeric app ID.",
      );
    const country = url.pathname.split("/").filter(Boolean)[0];
    if (!/^[a-z]{2}$/.test(country))
      throw new Error("Include the two-letter App Store country in the link.");
    return {
      kind: "appstore",
      url: `https://itunes.apple.com/${country}/rss/customerreviews/page=1/id=${appId}/sortby=mostrecent/json`,
    };
  }
  if (url.hostname === "store.steampowered.com") {
    const id = url.pathname.match(/^\/app\/(\d+)/)?.[1];
    if (!id)
      throw new Error(
        "Use a Steam product link containing /app/ and its numeric ID.",
      );
    return { kind: "steam", url: `https://store.steampowered.com/app/${id}/` };
  }
  if (
    /(^|\.)(google\.[a-z.]+|tripadvisor\.[a-z.]+|yelp\.[a-z.]+|trustpilot\.com|facebook\.com|instagram\.com|play\.google\.com)$/.test(
      url.hostname,
    )
  )
    throw new Error(
      "This platform needs an approved integration or owner authorization. Direct collection is not enabled; no reviews have been imported.",
    );
  if (kind && !["structured", "rss"].includes(kind))
    throw new Error("Choose a public review page or feedback feed.");
  return { kind: kind === "rss" ? "rss" : "structured", url: url.href };
}
const plain = (v: unknown) =>
  String(v ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
function date(v: unknown) {
  const n = Date.parse(String(v || ""));
  return Number.isFinite(n) && n <= Date.now() + 86400000
    ? new Date(n).toISOString()
    : null;
}
function safeLink(v: unknown, fallback: string) {
  try {
    return publicURL(new URL(String(v || ""), fallback).href, true);
  } catch {
    return fallback;
  }
}
function rating(v: any): number | null {
  const n = Number(v?.ratingValue ?? v);
  const low = Number(v?.worstRating ?? 1),
    high = Number(v?.bestRating ?? 5);
  return n >= low && n <= high && high > low
    ? Math.round((1 + (4 * (n - low)) / (high - low)) * 10) / 10
    : null;
}
export function parseStructured(html: string, url: string): CollectedReview[] {
  const result: CollectedReview[] = [];
  function visit(v: any, depth = 0) {
    if (!v || typeof v !== "object" || depth > 15 || result.length >= 100)
      return;
    if (Array.isArray(v)) {
      v.slice(0, 200).forEach((x) => visit(x, depth + 1));
      return;
    }
    const types = Array.isArray(v["@type"]) ? v["@type"] : [v["@type"]];
    if (types.some((t: any) => /(?:^|\/)Review$/.test(String(t)))) {
      const body = plain(v.reviewBody ?? v.description).slice(0, 3000);
      if (body.length >= 12)
        result.push({
          externalId: String(v["@id"] ?? v.identifier ?? ""),
          author: plain(v.author?.name ?? v.author ?? "Anonymous").slice(0, 80),
          title: plain(v.name).slice(0, 200),
          body,
          rating: rating(v.reviewRating),
          published: date(v.datePublished),
          url: safeLink(v.url ?? v["@id"], url),
          language: plain(v.inLanguage || "unknown").slice(0, 30),
        });
    }
    for (const [key, x] of Object.entries(v))
      if (!["author", "reviewRating"].includes(key)) visit(x, depth + 1);
  }
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]));
    } catch {}
  }
  return result;
}
export function parseApple(data: any, url: string): CollectedReview[] {
  const entries = data?.feed?.entry;
  return (Array.isArray(entries) ? entries : [])
    .slice(0, 50)
    .flatMap((r: any) => {
      const body = plain(r.content?.label).slice(0, 3000);
      if (!r["im:rating"] || body.length < 3) return [];
      return [
        {
          externalId: String(r.id?.label || ""),
          author: plain(r.author?.name?.label || "Anonymous").slice(0, 80),
          title: plain(r.title?.label).slice(0, 200),
          body,
          rating: rating(r["im:rating"].label),
          published: date(r.updated?.label),
          url: safeLink(r.link?.attributes?.href, url),
          language: new URL(url).pathname.split("/")[1],
        },
      ];
    });
}
export function parseSteam(data: any, url: string): CollectedReview[] {
  const obj = data?.response ?? data;
  if (Number(obj?.success) !== 1 && !Array.isArray(obj?.reviews))
    throw new Error(
      "Steam did not return a review list. The source may require publisher access.",
    );
  return (obj.reviews || []).slice(0, 100).flatMap((r: any) => {
    const body = plain(r.review).slice(0, 3000);
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
          new Date(Number(r.timestamp_created) * 1000).toISOString(),
        ),
        url: `https://steamcommunity.com/profiles/${encodeURIComponent(String(r.author?.steamid || ""))}/recommended/${new URL(url).pathname.match(/\/app\/(\d+)/)?.[1]}/`,
        language: String(r.language || "unknown"),
      },
    ];
  });
}
export function parseFeedbackFeed(xml: string, url: string): CollectedReview[] {
  const items = [
    ...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi),
  ].slice(0, 100);
  const field = (s: string, k: string) =>
    s.match(new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${k}>`, "i"))?.[1] ||
    "";
  return items.flatMap(([, , item]) => {
    const body = plain(
      field(item, "content:encoded") ||
        field(item, "content") ||
        field(item, "description") ||
        field(item, "summary"),
    ).slice(0, 3000);
    if (body.length < 12) return [];
    const link =
      field(item, "link") || item.match(/<link[^>]*href=["']([^"']+)/i)?.[1];
    return [
      {
        externalId: plain(field(item, "guid") || field(item, "id")),
        author: plain(
          field(item, "author") || field(item, "dc:creator") || "Anonymous",
        ).slice(0, 80),
        title: plain(field(item, "title")).slice(0, 200),
        body,
        rating: null,
        published: date(
          field(item, "pubDate") ||
            field(item, "published") ||
            field(item, "updated"),
        ),
        url: safeLink(link, url),
        language: "unknown",
      },
    ];
  });
}
async function jsonGet(url: string) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "application/json", "User-Agent": "InsightPilot/2.0" },
  });
  if (!response.ok)
    throw new Error(
      `Source returned HTTP ${response.status}; no bypass was attempted.`,
    );
  if (Number(response.headers.get("content-length") || 0) > 1500000)
    throw new Error("Source response is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty source response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1500000)
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
export async function collectReviews(source: SourceInput) {
  if (source.kind === "appstore")
    return parseApple(await jsonGet(source.url), source.url);
  if (source.kind === "steam") {
    const appid = Number(
      new URL(source.url).pathname.match(/\/app\/(\d+)/)?.[1],
    );
    const input = {
      appid,
      filter: 1,
      languages: ["english"],
      review_type: 0,
      purchase_type: 1,
      num_per_page: 100,
      cursor: "*",
      filter_offtopic_activity: true,
    };
    return parseSteam(
      await jsonGet(
        "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=" +
          encodeURIComponent(JSON.stringify(input)),
      ),
      source.url,
    );
  }
  if (!(await robotsAllows(source.url)))
    throw new Error(
      "Collection is restricted by robots.txt or its policy could not be checked.",
    );
  const page = await readBounded(source.url);
  if (
    /captcha|just a moment|access denied|verify you are human/i.test(
      page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
    )
  )
    throw new Error(
      "The source requires verification. Collection was stopped.",
    );
  return source.kind === "rss"
    ? parseFeedbackFeed(page.html, page.url)
    : parseStructured(page.html, page.url);
}
export async function discoverProfiles(
  name: string,
  website: string,
  location: string,
) {
  const query = `${name} ${location} reviews`;
  const { html } = await readBounded(
    "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query),
  );
  return parseFeed(html, name)
    .filter(
      (x) =>
        !/(^|\.)(bing\.com|microsoft\.com)$/.test(new URL(x.url).hostname) &&
        new URL(x.url).hostname !== new URL(website).hostname,
    )
    .slice(0, 8)
    .map((x) => ({ ...x, requires_confirmation: true }));
}
export async function discoverCompetitors(
  category: string,
  location: string,
  website: string,
) {
  const terms: Record<string, string> = {
    "Retail & e-commerce": "shops stores",
    "Restaurants & hospitality": "restaurants cafes",
    "Beauty & wellness": "salons beauty",
    "Professional services": "professional services",
    "Health & fitness": "gyms fitness",
    "Travel & accommodation": "hotels accommodation",
    "Software & apps": "software apps",
    "Games & entertainment": "games entertainment",
    Education: "education courses",
    Other: "business services",
  };
  const query = `${terms[category] || category} ${location} reviews businesses`;
  const { html } = await readBounded(
    "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query),
  );
  return [...html.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)]
    .flatMap(([, item]) => {
      const get = (tag: string) =>
        plain(
          item.match(
            new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
          )?.[1],
        );
      try {
        const url = publicURL(get("link"), true);
        if (new URL(url).hostname === new URL(website).hostname) return [];
        return [
          {
            title: get("title"),
            url,
            snippet: get("description").slice(0, 300),
            requires_confirmation: true,
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, 6);
}
