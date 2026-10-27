import { test, expect } from "@playwright/test";

test("research starts from a URL and preserves source access labels", async ({
  page,
}) => {
  const doc = {
    id: "browser-research",
    name: "Example Product",
    url: "https://example.com/",
    status: "ready",
    created_at: "2026-10-27",
    warnings: [],
    queries: ["Example Product reviews"],
    error: null,
    report: null as null | {
      mode: string;
      content: string;
      notice: string;
      source_ids: string[];
    },
    sources: [
      {
        id: "S1",
        url: "https://example.com/",
        title: "Example product website",
        kind: "official",
        status: "read",
        excerpt:
          "Company description used as a synthetic browser-test fixture.",
        reason: null,
        characters: 500,
      },
      {
        id: "S2",
        url: "https://reviews.example.org/example",
        title: "Third-party product discussion",
        kind: "independent",
        status: "snippet",
        excerpt: "A synthetic search excerpt. Full page is unavailable.",
        reason: "Full page unavailable.",
        characters: 0,
      },
    ],
  };
  await page.route("**/api/research**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/analyze")) {
      expect(route.request().postDataJSON().source_ids).toEqual(["S1"]);
      doc.status = "complete";
      doc.report = {
        mode: "local",
        content:
          "## Evidence\nLocal source digest from selected evidence [S1](https://example.com/).",
        notice:
          "Local source digest selected. No source text was sent to an AI provider.",
        source_ids: ["S1"],
      };
    }
    await route.fulfill({ json: url.pathname === "/api/research" ? [] : doc });
  });
  await page.goto("/");
  await page.screenshot({ path: "../docs/research.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../docs/research-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(
    page.getByRole("heading", { name: "One link. A wider perspective." }),
  ).toBeVisible();
  await page.getByLabel("Product website URL").fill("https://example.com");
  await page.getByRole("button", { name: "Find sources" }).click();
  await expect(
    page.getByText("Search excerpt only", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Include S1")).toBeChecked();
  await expect(page.getByLabel("Include S2")).not.toBeChecked();
  await page.getByRole("button", { name: "Build source digest" }).click();
  await expect(page.locator(".research-report")).toContainText(
    "Local source digest from selected evidence",
  );
  await expect(
    page.locator(".research-report").getByRole("link", { name: "S1" }),
  ).toHaveAttribute("href", "https://example.com/");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export research" }).click();
  expect((await download).suggestedFilename()).toBe("insightpilot-research.md");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
