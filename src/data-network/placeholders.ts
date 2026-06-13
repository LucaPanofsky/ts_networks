// The `{{path}}` placeholder mini-syntax shared by `interpolate` function bodies and
// `defllmfn` prompts. This module is the *compile-time* half — the placeholder grammar
// and the extraction of referenced paths. It lives in data-network (the lower layer)
// so both the type-checker (path validation) and codegen (which roots to pass) can read
// it without depending on the sandbox runtime. The *runtime* half — substituting the
// holes against argument values — is renderPrompt in sandbox/prompt-template.ts, which
// imports the same PLACEHOLDER regex so the two never drift.
//
// A placeholder key is a dotted path: a bare name (`{{title}}`) or a walk into a record
// argument (`{{rec.body}}`). Only `{{…}}` is a placeholder; a lone `{` is literal text.
export const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * The distinct placeholder paths a template references, in order of first appearance.
 * Single-sources the placeholder grammar; callers that need the referenced root names
 * split each path on the first `.`.
 */
export function placeholderPaths(template: string): string[] {
  const paths: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const key = match[1]!;
    if (!paths.includes(key)) paths.push(key);
  }
  return paths;
}
