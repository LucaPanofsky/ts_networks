// Project an info-bearing value to a plain JS result — the shared tail of `run` and
// `run-compiled`, so an artifact's output matches the engine `run` exactly.
//
// A cell's `knows()` (or a leaf's return) may be an unresolved APromise (an async leaf —
// llmfn / sub-network), a Contradiction, or a settled InfoStructure. We await the promise,
// surface a Contradiction as a structured error (never hidden as ∅/null), and unwrap
// Something / MergeObject / MergeSet to their content.

import { Something, Contradiction, type InfoStructure } from "../info-structure.js";
import { MergeObject } from "../information-structures/merge-object.js";
import { MergeSet } from "../information-structures/merge-set.js";
import { APromise } from "../information-structures/apromise.js";

export async function projectInfo(info: unknown): Promise<unknown> {
  if (info instanceof APromise) info = (await info.deferred.promise) as InfoStructure<unknown>;
  if (info instanceof Contradiction) {
    return { __contradiction: info.type, reason: String(info.reason ?? "") };
  }
  return info instanceof Something || info instanceof MergeObject || info instanceof MergeSet
    ? info.content()
    : null;
}
