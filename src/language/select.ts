// ── Typed selectors over a modular `Program` ────────────────────────────────────────
//
// The sole group-by-`kind` mechanism over a program — the lazy successor to the (now
// removed) `toProgramAST` adapter's eager fold. Where that adapter materialized ten typed
// arrays up front, these selectors filter `program.nodes` by `ConstructKind` on demand and
// return the corresponding engine AST type. A consumer reads `fnsOf(program)` off a
// `Program` where it once read `program.fns` off the engine's grouped `ProgramAST`.
//
// The cast is the SAME one the adapter made (`node as FnAST`): a modular node is
// structurally the engine AST, but not assignable to it — its `.kind` is a `ConstructKind`
// enum member, the engine AST's `.kind` is a string literal, which TypeScript treats as
// nominally distinct. The oracle-parity tests prove the structural equality the cast relies
// on. These selectors are the SOLE group-by-kind mechanism now — the lazy replacement for
// the (removed) adapter's eager fold.
//
// `derivesOf`/`parametersOf` are the two exceptions to the cast: their engine AST types
// (`DeriveAST`/`ParameterAST`) were deleted with `ProgramAST`, so the modular node *is* the
// return type — no cast. In particular `derivesOf` returns the `DeriveNode` VERBATIM, keeping
// its synthetic `name`: that name is the construct's combine/registry key (`combine.ts`
// `registryKey`), not adapter cruft — the adapter stripped it only to match the old name-less
// engine `DeriveAST`, which no longer exists. (`derive` subsumption is still dormant — no
// consumer reads `derivesOf` in production yet.)

import { ConstructKind } from "./core/enums.js";
import type { AstNode, Program } from "./pipeline/program.js";
import type { DeriveNode } from "./constructs/derive/ast.js";
import type { ParameterNode } from "./constructs/defparameter/ast.js";
import type {
  RecordAST, FnAST, LLMFnAST, EnumAST, GrammarAST, DataNetworkAST, ExtractAST, TTableAST,
} from "../data-network/types.js";

// The per-node cast, lifted to the filtered array: a modular node of a given kind IS the
// engine AST of that kind (oracle-proven), bar the nominally-distinct `.kind`. `byKind`
// narrows; each selector applies that one cast (the same the removed adapter applied).
const byKind = (p: Program, kind: ConstructKind): AstNode[] =>
  p.nodes.filter((n) => n.kind === kind);

export const recordsOf = (p: Program): RecordAST[] =>
  byKind(p, ConstructKind.Record) as RecordAST[];

export const fnsOf = (p: Program): FnAST[] =>
  byKind(p, ConstructKind.Fn) as FnAST[];

export const llmFnsOf = (p: Program): LLMFnAST[] =>
  byKind(p, ConstructKind.Llmfn) as LLMFnAST[];

export const grammarsOf = (p: Program): GrammarAST[] =>
  byKind(p, ConstructKind.Grammar) as GrammarAST[];

export const enumsOf = (p: Program): EnumAST[] =>
  byKind(p, ConstructKind.Enum) as EnumAST[];

export const networksOf = (p: Program): DataNetworkAST[] =>
  byKind(p, ConstructKind.Network) as DataNetworkAST[];

export const extractsOf = (p: Program): ExtractAST[] =>
  byKind(p, ConstructKind.Extract) as ExtractAST[];

export const ttablesOf = (p: Program): TTableAST[] =>
  byKind(p, ConstructKind.TTable) as TTableAST[];

// The two constructs whose engine AST type was deleted with `ProgramAST`: the modular node
// IS the return type, so no cast. `derivesOf` keeps `DeriveNode.name` (the combine key); both
// are carry-only today (subsumption + parameter run-wiring are dormant).
export const derivesOf = (p: Program): DeriveNode[] =>
  byKind(p, ConstructKind.Derive) as DeriveNode[];

export const parametersOf = (p: Program): ParameterNode[] =>
  byKind(p, ConstructKind.Parameter) as ParameterNode[];
