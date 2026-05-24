import { run } from "../operations/run.js";

export type RunRequest = {
  source: string;
  network: string;
  cells: Record<string, string>;
};

export type RunResponse =
  | { ok: true; network: string; cells: Record<string, unknown> }
  | { ok: false; error: string };

export function handleRun(req: RunRequest): RunResponse {
  return run.handle(req) as RunResponse;
}
