import { Kysely, PostgresDialect, type Transaction } from "kysely";
import pg from "pg";
import type { DB } from "./types";

// int8 (ids, counts) -> JS number. Safe below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export type { DB };
export type Db = Kysely<DB>;

export function createDb(url: string = requireUrl()): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 10 }) }),
  });
}

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

let shared: Kysely<DB> | undefined;
/** Process-wide database handle for the web app and worker. */
export function getDb(): Kysely<DB> {
  const g = globalThis as { __ozDb?: Kysely<DB> };
  shared ??= g.__ozDb ??= createDb();
  return shared;
}

/** Run fn in a transaction, reusing the current one when already inside it. */
export async function inTx<T>(db: Db, fn: (trx: Db) => Promise<T>): Promise<T> {
  if (db.isTransaction) return fn(db);
  return db.transaction().execute((trx: Transaction<DB>) => fn(trx));
}
