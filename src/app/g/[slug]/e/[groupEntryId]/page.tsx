import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentForm, CommentThread } from "@/components/comment-thread";
import { EntryCard } from "@/components/entry-card";
import { VoteButtons } from "@/components/group-bits";
import { getDb } from "@/db/client";
import { listGroupComments } from "@/domain/groups/comments";
import { getGroupEntry } from "@/domain/groups/entries";
import { getGroupBySlug } from "@/domain/groups/repo";
import { idParam } from "@/lib/params";
import { getUser } from "@/lib/session";
import { addGroupCommentAction, deleteGroupCommentAction, removeGroupEntryAction, voteAction } from "../../../actions";

export default async function GroupEntryPage({ params }: { params: Promise<{ slug: string; groupEntryId: string }> }) {
  const p = await params;
  const groupEntryId = idParam(p.groupEntryId);
  if (groupEntryId === null) notFound();
  const user = await getUser();
  const db = getDb();
  const group = await getGroupBySlug(db, p.slug, user?.id);
  if (!group) notFound();
  const item = await getGroupEntry(db, group.id, groupEntryId, user?.id);
  if (!item) notFound();
  const comments = await listGroupComments(db, groupEntryId);
  const canComment = group.role !== null;
  const canRemove = user && (group.role === "owner" || item.sharedBy.userId === user.id);

  return (
    <div>
      <p className="mb-3 text-sm"><Link href={`/g/${group.slug}`} className="link">← Back to {group.title}</Link></p>
      <div className="flex gap-3">
        <VoteButtons action={voteAction} slug={group.slug} groupEntryId={groupEntryId} score={item.score} myVote={item.myVote} canVote={canComment} />
        <div className="min-w-0 flex-1">
          <EntryCard
            entry={item}
            meta={
              <>
                Shared by <Link href={`/u/${item.sharedBy.handle}`} className="link">{item.sharedBy.displayName}</Link>
                {item.comment && <>: “{item.comment}”</>}
              </>
            }
            actions={
              canRemove && (
                <form action={removeGroupEntryAction}>
                  <input type="hidden" name="slug" value={group.slug} />
                  <input type="hidden" name="groupEntryId" value={groupEntryId} />
                  <button type="submit" className="btn btn-quiet">Remove from group</button>
                </form>
              )
            }
          />
        </div>
      </div>
      <section className="mt-8" aria-labelledby="discussion">
        <h2 id="discussion" className="h2 mb-3">Discussion ({item.commentCount})</h2>
        {canComment ? (
          <div className="mb-5">
            <CommentForm slug={group.slug} groupEntryId={groupEntryId} addAction={addGroupCommentAction} label="Add a comment" />
          </div>
        ) : (
          <p className="mb-5 text-sm text-muted">Join the group to vote and comment.</p>
        )}
        <CommentThread
          nodes={comments}
          slug={group.slug}
          groupEntryId={groupEntryId}
          viewerId={user?.id ?? null}
          canComment={canComment}
          isOwner={group.role === "owner"}
          addAction={addGroupCommentAction}
          deleteAction={deleteGroupCommentAction}
        />
      </section>
    </div>
  );
}
