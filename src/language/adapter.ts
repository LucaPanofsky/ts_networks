// ── The bridge: modular `Program` → engine `ProgramAST` ────────────────────────────
//
// The modular Ohm pipeline (this folder) parses a program into a flat bag of nodes
// (`Program = { nodes: AstNode[] }`). The existing engine — type-checker, schema
// compiler, jsgen, diagram — consumes the engine's `ProgramAST`, ten arrays keyed by
// construct. This adapter folds the one into the other.
//
// It is sound because every modular node is STRUCTURALLY the corresponding engine AST
// (the oracle-parity tests prove `modularNode toEqual oracleParse(src).<construct>[0]`
// for all 11 forms). So the conversion is a pure group-by-`kind`; no field reshaping.
// Predicates carry `isPredicate` on a `fn` node, so they land in `fns` like the engine.
//
// This adapter (plus the error wrapper below) is the entire "glue" of the Lezer-removal
// bridge: the modular parser feeds the unchanged engine through here. When the modular
// emit pipeline becomes the production run path, this hop is what gets deleted.

import { ConstructKind } from "./core/enums.js";
import type { Program } from "./pipeline/program.js";
import type {
  ProgramAST, DataNetworkAST, RecordAST, FnAST, DeriveAST, LLMFnAST, EnumAST,
  GrammarAST, ExtractAST, TTableAST, ParameterAST,
} from "../data-network/types.js";

export function toProgramAST(program: Program): ProgramAST {
  const out: ProgramAST = {
    networks: [], records: [], fns: [], derives: [], llmFns: [],
    enums: [], grammars: [], extracts: [], ttables: [], parameters: [],
  };
  for (const node of program.nodes) {
    switch (node.kind) {
      case ConstructKind.Network:   out.networks.push(node as DataNetworkAST); break;
      case ConstructKind.Record:    out.records.push(node as RecordAST); break;
      case ConstructKind.Fn:        out.fns.push(node as FnAST); break; // predicates too (isPredicate)
      // A modular DeriveNode carries a synthetic `name` (its combine registry key) that the
      // engine's DeriveAST lacks — strip it so the ProgramAST matches the engine exactly.
      case ConstructKind.Derive:    out.derives.push({ kind: node.kind, sub: node.sub, sup: node.sup } as DeriveAST); break;
      case ConstructKind.Llmfn:     out.llmFns.push(node as LLMFnAST); break;
      case ConstructKind.Enum:      out.enums.push(node as EnumAST); break;
      case ConstructKind.Grammar:   out.grammars.push(node as GrammarAST); break;
      case ConstructKind.Extract:   out.extracts.push(node as ExtractAST); break;
      case ConstructKind.TTable:    out.ttables.push(node as TTableAST); break;
      case ConstructKind.Parameter: out.parameters.push(node as ParameterAST); break;
      default: {
        // Exhaustiveness guard: a new ConstructKind must be mapped here.
        const _never: never = node;
        throw new Error(`toProgramAST: unmapped node kind ${(_never as { kind: string }).kind}`);
      }
    }
  }
  return out;
}
