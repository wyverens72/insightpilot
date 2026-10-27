import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import Research from "./Research";
const sources = [
  {
    id: "S1",
    url: "https://acme.com/",
    title: "Acme official website",
    kind: "official",
    status: "read",
    excerpt: "Company claims about its product.",
    reason: null,
    characters: 700,
  },
  {
    id: "S2",
    url: "https://reviews.example.com/acme",
    title: "Acme customer discussion",
    kind: "independent",
    status: "snippet",
    excerpt: "A short search result only.",
    reason: "Full page is unavailable.",
    characters: 0,
  },
];
const doc = {
  id: "research-test",
  url: "https://acme.com/",
  name: "Acme",
  status: "ready",
  created_at: "2026-10-27",
  sources,
  warnings: [],
  queries: ["Acme reviews"],
  report: null,
  error: null,
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      return {
        ok: true,
        json: async () =>
          url === "/api/research"
            ? []
            : url.endsWith("/analyze")
              ? {
                  ...doc,
                  status: "complete",
                  report: {
                    mode: "local",
                    content: "## Evidence\nSelected material only.",
                    notice: "Local source digest selected.",
                    source_ids: body.source_ids,
                  },
                }
              : doc,
      };
    }),
  );
});
test("discovers sources, distinguishes excerpts, and analyzes only the selection", async () => {
  render(<Research aiConfigured={false} onAiConfigured={() => {}} />);
  fireEvent.change(screen.getByLabelText("Product website URL"), {
    target: { value: "https://acme.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find sources" }));
  expect(
    await screen.findByText("Acme customer discussion"),
  ).toBeInTheDocument();
  expect(screen.getByText("Search excerpt only")).toBeInTheDocument();
  expect(screen.getByLabelText("Include S1")).toBeChecked();
  expect(screen.getByLabelText("Include S2")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Build source digest" }));
  expect(
    await screen.findByText("Selected material only."),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/research/research-test/analyze",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Acme",
          source_ids: ["S1"],
          use_ai: false,
        }),
      }),
    ),
  );
});
test("explains the key requirement and keeps the key out of persistent storage", async () => {
  const configured = vi.fn();
  render(<Research aiConfigured={false} onAiConfigured={configured} />);
  fireEvent.click(screen.getByText("Enable AI synthesis"));
  fireEvent.change(screen.getByLabelText("OpenAI API key"), {
    target: { value: "test-key-with-at-least-twenty-characters" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Enable for this session" }),
  );
  await waitFor(() => expect(configured).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("OpenAI API key")).toHaveValue("");
  expect(
    screen.getByText(/The key stays in server memory/),
  ).toBeInTheDocument();
});
test("shows an actionable discovery error without a fictional report", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: url === "/api/research",
      json: async () =>
        url === "/api/research"
          ? []
          : { detail: "Enter a public website URL." },
    })),
  );
  render(<Research aiConfigured={false} onAiConfigured={() => {}} />);
  fireEvent.change(screen.getByLabelText("Product website URL"), {
    target: { value: "http://localhost" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find sources" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Enter a public website URL.",
  );
  expect(
    screen.queryByRole("button", { name: "Export research" }),
  ).not.toBeInTheDocument();
});
