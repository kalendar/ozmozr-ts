import "dotenv/config";
import { betterAuth } from "better-auth";
import { harvestFeed } from "@/domain/feeds/harvest";
import { subscribeToUrl } from "@/domain/feeds/repo";
import { createGroup } from "@/domain/groups/repo";
import { createProfile, getProfileByHandle } from "@/domain/people/profiles";
import { getDb, getPool } from "./client";

/**
 * Development seed: a demo account (credentials come from DEMO_EMAIL and
 * DEMO_PASSWORD in .env), two real feeds and a group. Safe to run twice.
 */
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("The demo seed is for development only");
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) throw new Error("Set DEMO_EMAIL and DEMO_PASSWORD in .env (see .env.example)");
  const db = getDb();
  const auth = betterAuth({ database: getPool(), emailAndPassword: { enabled: true, minPasswordLength: 8 } });

  let userId = (await getProfileByHandle(db, "demo"))?.user_id;
  if (!userId) {
    const created = await auth.api.signUpEmail({ body: { email, password, name: "Demo Reader" } });
    userId = created.user.id;
    await createProfile(db, { userId, handle: "demo", displayName: "Demo Reader" });
    console.log("Created the demo account");
  }
  for (const [url, tags] of [
    ["https://xkcd.com/atom.xml", ["comics", "science"]],
    ["https://www.nasa.gov/feed/", ["space", "science"]],
  ] as const) {
    try {
      const { feedId, created } = await subscribeToUrl(db, userId, { url, tags: [...tags] });
      const result = created ? await harvestFeed(db, feedId) : { status: "already there", newEntries: 0 };
      console.log(`${url}: ${result.status}, ${result.newEntries} new`);
    } catch (err) {
      console.log(`${url}: skipped (${err instanceof Error ? err.message : err})`);
    }
  }
  try {
    await createGroup(db, userId, { title: "Open Education Readers", slug: "open-ed", description: "Sharing and ranking good reading about open education." });
    console.log("Created the demo group");
  } catch {
    // already exists
  }
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
