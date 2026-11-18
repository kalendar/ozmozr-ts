import { notFound } from "next/navigation";
import { GroupTabs } from "@/components/group-bits";
import { PersonCard } from "@/components/person-card";
import { getDb } from "@/db/client";
import { getGroupBySlug, listMembers } from "@/domain/groups/repo";
import { getUser } from "@/lib/session";

export default async function GroupMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser();
  const db = getDb();
  const group = await getGroupBySlug(db, (await params).slug, user?.id);
  if (!group) notFound();
  const members = await listMembers(db, group.id);
  return (
    <>
      <GroupTabs slug={group.slug} active="members" isOwner={group.role === "owner"} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <li key={m.userId}>
            <PersonCard person={m} actions={m.role === "owner" ? <span className="tag">Owner</span> : undefined} />
          </li>
        ))}
      </ul>
    </>
  );
}
