import "dotenv/config";
import { PgBoss } from "pg-boss";
import { getDb } from "@/db/client";
import { enqueueDueFeeds, HARVEST_DUE, HARVEST_FEED, runHarvest } from "./jobs";

/**
 * The background worker: every minute it queues a harvest for each feed that is
 * due, and harvests up to five feeds at a time.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = getDb();
  const boss = new PgBoss(url);
  boss.on("error", (err) => console.error("[worker]", err));
  await boss.start();

  await boss.createQueue(HARVEST_DUE, { policy: "short" });
  // At most one queued and one running harvest per feed.
  await boss.createQueue(HARVEST_FEED, { policy: "stately", retryLimit: 0 });

  await boss.work(HARVEST_DUE, async () => {
    const queued = await enqueueDueFeeds(db, (feedId) =>
      boss.send(HARVEST_FEED, { feedId }, { singletonKey: String(feedId) }),
    );
    if (queued > 0) console.log(`[worker] queued ${queued} feed(s)`);
  });

  await boss.work<{ feedId: number }>(HARVEST_FEED, { localConcurrency: 5 }, async ([job]) => {
    if (!job) return;
    const result = await runHarvest(db, job.data.feedId);
    console.log(`[worker] feed ${job.data.feedId}: ${result.status}, ${result.newEntries} new`);
  });

  await boss.schedule(HARVEST_DUE, "* * * * *");
  await boss.send(HARVEST_DUE, {});
  console.log("[worker] started");

  const stop = async () => {
    await boss.stop();
    await db.destroy();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
