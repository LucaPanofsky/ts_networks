import { parseNetwork } from "../../src/data-network/index.js";
import { parser } from "../../src/data-network/parser.js";

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
  const term = net.terms[0]!;

  test("kind", () => {
    expect(term.kind).toBe("propagate");
  });

  test("function name (namespaced)", () => {
    expect(term.kind === "propagate" && term.fn).toBe("myFunction.couldBeNamespaced");
  });

  test("from cells", () => {
    expect(term.kind === "propagate" && term.from).toEqual(["a", "b"]);
  });

  test("to cell", () => {
    expect(term.kind === "propagate" && term.to).toBe("c");
  });

  test("no params by default", () => {
    expect(term.kind === "propagate" && term.params).toEqual({});
  });
});

describe("parseNetwork: switch term", () => {
  const net = parseNetwork(input);
  const term = net.terms[1]!;

  test("kind", () => {
    expect(term.kind).toBe("switch");
  });

  test("from cells", () => {
    expect(term.kind === "switch" && term.from).toEqual(["b", "c"]);
  });

  test("to cell", () => {
    expect(term.kind === "switch" && term.to).toBe("d");
  });
});

describe("parseNetwork: with clause", () => {
  const net = parseNetwork(inputWithParams);
  const term = net.terms[0]!;

  test("params parsed", () => {
    expect(term.kind === "propagate" && term.params).toEqual({
      param1: "asd",
      param2: "hello world",
    });
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
  test("parse tree is clean (no error nodes)", () => {
    const tree = parser.parse(inputWithNumbers.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });

  test("param values extracted correctly", () => {
    const net = parseNetwork(inputWithNumbers);
    const term = net.terms[0]!;
    expect(term.kind === "propagate" && term.params).toEqual({
      count: "42",
      flag: "true",
      ratio: "3",
    });
  });
});
