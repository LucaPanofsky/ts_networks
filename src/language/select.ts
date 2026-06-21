// ── Typed selectors over a modular `Program` ────────────────────────────────────────
//
// The sole group-by-`kind` mechanism over a program: each selector filters `program.nodes`
// by its `ConstructKind` and returns that construct's node type. A consumer reads
// `fnsOf(program)` off a `Program` where it once read `program.fns` off the (removed) grouped
// `ProgramAST`.
//
// The per-selector cast (`as FnNode[]`) is a FILTER-NARROWING cast: TypeScript cannot narrow
// `AstNode[]` to a single union member by an enum field through `.filter`, so each selector
// asserts the element type its `ConstructKind` guarantees. That cast is now the ONLY one —
// there is no longer a second "engine AST" type family to convert to: the modular construct
// node IS the single type, consumed directly by the reused engine compilers / analysis passes.

import { ConstructKind } from "./core/enums.js";
import type { AstNode, Program } from "./pipeline/program.js";
import type { RecordNode } from "./constructs/defrecord/ast.js";
import type { FnNode } from "./constructs/defn/ast.js";
import type { EnumNode } from "./constructs/defenum/ast.js";
import type { LlmFnNode } from "./constructs/defllmfn/ast.js";
import type { GrammarNode } from "./constructs/defgrammar/ast.js";
import type { NetworkNode } from "./constructs/defnetwork/ast.js";
import type { ExtractNode } from "./constructs/defextract/ast.js";
import type { TTableNode } from "./constructs/ttable/ast.js";
import type { DeriveNode } from "./constructs/derive/ast.js";
import type { ParameterNode } from "./constructs/defparameter/ast.js";

// The per-node cast lifted to the filtered array: a node of a given kind IS that construct's
// node type. `byKind` narrows; each selector applies the one filter-narrowing cast.
const byKind = (p: Program, kind: ConstructKind): AstNode[] =>
  p.nodes.filter((n) => n.kind === kind);

export const recordsOf = (p: Program): RecordNode[] =>
  byKind(p, ConstructKind.Record) as RecordNode[];

export const fnsOf = (p: Program): FnNode[] =>
  byKind(p, ConstructKind.Fn) as FnNode[];

export const llmFnsOf = (p: Program): LlmFnNode[] =>
  byKind(p, ConstructKind.Llmfn) as LlmFnNode[];

export const grammarsOf = (p: Program): GrammarNode[] =>
  byKind(p, ConstructKind.Grammar) as GrammarNode[];

export const enumsOf = (p: Program): EnumNode[] =>
  byKind(p, ConstructKind.Enum) as EnumNode[];

export const networksOf = (p: Program): NetworkNode[] =>
  byKind(p, ConstructKind.Network) as NetworkNode[];

export const extractsOf = (p: Program): ExtractNode[] =>
  byKind(p, ConstructKind.Extract) as ExtractNode[];

export const ttablesOf = (p: Program): TTableNode[] =>
  byKind(p, ConstructKind.TTable) as TTableNode[];

// `derivesOf` keeps `DeriveNode.name` (the combine/registry key — see `combine.ts`). Both are
// carry-only today (derive subsumption + parameter run-wiring are dormant — no production reader).
export const derivesOf = (p: Program): DeriveNode[] =>
  byKind(p, ConstructKind.Derive) as DeriveNode[];

export const parametersOf = (p: Program): ParameterNode[] =>
  byKind(p, ConstructKind.Parameter) as ParameterNode[];
