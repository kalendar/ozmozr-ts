import { sql } from "kysely";
import { createDb } from "../src/db/client";
import { migrateToLatest } from "../src/db/migrator";

/** Start every e2e run from an empty, fully migrated database. Runs before the web server. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !/e2e/.test(url)) throw new Error("Refusing to reset a database whose name does not contain 'e2e'");
  const db = createDb(url);
  try {
    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
