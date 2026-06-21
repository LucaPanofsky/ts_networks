// The node `defrecord` produces — "what we expect back". A named sort with typed fields.

import type { FieldDecl } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type RecordNode = {
  kind: ConstructKind.Record;
  name: string;
  fields: FieldDecl[];
};
