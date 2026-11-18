import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { getProfileByUserId } from "@/domain/people/profiles";
import { auth } from "./auth";

export type SessionUser = { id: string; handle: string; displayName: string; avatarPath: string | null };

/** The signed-in user, or null. Cached for the duration of one request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const profile = await getProfileByUserId(getDb(), session.user.id);
  if (!profile) return null;
  return {
    id: profile.user_id,
    handle: profile.handle,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
  };
});

/** The signed-in user; redirects to /login when there is none. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
