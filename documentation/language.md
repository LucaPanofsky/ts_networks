# Language Reference

## Overview

The language is built around two complementary ideas: **networks** and **functions**. Together they let you express complex decision-making logic in a form that is easy to change, debug, inspect, and extend.

### Networks orchestrate; functions compute

A **network** is a directed graph of cells (data) and propagators (computation). Each propagator reads from one or more cells and writes to another. The runtime activates propagators in dependency order and propagates information forward until the network settles. This graph structure is the backbone of the system — it makes the flow of data and decisions explicit and visual, which means workflows can be modified by changing a few wires rather than rewriting logic buried deep in code.

**Functions** live outside networks and represent pure, self-contained business logic. They are the computation units that propagators invoke. The type annotations on their parameters and return value (`Number?`, `Boolean?`, a record predicate like `Circle?`) are not enforced at runtime today — they are documentation that both humans and tools can read to understand what a function expects and produces.

### A concrete example

A typical program might look like this:

```
// An LLM agent propagator produces a structured response (a record)
propagate llmAgent from [query] to agentResponse;

// A rational decision maker classifies the response using pattern matching
propagate classify from [agentResponse] to decision;
```

`llmAgent` is registered externally and wraps a call to a language model. `classify` is a `defn` in the same program that uses `match` to inspect the record type of the response and route accordingly. The network makes the pipeline structure visible; the functions express the classification logic clearly.

### Design principles

- **Simple and self-contained.** A program defines its own record types, functions, and networks. There are no imports. Everything a reader needs to understand the program is in the file.
- **Written by LLMs, debugged by humans.** The syntax is regular and unambiguous — straightforward to generate from a language model. The graph structure of networks makes the execution flow visual and easy to inspect without running the program.
- **Declarative by default.** Networks express *what* should happen (which cells feed which propagators) rather than *how* (no explicit sequencing, no mutable state). The runtime handles scheduling.

---

## Top-level definitions

There are five kinds of top-level definition:

| Keyword | Purpose |
|---|---|
| `defnetwork` | A propagator network |
| `defrecord` | A record type |
| `defn` | A pure function |
| `defpredicate` | A predicate (returns `Boolean?`) |
| `derive` | A subtype declaration |

---

## `defnetwork`

A network has a **signature** (named inputs and a named output) and a body of **terms** (wires and propagators).

```
defnetwork add
  signature: from [a, b] to result;
  propagate sum from [a, b] to result;
end
```

### Signature

```
signature: from [input1, input2, ...] to output;
```

The signature names the cells that callers must supply and the cell whose value is returned.

### Terms

Four kinds of term can appear in a network body:

#### `propagate` — apply a function

```
propagate fnName from [cell1, cell2] to outputCell;
propagate fnName from [cell1] to outputCell with: key = value, key2 = 'str';
```

Applies `fnName` to the listed input cells and writes the result to `outputCell`. The optional `with:` clause passes static parameters to the function.

#### `switch` — conditional gate

Two arities:

```
// 1-arity: apply predicate, store boolean
switch pred? from [input] to flag;

// 2-arity: pass value only if predicate holds
switch pred? from [flag, value] to output;

// anonymous switch (no predicate — passes value unconditionally once flag is truthy)
switch from [flag, value] to output;
```

#### `cell` — initial value

```
cell count = 0;
cell label = 'hello';
cell active = true;
```

Declares a cell with a starting value that can be overwritten during propagation.

#### `constant` — immutable value

```
constant pi = 3.14159;
constant maxRetries = 5;
```

Like `cell` but the value cannot change during propagation.

### Recursive networks

A network is recursive when it contains a `propagate` term whose function name matches the network's own name. The runtime detects this automatically and restarts the network with the new inputs.

```
defnetwork exampleSearch
  signature: from input to done;

  switch goodEnough? from [input] to inputIsGood;
  propagate not from [inputIsGood] to inputIsNotGood;
  switch from [inputIsGood, input] to done;
  switch from [inputIsNotGood, input] to inputIfNotGood;
  propagate improve from [inputIfNotGood] to betterInput;
  propagate exampleSearch from [betterInput] to done;  // recursive
end
```

