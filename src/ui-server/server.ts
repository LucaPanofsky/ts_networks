import express, { type Request, type Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseProgram } from "../data-network/tree-to-network.js";
import { astToDataNetwork } from "../data-network/ast-to-data-network.js";
import { networkToDiagram } from "./mermaid.js";
import { typeCheckProgram } from "../data-network/type-checker.js";
import { run } from "../operations/run.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public");

export type NetworkError = { node: string; kind: string; message: string };

export type NetworkDiagram = {
  name: string;
  diagram: string;
  details: Record<string, string>;
  errors: NetworkError[];
};

type SseClient = Response;

export function createServer(port = 3000) {
  const app = express();
  const clients: Set<SseClient> = new Set();

  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  app.get("/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  app.post("/push", (req: Request, res: Response) => {
    const body = req.body as { source?: string };
    if (!body.source) {
      res.status(400).json({ error: "body must have a source field" });
      return;
    }

    const networks: NetworkDiagram[] = [];
    try {
      const program = parseProgram(body.source);
      const enrichedMap = typeCheckProgram(program);
      for (const net of program.networks) {
        const enriched = enrichedMap.get(net.name);
        const { diagram, details } = networkToDiagram(astToDataNetwork(net), program, enriched);
        const errors: NetworkError[] = [];
        if (enriched) {
          for (const cell of enriched.cells.values())
            for (const e of cell._errors)
              errors.push({ node: cell.name, kind: e.kind, message: e.message });
          for (const prop of enriched.propagators)
            for (const e of prop._errors)
              errors.push({ node: prop.fn ?? "switch", kind: e.kind, message: e.message });
        }
        networks.push({ name: net.name, diagram, details, errors });
      }
    } catch {
      // parse errors are non-fatal; we still push the source
    }

    const programMsg = { type: "program", payload: { source: body.source, networks } };
    const programData = `data: ${JSON.stringify(programMsg)}\n\n`;
    for (const client of clients) client.write(programData);

    for (const net of networks) {
      for (const err of net.errors) {
        const logMsg = { type: "log", payload: { line: `[typecheck] ${net.name}/${err.node}: ${err.message}`, error: true } };
        const logData = `data: ${JSON.stringify(logMsg)}\n\n`;
        for (const client of clients) client.write(logData);
      }
    }

    res.json({ ok: true, clients: clients.size });
  });

  app.post("/run", (req: Request, res: Response) => {
    const body = req.body as Parameters<typeof run.handle>[0];
    const result = run.handle(body);
    console.log("[/run]", JSON.stringify(result, null, 2));
    res.json(result);
  });

  return app.listen(port, () => {
    console.log(`ui-server on http://localhost:${port}`);
  });
}
