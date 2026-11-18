import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    -- One row per pair, from the requester to the recipient.
    create table friendships (
      id bigint generated always as identity primary key,
      user_id text not null references "user"(id) on delete cascade,
      friend_id text not null references "user"(id) on delete cascade,
      status text not null default 'pending' check (status in ('pending', 'accepted')),
      created_at timestamptz not null default now(),
      unique (user_id, friend_id),
      check (user_id <> friend_id)
    );
    create index friendships_friend_idx on friendships (friend_id);

    -- Tags one side (owner_id) has put on the other.
    create table friendship_tags (
      friendship_id bigint not null references friendships(id) on delete cascade,
      tag_id bigint not null references tags(id) on delete cascade,
      owner_id text not null references "user"(id) on delete cascade,
      primary key (friendship_id, tag_id, owner_id)
    );

    create table entry_shares (
      id bigint generated always as identity primary key,
      entry_id bigint not null references entries(id) on delete cascade,
      from_user_id text not null references "user"(id) on delete cascade,
      to_user_id text not null references "user"(id) on delete cascade,
      comment text not null default '',
      created_at timestamptz not null default now(),
      unique (entry_id, from_user_id, to_user_id)
    );
    create index entry_shares_to_idx on entry_shares (to_user_id, created_at desc);

    create table profile_comments (
      id bigint generated always as identity primary key,
      profile_user_id text not null references "user"(id) on delete cascade,
      author_id text not null references "user"(id) on delete cascade,
      body text not null,
      created_at timestamptz not null default now()
    );
    create index profile_comments_profile_idx on profile_comments (profile_user_id, created_at desc);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table profile_comments, entry_shares, friendship_tags, friendships`.execute(db);
}
