# Propagation Networks in TypeScript

A TypeScript implementation of propagation networks, a computational model based on accumulating partial information through a network of cells and propagators.

---

## Building Blocks

### Information Structures

An **information structure** is the blueprint for any value in the model. Every value — including `null`, errors, and plain data — is wrapped in an information structure.

All information structures implement:

| Method | Signature | Description |
|--------|-----------|-------------|
| `content` | `() → A` | Returns the wrapped value |
| `equals` | `(other) → boolean` | Structural equality, used by `merge` |
| `unpack` | `(f: A → B) → InfoStructure` | Apply `f` to the content (like `map`) |
| `flatten` | `() → InfoStructure` | Remove one level of nesting |
| `bind` | `(f: A → InfoStructure) → InfoStructure` | `unpack` then `flatten` (like `flatMap`) |
| `merge` | `(other) → InfoStructure` | Combine two information structures |

The primary algebraic operation is **`merge`**. Together with `Nothing` as the identity element, the information structures form a **commutative monoid** under merge:

- **Idempotent**: `merge(a, a) = a`
- **Commutative**: `merge(a, b) = merge(b, a)`
- **Associative**: `merge(merge(a, b), c) = merge(a, merge(b, c))`

### The Type Hierarchy

Values are ordered by how much information they carry:

```
Nothing  <  Something(v)  <  Contradiction
  (none)      (a value)       (inconsistency)
```

| Type | Represents | `merge` behaviour |
|------|-----------|-------------------|
| `Nothing` | absence of information (identity element) | always returns `other` |
| `Something<A>` | a concrete value | returns self if equal to `other`, else `Contradiction` |
| `Contradiction` | an inconsistency (absorbing element) | always returns self |

### The `I` function

`I(value)` is the entry point that lifts any raw JavaScript value into an information structure:

```typescript
I(null)          // → Nothing
I(undefined)     // → Nothing
I(new Error())   // → Contradiction("runtime/error", {}, error)
I(42)            // → Something(42)
I("hello")       // → Something("hello")
```

---

## Project Structure

```
src/
  info-structure.ts   — InfoStructure<A> interface + all core types
                        (Nothing, Something<A>, Contradiction, I)
  index.ts            — public re-exports
tests/
  algebraic-properties-1.test.ts  — ACI laws for merge
```

## Development

```bash
npm run build   # compile TypeScript → dist/
npm test        # run all tests
npm run dev     # watch mode
```
## References

- Sussman, Gerald Jay & Radul, Alexey — **[The Art of the Propagator](https://dspace.mit.edu/entities/publication/295b4ade-7ab5-4787-b5d1-417905fe7ab0)** (MIT-CSAIL-TR-2009-002, January 26, 2009)

- Hanson, Chris & Sussman, Gerald Jay — **Software Design for Flexibility: How to Avoid Programming Yourself into a Corner** (MIT Press, 2021)