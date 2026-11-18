import type { Migration } from "kysely/migration";
import * as m0001 from "./0001_core";

export const migrations: Record<string, Migration> = {
  "0001_core": m0001,
};
