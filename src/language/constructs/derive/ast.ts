// The node `derive` produces — a subtype/subsumption declaration `sub <: sup`. It is a
// TYPE-LEVEL statement only: the existing engine parses and stores it but consumes it
// nowhere (no emitted JS, no registry entry, no checker use yet — `hierarchy.ts` exists but
// is unwired). The new pipeline carries it faithfully for a future subsumption slice and
// emits no runtime artifact.
//
// `name` is synthetic — AstNodeBase requires one, and a derive has no natural name. It is
// stable and never collides with a real construct's registry key.

import { ConstructKind } from "../../core/enums.js";

export type DeriveNode = {
  kind: ConstructKind.Derive;
  name: string; // synthetic, e.g. "Sub <: Sup"
  sub: string;
  sup: string;
};
