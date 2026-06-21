// The JS reserved words an emitted DSL name must not collide with in an identifier
// position. A construct-agnostic leaf (no deps) so both `mangle` (expr/compile.ts — escapes
// reserved-word *binder/reference* identifiers) and `reserved-words.ts` (rejects reserved-word
// record *field* names) draw from ONE list.
//
// Includes strict-mode/module reserved words: emitted code runs in contexts that may be strict.
export const RESERVED_JS_WORDS = new Set<string>([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
  "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with",
  "let", "static", "yield", "await", "implements", "interface", "package", "private",
  "protected", "public",
]);
