# ts-networks (.tsn) syntax highlighting

A minimal, highlighting-only VS Code extension for `.tsn` files. It is purely
declarative (a TextMate grammar) — no language server, no compiled code.

It colours: definition keywords (`defnetwork`, `defrecord`, `defn`,
`defpredicate`, `defllmfn`, `defgrammar`, `defextract`, `defenum`, `derive`),
structural keywords (`signature`, `from`, `to`, `propagate`, `switch`, `match`,
`when`, `let`, `within`, `scan`, `parse`, `using`, …), single-quoted strings,
triple-quoted blocks (prompts and `defgrammar` bodies), `//` comments, numbers,
booleans, operators, Capitalized types/constructors, and namespaced calls
(`str/…`, `network/…`, `extract/…`).

> Note: this is a separate TextMate grammar, independent of the Lezer grammar
> in `src/data-network/grammar.grammar` (VS Code cannot consume Lezer). The one
> thing to keep in sync is the keyword list.

## Install (local)

Symlink (or copy) this folder into your VS Code extensions directory and reload:

```bash
ln -s "$(pwd)/editors/vscode" ~/.vscode/extensions/tsn-syntax-0.0.1
```

Then reload VS Code (`Developer: Reload Window`) and open any `.tsn` file.

## Install (packaged .vsix)

```bash
cd editors/vscode
npx @vscode/vsce package
code --install-extension tsn-syntax-0.0.1.vsix
```
