// Pure templating core for LLM function prompts (the *runtime* half of the placeholder
// machinery). The PLACEHOLDER grammar and compile-time path extraction live in
// data-network/placeholders.ts; this module imports the regex so the runtime renderer
// and the static analysis never drift.
//
// Kept separate from llmfn-client.ts (the effectful SDK boundary) so it can be
// unit-tested in isolation. Two responsibilities, each a pure total function:
//   - serializeArg: turn any argument value into prompt text, explicitly.
//   - renderPrompt: substitute {{placeholders}}, surfacing missing keys as a value.

import { PLACEHOLDER } from "../data-network/placeholders.js";

/**
 * Resolve a dotted path against `args`, one segment at a time. Presence is tested
 * with `in` at every level (so a present-null leaf is found, not missing), and
 * descent stops safely at any non-object intermediate — `"x" in null` would
 * throw, so a path that runs into a scalar or null resolves to not-found rather
 * than crashing. The leaf value is returned verbatim for the caller to serialize.
 */
function resolvePath(args: Record<string, unknown>, path: string): { found: boolean; value?: unknown } {
  let current: unknown = args;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return { found: false };
    if (!(segment in current)) return { found: false };
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

/**
 * Render an argument value as prompt text. Total and explicit — no reliance on
 * implicit `toString`, which silently turns records into "[object Object]".
 * Objects and arrays (e.g. a record produced by an upstream LLM function) are
 * pretty-printed as JSON so a downstream LLM function can read their structure.
 */
export function serializeArg(value: unknown): string {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "object":
      // typeof null === "object"; handle it (and arrays/records) via JSON.
      return value === null ? "null" : JSON.stringify(value, null, 2);
    case "undefined":
      return "null";
    default:
      // function / symbol — should never reach a prompt; serialize defensively.
      return JSON.stringify(String(value));
  }
}

export type RenderResult =
  | { ok: true; prompt: string }
  | { ok: false; missing: string[] };

/**
 * Substitute every `{{key}}` in `template` with `serializeArg(args[key])`.
 *
 * A placeholder whose key is absent from `args` is an error, not a silent ""
 * — the missing keys are returned as a value (the caller decides how to fail).
 * A key present with a null/undefined value is allowed (serialized as "null");
 * presence is tested with `in`, so it is distinct from absence. Extra args that
 * no placeholder references are harmless and ignored.
 */
export function renderPrompt(
  template: string,
  args: Record<string, unknown>,
): RenderResult {
  const missing: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const key = match[1]!;
    if (!resolvePath(args, key).found && !missing.includes(key)) missing.push(key);
  }
  if (missing.length > 0) return { ok: false, missing };

  const prompt = template.replace(PLACEHOLDER, (_, key) => serializeArg(resolvePath(args, key).value));
  return { ok: true, prompt };
}
