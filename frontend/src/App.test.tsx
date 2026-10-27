import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";
const data = {
  total: 2,
  average_rating: 3.5,
  positive_share: 50,
  sentiments: { positive: 1, neutral: 0, negative: 1 },
  topics: [{ name: "Support", count: 2, negative: 1, positive: 1 }],
  trend: [{ month: "2026-10", count: 2, positive: 1, negative: 1, neutral: 0 }],
  available_sources: ["G2"],
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("health")
          ? { ai_configured: false }
          : url.includes("dashboard")
            ? data
            : url.includes("reviews")
              ? {
                  items: [
                    {
                      id: 1,
                      text: "Great support from a helpful team.",
                      rating: 5,
                      sentiment: "positive",
                      source: "G2",
                      date: "2026-10-20",
                      topics: ["Support"],
                    },
                  ],
                  total: 2,
                  page: 1,
                  page_size: 12,
                }
              : {
                  mode: "demo",
                  notice: "Local mode selected.",
                  content: "## Findings\nCustomers value support.",
                  review_count: 2,
                },
    })),
  );
});
test("loads persisted analytics and opens review evidence", async () => {
  render(<App />);
  expect(await screen.findByLabelText("Key metrics")).toHaveTextContent("50%");
  fireEvent.click(screen.getByRole("button", { name: /Review explorer/ }));
  expect(
    await screen.findByText("Great support from a helpful team."),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter by source"), {
    target: { value: "G2" },
  });
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("source=G2"),
      expect.anything(),
    ),
  );
});
test("generates a labeled local brief without an API key", async () => {
  render(<App />);
  await screen.findByLabelText("Key metrics");
  fireEvent.click(screen.getByRole("button", { name: "Insight brief" }));
  expect(screen.getByRole("checkbox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
  expect(
    await screen.findByText("Customers value support."),
  ).toBeInTheDocument();
  expect(screen.getByText("Local mode selected.")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("demo=true"), {
    method: "POST",
  });
});
test("shows a recoverable API error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("API unavailable")),
  );
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("API unavailable");
  expect(
    screen.getByRole("button", { name: "Retry connection" }),
  ).toBeInTheDocument();
});
test("opens an accessible import dialog with a format guide", async () => {
  render(<App />);
  await screen.findByLabelText("Key metrics");
  fireEvent.click(screen.getByRole("button", { name: "Import reviews" }));
  const modal = screen.getByRole("dialog");
  expect(within(modal).getByText("Expected columns")).toBeInTheDocument();
  expect(
    within(modal).getByRole("button", { name: "Choose CSV file" }),
  ).toBeInTheDocument();
});

test("discards a late brief after the feedback scope changes", async () => {
  const originalFetch = fetch;
  let finishBrief!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (url.includes("/brief?"))
        return new Promise<Response>((resolve) => {
          finishBrief = resolve;
        });
      return originalFetch(url, options);
    }),
  );
  render(<App />);
  await screen.findByLabelText("Key metrics");
  fireEvent.click(screen.getByRole("button", { name: "Insight brief" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
  fireEvent.change(screen.getByLabelText("Filter by source"), {
    target: { value: "G2" },
  });
  await screen.findByRole("button", { name: "Generate brief" });
  await act(async () => {
    finishBrief({
      ok: true,
      json: async () => ({
        mode: "demo",
        notice: "Old scope",
        content: "Stale analysis",
        review_count: 2,
      }),
    } as Response);
  });
  expect(screen.queryByText("Stale analysis")).not.toBeInTheDocument();
});
