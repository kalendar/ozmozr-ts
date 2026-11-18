import path from "node:path";
import { expect, test } from "@playwright/test";
import { startFixtureServer } from "./fixture-server";
import { signUp, uniqueHandle } from "./helpers";

let fixtures: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixtures = await startFixtureServer();
});
test.afterAll(() => fixtures.close());

test("read, filter, tag and export my news", async ({ page }) => {
  await signUp(page, uniqueHandle("news"), "Nina News");
  await page.goto("/feeds/add");
  await page.getByLabel("Address").fill(`${fixtures.url}/rss2.xml`);
  await page.getByLabel("Tags").fill("blogs");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page).toHaveURL(/\/feeds\/\d+$/);

  await page.goto("/news");
  await expect(page.getByRole("link", { name: "First post" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Second post" })).toBeVisible();

  // Filter by a tag from the cloud: only the first post carries "oer".
  await page.getByLabel("Tag cloud").getByRole("link", { name: "oer", exact: true }).click();
  await expect(page).toHaveURL(/\/news\/tagged\/oer/);
  await expect(page.getByRole("link", { name: "First post" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Second post" })).toHaveCount(0);

  // Mark one read, then the Unread tab hides it.
  await page.goto("/news");
  await page.getByRole("button", { name: 'Mark "Second post" read' }).click();
  await page.getByRole("tab", { name: "Unread" }).click();
  await expect(page.getByRole("link", { name: "Third post" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Second post" })).toHaveCount(0);

  // Tag an entry from its page.
  await page.getByRole("link", { name: "Third post" }).click();
  await page.getByRole("textbox", { name: /Your tags/ }).fill('"to read" later');
  await page.getByRole("button", { name: "Save tags" }).click();
  await expect(page.getByText("Tags saved")).toBeVisible();
  await page.goto("/news/tagged/to%20read");
  await expect(page.getByRole("link", { name: "Third post" })).toBeVisible();
  await expect(page.getByRole("link", { name: "First post" })).toHaveCount(0);

  // Private RSS: works with the key, 404 without it.
  await page.goto("/news");
  const rssHref = await page.getByRole("link", { name: "This view as RSS" }).getAttribute("href");
  const rss = await page.request.get(rssHref!);
  expect(rss.status()).toBe(200);
  expect(await rss.text()).toContain("<title>First post</title>");
  expect((await page.request.get("/news.rss?key=wrong")).status()).toBe(404);
  expect((await page.request.get("/news.rss")).status()).toBe(404);

  // OPML export lists the subscription with its tag.
  const opml = await (await page.request.get("/opml")).text();
  expect(opml).toContain(`xmlUrl="${fixtures.url}/rss2.xml"`);
  expect(opml).toContain('category="blogs"');
});

test("import an OPML file", async ({ page }) => {
  await signUp(page, uniqueHandle("opml"));
  await page.goto("/feeds/import");
  await page.getByLabel("OPML file").setInputFiles(path.join(__dirname, "../src/domain/feeds/fixtures/short.opml"));
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText(/Added 4, already subscribed to 0/)).toBeVisible();
  await page.goto("/feeds?sort=alpha");
  await expect(page.getByRole("link", { name: "Boing Boing" })).toBeVisible();
});
