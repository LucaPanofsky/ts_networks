# Language Reference

## Overview

The `TS NETWORK` language is built around two complementary ideas: **networks** and **functions**. Together they let you express complex decision-making logic in a form that is easy to change, debug, inspect, and extend.

### Design principles

- **Simple and self-contained.** A program defines its own record types, functions, and networks. There are no imports. Everything a reader needs to understand the program is in the file.
- **Written by LLMs, debugged by humans.** The syntax is regular and unambiguous — straightforward to generate from a language model. The graph structure of networks makes the execution flow visual and easy to inspect without running the program.
- **Declarative by default.** Networks express *what* should happen (which cells feed which propagators) rather than *how* (no explicit sequencing, no mutable state). The runtime handles scheduling.
- **Code is specification, specification is code.** Code must be declarative and simple enough so that it can be used without further infrastructure to communicate specifics through an agentic 'lingua franca'.

### Networks orchestrate; functions compute

A **network** is a directed graph of cells (data) and propagators (computation). Each propagator reads from one or more cells and writes to another. Writes are implemented by means of an associative, commutative and idempotent `merge` operation which guarantees the network will eventually converge to something meaningful. Finally, propagators activate if and only if there is enough information to decide and do nothing if any of the inputs has no information.
The network runtime does the math for you, scheduling propagators in the right order. 

**Functions** represent pure, self-contained business logic. They are the computation units that propagators invoke. The type annotations on their parameters and return value (`Number?`, `Boolean?`, a record predicate like `Circle?`) are not enforced at runtime today — they are documentation that both humans and tools can read to understand what a function expects and produces.

### A concrete example

A typical program might look like this:

```
// An LLM agent propagator produces a structured response (a record)
propagate llmAgent from [query] to agentResponse;

// A rational propagating function classifies the response using pattern matching
propagate classify from [agentResponse] to decision;
```

`llmAgent` is registered externally and wraps a call to a language model. `classify` is a `defn` in the same program that uses `match` to inspect the record type of the response and route accordingly. The network makes the pipeline structure visible; the functions express the classification logic clearly.

---

## Top-level definitions

There are seven kinds of top-level definition:

| Keyword | Purpose |
|---|---|
| `defnetwork` | A propagator network |
| `defrecord` | A record type |
| `defenum` | A named finite set of string values |
| `defn` | A pure function |
| `defpredicate` | A predicate (returns `Boolean?`) |
| `defllmfn` | An LLM agent that returns structured output |
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
  signature: from [input] to done;

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

Each field declaration is `fieldName: PredicateType;`. Field types can be scalar predicates or typed vectors:

```
defrecord Report
  title: String?;
  score: Number?;
  measurements: [Measurement?];   // vector field
end
```

`[Type?]` declares a field that holds a typed array of values.

Defining a record automatically creates:
- A constructor: `Circle(radius)` → `{ __type: "Circle", radius }`
- A predicate: `Circle?(v)` → `true` if `v` is a `Circle`

---

## `defenum`

Defines a named, finite set of string values.

```
defenum DocumentType
  'report', 'email', 'legal', 'technical';
end
```

Defining an enum automatically creates:
- A predicate: `DocumentType?(v)` → `true` if `v` is one of the declared values

The predicate can be used anywhere a type annotation is accepted — function signatures, agent return types, record fields:

```
defrecord DocumentAnalysis
  type: DocumentType?;
  summary: String?;
end

defllmfn classify
  signature: from [String?(text)] to DocumentType?;
  ...
end
```

When an enum is used as an agent's return type or as a record field type, the JSON schema constraint is derived automatically:

```json
{ "type": "string", "enum": ["report", "email", "legal", "technical"] }
```

This constrains the LLM's structured output to valid values at the protocol level.

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

Each parameter is `Type?(name)` — a predicate annotation followed by a binding name. The return type is a predicate name or a typed vector:

```
signature: from [String?(query)] to [Result?];   // returns a vector
```

For functions with no parameters:

```
signature: from to Number?;
```

### Body

The body starts with `expression` and ends with `;`. It can optionally include `let` bindings before the final expression:

```
defn sumOfSquares
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

## `defllmfn`

Defines an LLM agent. An agent has a signature like a `defn`, but instead of a function body it has a prompt template. At runtime the agent calls the Claude API and returns a structured value matching the declared return type.

```text
defllmfn analyzeDocument
  signature: from [String?(text)] to DocumentAnalysis?;
  with: model = 'claude-opus-4-7';
  """
  Analyze the following document and return a structured result.

  Document:
  
  {{text}}
  
  """;
