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

// ── Record definitions ────────────────────────────────────────────────────────

export type FieldDecl = {
  name: string;
  predicate: string;
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

export type Expr = LiteralExpr | VarExpr | CallExpr | BinaryExpr | UnaryExpr | FieldExpr | LetExpr;

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
  returnType: string;
  body: Expr;
};

// ── Derive declarations ───────────────────────────────────────────────────────

export type DeriveAST = {
  kind: "derive";
  sub: string;
  sup: string;
};

// ── Program ───────────────────────────────────────────────────────────────────

export type ProgramAST = {
  networks: DataNetworkAST[];
  records: RecordAST[];
  fns: FnAST[];
  derives: DeriveAST[];
};
