import type { Db } from "./client";
import { createProfile } from "@/domain/people/profiles";

/** Creates an auth user and profile; returns the user id. */
export async function makeUser(db: Db, handle: string): Promise<string> {
  const id = `u_${handle}`;
  await db
    .insertInto("user")
    .values({ id, name: handle, email: `${handle}@example.test`, emailVerified: false })
    .execute();
  await createProfile(db, { userId: id, handle, displayName: handle });
  return id;
}

export async function makeBareUser(db: Db, id: string): Promise<string> {
  await db.insertInto("user").values({ id, name: id, email: `${id}@example.test`, emailVerified: false }).execute();
  return id;
}
