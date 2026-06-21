// The node `defrecord` produces — "what we expect back". A named sort with typed fields.
//
// SINGLE SOURCE OF TRUTH: the record's DATA shape (name + fields) is `RecordDescriptor` in
// core/types.ts — the construct-agnostic view the heavy-construct compilers + LLM schema read.
// RecordNode is exactly that descriptor plus the construct discriminant; the field list lives
// once, in `RecordDescriptor`.

import type { RecordDescriptor } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type RecordNode = RecordDescriptor & { kind: ConstructKind.Record };
