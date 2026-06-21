// ── Type references ───────────────────────────────────────────────────────────

export type ScalarType = { kind: "scalar"; predicate: string };
export type VectorType = { kind: "vector"; element: string };
export type TypeRef    = ScalarType | VectorType;

export const typeRefToString = (t: TypeRef): string =>
  t.kind === "scalar" ? t.predicate : `[${t.element}]`;

// ── Expressions ───────────────────────────────────────────────────────────────

export type LiteralExpr = {
  kind: "literal";
  value: string | number | boolean;
};

export type VarExpr = {
  kind: "var";
  name: string;
};

export type CallExpr = {
  kind: "call";
  fn: string;
  args: Expr[];
};

export type BinaryExpr = {
  kind: "binary";
  op: string;
  left: Expr;
  right: Expr;
};

export type UnaryExpr = {
  kind: "unary";
  op: string;
  expr: Expr;
};

export type FieldExpr = {
  kind: "field";
  object: Expr;
  field: string;
};

export type LetBinding = {
  name:  string;
  value: Expr;
};

export type LetExpr = {
  kind:     "let";
  bindings: LetBinding[];
  body:     Expr;
};

export type WildcardPattern = { kind: "wildcard" };

export type RecordPattern = {
  kind: "record-pattern";
  recordName: string;
  bindings: { field: string; as: string }[];
};

export type MatchPattern = WildcardPattern | RecordPattern;

export type MatchArm = {
  pattern: MatchPattern;
  guard: Expr | null;
  body: Expr;
};

export type MatchExpr = {
  kind: "match";
  subject: Expr;
  arms: MatchArm[];
};

// The body of a `defn ... interpolate """..."""`. Produces a String by substituting
// `{{path}}` placeholders against the function's arguments, via the same renderer
// (`renderPrompt`) that backs `defllmfn` prompts. `template` is the raw text between
// the triple quotes; the referenced argument roots are derived from it at codegen
// time (kept out of the AST so parse-time data-network code needs no placeholder
// analysis). Only produced in function-body position by the grammar, but it is an
// Expr (a value-producing form) like `let` and `match`.
export type InterpolateExpr = {
  kind: "interpolate";
  template: string;
};

export type Expr = LiteralExpr | VarExpr | CallExpr | BinaryExpr | UnaryExpr | FieldExpr | LetExpr | MatchExpr | InterpolateExpr;

// ── Per-construct AST node types live with their construct modules ─────────────
//
// The node type for every construct (RecordNode, FnNode, EnumNode, GrammarNode, ExtractNode,
// TTableNode, NetworkNode, LlmFnNode, DeriveNode, ParameterNode) now lives in
// `src/language/constructs/<x>/ast.ts` — the SINGLE source of truth. The reused compilers and
// analysis passes in this layer consume those modular nodes directly (via the
// `src/language/select.ts` selectors); the parallel engine `*AST` twins, the grouped
// `ProgramAST` container, and the `Program → ProgramAST` adapter have all been deleted. The
// modular `Program = { nodes }` (`src/language/pipeline/program.ts`) is the one program shape.
//
// What stays here is the genuinely shared LEAF vocabulary: the expression AST (`Expr` & co.,
// consumed by `compileExpr`) and `TypeRef`. The modular nodes import these from here.
