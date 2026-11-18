import { createDb } from "./client";
import { migrateToLatest } from "./migrator";
import { TEST_DATABASE_URL } from "./test-db";

export default async function setup() {
  const db = createDb(TEST_DATABASE_URL);
  try {
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}
