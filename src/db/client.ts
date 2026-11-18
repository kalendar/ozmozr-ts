import { Kysely, PostgresDialect, type Transaction } from "kysely";
import pg from "pg";
import type { DB } from "./types";

// int8 (ids, counts) -> JS number. Safe below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export type { DB };
export type Db = Kysely<DB>;

export function createDb(url: string = requireUrl()): Kysely<DB> {
  return fromPool(new pg.Pool({ connectionString: url, max: 10 }));
}

function fromPool(pool: pg.Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const g = globalThis as { __ozPool?: pg.Pool; __ozDb?: Kysely<DB> };

/** Process-wide connection pool, shared by Kysely and the auth library. */
export function getPool(): pg.Pool {
  return (g.__ozPool ??= new pg.Pool({ connectionString: requireUrl(), max: 10 }));
}

/** Process-wide database handle for the web app and worker. */
export function getDb(): Kysely<DB> {
  return (g.__ozDb ??= fromPool(getPool()));
}

/** Run fn in a transaction, reusing the current one when already inside it. */
export async function inTx<T>(db: Db, fn: (trx: Db) => Promise<T>): Promise<T> {
  if (db.isTransaction) return fn(db);
  return db.transaction().execute((trx: Transaction<DB>) => fn(trx));
}
