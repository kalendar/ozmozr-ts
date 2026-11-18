import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table rate_limits (
      key text not null,
      window_start timestamptz not null,
      count integer not null default 0,
      primary key (key, window_start)
    );
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table rate_limits`.execute(db);
}
