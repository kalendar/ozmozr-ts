import { expect, test } from "@playwright/test";
import { logIn, logOut, signUp, uniqueHandle } from "./helpers";

test("sign up, land on news, sign out, sign in again", async ({ page }) => {
  const handle = uniqueHandle("ada");
  await signUp(page, handle, "Ada Lovelace");
  await expect(page.getByRole("heading", { name: "My News", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ada Lovelace" })).toBeVisible();
  await logOut(page);
  await logIn(page, handle);
  await expect(page.getByRole("heading", { name: "My News", exact: true })).toBeVisible();
});

test("signed-out visitors are sent to log in", async ({ page }) => {
  await page.goto("/news");
  await expect(page).toHaveURL(/\/login/);
});

test("a taken handle is refused with a message", async ({ page }) => {
  const handle = uniqueHandle("dup");
  await signUp(page, handle);
  await logOut(page);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`other-${handle}@example.test`);
  await page.getByLabel("Display name").fill("Other");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("already taken");
});
