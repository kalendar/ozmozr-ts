import type { Migration } from "kysely/migration";
import * as m0001 from "./0001_core";
import * as m0002 from "./0002_auth";
import * as m0003 from "./0003_search_saves";
import * as m0004 from "./0004_people";

export const migrations: Record<string, Migration> = {
  "0001_core": m0001,
  "0002_auth": m0002,
  "0003_search_saves": m0003,
  "0004_people": m0004,
};
