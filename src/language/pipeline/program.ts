// The closed AST union and the program shape. This is the assembly point that names
// every construct — the one file (besides registry.ts) that depends on all of them.
// AstNode grows by union as modules land.

import type { RecordNode } from "../constructs/defrecord/ast.js";
import type { FnNode } from "../constructs/defn/ast.js";
import type { EnumNode } from "../constructs/defenum/ast.js";
import type { DeriveNode } from "../constructs/derive/ast.js";
import type { GrammarNode } from "../constructs/defgrammar/ast.js";
import type { ExtractNode } from "../constructs/defextract/ast.js";
import type { TTableNode } from "../constructs/ttable/ast.js";
import type { NetworkNode } from "../constructs/defnetwork/ast.js";
import type { LlmFnNode } from "../constructs/defllmfn/ast.js";

export type AstNode = RecordNode | FnNode | EnumNode | DeriveNode | GrammarNode | ExtractNode | TTableNode | NetworkNode | LlmFnNode;
// ⊕ ParameterNode | … as modules land

// A program is a bag of nodes (order is rhetoric, not semantics). Every node is named —
// that is what `combine` keys the registry on.
export type Program = { nodes: AstNode[] };
