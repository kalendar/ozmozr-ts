import type { ColumnType, Generated, Selectable } from "kysely";

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;

export interface FeedsTable {
  id: Generated<number>;
  url: string;
  site_url: string | null;
  title: Generated<string>;
  description: Generated<string>;
  kind: Generated<"rss" | "bookmarks">;
  etag: string | null;
  last_modified: string | null;
  refreshed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  next_refresh_at: Timestamp;
  failure_count: Generated<number>;
  last_error: string | null;
  created_at: CreatedAt;
}

export interface EntriesTable {
  id: Generated<number>;
  feed_id: number;
  guid: string;
  url: string | null;
  title: string;
  summary: Generated<string>;
  content_html: Generated<string>;
  author: string | null;
  published_at: Timestamp;
  created_at: CreatedAt;
}

export interface TagsTable {
  id: Generated<number>;
  name: string;
  created_at: CreatedAt;
}

export interface ProfilesTable {
  id: Generated<number>;
  user_id: string;
  handle: string;
  display_name: string;
  blurb: Generated<string>;
  location: Generated<string>;
  website: Generated<string>;
  avatar_path: string | null;
  feed_key: string;
  bookmark_feed_id: number | null;
  created_at: CreatedAt;
}

export interface SubscriptionsTable {
  id: Generated<number>;
  user_id: string;
  feed_id: number;
  title: Generated<string>;
  created_at: CreatedAt;
}

export interface SubscriptionTagsTable {
  subscription_id: number;
  tag_id: number;
}

export interface EntryTagsTable {
  id: Generated<number>;
  entry_id: number;
  tag_id: number;
  user_id: string | null;
  created_at: CreatedAt;
}

export interface EntryReadsTable {
  user_id: string;
  entry_id: number;
  created_at: CreatedAt;
}

export interface UserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SavesTable {
  user_id: string;
  entry_id: number;
  comment: Generated<string>;
  created_at: CreatedAt;
}

export interface FriendshipsTable {
  id: Generated<number>;
  user_id: string;
  friend_id: string;
  status: Generated<"pending" | "accepted">;
  created_at: CreatedAt;
}

export interface FriendshipTagsTable {
  friendship_id: number;
  tag_id: number;
  owner_id: string;
}

export interface EntrySharesTable {
  id: Generated<number>;
  entry_id: number;
  from_user_id: string;
  to_user_id: string;
  comment: Generated<string>;
  created_at: CreatedAt;
}

export interface ProfileCommentsTable {
  id: Generated<number>;
  profile_user_id: string;
  author_id: string;
  body: string;
  created_at: CreatedAt;
}

export interface DB {
  user: UserTable;
  friendships: FriendshipsTable;
  friendship_tags: FriendshipTagsTable;
  entry_shares: EntrySharesTable;
  profile_comments: ProfileCommentsTable;
  saves: SavesTable;
  feeds: FeedsTable;
  entries: EntriesTable;
  tags: TagsTable;
  profiles: ProfilesTable;
  subscriptions: SubscriptionsTable;
  subscription_tags: SubscriptionTagsTable;
  entry_tags: EntryTagsTable;
  entry_reads: EntryReadsTable;
}

export type Feed = Selectable<FeedsTable>;
export type Entry = Selectable<EntriesTable>;
export type Profile = Selectable<ProfilesTable>;
