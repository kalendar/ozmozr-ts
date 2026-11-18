import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table entries add column events_checked_at timestamptz`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table entries drop column events_checked_at`.execute(db);
}
