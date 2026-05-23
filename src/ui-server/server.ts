import express, { type Request, type Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseProgram } from "../data-network/tree-to-network.js";
import { astToDataNetwork } from "../data-network/ast-to-data-network.js";
import { networkToDiagram } from "./mermaid.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public");

export type NetworkDiagram = {
  name: string;
  diagram: string;
  details: Record<string, string>;
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
      for (const net of program.networks) {
        const { diagram, details } = networkToDiagram(astToDataNetwork(net), program);
        networks.push({ name: net.name, diagram, details });
      }
    } catch {
      // parse errors are non-fatal; we still push the source
    }

    const msg = { type: "program", payload: { source: body.source, networks } };
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const client of clients) client.write(data);
    res.json({ ok: true, clients: clients.size });
  });

  return app.listen(port, () => {
    console.log(`ui-server on http://localhost:${port}`);
  });
}
