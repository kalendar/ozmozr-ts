import type { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { migrations } from "../../db/migrations";
import type { DB } from "./types";

type MigratorDb = ConstructorParameters<typeof Migrator>[0]["db"];

export async function migrateToLatest(db: Kysely<DB>): Promise<string[]> {
  const migrator = new Migrator({
    db: db as unknown as MigratorDb,
    provider: { getMigrations: async () => migrations },
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return (results ?? []).map((r) => `${r.migrationName}: ${r.status}`);
}
