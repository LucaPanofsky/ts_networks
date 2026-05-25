import { compile } from "../../../src/sandbox/jsgen/index.js";

// ── Arithmetic ────────────────────────────────────────────────────────────────

const arithmeticDsl = `
defn add
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a + b;
end

defn sub
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a - b;
end

defn mul
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a * b;
end

defn div
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a / b;
end
`;

describe("arithmetic operators — end-to-end", () => {
  const { sandbox } = compile(arithmeticDsl);
  const add = sandbox["add"] as (a: number, b: number) => number;
  const sub = sandbox["sub"] as (a: number, b: number) => number;
  const mul = sandbox["mul"] as (a: number, b: number) => number;
  const div = sandbox["div"] as (a: number, b: number) => number;

  it("3 + 4 = 7", () => expect(add(3, 4)).toBe(7));
  it("10 - 3 = 7", () => expect(sub(10, 3)).toBe(7));
  it("3 * 4 = 12", () => expect(mul(3, 4)).toBe(12));
  it("10 / 2 = 5", () => expect(div(10, 2)).toBe(5));
});

// ── Unary minus ───────────────────────────────────────────────────────────────

const unaryDsl = `
defn negate
  signature: from [Number?(x)] to Number?;
  expression -x;
end

defn mulNegOne
  signature: from [Number?(x)] to Number?;
  expression x * -1;
end

defn doubleNeg
  signature: from [Number?(x)] to Number?;
  expression 0 - -x;
end
`;

describe("unary minus — end-to-end", () => {
  const { sandbox } = compile(unaryDsl);
  const negate = sandbox["negate"] as (x: number) => number;
  const mulNegOne = sandbox["mulNegOne"] as (x: number) => number;
  const doubleNeg = sandbox["doubleNeg"] as (x: number) => number;

  it("-5 = -5", () => expect(negate(5)).toBe(-5));
  it("3 * -1 = -3", () => expect(mulNegOne(3)).toBe(-3));
  it("0 - -4 = 4 (double unary)", () => expect(doubleNeg(4)).toBe(4));
});

// ── Boolean and comparison operators ─────────────────────────────────────────

const boolDsl = `
defn eq
  signature: from [Number?(a), Number?(b)] to Boolean?;
  expression a == b;
end

defn neq
  signature: from [Number?(a), Number?(b)] to Boolean?;
  expression a != b;
end

defn gt
  signature: from [Number?(a), Number?(b)] to Boolean?;
  expression a > b;
end

defn lt
  signature: from [Number?(a), Number?(b)] to Boolean?;
  expression a < b;
end

defn gte
  signature: from [Number?(a), Number?(b)] to Boolean?;
  expression a >= b;
end

defn lte
  signature: from [Number?(a), Number?(b)] to Boolean?;
  expression a <= b;
end

defn and
  signature: from [Boolean?(a), Boolean?(b)] to Boolean?;
  expression a && b;
end

defn or
  signature: from [Boolean?(a), Boolean?(b)] to Boolean?;
  expression a || b;
end

defn not
  signature: from [Boolean?(b)] to Boolean?;
  expression !b;
end
`;

describe("boolean and comparison operators — end-to-end", () => {
  const { sandbox } = compile(boolDsl);
  const eq  = sandbox["eq"]  as (a: number, b: number) => boolean;
  const neq = sandbox["neq"] as (a: number, b: number) => boolean;
  const gt  = sandbox["gt"]  as (a: number, b: number) => boolean;
  const lt  = sandbox["lt"]  as (a: number, b: number) => boolean;
  const gte = sandbox["gte"] as (a: number, b: number) => boolean;
  const lte = sandbox["lte"] as (a: number, b: number) => boolean;
  const and = sandbox["and"] as (a: boolean, b: boolean) => boolean;
  const or  = sandbox["or"]  as (a: boolean, b: boolean) => boolean;
  const not = sandbox["not"] as (b: boolean) => boolean;

  it("3 == 3 is true",  () => expect(eq(3, 3)).toBe(true));
  it("3 == 4 is false", () => expect(eq(3, 4)).toBe(false));
  it("3 != 4 is true",  () => expect(neq(3, 4)).toBe(true));
  it("3 != 3 is false", () => expect(neq(3, 3)).toBe(false));
  it("5 > 3 is true",   () => expect(gt(5, 3)).toBe(true));
  it("3 > 5 is false",  () => expect(gt(3, 5)).toBe(false));
  it("3 < 5 is true",   () => expect(lt(3, 5)).toBe(true));
  it("5 < 3 is false",  () => expect(lt(5, 3)).toBe(false));
  it("3 >= 3 is true",  () => expect(gte(3, 3)).toBe(true));
  it("2 >= 3 is false", () => expect(gte(2, 3)).toBe(false));
  it("3 <= 4 is true",  () => expect(lte(3, 4)).toBe(true));
  it("4 <= 3 is false", () => expect(lte(4, 3)).toBe(false));
  it("true && false is false", () => expect(and(true, false)).toBe(false));
  it("true && true is true",   () => expect(and(true, true)).toBe(true));
  it("false || true is true",  () => expect(or(false, true)).toBe(true));
  it("false || false is false",() => expect(or(false, false)).toBe(false));
  it("!true is false",  () => expect(not(true)).toBe(false));
  it("!false is true",  () => expect(not(false)).toBe(true));
});

