import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startFixtureServer } from "./fixture-server";
import { signUp, uniqueHandle } from "./helpers";

let fixtures: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  const dir = path.join(__dirname, "../src/domain/events/fixtures");
  fixtures = await startFixtureServer({
    "conference-page": readFileSync(path.join(dir, "conference.html"), "utf8"),
  });
});
test.afterAll(() => fixtures.close());

test("saving a page with events lists them, with conference details and a calendar feed", async ({ page }) => {
  await signUp(page, uniqueHandle("events"));
  await page.goto("/save");
  await page.getByLabel("Address").fill(`${fixtures.url}/conference-page`);
  await page.getByLabel("Title").fill("OpenEd events");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/e\/\d+$/);

  await page.goto("/news");
  const panel = page.getByRole("region", { name: "Upcoming events" });
  await expect(panel.getByRole("link", { name: "OpenEd Gathering 2027" })).toBeVisible();
  await expect(panel.getByText("Theme: Sustaining open education.")).toBeVisible();
  await expect(panel.getByText("Register by Aug 1, 2027.")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Nested workshop" })).toBeVisible();

  // Add a submission deadline to the conference.
  const gathering = panel.getByRole("listitem").filter({ hasText: "OpenEd Gathering 2027" });
  await gathering.getByText("Conference details").click();
  await gathering.getByLabel("Submit by").fill("2027-06-15");
  await gathering.getByRole("button", { name: "Save details" }).click();
  await expect(panel.getByText("Submit by Jun 15, 2027.")).toBeVisible();

  // The calendar feed needs the private key and includes the deadlines.
  const href = await panel.getByRole("link", { name: "Subscribe in your calendar (iCal)" }).getAttribute("href");
  const ics = await (await page.request.get(href!)).text();
  expect(ics).toContain("SUMMARY:OpenEd Gathering 2027");
  expect(ics).toContain("SUMMARY:Register by: OpenEd Gathering 2027");
  expect(ics).toContain("DTSTART;VALUE=DATE:20270615");
  expect((await page.request.get("/calendar.ics?key=nope")).status()).toBe(404);
});
