import { run } from "../operations/run.js";

export type RunRequest = {
  source: string;
  network: string;
  cells: Record<string, string>;
};

export type RunResponse =
  | { ok: true; network: string; cells: Record<string, unknown> }
  | { ok: false; error: string };

export async function handleRun(req: RunRequest): Promise<RunResponse> {
  return (await run.handle(req)) as RunResponse;
}