// ── Field access ──────────────────────────────────────────────────────────────

const fieldDsl = `
defrecord Point
  x: Number?;
  y: Number?;
end

defrecord Rectangle
  width: Number?;
  height: Number?;
  origin: Point?;
end

defn getWidth
  signature: from [Rectangle?(r)] to Number?;
  expression r.width;
end

defn getOriginX
  signature: from [Rectangle?(r)] to Number?;
  expression r.origin.x;
end
`;

describe("field access — end-to-end", () => {
  const { sandbox } = compile(fieldDsl);
  const Point     = sandbox["Point"]     as (x: number, y: number) => unknown;
  const Rectangle = sandbox["Rectangle"] as (width: number, height: number, origin: unknown) => unknown;
  const getWidth   = sandbox["getWidth"]   as (r: unknown) => number;
  const getOriginX = sandbox["getOriginX"] as (r: unknown) => number;

  it("r.width returns the width field", () => {
    const r = Rectangle(3, 4, Point(0, 0));
    expect(getWidth(r)).toBe(3);
  });

  it("r.origin.x returns nested field", () => {
    const r = Rectangle(3, 4, Point(7, 2));
    expect(getOriginX(r)).toBe(7);
  });
});

// ── Let bindings ──────────────────────────────────────────────────────────────

const letDsl = `
defn singleLet
  signature: from [] to Number?;
  expression
    let a = 3;
    a * 2;
end

defn twoLets
  signature: from [] to Number?;
  expression
    let a = 3;
    let b = 4;
    a + b;
end

`;

describe("let bindings — end-to-end", () => {
  const { sandbox } = compile(letDsl);
  const singleLet = sandbox["singleLet"] as () => number;
  const twoLets   = sandbox["twoLets"]   as () => number;

  it("let a = 3; a * 2 = 6", () => expect(singleLet()).toBe(6));
  it("let a = 3; let b = 4; a + b = 7", () => expect(twoLets()).toBe(7));
});

// ── Conditionals (if) ─────────────────────────────────────────────────────────

const ifDsl = `
defn pickTrue
  signature: from [Boolean?(b)] to String?;
  expression if(b, 'yes', 'no');
end

defn nested
  signature: from [Number?(a)] to String?;
  expression if(a > 0, if(a > 5, 'big', 'small'), 'negative');
end
`;

describe("if conditionals — end-to-end", () => {
  const { sandbox } = compile(ifDsl);
  const pickTrue = sandbox["pickTrue"] as (b: boolean) => string;
  const nested   = sandbox["nested"]   as (a: number) => string;

  it("if(true, 'yes', 'no') = 'yes'",  () => expect(pickTrue(true)).toBe("yes"));
  it("if(false, 'yes', 'no') = 'no'",  () => expect(pickTrue(false)).toBe("no"));
  it("nested if: 3 → 'small'",         () => expect(nested(3)).toBe("small"));
  it("nested if: 10 → 'big'",          () => expect(nested(10)).toBe("big"));
  it("nested if: -1 → 'negative'",     () => expect(nested(-1)).toBe("negative"));
});

// ── Operator precedence ───────────────────────────────────────────────────────

const precedenceDsl = `
defn addThenMul
  signature: from [] to Number?;
  expression 2 + 3 * 4;
end

defn parenFirst
  signature: from [] to Number?;
  expression (2 + 3) * 4;
end

defn notBeforeOr
  signature: from [Boolean?(a), Boolean?(b)] to Boolean?;
  expression !a || b;
end

defn unaryBeforeMul
  signature: from [Number?(x)] to Number?;
  expression -x * 2;
end
`;

describe("operator precedence — end-to-end", () => {
  const { sandbox } = compile(precedenceDsl);
  const addThenMul    = sandbox["addThenMul"]    as () => number;
  const parenFirst    = sandbox["parenFirst"]    as () => number;
  const notBeforeOr   = sandbox["notBeforeOr"]   as (a: boolean, b: boolean) => boolean;
  const unaryBeforeMul = sandbox["unaryBeforeMul"] as (x: number) => number;

  it("2 + 3 * 4 = 14 (mul binds tighter)", () => expect(addThenMul()).toBe(14));
  it("(2 + 3) * 4 = 20 (parens override)", () => expect(parenFirst()).toBe(20));
  it("!true || true = true  (!a before ||)", () => expect(notBeforeOr(true, true)).toBe(true));
  it("!false || false = true (!a before ||)", () => expect(notBeforeOr(false, false)).toBe(true));
  it("-3 * 2 = -6  (unary binds tighter than mul)", () => expect(unaryBeforeMul(3)).toBe(-6));
});
