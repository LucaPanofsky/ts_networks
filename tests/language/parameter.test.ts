// defparameter slice — a network INPUT declaration. Like `derive`, the engine parses and
// stores it but consumes it NOWHERE yet (no registry entry, no emission, no run-wiring —
// the teeth land later with defnetwork + the `run` entry point). So here it is parse +
// carry + no-op emit: the pipeline carries a ParameterNode for that future slice and emits
// only a documenting comment. Asserts golden-snapshot parse and a clean no-op at run.

import { emitJs, parseProgram } from "../../src/language/index.js";
import * as rt from "../../src/language/runtime/index.js";
import type { Registry } from "../../src/language/core/runtime-api.js";

function run(js: string): Registry {
  const body =
    js
      .split("\n")
      .filter((l) => !/^\s*import\s/.test(l) && !/^\s*export\s/.test(l))
      .join("\n") + "\nreturn __reg;";
  return new Function("rt", body)(rt) as Registry;
}

const withValue = `
defparameter myArticle
  type: Text?;
  value:
    """
    Article 12(1)-(2) GDPR
    """;
end
`;

const noValue = `
defparameter pending
  type: Text?;
end
`;

describe("defparameter slice — parse + carry + no-op emit", () => {
  test("parses to a ParameterNode matching its frozen golden (Lezer-validated at capture) (name, scalar type, trimmed value)", () => {
    const node = parseProgram(withValue).nodes.find((n) => n.kind === "parameter");
    expect(node).toMatchSnapshot();
  });

  test("an absent value clause parses to its frozen golden (default is Nothing — carried as no value)", () => {
    const node = parseProgram(noValue).nodes.find((n) => n.kind === "parameter") as
      | { kind: string; name: string; value?: string }
      | undefined;
    expect(node).toMatchSnapshot();
    expect(node!.value).toBeUndefined();
  });

  test("emits a documenting comment, not a runtime artifact", () => {
    const js = emitJs(withValue);
    expect(js).toContain("defparameter myArticle");
    expect(js).toContain("network input"); // a comment, not a register call
    // the parameter registers NOTHING under its own name (the prelude defns register, so we
    // check the parameter's name specifically rather than for any `register` call).
    expect(js).not.toContain('register("myArticle"');
  });

  test("is a clean no-op at run time: the program builds and the parameter registers nothing", () => {
    const reg = run(
      emitJs(`
defrecord Person
  name: String?;
end

defparameter pending
  type: Text?;
end
`),
    );
    // the record still resolves…
    expect(reg.resolve("Person")("Ada")).toEqual({ __type: "Person", name: "Ada" });
    // …and nothing is registered under the parameter name.
    expect(() => reg.resolve("pending")(null)).toThrow();
  });
});
