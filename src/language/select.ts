// ── Typed selectors over a modular `Program` ────────────────────────────────────────
//
// The lazy successor to the adapter's eager group-by-`kind` fold (`adapter.ts`
// `toProgramAST`). Where the adapter materializes ten typed arrays up front, these
// selectors filter `program.nodes` by `ConstructKind` on demand and return the
// corresponding engine AST type. A consumer that reads `program.fns` off a `ProgramAST`
// reads `fnsOf(program)` off a `Program` instead — body unchanged.
//
// The cast is the SAME one the adapter makes (`node as FnAST`): a modular node is
// structurally the engine AST, but not assignable to it — its `.kind` is a `ConstructKind`
// enum member, the engine AST's `.kind` is a string literal, which TypeScript treats as
// nominally distinct. The oracle-parity tests prove the structural equality the cast relies
// on. (Stage 2 grows this module construct-by-construct as consumers come off `ProgramAST`;
// `derivesOf` will additionally have to strip the synthetic `DeriveNode.name`, the lone
// friction the adapter documents — no current selector here reads it.)

import { ConstructKind } from "./core/enums.js";
import type { AstNode, Program } from "./pipeline/program.js";
import type {
  RecordAST, FnAST, LLMFnAST, EnumAST, GrammarAST, DataNetworkAST,
} from "../data-network/types.js";

// The cast the adapter makes per node, lifted to the filtered array: a modular node of a
// given kind IS the engine AST of that kind (oracle-proven), bar the nominally-distinct
// `.kind`. `byKind` narrows; each selector applies the one cast the adapter does.
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

// A predicate IS a fn carrying `isPredicate` (no separate `ConstructKind`).
export const predicatesOf = (p: Program): FnAST[] =>
  fnsOf(p).filter((f) => f.isPredicate);
