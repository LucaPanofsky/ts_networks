export type PropagateTerm = {
  kind: "propagate";
  fn: string;
  from: string[];
  to: string;
  params: Record<string, string>;
};

export type SwitchTerm = {
  kind: "switch";
  from: [string, string];
  to: string;
};

export type Term = PropagateTerm | SwitchTerm;

export type DataNetwork = {
  name: string;
  signature: { from: string[]; to: string };
  terms: Term[];
};
