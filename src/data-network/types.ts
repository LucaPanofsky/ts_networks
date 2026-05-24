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

// ── Agent definitions ─────────────────────────────────────────────────────────

export type AgentAST = {
  kind: "agent";
  name: string;
  params: TypedParam[];
  returnType: TypeRef;
  prompt: string;
  config: Record<string, string>;
};

// ── Program ───────────────────────────────────────────────────────────────────

export type ProgramAST = {
  networks: DataNetworkAST[];
  records: RecordAST[];
  fns: FnAST[];
  derives: DeriveAST[];
  agents: AgentAST[];
  enums: EnumAST[];
};
