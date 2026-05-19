export type Morphism = {
  from: string[];
  to: string;
};

export type RegistryEntry = {
  fnName: string;
  impl: (...args: unknown[]) => unknown;
  arity: number;
  morphism: Morphism;
};

export type Registry = {
  register: (entry: RegistryEntry) => void;
  remove: (fnName: string) => void;
  get: (fnName: string) => RegistryEntry | undefined;
  entries: () => RegistryEntry[];
};

export function createRegistry(): Registry {
  const map = new Map<string, RegistryEntry>();

  return {
    register: (entry) => { map.set(entry.fnName, entry); },
    remove: (fnName) => { map.delete(fnName); },
    get: (fnName) => map.get(fnName),
    entries: () => Array.from(map.values()),
  };
}
