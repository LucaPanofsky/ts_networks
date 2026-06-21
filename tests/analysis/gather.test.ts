import { parseImports } from "../../repo_workspace/analysis/gather.js";

// `parseImports` is the pure value-vs-type classifier behind the maintenance report's
// dependency graph. The distinction matters: TypeScript ERASES `import type` / `export type`,
// so those create no runtime edge — counting them is what produced a phantom module "cycle"
// (the front end shares the engine's AST types while the engine reads the front end's `Program`:
// bidirectional in the type graph, a clean DAG at runtime). gatherEdges drops the type-only ones.

const specs = (src: string) => parseImports(src).map((r) => r.spec);
const typeOnly = (src: string) => parseImports(src).filter((r) => r.typeOnly).map((r) => r.spec);
const runtime = (src: string) => parseImports(src).filter((r) => !r.typeOnly).map((r) => r.spec);

describe("parseImports: value vs type classification", () => {
  test("a plain value import is a runtime edge", () => {
    expect(runtime(`import { fnsOf } from "../language/select.js";`)).toEqual(["../language/select.js"]);
    expect(typeOnly(`import { fnsOf } from "../language/select.js";`)).toEqual([]);
  });

  test("a statement-level `import type` is type-only (erased — no runtime edge)", () => {
    const src = `import type { Program } from "../language/pipeline/program.js";`;
    expect(typeOnly(src)).toEqual(["../language/pipeline/program.js"]);
    expect(runtime(src)).toEqual([]);
  });

  test("`export type … from` is type-only; `export … from` is runtime", () => {
    expect(typeOnly(`export type { RecordAST } from "./types.js";`)).toEqual(["./types.js"]);
    expect(runtime(`export { astToDataNetwork } from "./ast-to-data-network.js";`)).toEqual([
      "./ast-to-data-network.js",
    ]);
  });

  test("a mixed inline import (value + `type`) is a runtime edge — it carries a value", () => {
    const src = `import { I, type InfoStructure, Contradiction } from "../info-structure.js";`;
    expect(runtime(src)).toEqual(["../info-structure.js"]);
    expect(typeOnly(src)).toEqual([]);
  });

  test("default and namespace imports are runtime", () => {
    expect(runtime(`import Foo from "./foo.js";`)).toEqual(["./foo.js"]);
    expect(runtime(`import * as ns from "./ns.js";`)).toEqual(["./ns.js"]);
  });

  test("side-effect and dynamic imports are runtime", () => {
    expect(runtime(`import "./register.js";`)).toEqual(["./register.js"]);
    expect(runtime(`const m = await import("./lazy.js");`)).toEqual(["./lazy.js"]);
  });
});

describe("parseImports: robustness", () => {
  test("multi-line import clauses are captured", () => {
    const src = `import {\n  a,\n  b,\n} from "./multi.js";`;
    expect(runtime(src)).toEqual(["./multi.js"]);
  });

  test("multi-line `import type` clause is still type-only", () => {
    const src = `import type {\n  Expr,\n  TypeRef,\n} from "../data-network/types.js";`;
    expect(typeOnly(src)).toEqual(["../data-network/types.js"]);
  });

  test("several statements on one file are all found, in order", () => {
    const src = [
      `import { a } from "./a.js";`,
      `import type { B } from "./b.js";`,
      `export { c } from "./c.js";`,
    ].join("\n");
    expect(specs(src)).toEqual(["./a.js", "./b.js", "./c.js"]);
    expect(runtime(src)).toEqual(["./a.js", "./c.js"]);
  });

  test("the engine ⇄ front-end coupling: the type-only back-edge is dropped, the value edge kept", () => {
    // type-checker.ts shape: reads the modular Program (type) but calls the selectors (value).
    const src = [
      `import type { Program } from "../language/pipeline/program.js";`,
      `import { fnsOf, recordsOf } from "../language/select.js";`,
    ].join("\n");
    expect(runtime(src)).toEqual(["../language/select.js"]); // the only runtime dependency
    expect(typeOnly(src)).toEqual(["../language/pipeline/program.js"]);
  });
});
