import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../../src/operations/run.js";

// identity over String — surfaces whatever was seeded into `s`
const echoDsl = `
defn echo
  signature: from [String?(s)] to String?;
  expression s;
end

defnetwork e
  signature: from [s] to out;
  propagate echo from [s] to out;
end
`;

// identity over Number — used to contrast the eval path with @file
const numDsl = `
defn idn
  signature: from [Number?(n)] to Number?;
  expression n;
end

defnetwork d
  signature: from [n] to out;
  propagate idn from [n] to out;
end
`;

describe("run operation: @file cell seeding", () => {
  let root: string;
  const saved = process.env.TSN_WORKSPACE;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "runseed-"));
    process.env.TSN_WORKSPACE = root;
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.TSN_WORKSPACE;
    else process.env.TSN_WORKSPACE = saved;
    await rm(root, { recursive: true, force: true });
  });

  test("@file seeds the raw text of a workspace file as a string", async () => {
    await writeFile(join(root, "doc.txt"), "hello from a file", "utf-8");
    const r = await run.handle({ source: echoDsl, network: "e", cells: { s: "@doc.txt" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cells["out"]).toBe("hello from a file");
  });

  // The load-bearing negative: a document is data, not code. Content that LOOKS
  // like a JS expression must be seeded verbatim, never executed.
  test("a file whose contents look like JS is NOT evaluated", async () => {
    await writeFile(join(root, "calc.txt"), "1 + 1", "utf-8");
    const r = await run.handle({ source: echoDsl, network: "e", cells: { s: "@calc.txt" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cells["out"]).toBe("1 + 1"); // the string, not the number 2
  });

  test("contrast: the same text as a bare expression IS evaluated", async () => {
    const r = await run.handle({ source: numDsl, network: "d", cells: { n: "1 + 1" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cells["out"]).toBe(2);
  });

  test("a missing @file is a clean error", async () => {
    const r = await run.handle({ source: echoDsl, network: "e", cells: { s: "@nope.txt" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no such file/i);
  });

  test("a traversal @file name is refused", async () => {
    const r = await run.handle({ source: echoDsl, network: "e", cells: { s: "@../escape" } });
    expect(r.ok).toBe(false);
  });
});
