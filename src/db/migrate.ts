import "dotenv/config";
import { createDb } from "./client";
import { migrateToLatest } from "./migrator";

async function main() {
  const db = createDb();
  try {
    const done = await migrateToLatest(db);
    console.log(done.length ? done.join("\n") : "Already up to date");
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
