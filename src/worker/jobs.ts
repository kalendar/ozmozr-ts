import type { Db } from "@/db/client";
import { harvestFeed, type HarvestResult } from "@/domain/feeds/harvest";
import { dueFeedIds } from "@/domain/feeds/repo";

export const HARVEST_DUE = "harvest-due";
export const HARVEST_FEED = "harvest-feed";
export const SWEEP_LIMIT = 200;

/** Queues one harvest per due feed; returns how many were queued. */
export async function enqueueDueFeeds(
  db: Db,
  send: (feedId: number) => Promise<unknown>,
  now: Date = new Date(),
  limit: number = SWEEP_LIMIT,
): Promise<number> {
  const ids = await dueFeedIds(db, now, limit);
  for (const id of ids) await send(id);
  return ids.length;
}

export async function runHarvest(db: Db, feedId: number): Promise<HarvestResult> {
  return harvestFeed(db, feedId);
}
