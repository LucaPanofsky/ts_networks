import { compile } from "../../../src/sandbox/jsgen/index.js";

// Builtins available inside expressions: `every`/`some` (flat collection questions
// over a named predicate, which compiles to a function value) and the `str/...`
// namespace of non-regex string functions. Each is exercised through a `defn` that
// wraps it, so it shows up as a callable sandbox export.

const src = `
defpredicate big?
  signature: from [Number?(n)] to Boolean?;
  expression n > 2;
end

defn allBig
  signature: from [Any?(xs)] to Boolean?;
  expression every(big?, xs);
end

defn anyBig
  signature: from [Any?(xs)] to Boolean?;
  expression some(big?, xs);
end

defn greet
  signature: from [String?(name)] to String?;
  expression str('hello ', name);
end

defn shout
  signature: from [String?(s)] to String?;
  expression str/upper(s);
end

defn hasLuca
  signature: from [String?(s)] to Boolean?;
  expression str/contains?(s, 'luca');
end

defn firstWord
  signature: from [String?(s)] to Any?;
  expression str/split(s, ' ');
end

defn redact
  signature: from [String?(s)] to String?;
  expression str/replace(s, 'secret', '***');
end

defn isEmpty
  signature: from [String?(s)] to Boolean?;
  expression str/blank?(s);
end
`;

const { sandbox } = compile(src);

describe("expression builtins: every / some", () => {
  test("every applies a named predicate elementwise", () => {
    expect(sandbox["allBig"]!([3, 4, 5])).toBe(true);
    expect(sandbox["allBig"]!([3, 1, 5])).toBe(false);
  });

  test("some is the dual of every", () => {
    expect(sandbox["anyBig"]!([1, 2, 5])).toBe(true);
    expect(sandbox["anyBig"]!([1, 2])).toBe(false);
  });
});

describe("expression builtins: str / str/...", () => {
  test("str concatenates its arguments", () => {
    expect(sandbox["greet"]!("luca")).toBe("hello luca");
  });

  test("str/upper, str/contains?, str/split, str/replace, str/blank?", () => {
    expect(sandbox["shout"]!("hi")).toBe("HI");
    expect(sandbox["hasLuca"]!("hello luca")).toBe(true);
    expect(sandbox["hasLuca"]!("hello bob")).toBe(false);
    expect(sandbox["firstWord"]!("a b c")).toEqual(["a", "b", "c"]);
    expect(sandbox["redact"]!("the secret is out")).toBe("the *** is out");
    expect(sandbox["isEmpty"]!("   ")).toBe(true);
    expect(sandbox["isEmpty"]!(" x ")).toBe(false);
  });
});

describe("builtins are shadowed by user definitions, not clashed", () => {
  // A user `defn` with a builtin's name must win without a duplicate-const crash.
  test("a user-defined `every` overrides the builtin", () => {
    const shadow = `
      defn every
        signature: from [Any?(a), Any?(b)] to String?;
        expression str('shadowed:', a);
      end
      defn use
        signature: from [Any?(x)] to String?;
        expression every(x, x);
      end
    `;
    const { sandbox: sb } = compile(shadow);
    expect(sb["use"]!("Z")).toBe("shadowed:Z");
  });
});
