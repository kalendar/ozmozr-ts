import type { Db } from "@/db/client";

/**
 * Things other modules contribute to a profile page. Groups registers its
 * lister here, so the people module does not depend on groups.
 */
export const profileExtras: {
  listGroups: (db: Db, userId: string) => Promise<{ slug: string; title: string }[]>;
} = {
  listGroups: async () => [],
};
