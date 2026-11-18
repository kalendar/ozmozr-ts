import { expect, test } from "@playwright/test";
import { signUp, uniqueHandle } from "./helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("befriend, share an entry with a note, and comment on a profile", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();
  const aliceHandle = uniqueHandle("alice");
  const bobHandle = uniqueHandle("bob");
  await signUp(alice, aliceHandle, "Alice Example");
  await signUp(bob, bobHandle, "Bob Example");

  // Alice edits her profile, with a picture.
  await alice.goto("/settings");
  await alice.getByLabel("About you").fill("I read about open education.");
  await alice.getByLabel("Website").fill("https://alice.example/");
  await alice.getByLabel("Picture").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 });
  await alice.getByRole("button", { name: "Save profile" }).click();
  await expect(alice.getByText("Profile saved")).toBeVisible();

  // Alice asks; Bob accepts.
  await alice.goto(`/u/${bobHandle}`);
  await alice.getByRole("button", { name: "Add friend" }).click();
  await expect(alice.getByRole("button", { name: "Cancel friend request" })).toBeVisible();
  await bob.goto("/friends");
  await expect(bob.getByRole("heading", { name: "Friend requests" })).toBeVisible();
  await bob.getByRole("button", { name: "Accept" }).click();
  await expect(bob.getByRole("link", { name: "Alice Example" })).toBeVisible();
  await expect(bob.getByRole("heading", { name: "Friend requests" })).toHaveCount(0);

  // Alice saves a link and shares it with Bob.
  await alice.goto("/save");
  await alice.getByLabel("Address").fill(`https://example.org/${aliceHandle}`);
  await alice.getByLabel("Title").fill("Worth your time");
  await alice.getByRole("button", { name: "Save", exact: true }).click();
  await expect(alice).toHaveURL(/\/e\/\d+$/);
  await alice.getByLabel("Bob Example").check();
  await alice.getByRole("region", { name: "Share with friends" }).getByLabel("Note (optional)").fill("Thought of you");
  await alice.getByRole("button", { name: "Share", exact: true }).click();
  await expect(alice.getByText("Shared with 1 friend")).toBeVisible();

  await bob.goto("/news/shared");
  await expect(bob.getByRole("link", { name: "Worth your time" })).toBeVisible();
  await expect(bob.getByText("Thought of you")).toBeVisible();

  // Bob sees Alice's profile and leaves a comment; markup is shown as text.
  await bob.goto(`/u/${aliceHandle}`);
  await expect(bob.getByText("I read about open education.")).toBeVisible();
  await expect(bob.getByRole("link", { name: "Worth your time" })).toBeVisible();
  await expect(bob.locator("header img")).toHaveAttribute("src", /^\/uploads\/avatar\/[a-f0-9]{32}\.webp$/);
  await bob.getByLabel("Write a comment").fill("Nice links <b>Alice</b>");
  await bob.getByRole("button", { name: "Post comment" }).click();
  await expect(bob.getByText("Nice links <b>Alice</b>")).toBeVisible();

  // The directory lists both.
  await bob.goto("/people");
  await expect(bob.getByRole("link", { name: "Alice Example" })).toBeVisible();
  await aliceCtx.close();
  await bobCtx.close();
});
