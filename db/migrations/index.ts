import type { Migration } from "kysely/migration";
import * as m0001 from "./0001_core";
import * as m0002 from "./0002_auth";

export const migrations: Record<string, Migration> = {
  "0001_core": m0001,
  "0002_auth": m0002,
};
