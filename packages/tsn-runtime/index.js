// `@tsn/runtime` — the public boundary a compiled artifact imports. It re-exports the built
// runtime so the bare specifier resolves under plain node. This file lives inside the linked
// package; the `../../dist` path resolves through the file: symlink back to the project's dist/.
// (Build first: `npm run build`.)
export * from "../../dist/language/runtime/index.js";
