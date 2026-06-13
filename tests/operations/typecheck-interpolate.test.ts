import { typecheck } from "../../src/operations/typecheck.js";

// The typecheck operation runs interpolate-body validation (every {{path}} resolves
// against the function's parameters) alongside the grammar/extract/ttable checks.

const valid = `
defrecord GF
  point: String?;
  body:  String?;
end
defn make
  signature: from [GF?(rec)] to String?;
  interpolate """point = {{rec.point}}, body = {{rec.body}}""";
end
defnetwork run
  signature: from [g] to s;
  propagate make from [g] to s;
end
`;

const badPath = `
defrecord GF
  point: String?;
end
defn make
  signature: from [GF?(rec)] to String?;
  interpolate """{{rec.nope}}""";
end
`;

describe("typecheck operation: interpolate path validation", () => {
  test("a program whose interpolate paths all resolve type-checks clean", () => {
    const result = typecheck.handle({ source: valid });
    expect(result.ok).toBe(true);
  });

  test("an unresolved interpolate path is rejected with a located message", () => {
    const result = typecheck.handle({ source: badPath });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("defn make");
      expect(result.error).toContain('has no field "nope"');
    }
  });
});
