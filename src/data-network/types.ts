// ── Network terms ─────────────────────────────────────────────────────────────

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

export type CellTerm = {
  kind: "cell";
  name: string;
  value: string;
};

export type ConstantTerm = {
  kind: "constant";
  name: string;
  value: string;
};

export type Term = PropagateTerm | SwitchTerm | CellTerm | ConstantTerm;

export type DataNetworkAST = {
  kind: "network";
  name: string;
  signature: { from: string[]; to: string };
  terms: Term[];
};

// ── Type references ───────────────────────────────────────────────────────────

export type ScalarType = { kind: "scalar"; predicate: string };
export type VectorType = { kind: "vector"; element: string };
export type TypeRef    = ScalarType | VectorType;

export const typeRefToString = (t: TypeRef): string =>
  t.kind === "scalar" ? t.predicate : `[${t.element}]`;

// ── Record definitions ────────────────────────────────────────────────────────

export type FieldDecl = {
  name: string;
  type: TypeRef;
};

export type RecordAST = {
  kind: "record";
  name: string;
  fields: FieldDecl[];
};

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

export type Expr = LiteralExpr | VarExpr | CallExpr | BinaryExpr | UnaryExpr | FieldExpr | LetExpr | MatchExpr;

// ── Function definitions ──────────────────────────────────────────────────────

export type TypedParam = {
  predicate: string;
  name: string;
};

export type FnAST = {
  kind: "fn";
  isPredicate: boolean;
  name: string;
  params: TypedParam[];
  returnType: TypeRef;
  body: Expr;
};

// ── Enum definitions ──────────────────────────────────────────────────────────

export type EnumAST = {
  kind: "enum";
  name: string;
  values: string[];
};

// ── Derive declarations ───────────────────────────────────────────────────────

export type DeriveAST = {
  kind: "derive";
  sub: string;
  sup: string;
};

// ── LLM function definitions ──────────────────────────────────────────────────

export type LLMFnAST = {
  kind: "llmfn";
  name: string;
  params: TypedParam[];
  returnType: TypeRef;
  prompt: string;
  config: Record<string, string>;
};

// ── Grammar definitions ───────────────────────────────────────────────────────

// A named Ohm grammar carried as verbatim source text. The optional signature is
// the same shape as a fn/llmfn signature (`from [String?(text)] to Rec?`): it binds
// the parse result to a record. A scalar `returnType` parses the whole input string
// into one record; a vector `returnType` (`to [Rec?]`) scans for all embedded
// matches and returns an array. With no signature the grammar is a bare recognizer
// returning the matched text.
export type GrammarAST = {
  kind: "grammar";
  name: string;
  source: string;
  signature?: { params: TypedParam[]; returnType: TypeRef };
};

// ── Extract definitions (defextract) ──────────────────────────────────────────

// A `scan`/`parse` statement binds a record-valued field of the enclosing scope to a
// recogniser. The verb sets cardinality: `scan` fills a vector field (many matches),
// `parse` fills a scalar field (one match). Spelled with the bare element record
// (`scan Paragraph`); the `as <field>` target carries the [X?]/X? cardinality.
export type ExtractBind = {
  kind: "scan" | "parse";
  record: string;   // the element record recognised, e.g. "Paragraph"
  as: string;       // the field it fills on the enclosing scope's record
  grammar: string;  // the recogniser reference, e.g. "grammar/Paragraph"
};

// A `within` scope. The ROOT names the record TYPE it builds (which is also the
// extract's return type) and carries `grammar`, the recogniser that parses it; its
// region is the whole input. A NESTED `within` names a FIELD produced by a prior
// `scan`/`parse`, carries no grammar, and recurses into each matched element scoped
// to the SPAN that element's grammar consumed (span-based — no region field).
export type ExtractWithin = {
  kind: "within";
  target: string;     // root: record name; nested: field name
  grammar?: string;   // root: grammar reference; nested: undefined
  body: ExtractStmt[];
};

export type ExtractStmt = ExtractBind | ExtractWithin;

// A named structural extractor, callable as `extract/<name>`. It has exactly one root
// `within` (the document tree is a single record), built from nested withins/binds.
export type ExtractAST = {
  kind: "extract";
  name: string;
  root: ExtractWithin;
};

// ── Text-table definitions (TTable) ────────────────────────────────────────────

// One column's header binding. The data's first row is always the header (consumed).
// With `text`, the header is LOCATED: the declared text identifies the column in that
// header row (order-independent, self-validating). Without `text`, the column is
// POSITIONAL: mapped by declaration order, the header row's content ignored (e.g. a
// section sub-header to discard).
export type TTableHeader = { field: string; text?: string };

// A flat text-table extractor, callable as `TTable/<name>` (text → [Row?]). It
// declares the row record, the cell delimiter, and the per-column headers. The header
// is mandatory: it locates the table, maps columns by name (order-independent), and
// self-validates (a header that doesn't match → Contradiction).
export type TTableAST = {
  kind: "ttable";
  name: string;
  row: string;             // the row record name
  cell: string;            // the cell delimiter (verbatim, quotes stripped)
  headers: TTableHeader[]; // the declared column headers
};

// ── Parameter definitions ─────────────────────────────────────────────────────

// A named, overridable input. `type` is the value's type reference; `value` is the
// optional default (the trimmed body of a triple-quoted blob, text only for now).
// An absent `value` means the default is Nothing — a network reading an unfilled
// parameter simply produces no information. A `run` entry point (later) wires
// parameters into network cells and lets the CLI override them.
export type ParameterAST = {
  kind: "parameter";
  name: string;
  type: TypeRef;
  value?: string;
};

// ── Program ───────────────────────────────────────────────────────────────────

export type ProgramAST = {
  networks: DataNetworkAST[];
  records: RecordAST[];
  fns: FnAST[];
  derives: DeriveAST[];
  llmFns: LLMFnAST[];
  enums: EnumAST[];
  grammars: GrammarAST[];
  extracts: ExtractAST[];
  ttables: TTableAST[];
  parameters: ParameterAST[];
};
