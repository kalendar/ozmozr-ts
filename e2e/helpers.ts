import { expect, type Page } from "@playwright/test";

let counter = 0;
export function uniqueHandle(prefix = "user"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter}`;
}

export const PASSWORD = "correct-horse-battery";

export async function signUp(page: Page, handle: string, displayName = handle): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/news/);
}

export async function logIn(page: Page, handle: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/news/);
}

export async function logOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
}
