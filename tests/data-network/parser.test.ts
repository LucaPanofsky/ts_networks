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

  test("network name", () => {
    expect(net.name).toBe("mynetwork");
  });

  test("signature from", () => {
    expect(net.signature.from).toEqual(["a", "b"]);
  });

  test("signature to", () => {
    expect(net.signature.to).toBe("d");
  });

  test("term count", () => {
    expect(net.terms).toHaveLength(2);
  });
});

describe("parseNetwork: propagate term", () => {
  const net = parseNetwork(input);
  const term = net.terms[0]! as PropagateTerm;

  test("kind", () => {
    expect(term.kind).toBe("propagate");
  });

  test("function name (namespaced)", () => {
    expect(term.fn).toBe("myFunction.couldBeNamespaced");
  });

  test("from cells", () => {
    expect(term.from).toEqual(["a", "b"]);
  });

  test("to cell", () => {
    expect(term.to).toBe("c");
  });

  test("no params by default", () => {
    expect(term.params).toEqual({});
  });
});

describe("parseNetwork: switch term", () => {
  const net = parseNetwork(input);
  const term = net.terms[1]! as SwitchTerm;

  test("kind", () => {
    expect(term.kind).toBe("switch");
  });

  test("from cells", () => {
    expect(term.from).toEqual(["b", "c"]);
  });

  test("to cell", () => {
    expect(term.to).toBe("d");
  });
});

describe("parseNetwork: with clause", () => {
  const net = parseNetwork(inputWithParams);
  const term = net.terms[0]! as PropagateTerm;

  test("params parsed", () => {
    expect(term.params).toEqual({
      param1: "asd",
      param2: "hello world",
    });
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
  test("parse tree is clean (no error nodes)", () => {
    const tree = parser.parse(inputWithCellsAndConstants.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });

  test("cell term extracted correctly", () => {
    const net = parseNetwork(inputWithCellsAndConstants);
    const term = net.terms[0]!;
    expect(term).toEqual({ kind: "cell", name: "x", value: "42" });
  });

  test("constant term with number", () => {
    const net = parseNetwork(inputWithCellsAndConstants);
    const term = net.terms[1]!;
    expect(term).toEqual({ kind: "constant", name: "pi", value: "3" });
  });

  test("constant term with string", () => {
    const net = parseNetwork(inputWithCellsAndConstants);
    const term = net.terms[2]!;
    expect(term).toEqual({ kind: "constant", name: "label", value: "hello" });
  });
});

const inputWithNumbers = `
defnetwork myNet
  signature: from [a] to b;

  propagate f from [a] to b
    with: count=42, flag=true, ratio=3;
end
`;

describe("parse tree: keyword nodes are named (not anonymous)", () => {
  test("all keyword node names are present in the full tree", () => {
    const input = `
      defnetwork test
        signature: from [a] to b;
        propagate f from [a] to b with: k=v;
        switch from [a] to b;
        cell x = 1;
        constant y = 2;
      end
    `;
    const tree = parser.parse(input.trim());
    const names = new Set<string>();
    const cursor = tree.cursor();
    do { names.add(cursor.name); } while (cursor.next());
    for (const kw of ["Defnetwork", "End", "Signature_", "From", "To", "Propagate", "With", "Switch", "Cell", "Constant"]) {
      expect(names).toContain(kw);
    }
  });
});

describe("parseNetwork: numeric and boolean param values", () => {
  test("parse tree is clean (no error nodes)", () => {
    const tree = parser.parse(inputWithNumbers.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });

  test("param values extracted correctly", () => {
    const term = parseNetwork(inputWithNumbers).terms[0]! as PropagateTerm;
    expect(term.params).toEqual({
      count: "42",
      flag: "true",
      ratio: "3",
    });
  });
});
