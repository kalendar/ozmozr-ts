import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table feeds add column search tsvector generated always as (
      setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', left(description, 5000)), 'B')
    ) stored;
    create index feeds_search_idx on feeds using gin (search);

    alter table entries add column search tsvector generated always as (
      setweight(to_tsvector('english', title), 'A') ||
      setweight(to_tsvector('english', summary), 'B') ||
      setweight(to_tsvector('english', left(regexp_replace(content_html, '<[^>]+>', ' ', 'g'), 100000)), 'C')
    ) stored;
    create index entries_search_idx on entries using gin (search);

    alter table profiles add column search tsvector generated always as (
      setweight(to_tsvector('simple', handle || ' ' || display_name), 'A') ||
      setweight(to_tsvector('english', left(blurb, 5000) || ' ' || location), 'B')
    ) stored;
    create index profiles_search_idx on profiles using gin (search);

    -- A person's saved links: which entries they saved, with their private note.
    create table saves (
      user_id text not null references "user"(id) on delete cascade,
      entry_id bigint not null references entries(id) on delete cascade,
      comment text not null default '',
      created_at timestamptz not null default now(),
      primary key (user_id, entry_id)
    );
    create index saves_entry_idx on saves (entry_id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop table saves;
    alter table profiles drop column search;
    alter table entries drop column search;
    alter table feeds drop column search;
  `.execute(db);
}
