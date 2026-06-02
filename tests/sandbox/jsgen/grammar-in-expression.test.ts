import { compile } from "../../../src/sandbox/jsgen/index.js";

// A grammar is a function. It must therefore be callable from inside a `defn`
// expression, exactly like a fn or a `str/` builtin — referenced by its qualified
// name `grammar/<Name>`. Grammars are synchronous (Ohm matching returns directly),
// so the call yields a plain value (a record / array / Contradiction).

const dsl = `
defrecord Point
  label: String?;
  body:  String?;
end

defgrammar PointScan
  signature: from [String?(text)] to [Point?];
  """
  PointScan {
    point = "(" label ")" spaces body
    label = "a".."z"
    body  = (~mark any)*
    mark  = "(" label ")"
  }
  """
end

defn findPointsFn
  signature: from [String?(t)] to [Point?];
  expression
    grammar/PointScan(t);
end
`;

describe("a grammar is callable from a defn expression", () => {
  const { sandbox } = compile(dsl);
  const findPointsFn = sandbox["findPointsFn"] as (t: string) => unknown;

  it("invokes the grammar inside the expression and returns the scanned records", () => {
    expect(findPointsFn("(a) first; (b) second.")).toEqual([
      { __type: "Point", label: "a", body: "first; " },
      { __type: "Point", label: "b", body: "second." },
    ]);
  });

  it("a scan with no matches yields an empty array, not a failure", () => {
    expect(findPointsFn("no points here")).toEqual([]);
  });
});
