import { notFound } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { GroupTabs } from "@/components/group-bits";
import { getDb } from "@/db/client";
import { listGroupLinks } from "@/domain/groups/links";
import { getGroupBySlug } from "@/domain/groups/repo";
import { requireUser } from "@/lib/session";
import {
  addGroupLinkAction, deleteGroupAction, moveGroupLinkUpAction, removeGroupLinkAction, updateGroupAction,
} from "../../actions";

export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const db = getDb();
  const group = await getGroupBySlug(db, (await params).slug, user.id);
  if (!group || group.role !== "owner") notFound();
  const links = await listGroupLinks(db, group.id);
  const hidden = (
    <>
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="slug" value={group.slug} />
    </>
  );
  return (
    <>
      <GroupTabs slug={group.slug} active="settings" isOwner />
      <section className="card mb-6">
        <h2 className="h2 mb-3">Group details</h2>
        <ActionForm action={updateGroupAction}>
          {hidden}
          <Field label="Name" name="title" required maxLength={100} defaultValue={group.title} />
          <label className="block">
            <span className="label">What is it for?</span>
            <textarea name="description" rows={4} required maxLength={3000} defaultValue={group.description} className="input" />
          </label>
          <label className="block">
            <span className="label">New picture (optional)</span>
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="input" />
          </label>
          <SubmitButton>Save group</SubmitButton>
        </ActionForm>
      </section>

      <section className="card mb-6">
        <h2 className="h2 mb-3">Pinned links</h2>
        {links.length > 0 && (
          <ol className="mb-4 space-y-2 text-sm">
            {links.map((link, i) => (
              <li key={link.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{link.title} <span className="text-muted">— {link.url}</span></span>
                {i > 0 && (
                  <form action={moveGroupLinkUpAction}>
                    {hidden}
                    <input type="hidden" name="linkId" value={link.id} />
                    <button type="submit" className="btn btn-quiet" aria-label={`Move ${link.title} up`}>↑</button>
                  </form>
                )}
                <form action={removeGroupLinkAction}>
                  {hidden}
                  <input type="hidden" name="linkId" value={link.id} />
                  <button type="submit" className="btn btn-quiet" aria-label={`Remove ${link.title}`}>Remove</button>
                </form>
              </li>
            ))}
          </ol>
        )}
        <ActionForm action={addGroupLinkAction}>
          {hidden}
          <Field label="Link title" name="title" required maxLength={200} />
          <Field label="Link address" name="url" type="text" inputMode="url" required placeholder="https://" />
          <SubmitButton className="btn">Pin link</SubmitButton>
        </ActionForm>
      </section>

      <section className="card border-danger">
        <h2 className="h2 mb-1">Delete this group</h2>
        <p className="mb-3 text-sm text-muted">This removes the group, its shared entries, votes and comments for everyone. It cannot be undone.</p>
        <form action={deleteGroupAction}>
          {hidden}
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" required /> I understand, delete “{group.title}”
          </label>
          <button type="submit" className="btn btn-danger">Delete group</button>
        </form>
      </section>
    </>
  );
}
