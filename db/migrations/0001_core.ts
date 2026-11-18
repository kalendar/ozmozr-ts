import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table feeds (
      id bigint generated always as identity primary key,
      url text not null unique,
      site_url text,
      title text not null default '',
      description text not null default '',
      kind text not null default 'rss' check (kind in ('rss', 'bookmarks')),
      etag text,
      last_modified text,
      refreshed_at timestamptz,
      next_refresh_at timestamptz not null default now(),
      failure_count integer not null default 0,
      last_error text,
      created_at timestamptz not null default now()
    );
    create index feeds_due_idx on feeds (next_refresh_at) where kind = 'rss';

    create table entries (
      id bigint generated always as identity primary key,
      feed_id bigint not null references feeds(id) on delete cascade,
      guid text not null,
      url text,
      title text not null,
      summary text not null default '',
      content_html text not null default '',
      author text,
      published_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      unique (feed_id, guid)
    );
    create index entries_feed_published_idx on entries (feed_id, published_at desc);
    create index entries_published_idx on entries (published_at desc, id desc);
    create index entries_url_idx on entries (url);

    create table tags (
      id bigint generated always as identity primary key,
      name text not null unique,
      created_at timestamptz not null default now()
    );

    create table profiles (
      id bigint generated always as identity primary key,
      user_id text not null unique,
      handle text not null,
      display_name text not null,
      blurb text not null default '',
      location text not null default '',
      website text not null default '',
      avatar_path text,
      feed_key text not null unique,
      bookmark_feed_id bigint references feeds(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create unique index profiles_handle_lower_idx on profiles (lower(handle));

    create table subscriptions (
      id bigint generated always as identity primary key,
      user_id text not null,
      feed_id bigint not null references feeds(id) on delete cascade,
      title text not null default '',
      created_at timestamptz not null default now(),
      unique (user_id, feed_id)
    );
    create index subscriptions_feed_idx on subscriptions (feed_id);

    create table subscription_tags (
      subscription_id bigint not null references subscriptions(id) on delete cascade,
      tag_id bigint not null references tags(id) on delete cascade,
      primary key (subscription_id, tag_id)
    );
    create index subscription_tags_tag_idx on subscription_tags (tag_id);

    create table entry_tags (
      id bigint generated always as identity primary key,
      entry_id bigint not null references entries(id) on delete cascade,
      tag_id bigint not null references tags(id) on delete cascade,
      user_id text,
      created_at timestamptz not null default now(),
      unique nulls not distinct (entry_id, tag_id, user_id)
    );
    create index entry_tags_tag_idx on entry_tags (tag_id);
    create index entry_tags_user_idx on entry_tags (user_id);

    create table entry_reads (
      user_id text not null,
      entry_id bigint not null references entries(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, entry_id)
    );
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists entry_reads, entry_tags, subscription_tags, subscriptions, profiles, tags, entries, feeds cascade
  `.execute(db);
}
