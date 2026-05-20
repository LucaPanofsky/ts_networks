declare module "nbb" {
  export function loadString(source: string, opts: Record<string, unknown>): Promise<unknown>;
}
