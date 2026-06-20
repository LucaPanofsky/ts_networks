// The installed modules, keyed by kind. This is the "register a module" half of the
// additivity rule (the other half is the ConstructKind entry in core/enums.ts). The
// splitter produces a Block tagged with a kind; the pipeline looks the module up here.
//
// Typed to ConstructModule<AstNode>: the pipeline narrows the contract's AstNodeBase to
// the concrete union, so parse() yields a real AstNode.

import type { ConstructModule } from "../core/module.js";
import { ConstructKind } from "../core/enums.js";
import type { AstNode } from "./program.js";

import recordModule from "../constructs/defrecord/index.js";
import fnModule from "../constructs/defn/index.js";
import enumModule from "../constructs/defenum/index.js";
import deriveModule from "../constructs/derive/index.js";
import grammarModule from "../constructs/defgrammar/index.js";
import extractModule from "../constructs/defextract/index.js";
import ttableModule from "../constructs/ttable/index.js";
import networkModule from "../constructs/defnetwork/index.js";
import llmfnModule from "../constructs/defllmfn/index.js";

export const MODULES: Readonly<Record<ConstructKind, ConstructModule<AstNode>>> = {
  [ConstructKind.Record]: recordModule,
  [ConstructKind.Fn]: fnModule,
  [ConstructKind.Enum]: enumModule,
  [ConstructKind.Derive]: deriveModule,
  [ConstructKind.Grammar]: grammarModule,
  [ConstructKind.Extract]: extractModule,
  [ConstructKind.TTable]: ttableModule,
  [ConstructKind.Network]: networkModule,
  [ConstructKind.Llmfn]: llmfnModule,
};
