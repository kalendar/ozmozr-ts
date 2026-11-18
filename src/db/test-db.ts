import type { Kysely } from "kysely";
import { createDb, type DB } from "./client";

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://localhost:5432/ozmozr_test";

let pool: Kysely<DB> | undefined;

/** Runs fn inside a transaction on the test database that is always rolled back. */
export async function withTestDb(fn: (db: Kysely<DB>) => Promise<void>): Promise<void> {
  pool ??= createDb(TEST_DATABASE_URL);
  const trx = await pool.startTransaction().execute();
  try {
    await fn(trx);
  } finally {
    await trx.rollback().execute();
  }
}

/**
 * Asserts that fn fails with a database error, without aborting the surrounding
 * transaction (uses a savepoint).
 */
export async function expectDbError(db: Kysely<DB>, fn: (db: Kysely<DB>) => Promise<unknown>): Promise<string> {
  const trx = db as unknown as import("kysely").ControlledTransaction<DB>;
  const sp = await trx.savepoint("expect_err").execute();
  try {
    await fn(sp);
  } catch (err) {
    await sp.rollbackToSavepoint("expect_err").execute();
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("Expected a database error, but the statement succeeded");
}
