import Link from "next/link";
import type { CommentNode } from "@/domain/groups/comments";
import { timeAgo } from "@/lib/time";
import { ActionForm, SubmitButton, type FormState } from "./form";

type Props = {
  nodes: CommentNode[];
  slug: string;
  groupEntryId: number;
  viewerId: string | null;
  canComment: boolean;
  isOwner: boolean;
  addAction: (prev: FormState, form: FormData) => Promise<FormState>;
  deleteAction: (form: FormData) => Promise<void>;
  depth?: number;
};

export function CommentForm({ slug, groupEntryId, parentId, addAction, label }: {
  slug: string; groupEntryId: number; parentId?: number; addAction: Props["addAction"]; label: string;
}) {
  return (
    <ActionForm action={addAction} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="groupEntryId" value={groupEntryId} />
      {parentId !== undefined && <input type="hidden" name="parentId" value={parentId} />}
      <textarea name="body" rows={2} required maxLength={5000} aria-label={label} placeholder={label} className="input" />
      <SubmitButton className="btn">{parentId === undefined ? "Post comment" : "Post reply"}</SubmitButton>
    </ActionForm>
  );
}

/** A threaded discussion. Replies are indented up to five levels. */
export function CommentThread({ nodes, depth = 0, ...rest }: Props) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth === 0 ? "space-y-3" : `mt-3 space-y-3 border-l border-line ${depth <= 5 ? "pl-4" : "pl-0"}`}>
      {nodes.map((node) => (
        <li key={node.id}>
          <p className="text-xs text-muted">
            <Link href={`/u/${node.author.handle}`} className="font-medium text-ink hover:underline">{node.author.displayName}</Link>
            {" · "}{timeAgo(node.createdAt)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{node.body}</p>
          <div className="mt-1 flex items-start gap-3 text-xs">
            {rest.canComment && (
              <details>
                <summary className="cursor-pointer text-muted hover:text-ink">Reply</summary>
                <div className="mt-2 w-72 max-w-full">
                  <CommentForm slug={rest.slug} groupEntryId={rest.groupEntryId} parentId={node.id} addAction={rest.addAction} label={`Reply to ${node.author.displayName}`} />
                </div>
              </details>
            )}
            {rest.viewerId && (rest.viewerId === node.author.userId || rest.isOwner) && (
              <form action={rest.deleteAction}>
                <input type="hidden" name="slug" value={rest.slug} />
                <input type="hidden" name="commentId" value={node.id} />
                <button type="submit" className="cursor-pointer text-muted hover:text-danger">Delete</button>
              </form>
            )}
          </div>
          <CommentThread nodes={node.replies} depth={depth + 1} {...rest} />
        </li>
      ))}
    </ul>
  );
}
