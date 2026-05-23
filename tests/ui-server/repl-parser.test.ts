import { parseReplCommand } from "../../src/ui-server/repl-parser.js";

test("parses a basic run command", () => {
  const result = parseReplCommand(`
run add with
  cell a = 5;
  cell b = 10;
end
  `.trim());
  expect(result).toEqual({
    ok: true,
    command: { network: "add", cells: { a: "5", b: "10" } },
  });
});

test("parses string values", () => {
  const result = parseReplCommand(`run pipeline with\n  cell input = "hello";\nend`);
  expect(result).toEqual({
    ok: true,
    command: { network: "pipeline", cells: { input: '"hello"' } },
  });
});

test("parses constructor call values", () => {
  const result = parseReplCommand(`run net with\n  cell x = Point(1, 2);\nend`);
  expect(result).toEqual({
    ok: true,
    command: { network: "net", cells: { x: "Point(1, 2)" } },
  });
});

test("parses zero cells", () => {
  const result = parseReplCommand(`run net with\nend`);
  expect(result).toEqual({ ok: true, command: { network: "net", cells: {} } });
});

test("error on missing with", () => {
  const result = parseReplCommand(`run net\n  cell a = 1;\nend`);
  expect(result.ok).toBe(false);
});

test("error on missing end", () => {
  const result = parseReplCommand(`run net with\n  cell a = 1;`);
  expect(result.ok).toBe(false);
});

test("error on malformed cell line", () => {
  const result = parseReplCommand(`run net with\n  blah;\nend`);
  expect(result.ok).toBe(false);
});
