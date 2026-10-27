export type StoredReview = {
  id: string;
  business_id: string;
  source_id: string;
  body: string;
  title: string;
  rating: number | null;
  sentiment: string;
  topics: string;
  published: string | null;
  first_seen: string;
  url: string;
  author: string;
  language: string;
};
const rules: [string, RegExp][] = [
  [
    "Customer support",
    /\b(support|customer service|rude|unhelpful|response|staff)\b|поддержк|персонал|обслужив/i,
  ],
  [
    "Pricing & billing",
    /\b(price|pricing|expensive|subscription|charge[ds]?|billing|refund|payment|paywall|cost)\b|оплат|возврат|дорого|подписк/i,
  ],
  [
    "Reliability",
    /\b(crash|crashes|bug|bugs|broken|error|outage|glitch|unreliable|freeze|freezes)\b|ошибк|вылет|не работает/i,
  ],
  [
    "Speed & waiting",
    /\b(slow|lag|waiting|waited|queue|delay|delayed|loading|wait)\b|медлен|ожидани|задержк/i,
  ],
  [
    "Ease of use",
    /\b(confusing|difficult|intuitive|interface|navigation|usability|easy to use|complicated)\b|неудоб|интерфейс|удоб/i,
  ],
  [
    "Quality & experience",
    /\b(quality|dirty|clean|taste|fresh|damaged|defect|experience)\b|качеств|грязн|вкус|свеж/i,
  ],
  [
    "Delivery & access",
    /\b(delivery|shipping|arrived|order|login|log in|sign in|account|locked)\b|достав|заказ|аккаунт|вход/i,
  ],
];
export function signals(
  body: string,
  rating: number | null,
  provided?: string,
) {
  const negative =
    /\b(terrible|awful|worst|hate|broken|unusable|disappointed|useless|scam|rude|crashes|expensive|unhelpful)\b|ужас|плох|обман|не работает/i.test(
      body,
    );
  const positive =
    /\b(excellent|great|love|amazing|perfect|helpful|recommend|fantastic)\b|отличн|прекрасн|рекоменд/i.test(
      body,
    );
  const sentiment =
    provided && ["positive", "negative"].includes(provided)
      ? provided
      : rating !== null
        ? rating <= 2
          ? "negative"
          : rating >= 4
            ? "positive"
            : "neutral"
        : negative
          ? "negative"
          : positive
            ? "positive"
            : "unknown";
  return {
    sentiment,
    topics: rules.filter(([, re]) => re.test(body)).map(([label]) => label),
  };
}
const day = 86400000;
export function reviewStats(rows: StoredReview[], now = Date.now()) {
  const valid = rows.filter(
    (r) => r.published && Date.parse(r.published) <= now,
  );
  const window = (start: number, end: number) =>
    valid.filter(
      (r) =>
        Date.parse(r.published!) >= start && Date.parse(r.published!) < end,
    );
  const stat = (items: StoredReview[]) => {
    const rated = items.filter((r) => r.rating !== null),
      classified = items.filter((r) => r.sentiment !== "unknown");
    return {
      total: items.length,
      negative: items.filter((r) => r.sentiment === "negative").length,
      positive: items.filter((r) => r.sentiment === "positive").length,
      unknown: items.filter((r) => r.sentiment === "unknown").length,
      rated: rated.length,
      average: rated.length
        ? Math.round(
            (rated.reduce((n, r) => n + Number(r.rating), 0) / rated.length) *
              100,
          ) / 100
        : null,
      negative_share: classified.length
        ? Math.round(
            (items.filter((r) => r.sentiment === "negative").length /
              classified.length) *
              100,
          )
        : null,
      classified: classified.length,
    };
  };
  const currentRows = window(now - 7 * day, now + 1),
    previousRows = window(now - 14 * day, now - 7 * day);
  const current = stat(currentRows),
    previous = stat(previousRows);
  const topics = rules
    .map(([name]) => {
      const includes = (r: StoredReview) => {
        try {
          return JSON.parse(r.topics).includes(name);
        } catch {
          return false;
        }
      };
      const matching = rows.filter(includes),
        complaints = matching.filter((r) => r.sentiment === "negative");
      const c = currentRows.filter(
          (r) => r.sentiment === "negative" && includes(r),
        ),
        p = previousRows.filter(
          (r) => r.sentiment === "negative" && includes(r),
        );
      return {
        name,
        total: matching.length,
        complaints: complaints.length,
        current: c.length,
        previous: p.length,
        delta: c.length - p.length,
        evidence: complaints.slice(0, 8).map((r) => r.id),
      };
    })
    .filter((t) => t.total)
    .sort((a, b) => b.complaints - a.complaints || b.total - a.total);
  const trend = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(now - (13 - i) * day).toISOString().slice(0, 10);
    return {
      date,
      ...stat(valid.filter((r) => r.published!.slice(0, 10) === date)),
    };
  });
  return {
    all: stat(rows),
    current,
    previous,
    delta: {
      reviews: current.total - previous.total,
      negative: current.negative - previous.negative,
      average:
        current.average !== null && previous.average !== null
          ? Math.round((current.average - previous.average) * 100) / 100
          : null,
    },
    undated: rows.length - valid.length,
    topics,
    trend,
  };
}
export function spikeCandidates(
  rows: StoredReview[],
  min: number,
  multiplier: number,
  now = Date.now(),
) {
  const stats = reviewStats(rows, now);
  const total =
    stats.current.negative >= min &&
    stats.current.negative >= Math.max(1, stats.previous.negative) * multiplier;
  const alerts: {
    key: string;
    title: string;
    body: string;
    evidence: string[];
  }[] = [];
  if (total)
    alerts.push({
      key: "all",
      title: "Complaint volume increased",
      body: `${stats.current.negative} negative reviews in the last 7 days, compared with ${stats.previous.negative} in the previous 7 days. This is a change in the collected sample, not total customer sentiment.`,
      evidence: rows
        .filter(
          (r) =>
            r.sentiment === "negative" &&
            r.published &&
            Date.parse(r.published) >= now - 7 * day,
        )
        .slice(0, 8)
        .map((r) => r.id),
    });
  for (const t of stats.topics)
    if (t.current >= min && t.current >= Math.max(1, t.previous) * multiplier)
      alerts.push({
        key: t.name,
        title: `More complaints about ${t.name.toLowerCase()}`,
        body: `${t.current} negative reviews mention this topic in the last 7 days; ${t.previous} in the previous 7 days. Check the linked reviews before taking action.`,
        evidence: t.evidence,
      });
  return alerts;
}
