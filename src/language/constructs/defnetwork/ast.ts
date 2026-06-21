// The node `defnetwork` produces — a wiring: a signature plus a bag of terms. This is
// the shape our `tsn_network_extract` experiment recovered from source text; here it is
// the typed target instead of a `defrecord`.

import type { Signature } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type PropagateTerm = {
  kind: "propagate";
  fn: string;
  from: string[];
  to: string;
  params: Record<string, string>;
};

export type SwitchTerm = {
  kind: "switch";
  fn: string | null;
  from: string[];
  to: string;
};

export type CellTerm = { kind: "cell"; name: string; value: string };
export type ConstantTerm = { kind: "constant"; name: string; value: string };

export type Term = PropagateTerm | SwitchTerm | CellTerm | ConstantTerm;

export type NetworkNode = {
  kind: ConstructKind.Network;
  name: string;
  signature: Signature;
  terms: Term[];
};
