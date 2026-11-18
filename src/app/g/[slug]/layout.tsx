import { notFound } from "next/navigation";
import { GroupImage } from "@/components/group-bits";
import { getDb } from "@/db/client";
import { listGroupLinks } from "@/domain/groups/links";
import { getGroupBySlug } from "@/domain/groups/repo";
import { getUser } from "@/lib/session";
import { joinGroupAction, leaveGroupAction } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const group = await getGroupBySlug(getDb(), (await params).slug);
  return { title: group?.title ?? "Group" };
}

export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const user = await getUser();
  const db = getDb();
  const group = await getGroupBySlug(db, (await params).slug, user?.id);
  if (!group) notFound();
  const links = await listGroupLinks(db, group.id);
  const hidden = (
    <>
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="slug" value={group.slug} />
    </>
  );
  return (
    <div>
      <header className="mb-5 flex items-start gap-4">
        <GroupImage path={group.imagePath} title={group.title} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="h1">{group.title}</h1>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{group.description}</p>
          <p className="mt-1 text-xs text-muted">{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</p>
        </div>
        {user && group.role === null && (
          <form action={joinGroupAction}>{hidden}<button type="submit" className="btn btn-primary">Join group</button></form>
        )}
        {group.role === "member" && (
          <form action={leaveGroupAction}>{hidden}<button type="submit" className="btn">Leave group</button></form>
        )}
        {group.role === "owner" && <span className="tag">You own this group</span>}
      </header>
      <div className="grid gap-6 md:grid-cols-[1fr_15rem]">
        <div className="min-w-0">{children}</div>
        <aside>
          <section className="card">
            <h2 className="mb-2 text-sm font-semibold">Pinned links</h2>
            {links.length === 0 ? (
              <p className="text-xs text-muted">The owner can pin links here, such as a FAQ or a forum.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {links.map((link) => (
                  <li key={link.id}>
                    <a href={link.url} target="_blank" rel="noopener nofollow ugc" className="link">{link.title}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
