import { expect, test } from "@playwright/test";
import { startFixtureServer } from "./fixture-server";
import { signUp, uniqueHandle } from "./helpers";

let fixtures: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixtures = await startFixtureServer();
});
test.afterAll(() => fixtures.close());

test("add a feed and read its entries", async ({ page }) => {
  await signUp(page, uniqueHandle("reader"));
  await page.goto("/feeds/add");
  await page.getByLabel("Address").fill(`${fixtures.url}/rss2.xml`);
  await page.getByLabel("Tags").fill('oer "open education"');
  await page.getByRole("button", { name: "Subscribe" }).click();

  await expect(page).toHaveURL(/\/feeds\/\d+$/);
  await expect(page.getByRole("heading", { name: "Open Content & Friends" })).toBeVisible();
  await expect(page.getByRole("link", { name: "First post" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Third post" })).toBeVisible();
  await expect(page.getByLabel("Your tags for this feed")).toHaveValue('oer "open education"');

  await page.getByRole("link", { name: "First post" }).click();
  await expect(page.getByRole("heading", { name: "First post" })).toBeVisible();
  await expect(page.getByText("Full text")).toBeVisible();

  await page.goto("/feeds");
  await expect(page.getByRole("link", { name: "Open Content & Friends" })).toBeVisible();
  await expect(page.getByText("Subscribed")).toBeVisible();
});

test("a page with no feed gives a clear message", async ({ page }) => {
  await signUp(page, uniqueHandle("reader"));
  await page.goto("/feeds/add");
  await page.getByLabel("Address").fill(`${fixtures.url}/invalid.xml`);
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("No feed was found");
});