end
```

### Signature

Same syntax as `defn`. The return type can be a record, a primitive, or a typed vector:

```
signature: from [String?(query)] to [SearchResult?];
```

### `with:` clause

Optional model configuration:

```
with: model = 'claude-opus-4-7', max_tokens = '4096';
```

| Key | Default | Description |
|---|---|---|
| `model` | `claude-opus-4-7` | The Claude model to use |
| `max_tokens` | `16384` | Maximum tokens in the response |

### Prompt template

The prompt is a triple-quoted string (`""" ... """`). Parameter names wrapped in `{{` and `}}` are substituted with their runtime values before the API call:

```
"""
Classify this text: {{text}}
"""
```

### Response protocol

The return type determines how the agent communicates with the Claude API:

- **Record return type** — the API is asked to return the record's fields directly. The runtime injects `__type` into the result.
- **Primitive return type** (`String?`, `Number?`, etc.) — the API returns `{ value: ... }`; the runtime unwraps it.
- **Vector return type** (`[Type?]`) — the API returns `{ items: [...] }`; the runtime unwraps the array.

The JSON schema sent to the API is derived automatically from `defrecord` definitions and predicate declarations in the program — no manual schema authoring is needed.

### Using an agent in a network

An agent is used exactly like a `defn` — referenced by name in a `propagate` term:

```
defnetwork documentPipeline
  signature: from [text] to label;
  propagate analyzeDocument from [text] to analysis;
  propagate classifyResult from [analysis] to label;
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

## JSON Schema generation

Every `defrecord` and `defenum` in a program has a corresponding JSON Schema representation that is derived automatically. This is used in two ways:

- **Agent API calls** — when an agent's return type is a record or enum, the schema is sent to the Claude API as a structured-output constraint, so the model's response is guaranteed to match the declared type.
- **External tooling** — the `compile-schemas` script emits the full schema map for all records, so it can be used with any JSON Schema validator or passed to external LLM APIs.

### Schema rules

| ts-networks type | JSON Schema |
|---|---|
| `String?` | `{ "type": "string" }` |
| `Number?` | `{ "type": "number" }` |
| `Boolean?` | `{ "type": "boolean" }` |
| `MyEnum?` (defenum) | `{ "type": "string", "enum": [...] }` |
| `MyRecord?` (defrecord) | `{ "type": "object", "properties": {...}, "required": [...] }` |
| `[Type?]` (vector) | `{ "type": "array", "items": <schema for Type?> }` |
| user-defined predicate | base type with `description` annotation |

Nested records are inlined — the schema for a record whose field references another record includes the full nested object schema, not a `$ref`.

### Example

Given:

```
defenum Sentiment
  'positive', 'negative', 'neutral';
end

defrecord DocumentAnalysis
  sentiment: Sentiment?;
  summary: String?;
  confidence: Number?;
end
```

Running:

```bash
npx tsx scripts/compile-schemas.ts my-program.tsn
```

Produces:

```json
{
  "DocumentAnalysis": {
    "type": "object",
    "properties": {
      "sentiment": { "type": "string", "enum": ["positive", "negative", "neutral"] },
      "summary":   { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["sentiment", "summary", "confidence"]
  }
}
```

---

## REPL execution command

The dev UI includes a REPL terminal where you can execute a network interactively. The `run` command seeds named cells with initial values and runs the network to completion.

```
run networkName with
  cell cellName = expr;
  cell cellName = expr;
end
```

- **`networkName`** — must match a `defnetwork` defined in the current program.
- **`cell name = expr`** — seeds the named cell with a value before propagation starts. The expression is evaluated in the context of the program's sandbox, so constructors and functions defined in the program are available.
- **Shift+Enter** — submits the command for evaluation.

### Example

Given the geometry example:

```
defrecord Point
  x: Number?;
  y: Number?;
end

defrecord Rectangle
  origin: Point?;
  width: Number?;
  height: Number?;
end

defn rectangleArea
  signature: from [Rectangle?(r)] to Number?;
  expression r.width * r.height;
end

defnetwork rectangleMetrics
  signature: from [rect] to area;
  propagate rectangleArea from [rect] to area;
end
```

The REPL command:

```
run rectangleMetrics with
  cell rect = Rectangle(Point(0, 0), 5, 3);
end
```

Produces:

```
─── rectangleMetrics ───
rect = Rectangle(origin: Point(x: 0, y: 0), width: 5, height: 3)
area = 15
```

Cell values that are still `Nothing` after propagation are displayed as `∅`.

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

> See [`tests/sandbox/jsgen/expressions.test.ts`](../tests/sandbox/jsgen/expressions.test.ts) for expression tests and usage.
> See also [`examples/`](../examples/) for complete programs.
