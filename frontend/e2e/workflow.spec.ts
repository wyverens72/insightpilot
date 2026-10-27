import { test, expect } from "@playwright/test";

test("imports reviews, filters evidence, and exports a local brief", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Import reviews" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Load sample data" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    /36 imported|36 duplicates/,
  );
  await dialog.getByRole("button", { name: "Close import dialog" }).click();
  await expect(page.getByLabel("Key metrics")).toContainText("36");
  await page.screenshot({ path: "../docs/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: /Review explorer/ }).click();
  await expect(page.locator("article.review")).toHaveCount(12);
  await page.getByLabel("Search reviews").fill("crashes");
  await expect(page.locator("article.review")).toHaveCount(1);
  await expect(page.locator("article.review")).toContainText(
    "export a large report",
  );
  await page
    .getByRole("button", { name: "Insight brief", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate brief" }).click();
  await expect(page.locator(".markdown")).toContainText("Based on 1 reviews");
  await expect(page.locator(".brief-notice")).toContainText(
    "No reviews were sent",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "insightpilot-brief.md",
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Import reviews" }).click();
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "interview.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "text,rating,date,source\nA helpful interview workflow,5,2026-10-27,Interview test\nInvalid rating,8,2026-10-27,Interview test\n",
    ),
  });
  await expect(dialog.getByRole("status")).toContainText(
    "1 imported · 0 duplicates · 1 rejected",
  );
  await expect(dialog.getByRole("status")).toContainText("Row 3");
  await dialog.getByRole("button", { name: "Close import dialog" }).click();
  await page.getByLabel("Filter by source").selectOption("Interview test");
  await expect(page.locator(".brief-heading")).toContainText("1 reviews");
  await page.reload();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("Key metrics")).toContainText("37");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../docs/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
