import { parseNetwork } from "../../src/data-network/index.js";
import { parser } from "../../src/data-network/parser.js";
import type { PropagateTerm, SwitchTerm } from "../../src/data-network/types.js";

const input = `
defnetwork mynetwork
  signature: from [a, b] to d;

  propagate myFunction.couldBeNamespaced from [a, b] to c;

  switch from [b, c] to d;
end
`;

const inputWithParams = `
defnetwork myLL
  signature: from [a, b] to c;

  propagate myLL from [a, b] to c
    with: param1=asd, param2='hello world';
end
`;

describe("parseNetwork: basic structure", () => {
  const net = parseNetwork(input);

  test("name and signature", () => {
    expect(net.name).toBe("mynetwork");
    expect(net.signature.from).toEqual(["a", "b"]);
    expect(net.signature.to).toBe("d");
  });

  test("term count", () => {
    expect(net.terms).toHaveLength(2);
  });
});

describe("parseNetwork: propagate term", () => {
  const term = parseNetwork(input).terms[0]! as PropagateTerm;

  test("kind, fn, from, to", () => {
    expect(term.kind).toBe("propagate");
    expect(term.fn).toBe("myFunction.couldBeNamespaced");
    expect(term.from).toEqual(["a", "b"]);
    expect(term.to).toBe("c");
  });

  test("no params by default", () => {
    expect(term.params).toEqual({});
  });

  test("with clause params", () => {
    const t = parseNetwork(inputWithParams).terms[0]! as PropagateTerm;
    expect(t.params).toEqual({ param1: "asd", param2: "hello world" });
  });
});

describe("parseNetwork: switch term", () => {
  const noFnTerm = parseNetwork(input).terms[1]! as SwitchTerm;

  test("kind, from, to", () => {
    expect(noFnTerm.kind).toBe("switch");
    expect(noFnTerm.from).toEqual(["b", "c"]);
    expect(noFnTerm.to).toBe("d");
  });

  test("fn is null when predicate omitted", () => {
    expect(noFnTerm.fn).toBeNull();
  });

  test("fn is predicate name when provided", () => {
    const net = parseNetwork(`
      defnetwork test
        signature: from [a] to b;
        switch even? from [a] to b;
      end
    `);
    expect((net.terms[0]! as SwitchTerm).fn).toBe("even?");
  });
});

const inputWithCellsAndConstants = `
defnetwork myNet
  signature: from [a] to result;

  cell x = 42;
  constant pi = 3;
  constant label = 'hello';
end
`;

describe("parseNetwork: cell and constant terms", () => {
  test("parse tree is clean", () => {
    const tree = parser.parse(inputWithCellsAndConstants.trim());
    const cursor = tree.cursor();
    do { expect(cursor.name).not.toBe("⚠"); } while (cursor.next());
  });

  test("cell term", () => {
    expect(parseNetwork(inputWithCellsAndConstants).terms[0]!).toEqual({ kind: "cell", name: "x", value: "42" });
  });

  test("constant terms (number and string)", () => {
    const terms = parseNetwork(inputWithCellsAndConstants).terms;
    expect(terms[1]!).toEqual({ kind: "constant", name: "pi",    value: "3"     });
    expect(terms[2]!).toEqual({ kind: "constant", name: "label", value: "hello" });
  });
});

describe("parse tree: keyword nodes are named", () => {
  test("all keyword node names present", () => {
    const src = `
      defnetwork test
        signature: from [a] to b;
        propagate f from [a] to b with: k=v;
        switch from [a] to b;
        cell x = 1;
        constant y = 2;
      end
    `;
    const tree = parser.parse(src.trim());
    const names = new Set<string>();
    const cursor = tree.cursor();
    do { names.add(cursor.name); } while (cursor.next());
    for (const kw of ["Defnetwork", "End", "Signature_", "From", "To", "Propagate", "With", "Switch", "Cell", "Constant"]) {
      expect(names).toContain(kw);
    }
  });
});

const inputWithNumbers = `
defnetwork myNet
  signature: from [a] to b;

  propagate f from [a] to b
    with: count=42, flag=true, ratio=3;
end
`;

describe("parseNetwork: numeric and boolean param values", () => {
  test("parse tree is clean", () => {
    const tree = parser.parse(inputWithNumbers.trim());
    const cursor = tree.cursor();
    do { expect(cursor.name).not.toBe("⚠"); } while (cursor.next());
  });

  test("param values extracted correctly", () => {
    const term = parseNetwork(inputWithNumbers).terms[0]! as PropagateTerm;
    expect(term.params).toEqual({ count: "42", flag: "true", ratio: "3" });
  });
});
