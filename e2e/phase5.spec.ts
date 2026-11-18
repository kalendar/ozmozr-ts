import { expect, test } from "@playwright/test";
import { signUp, uniqueHandle } from "./helpers";

test("create a group, share an entry, vote, discuss, and see it on Popular", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const memberCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const member = await memberCtx.newPage();
  const slug = `oer-${Date.now().toString(36)}`;
  await signUp(owner, uniqueHandle("owner"), "Olive Owner");
  await signUp(member, uniqueHandle("member"), "Max Member");

  // The owner starts a group and pins a link.
  await owner.goto("/groups/new");
  await owner.getByLabel("Name").fill(`Open Readers ${slug}`);
  await owner.getByLabel("Address").fill(slug);
  await owner.getByLabel("What is it for?").fill("Sharing good reading about open education.");
  await owner.getByRole("button", { name: "Create group" }).click();
  await expect(owner).toHaveURL(new RegExp(`/g/${slug}$`));
  await expect(owner.getByText("You own this group")).toBeVisible();
  await owner.getByRole("tab", { name: "Settings" }).click();
  await owner.getByLabel("Link title").fill("Group FAQ");
  await owner.getByLabel("Link address").fill("https://example.org/faq");
  await owner.getByRole("button", { name: "Pin link" }).click();
  await expect(owner.getByRole("complementary").getByRole("link", { name: "Group FAQ" })).toBeVisible();

  // A visitor cannot vote until they join.
  await member.goto(`/g/${slug}`);
  await member.getByRole("button", { name: "Join group" }).click();
  await expect(member.getByRole("button", { name: "Leave group" })).toBeVisible();

  // The member saves a link and shares it with the group.
  await member.goto("/save");
  await member.getByLabel("Address").fill(`https://example.org/reading-${slug}`);
  await member.getByLabel("Title").fill("A fine essay");
  await member.getByLabel("Tags").fill("essays");
  await member.getByRole("button", { name: "Save", exact: true }).click();
  await expect(member).toHaveURL(/\/e\/\d+$/);
  await member.getByLabel(`Open Readers ${slug}`).check();
  await member.getByRole("button", { name: "Share with groups" }).click();
  await expect(member.getByText("Shared with 1 group")).toBeVisible();

  // Both vote it up; the owner comments and the member replies.
  await owner.goto(`/g/${slug}`);
  await expect(owner.getByRole("link", { name: "A fine essay" })).toBeVisible();
  await owner.getByRole("button", { name: "Vote up" }).click();
  await expect(owner.getByLabel("Score 1")).toBeVisible();
  await member.goto(`/g/${slug}`);
  await member.getByRole("button", { name: "Vote up" }).click();
  await expect(member.getByLabel("Score 2")).toBeVisible();

  await owner.getByRole("link", { name: "0 comments" }).click();
  await owner.getByLabel("Add a comment").fill("Great find, thank you.");
  await owner.getByRole("button", { name: "Post comment" }).click();
  await expect(owner.getByText("Great find, thank you.")).toBeVisible();

  await member.reload();
  await member.getByRole("link", { name: "1 comment" }).click();
  await member.getByText("Reply", { exact: true }).click();
  await member.getByLabel("Reply to Olive Owner").fill("Glad you liked it.");
  await member.getByRole("button", { name: "Post reply" }).click();
  await expect(member.getByText("Glad you liked it.")).toBeVisible();
  await expect(member.getByRole("heading", { name: "Discussion (2)" })).toBeVisible();

  // Popular tab and group search.
  await member.goto(`/g/${slug}/popular`);
  await expect(member.getByRole("link", { name: "A fine essay" })).toBeVisible();
  await expect(member.getByLabel("Score 2")).toBeVisible();
  await member.goto(`/search?type=groups&q=${encodeURIComponent(`Open Readers ${slug}`)}`);
  await expect(member.getByRole("link", { name: `Open Readers ${slug}` })).toBeVisible();

  // A non-owner cannot reach settings.
  const res = await member.goto(`/g/${slug}/settings`);
  expect(res?.status()).toBe(404);
  await ownerCtx.close();
  await memberCtx.close();
});
