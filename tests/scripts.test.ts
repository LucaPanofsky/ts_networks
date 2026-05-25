import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(script: string, args: string[] = []) {
  const result = spawnSync("npx", ["tsx", `scripts/${script}.ts`, ...args], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

function writeTmp(content: string): string {
  const path = join(tmpdir(), `tsn-test-${process.pid}-${Date.now()}.tsn`);
  writeFileSync(path, content, "utf-8");
  return path;
}

function removeTmp(path: string) {
  try { unlinkSync(path); } catch { /* ignore */ }
}

const VALID_TSN = `
defn double
  signature: from [Number?(x)] to Number?;
  expression x * 2;
end

defnetwork doubleNet
  signature: from [input] to output;
  propagate double from [input] to output;
end
`;

const INVALID_SYNTAX_TSN = `
this is not valid tsn at all %%%
`;

const TYPE_ERROR_TSN = `
defn strFn
  signature: from [Number?(x)] to String?;
  expression 'hello';
end

defn numFn
  signature: from [Number?(x)] to Number?;
  expression x;
end

defnetwork conflict
  signature: from [input] to output;
  propagate strFn from [input] to output;
  propagate numFn from [input] to output;
end
`;

// ── check ─────────────────────────────────────────────────────────────────────

describe("check: missing argument", () => {
  const r = run("check");
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints usage to stderr", () => expect(r.stderr).toContain("Usage:"));
});

describe("check: file not found", () => {
  const r = run("check", ["nonexistent.tsn"]);
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints clean error to stderr", () => expect(r.stderr).toContain("Cannot read file"));
  test("no stack trace on stderr", () => expect(r.stderr).not.toContain("at "));
});

describe("check: invalid syntax", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(INVALID_SYNTAX_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("check", [tmp]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("error mentions line number", () => expect(r().stderr).toContain("line"));
});

describe("check: valid file", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(VALID_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("check", [tmp]);
  test("exits 0", () => expect(r().exitCode).toBe(0));
  test("prints ok", () => expect(r().stdout).toContain("ok"));
});

// ── parse ─────────────────────────────────────────────────────────────────────

describe("parse: missing argument", () => {
  const r = run("parse");
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints usage to stderr", () => expect(r.stderr).toContain("Usage:"));
});

describe("parse: file not found", () => {
  const r = run("parse", ["nonexistent.tsn"]);
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints clean error to stderr", () => expect(r.stderr).toContain("Cannot read file"));
  test("no stack trace on stderr", () => expect(r.stderr).not.toContain("at "));
});

describe("parse: invalid syntax", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(INVALID_SYNTAX_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("parse", [tmp]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("error mentions line number", () => expect(r().stderr).toContain("line"));
});

describe("parse: valid file", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(VALID_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("parse", [tmp]);
  test("exits 0", () => expect(r().exitCode).toBe(0));
  test("stdout is valid JSON", () => expect(() => JSON.parse(r().stdout)).not.toThrow());
});

// ── typecheck ─────────────────────────────────────────────────────────────────

describe("typecheck: missing argument", () => {
  const r = run("typecheck");
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints usage to stderr", () => expect(r.stderr).toContain("Usage:"));
});

describe("typecheck: file not found", () => {
  const r = run("typecheck", ["nonexistent.tsn"]);
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints clean error to stderr", () => expect(r.stderr).toContain("Cannot read file"));
  test("no stack trace on stderr", () => expect(r.stderr).not.toContain("at "));
});

describe("typecheck: invalid syntax", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(INVALID_SYNTAX_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("typecheck", [tmp]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("error mentions line number", () => expect(r().stderr).toContain("line"));
});

describe("typecheck: well-typed file", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(VALID_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("typecheck", [tmp]);
  test("exits 0", () => expect(r().exitCode).toBe(0));
  test("prints ok", () => expect(r().stdout).toContain("ok"));
});

describe("typecheck: file with type errors", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(TYPE_ERROR_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("typecheck", [tmp]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("prints error details to stderr", () => expect(r().stderr).toContain("conflicting-cell-types"));
});

// ── compile-schemas ───────────────────────────────────────────────────────────

describe("compile-schemas: missing argument", () => {
  const r = run("compile-schemas");
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints usage to stderr", () => expect(r.stderr).toContain("Usage:"));
});

describe("compile-schemas: file not found", () => {
  const r = run("compile-schemas", ["nonexistent.tsn"]);
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints clean error to stderr", () => expect(r.stderr).toContain("Cannot read file"));
  test("no stack trace on stderr", () => expect(r.stderr).not.toContain("at "));
});

describe("compile-schemas: invalid syntax", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(INVALID_SYNTAX_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("compile-schemas", [tmp]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("error mentions line number", () => expect(r().stderr).toContain("line"));
});

describe("compile-schemas: valid file", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(VALID_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("compile-schemas", [tmp]);
  test("exits 0", () => expect(r().exitCode).toBe(0));
  test("stdout is valid JSON", () => expect(() => JSON.parse(r().stdout)).not.toThrow());
});

// ── run ───────────────────────────────────────────────────────────────────────

describe("run: missing arguments", () => {
  const r = run("run");
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints usage to stderr", () => expect(r.stderr).toContain("Usage:"));
});

describe("run: file not found", () => {
  const r = run("run", ["nonexistent.tsn", "someNet"]);
  test("exits 1", () => expect(r.exitCode).toBe(1));
  test("prints clean error to stderr", () => expect(r.stderr).toContain("Cannot read file"));
  test("no stack trace on stderr", () => expect(r.stderr).not.toContain("at "));
});

describe("run: invalid syntax", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(INVALID_SYNTAX_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("run", [tmp, "someNet"]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("error mentions line number", () => expect(r().stderr).toContain("line"));
});

describe("run: unknown network name", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(VALID_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("run", [tmp, "nonexistentNet"]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("error mentions the network name", () => expect(r().stderr).toContain("nonexistentNet"));
});

describe("run: malformed cell argument", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(VALID_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("run", [tmp, "doubleNet", "noequalssign"]);
  test("exits 1", () => expect(r().exitCode).toBe(1));
  test("error mentions the bad argument", () => expect(r().stderr).toContain("noequalssign"));
});

describe("run: valid invocation", () => {
  let tmp: string;
  beforeAll(() => { tmp = writeTmp(VALID_TSN); });
  afterAll(() => removeTmp(tmp));

  const r = () => run("run", [tmp, "doubleNet", "input=21"]);
  test("exits 0", () => expect(r().exitCode).toBe(0));
  test("output cell is printed", () => expect(r().stdout).toContain("output"));
});
