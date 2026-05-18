import { type InfoStructure } from "./info-structure.js";
import { naryUnpacking } from "./nary-unpacking.js";

export type Morphism = {
  from: string[];
  to: string;
};

export type RegistryEntry = {
  fnName: string;
  impl: (...args: unknown[]) => unknown;
  arity: number;
  morphism: Morphism;
  unpacked: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>;
};

type RegistryInput = Omit<RegistryEntry, "unpacked">;

export type Registry = {
  register: (entry: RegistryInput) => void;
  remove: (fnName: string) => void;
  get: (fnName: string) => RegistryEntry | undefined;
  entries: () => RegistryEntry[];
};

export function createRegistry(): Registry {
  const map = new Map<string, RegistryEntry>();

  return {
    register: (entry) => {
      map.set(entry.fnName, { ...entry, unpacked: naryUnpacking(entry.impl) });
    },
    remove: (fnName) => { map.delete(fnName); },
    get: (fnName) => map.get(fnName),
    entries: () => Array.from(map.values()),
  };
}
