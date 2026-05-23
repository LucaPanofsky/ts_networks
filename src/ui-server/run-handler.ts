export type RunRequest = {
  source: string;
  network: string;
  cells: Record<string, string>;
};

export type RunResponse =
  | { ok: true; network: string; cells: Record<string, string> }
  | { ok: false; error: string };

export function handleRun(req: RunRequest): RunResponse {
  const { source, network, cells } = req;
  if (!source) return { ok: false, error: "source is required" };
  if (!network) return { ok: false, error: "network is required" };
  return { ok: true, network, cells };
}
