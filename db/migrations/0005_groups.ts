import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table groups (
      id bigint generated always as identity primary key,
      slug text not null unique,
      title text not null,
      description text not null,
      image_path text,
      created_at timestamptz not null default now(),
      search tsvector generated always as (
        setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', left(description, 5000)), 'B')
      ) stored
    );
    create unique index groups_title_lower_idx on groups (lower(title));
    create index groups_search_idx on groups using gin (search);

    create table group_members (
      group_id bigint not null references groups(id) on delete cascade,
      user_id text not null references "user"(id) on delete cascade,
      role text not null default 'member' check (role in ('owner', 'member')),
      created_at timestamptz not null default now(),
      primary key (group_id, user_id)
    );
    create index group_members_user_idx on group_members (user_id);

    create table group_feeds (
      group_id bigint not null references groups(id) on delete cascade,
      feed_id bigint not null references feeds(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (group_id, feed_id)
    );

    create table group_entries (
      id bigint generated always as identity primary key,
      group_id bigint not null references groups(id) on delete cascade,
      entry_id bigint not null references entries(id) on delete cascade,
      shared_by text not null references "user"(id) on delete cascade,
      comment text not null default '',
      created_at timestamptz not null default now(),
      unique (group_id, entry_id)
    );
    create index group_entries_group_idx on group_entries (group_id, created_at desc);

    create table group_entry_votes (
      group_entry_id bigint not null references group_entries(id) on delete cascade,
      user_id text not null references "user"(id) on delete cascade,
      value smallint not null check (value in (1, -1)),
      created_at timestamptz not null default now(),
      primary key (group_entry_id, user_id)
    );

    create table group_entry_comments (
      id bigint generated always as identity primary key,
      group_entry_id bigint not null references group_entries(id) on delete cascade,
      parent_id bigint references group_entry_comments(id) on delete cascade,
      author_id text not null references "user"(id) on delete cascade,
      body text not null,
      created_at timestamptz not null default now()
    );
    create index group_entry_comments_entry_idx on group_entry_comments (group_entry_id, created_at);

    create table group_links (
      id bigint generated always as identity primary key,
      group_id bigint not null references groups(id) on delete cascade,
      url text not null,
      title text not null,
      position integer not null default 0,
      created_at timestamptz not null default now()
    );
    create index group_links_group_idx on group_links (group_id, position);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table group_links, group_entry_comments, group_entry_votes, group_entries, group_feeds, group_members, groups`.execute(db);
}
