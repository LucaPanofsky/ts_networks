// Falsification set for the real splitter. These pass only if the blob/comment/string
// state tracking and the next-anchor boundary rule are all correct. We assert on
// `split(source)` directly — no parsing — so blocks for stub-parser kinds (defn) are
// fine to inspect.

import { split } from "../../src/language/pipeline/split.js";
import { ConstructKind } from "../../src/language/core/enums.js";

describe("split — real splitter", () => {
  test("blob immunity: keyword/end lines inside a \"\"\" body create no blocks", () => {
    const src = `
defrecord Point
  x: Number?;
end

defgrammar Foo
  signature: from [String?(t)] to Point?;
  """
  Foo {
    rule = "defrecord Fake"
    end  = "end"
  }
  """
end
`;
    const blocks = split(src);
    // defgrammar is unimplemented → not emitted; only the real record is.
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe(ConstructKind.Record);
    expect(blocks[0]!.text).toContain("defrecord Point");
    expect(blocks[0]!.text).not.toContain("Foo {"); // bounded before the grammar
  });

  test("nested-end defextract: its three ends confuse nothing", () => {
    const src = `
defrecord A
  a: Number?;
end

defextract Ext
  within X using grammar/X
    scan Y as ys using grammar/Y;
    within ys
      scan Z as zs using grammar/Z;
    end
  end
end

defrecord B
  b: Number?;
end
`;
    const blocks = split(src);
    expect(blocks).toHaveLength(2); // A and B; Ext (unimplemented) is a boundary only
    expect(blocks.map((b) => b.kind)).toEqual([ConstructKind.Record, ConstructKind.Record]);
    expect(blocks[0]!.text).toContain("defrecord A");
    expect(blocks[0]!.text).not.toContain("defextract");
    expect(blocks[1]!.text).toContain("defrecord B");
  });

  test("derive (no `end`, ends with ;) is a clean boundary", () => {
    const src = `
defrecord E
  e: Number?;
end

derive Adult from Person;

defrecord F
  f: Number?;
end
`;
    const blocks = split(src);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.text).toContain("defrecord E");
    expect(blocks[0]!.text).not.toContain("derive");
    expect(blocks[1]!.text).toContain("defrecord F");
  });

  test("leading preamble comments and blank lines are ignored", () => {
    const src = `// a banner comment
// another line

defrecord C
  c: Number?;
end
`;
    const blocks = split(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe(ConstructKind.Record);
    expect(blocks[0]!.text.startsWith("defrecord C")).toBe(true);
  });

  test("inline // comments are stripped from a block", () => {
    const src = `
defrecord P
  x: Number?; // the x coordinate
  y: Number?;
end
`;
    const blocks = split(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).not.toContain("//");
    expect(blocks[0]!.text).toContain("x: Number?;");
  });

  test("a construct at EOF (no trailing newline) is captured in full", () => {
    const src = `defrecord D
  d: Number?;
end`;
    const blocks = split(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toContain("defrecord D");
    expect(blocks[0]!.text.trimEnd().endsWith("end")).toBe(true);
  });

  test("a blob that opens and closes on one line does not leak state", () => {
    const src = `
defgrammar Inline
  """ Foo { x = "y" } """
end

defrecord After
  z: Number?;
end
`;
    const blocks = split(src);
    // Inline (unimplemented) is a boundary; After must still be found.
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe(ConstructKind.Record);
    expect(blocks[0]!.text).toContain("defrecord After");
  });

  test("// inside a single-quoted string literal is preserved (not a comment)", () => {
    const src = `
defn f
  signature: from [Number?(n)] to String?;
  expression
    'http://x // y';
end
`;
    const blocks = split(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe(ConstructKind.Fn);
    expect(blocks[0]!.text).toContain("'http://x // y'");
  });

  test("empty / comment-only source yields no blocks", () => {
    expect(split("")).toEqual([]);
    expect(split("// just a comment\n\n// and another\n")).toEqual([]);
  });
});
