import { expect, test } from "@playwright/test";
import { startFixtureServer } from "./fixture-server";
import { signUp, uniqueHandle } from "./helpers";

let fixtures: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixtures = await startFixtureServer({ article: "<html><head><title>A Saved Article</title></head><body>Hi</body></html>" });
});
test.afterAll(() => fixtures.close());

test("save a link from the bookmarklet address, then find it by tag and search", async ({ page }) => {
  await signUp(page, uniqueHandle("saver"));
  const unique = `zebra${Date.now().toString(36)}`;
  await page.goto(`/save?u=${encodeURIComponent(`${fixtures.url}/article`)}`);
  await expect(page.getByLabel("Title")).toHaveValue("A Saved Article"); // fetched from the page
  await page.getByLabel("Title").fill(`Quagga ${unique} notes`);
  await page.getByLabel("Tags").fill(`${unique} "field notes"`);
  await page.getByLabel("Note (optional)").fill("Compare with the 2006 version");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page).toHaveURL(/\/e\/\d+$/);
  await expect(page.getByText("Compare with the 2006 version")).toBeVisible();

  await page.goto("/news/saved");
  await expect(page.getByRole("link", { name: `Quagga ${unique} notes` })).toBeVisible();

  await page.goto(`/tags/${unique}/field%20notes`);
  await expect(page.getByRole("link", { name: `Quagga ${unique} notes` })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search", exact: true }).fill(`quagga ${unique}`);
  await page.getByRole("searchbox", { name: "Search", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole("link", { name: `Quagga ${unique} notes` })).toBeVisible();

  await page.goto("/search?q=!!!");
  await expect(page.getByText("Nothing found")).toBeVisible();
});