---

## `defrecord`

Defines a named record type with typed fields.

```
defrecord Circle
  radius: Number?;
end

defrecord Rect
  width: Number?;
  height: Number?;
end
```

Each field declaration is `fieldName: PredicateType;`. Defining a record automatically creates:
- A constructor: `Circle(radius)` → `{ __type: "Circle", radius }`
- A predicate: `Circle?(v)` → `true` if `v` is a `Circle`

---

## `defn`

Defines a pure function.

```
defn add
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a + b;
end
```

### Signature

```
signature: from [Type?(paramName), ...] to ReturnType?;
```

Each parameter is `Type?(name)` — a predicate annotation followed by a binding name. The return type is a predicate name.

For functions with no parameters:

```
signature: from to Number?;
```

### Body

The body starts with `expression` and ends with `;`. It can optionally include `let` bindings before the final expression:

```
defn hypotenuse
  signature: from [Number?(a), Number?(b)] to Number?;
  expression
    let a2 = a * a;
    let b2 = b * b;
    a2 + b2;
end
```

---

## `defpredicate`

Identical to `defn` but marks the function as a predicate. By convention predicate names end with `?`.

```
defpredicate positive?
  signature: from [Number?(n)] to Boolean?;
  expression n > 0;
end
```

---

## `derive`

Declares that one predicate is a subtype of another.

```
derive Student? from Person?;
```

This tells the type system that any value satisfying `Student?` also satisfies `Person?`.

---

## Expressions

Expressions appear in `defn` and `defpredicate` bodies.

### Literals

```
42          // integer
3.14        // float
'hello'     // string (single quotes)
true        // boolean
false
```

### Variables

Any name refers to a parameter or `let`-bound variable in scope.

```
n
myParam
```

### Field access

```
circle.radius
rect.width
```

### Binary operators

| Operator | Meaning |
|---|---|
| `+`, `-`, `*`, `/` | Arithmetic |
| `==`, `!=`, `<`, `>`, `<=`, `>=` | Comparison (`==` compiles to `===`) |
| `&&`, `\|\|` | Logical and / or |

Precedence follows standard math conventions (`*` before `+`, etc.).

### Unary

```
!flag     // logical not
```

### Function calls

```
sqrt(x)
max(a, b)
Circle(15)
```

### Let bindings

```
let name = expr;
```

Let bindings are scoped to the `expression` body. Multiple bindings are evaluated in order.

---

## Special forms

Special forms look like function calls but are compiled differently — they are not runtime values.

### `if`

```
if(condition, thenExpr, elseExpr)
```

Compiles to a JS ternary. All three arguments are required.

```
if(n > 0, n, 0 - n)   // absolute value
```

### `decide`

Multi-branch conditional, like Clojure's `cond`. Arguments are predicate/value pairs, with an optional default as the last argument (odd arity).

```
decide(small?(x),  'small',
       medium?(x), 'medium',
       large?(x),  'large',
       'unknown')         // default
```

Even arity (no default) returns `null` if no predicate matches.

### `match`

Structural pattern matching on records. Each arm tests `__type` and optionally destructures fields. A wildcard arm (`_`) catches everything.

```
match shape
  | Circle { radius: r } when r > 10 -> 'large circle'
  | Circle { radius: r }             -> 'small circle'
  | Rect { width: w, height: h }     -> 'rectangle'
  | _                                -> 'unknown'
end
```

**Syntax:**
```
match <expr>
  | RecordName { field: binding, ... } [when <guard>] -> <expr>
  | _                                                 -> <expr>
end
```

- Field bindings: `field: localName` — binds the field value to a local name in the arm body.
- Guards: `when <expr>` — the arm only fires if the guard is truthy.
- Arms are tested in order; the first match wins.
- Compiles to a guarded IIFE with `if (__v.__type === ...)` chains — no runtime dependency.
