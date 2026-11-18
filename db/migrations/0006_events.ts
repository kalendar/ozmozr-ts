import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table events (
      id bigint generated always as identity primary key,
      entry_id bigint not null references entries(id) on delete cascade,
      name text not null,
      starts_at timestamptz not null,
      ends_at timestamptz,
      location text,
      url text not null,
      description text not null default '',
      created_at timestamptz not null default now(),
      unique (entry_id, name, starts_at)
    );
    create index events_starts_idx on events (starts_at);

    -- The conference sub-type: an event with a theme and two deadlines.
    create table conferences (
      event_id bigint primary key references events(id) on delete cascade,
      theme text,
      register_by timestamptz,
      submit_by timestamptz
    );
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table conferences, events`.execute(db);
}
