// Pure templating core for LLM function prompts.
//
// Kept separate from llmfn-client.ts (the effectful SDK boundary) so it can be
// unit-tested in isolation. Two responsibilities, each a pure total function:
//   - serializeArg: turn any argument value into prompt text, explicitly.
//   - renderPrompt: substitute {{placeholders}}, surfacing missing keys as a value.

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

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
    if (!(key in args) && !missing.includes(key)) missing.push(key);
  }
  if (missing.length > 0) return { ok: false, missing };

  const prompt = template.replace(PLACEHOLDER, (_, key) => serializeArg(args[key]));
  return { ok: true, prompt };
}
