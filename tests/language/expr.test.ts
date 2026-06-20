// Differential-oracle tests for the new Ohm expression parser. The existing Lezer
// parser is the ORACLE (used here as a dev-time fitness check only — the shipped
// pipeline imports no Lezer): for each snippet we assert the new `parseExpression`
// produces an `Expr` AST deep-equal to what the existing parser produces.
//
// The oracle wraps the snippet in a one-defn program and reads `.fns[0].body`. We pass
// snippets WITHOUT the trailing ';'; the helpers add it (the body grammar requires it).

import { parseExpression } from "../../src/language/expr/parse.js";
import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
import { fnsOf } from "../../src/language/select.js";
import type { Expr } from "../../src/data-network/types.js";

function oracle(snippet: string): Expr {
  const prog = parseProgram(`defn o signature: from to Number?; expression ${snippet}; end`);
  return fnsOf(prog)[0]!.body;
}

function check(snippet: string): void {
  expect(parseExpression(`${snippet};`)).toEqual(oracle(snippet));
}

describe("expr — core (literals, var, field, call, if, unary, binary precedence)", () => {
  test.each([
    "42",
    "3.14",
    "true",
    "false",
    "'hello'",
    "x",
    "r.width",
    "p.origin.x",
    "f(x).y",
    "add(a, b)",
    "max(1, 2, 3)",
    "if(b, 'yes', 'no')",
    "if(a > 0, if(a > 5, 'big', 'small'), 'neg')",
    "!a",
    "-x",
    "!!a",
    "1 + 2",
    "2 + 3 * 4",
    "a + b + c",
    "a + b - c",
    "-x * 2",
    "!a || b",
    "a && b || c",
    "a == b",
    "a != b",
    "a <= b && c > d",
    "(a + b) * c",
    "n > 2",
  ])("matches the oracle: %s", (snippet) => check(snippet));
});

describe("expr — let", () => {
  test.each([
    "let a = 3; a + 1",
    "let a = 3; let b = 4; a + b",
    "let x = f(y); x * x",
  ])("matches the oracle: %s", (snippet) => check(snippet));
});

describe("expr — match", () => {
  test.each([
    "match s | _ -> 0 end",
    "match s | Circle { radius: r } -> r end",
    "match s | Circle { radius: r } when r > 10 -> 'big' | _ -> 'small' end",
    "match s | Rect { width: w, height: h } when w == h -> 'square' | Rect { width: w, height: h } -> 'rect' | _ -> 'other' end",
  ])("matches the oracle: %s", (snippet) => check(snippet));
});

describe("expr — failure", () => {
  test("a malformed expression throws", () => {
    expect(() => parseExpression("1 +;")).toThrow();
  });
});
