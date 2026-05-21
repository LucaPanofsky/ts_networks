import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Nothing, Something, Contradiction, type InfoStructure } from "../info-structure.js";
import { parseProgram } from "../data-network/tree-to-network.js";
import { compileProgram, compileCoercedExportMap } from "../sandbox/scittle/compiler.js";
import { compile } from "../sandbox/scittle/index.js";
import { openDb, upsertProgram, getProgram, listPrograms, deleteProgram } from "./db.js";
import type { RunResult } from "../network-impl/runner.js";

function serializeResult(result: RunResult) {
  const cells: Record<string, unknown> = {};
  for (const [name, cell] of result.cells) {
    const info: InfoStructure<unknown> = cell.knows();
    if (info === Nothing)              cells[name] = { type: "nothing" };
    else if (info instanceof Contradiction) cells[name] = { type: "contradiction", reason: info.type };
    else if (info instanceof Something)     cells[name] = { type: "something", value: info.content() };
  }
  if (result.type === "exit") return { type: "exit", reason: result.reason, cells };
  return { type: "done", cells };
}

export function createApp(dbPath: string): Hono {
  const db = openDb(dbPath);
  const app = new Hono();

  app.get("/programs", (c) => {
    return c.json(listPrograms(db));
  });

  app.get("/programs/:name", (c) => {
    const program = getProgram(db, c.req.param("name"));
    if (!program) return c.json({ error: "not found" }, 404);
    return c.json(program);
  });

  app.put("/programs/:name", async (c) => {
    const body = await c.req.json<{ dsl: string }>();
    if (typeof body.dsl !== "string") return c.json({ error: "dsl must be a string" }, 400);

    let program;
    try {
      program = parseProgram(body.dsl);
    } catch (e) {
      return c.json({ error: "parse error", detail: String(e) }, 400);
    }

    const clojure_source = compileProgram(program, [compileCoercedExportMap(program)]);

    upsertProgram(db, {
      name:           c.req.param("name"),
      dsl:            body.dsl,
      clojure_source,
      networks_json:  JSON.stringify(program.networks.map(n => ({ name: n.name, from: n.signature.from, to: n.signature.to }))),
      functions_json: JSON.stringify(program.fns.map(f => ({ name: f.name, from: f.params.map(p => p.predicate), to: f.returnType }))),
      records_json:   JSON.stringify(program.records.map(r => ({ name: r.name, fields: r.fields }))),
    });

    return c.json(getProgram(db, c.req.param("name")));
  });

  app.delete("/programs/:name", (c) => {
    const deleted = deleteProgram(db, c.req.param("name"));
    if (!deleted) return c.json({ error: "not found" }, 404);
    return c.json({ deleted: true });
  });

  app.post("/programs/:name/invoke/:networkName", async (c) => {
    const row = getProgram(db, c.req.param("name"));
    if (!row) return c.json({ error: "program not found" }, 404);

    const body = await c.req.json<{ inputs: Record<string, unknown> }>();

    let compiled;
    try {
      compiled = await compile(row.dsl);
    } catch (e) {
      return c.json({ error: "compile error", detail: String(e) }, 500);
    }

    const network = compiled.networks.get(c.req.param("networkName"));
    if (!network) return c.json({ error: "network not found" }, 404);

    const result = network.invoke(body.inputs ?? {});
    return c.json(serializeResult(result));
  });

  app.use("/*", serveStatic({ root: "./ui" }));

  return app;
}
