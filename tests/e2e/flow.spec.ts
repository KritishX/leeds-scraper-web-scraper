import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Store -> Page Metadata Reader -> Start -> SUCCEEDED -> results", async ({
  page,
}) => {
  await page.goto("/store");
  await expect(page).toHaveTitle("Store · Leeds Harvester");
  await page.getByLabel("Search Actors").fill("metadata");
  await page.getByRole("link", { name: /Page Metadata Reader/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Page Metadata Reader" }),
  ).toBeVisible();
  await page.getByLabel("Start URLs 1").fill("https://shop.example/");
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/);
  await expect(page.locator(".run-summary .run-status")).toHaveText(
    "SUCCEEDED",
    { timeout: 15_000 },
  );
  await expect(page.getByRole("tab", { name: "Output" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const table = page.locator(".output-table");
  await expect(table).toContainText("Fixture Shop");
  await expect(table).toContainText("https://shop.example/");
});

test("Store and Actor pages have no serious or critical accessibility issues", async ({
  page,
}) => {
  for (const path of ["/store", "/actors/metadata-extractor"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(
      serious.map((v) => v.id),
      path,
    ).toEqual([]);
  }
});
