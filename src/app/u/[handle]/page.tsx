import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryCard, EntryList } from "@/components/entry-card";
import { ActionForm, SubmitButton } from "@/components/form";
import { Avatar } from "@/components/person-card";
import { Empty, Pager, TagCloud } from "@/components/ui";
import { getDb } from "@/db/client";
import { listSaved } from "@/domain/bookmarks/repo";
import { friendStatus, listFriends } from "@/domain/people/friends";
import { getProfileByHandle, listProfileComments, userTagCloud } from "@/domain/people/profiles";
import { listGroupsForUser } from "@/domain/groups/repo";
import { pageParam, queryString, type SearchParams } from "@/lib/params";
import { getUser } from "@/lib/session";
import { timeAgo } from "@/lib/time";
import {
  addProfileCommentAction, deleteProfileCommentAction, removeFriendAction, requestFriendAction, respondAction,
} from "../../people/actions";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const profile = await getProfileByHandle(getDb(), (await params).handle);
  return { title: profile?.display_name ?? "Profile" };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: SearchParams }) {
  const db = getDb();
  const profile = await getProfileByHandle(db, (await params).handle);
  if (!profile) notFound();
  const page = pageParam((await searchParams).page);
  const viewer = await getUser();
  const isMe = viewer?.id === profile.user_id;
  const [saved, cloud, friends, comments, status, groups] = await Promise.all([
    listSaved(db, profile.user_id, { page }),
    userTagCloud(db, profile.user_id),
    listFriends(db, profile.user_id),
    listProfileComments(db, profile.user_id),
    viewer && !isMe ? friendStatus(db, viewer.id, profile.user_id) : null,
    listGroupsForUser(db, profile.user_id),
  ]);
  const hidden = <input type="hidden" name="userId" value={profile.user_id} />;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_17rem]">
      <div>
        <header className="mb-6 flex items-start gap-4">
          <Avatar path={profile.avatar_path} name={profile.display_name} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="h1">{profile.display_name}</h1>
            <p className="text-sm text-muted">
              @{profile.handle}
              {profile.location && <> · {profile.location}</>}
              {" · "}joined {timeAgo(profile.created_at)} ago
            </p>
            {profile.blurb && <p className="mt-2 whitespace-pre-wrap text-sm">{profile.blurb}</p>}
            {profile.website && (
              <p className="mt-1 text-sm">
                <a href={profile.website} target="_blank" rel="noopener nofollow ugc" className="link break-all">{profile.website}</a>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {isMe && <Link href="/settings" className="btn">Edit profile</Link>}
              {status === "none" && (
                <form action={requestFriendAction}>{hidden}<button type="submit" className="btn btn-primary">Add friend</button></form>
              )}
              {status === "pending-out" && (
                <form action={removeFriendAction}>{hidden}<button type="submit" className="btn">Cancel friend request</button></form>
              )}
              {status === "pending-in" && (
                <>
                  <form action={respondAction}>{hidden}<input type="hidden" name="accept" value="yes" /><button type="submit" className="btn btn-primary">Accept friend request</button></form>
                  <form action={respondAction}>{hidden}<input type="hidden" name="accept" value="no" /><button type="submit" className="btn">Decline</button></form>
                </>
              )}
              {status === "friends" && (
                <form action={removeFriendAction}>{hidden}<button type="submit" className="btn">Friends ✓ · Remove</button></form>
              )}
            </div>
          </div>
        </header>

        <h2 className="h2 mb-3">Saved links</h2>
        {saved.length === 0 ? (
          <Empty>{isMe ? "You have not saved any links yet." : "Nothing saved yet."}</Empty>
        ) : (
          <EntryList>
            {saved.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </EntryList>
        )}
        <Pager page={page} count={saved.length} hrefFor={(p) => `/u/${profile.handle}${queryString({ page: p })}`} />

        <section className="mt-10" aria-labelledby="wall">
          <h2 id="wall" className="h2 mb-3">Comments</h2>
          {viewer && (
            <ActionForm action={addProfileCommentAction} className="mb-4 space-y-2">
              <input type="hidden" name="profileUserId" value={profile.user_id} />
              <input type="hidden" name="handle" value={profile.handle} />
              <textarea name="body" rows={2} maxLength={2000} required aria-label="Write a comment" placeholder="Write a comment" className="input" />
              <SubmitButton className="btn">Post comment</SubmitButton>
            </ActionForm>
          )}
          {comments.length === 0 ? (
            <p className="text-sm text-muted">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="card">
                  <p className="text-xs text-muted">
                    <Link href={`/u/${c.author.handle}`} className="font-medium text-ink hover:underline">{c.author.displayName}</Link>
                    {" · "}{timeAgo(c.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                  {viewer && (viewer.id === c.author.userId || isMe) && (
                    <form action={deleteProfileCommentAction} className="mt-1">
                      <input type="hidden" name="commentId" value={c.id} />
                      <button type="submit" className="cursor-pointer text-xs text-muted hover:text-danger">Delete</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold">Tags {isMe ? "you use" : "they use"}</h2>
          {cloud.length === 0 ? (
            <p className="text-xs text-muted">None yet.</p>
          ) : (
            <TagCloud tags={cloud} hrefFor={(t) => `/people${queryString({ tag: [t] })}`} />
          )}
        </section>
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold">Friends ({friends.length})</h2>
          {friends.length === 0 ? (
            <p className="text-xs text-muted">None yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {friends.slice(0, 30).map((f) => (
                <li key={f.userId}><Link href={`/u/${f.handle}`} className="link">{f.displayName}</Link></li>
              ))}
            </ul>
          )}
        </section>
        {groups.length > 0 && (
          <section className="card">
            <h2 className="mb-2 text-sm font-semibold">Groups</h2>
            <ul className="space-y-1 text-sm">
              {groups.map((g) => (
                <li key={g.slug}><Link href={`/g/${g.slug}`} className="link">{g.title}</Link></li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
