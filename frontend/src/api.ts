export type Review = {
  id: number;
  text: string;
  rating: number | null;
  date: string;
  source: string;
  sentiment: "positive" | "neutral" | "negative";
  topics: string[];
};
export type Dashboard = {
  total: number;
  average_rating: number | null;
  positive_share: number;
  sentiments: Record<string, number>;
  topics: { name: string; count: number; negative: number; positive: number }[];
  trend: {
    month: string;
    count: number;
    positive: number;
    negative: number;
    neutral: number;
  }[];
  available_sources: string[];
};
export type ReviewPage = {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
};
export type Brief = {
  mode: "ai" | "demo";
  notice: string;
  content: string;
  review_count: number;
};
export type ImportResult = {
  imported: number;
  duplicates: number;
  rejected: number;
  errors: { row: number; message: string }[];
};
export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "The request could not be completed. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}
