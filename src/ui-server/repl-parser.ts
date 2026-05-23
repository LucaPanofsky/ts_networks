export type RunCommand = {
  network: string;
  cells: Record<string, string>;
};

export type ParseResult =
  | { ok: true; command: RunCommand }
  | { ok: false; error: string };

export function parseReplCommand(input: string): ParseResult {
  const trimmed = input.trim();

  const headerMatch = trimmed.match(/^run\s+(\S+)\s+with\b/);
  if (!headerMatch) return { ok: false, error: 'expected: run <network> with' };
  const network = headerMatch[1]!;

  const endIdx = trimmed.lastIndexOf("end");
  if (endIdx === -1) return { ok: false, error: 'missing "end"' };

  const body = trimmed.slice(headerMatch[0].length, endIdx);
  const cells: Record<string, string> = {};

  for (const segment of body.split(";")) {
    const line = segment.trim();
    if (!line) continue;
    const cellMatch = line.match(/^cell\s+(\S+)\s*=\s*(.+)$/s);
    if (!cellMatch) return { ok: false, error: `cannot parse: "${line}"` };
    cells[cellMatch[1]!] = cellMatch[2]!.trim();
  }

  return { ok: true, command: { network, cells } };
}
