export type Review = {
  id: number;
  text: string;
  rating: number | null;
  date: string;
  source: string;
  sentiment: string;
  topics: string[];
  fingerprint?: string;
};
export const topics: Record<string, string[]> = {
  Performance: [
    "slow",
    "fast",
    "speed",
    "load",
    "crash",
    "lag",
    "performance",
    "freeze",
  ],
  "Ease of use": [
    "easy",
    "intuitive",
    "confusing",
    "navigation",
    "interface",
    "onboarding",
    "setup",
  ],
  Pricing: [
    "price",
    "pricing",
    "expensive",
    "cost",
    "subscription",
    "value",
    "affordable",
  ],
  Support: ["support", "helpful", "response", "service", "ticket"],
  Features: [
    "feature",
    "export",
    "integration",
    "search",
    "filter",
    "report",
    "dashboard",
  ],
};
export function classify(text: string, rating: number | null) {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) || []);
  const score =
    [
      "love",
      "great",
      "excellent",
      "easy",
      "fast",
      "helpful",
      "intuitive",
      "affordable",
      "reliable",
      "amazing",
    ].filter((w) => words.has(w)).length -
    [
      "slow",
      "bad",
      "crash",
      "confusing",
      "expensive",
      "broken",
      "poor",
      "frustrating",
      "terrible",
      "unreliable",
    ].filter((w) => words.has(w)).length;
  const sentiment = rating
    ? rating >= 4
      ? "positive"
      : rating <= 2
        ? "negative"
        : "neutral"
    : score > 0
      ? "positive"
      : score < 0
        ? "negative"
        : "neutral";
  const found = Object.entries(topics)
    .filter(([, values]) => values.some((w) => words.has(w)))
    .map(([name]) => name);
  return { sentiment, topics: found.length ? found : ["Other"] };
}
export function summarize(rows: Review[]) {
  const sentiments: Record<string, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  const categories: Record<
    string,
    { name: string; count: number; negative: number; positive: number }
  > = {};
  const trend: Record<
    string,
    {
      month: string;
      count: number;
      positive: number;
      neutral: number;
      negative: number;
    }
  > = {};
  for (const r of rows) {
    sentiments[r.sentiment]++;
    for (const name of r.topics) {
      categories[name] ??= { name, count: 0, negative: 0, positive: 0 };
      categories[name].count++;
      if (r.sentiment === "positive" || r.sentiment === "negative")
        categories[name][r.sentiment]++;
    }
    const month = r.date.slice(0, 7);
    trend[month] ??= { month, count: 0, positive: 0, neutral: 0, negative: 0 };
    trend[month].count++;
    trend[month][r.sentiment as "positive" | "negative" | "neutral"]++;
  }
  const ratings = rows
    .map((r) => r.rating)
    .filter((r): r is number => r !== null);
  return {
    total: rows.length,
    average_rating: ratings.length
      ? Math.round(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100,
        ) / 100
      : null,
    positive_share: rows.length
      ? Math.round((sentiments.positive / rows.length) * 100)
      : 0,
    sentiments,
    topics: Object.values(categories).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
    trend: Object.values(trend).sort((a, b) => a.month.localeCompare(b.month)),
    sources: [...new Set(rows.map((r) => r.source))].sort(),
  };
}
export function parseCSV(input: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!quoted && field.length)
        throw new Error("Quote appears inside an unquoted field.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.length)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
export function reviewBrief(rows: Review[]) {
  const stats = summarize(rows);
  return {
    mode: "demo",
    notice: "Local review analysis. No paid AI provider is used.",
    review_count: rows.length,
    content: `## Customer feedback brief\n\nBased on ${rows.length} reviews: ${stats.positive_share}% positive.\n\n### Recurring topics\n${stats.topics.map((t) => `- **${t.name}**: ${t.count} mentions, including ${t.negative} negative.`).join("\n")}\n\n### Evidence\n${rows
      .filter((r) => r.sentiment === "negative")
      .slice(0, 3)
      .map((r) => `- Review #${r.id}: ${r.text.slice(0, 240)}`)
      .join(
        "\n",
      )}\n\n### Next steps\nValidate repeated issues with customers before prioritizing changes. Rating and keyword rules can miss context, sarcasm, and mixed opinions.`,
  };
}
