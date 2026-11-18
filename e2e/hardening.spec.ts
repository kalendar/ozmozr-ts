import { expect, test } from "@playwright/test";
import { signUp, uniqueHandle } from "./helpers";

test("pages carry security headers and run without CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  const response = await page.goto("/");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");

  // Interactive pages still work under the policy.
  await signUp(page, uniqueHandle("csp"));
  await page.goto("/feeds/add");
  await page.getByLabel("Address").fill("http://127.0.0.1:1/nothing-here");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  expect(violations).toEqual([]);
});

test("unknown pages show a friendly 404", async ({ page }) => {
  const response = await page.goto("/definitely/not/here");
  expect(response!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await page.goto("/feeds/999999999"))!.status()).toBe(404);
  expect((await page.request.get("/uploads/avatar/../../package.json")).status()).toBe(404);
});
