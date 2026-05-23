import { compile } from "../../../src/sandbox/jsgen/index.js";

const dsl = `
defrecord Circle
  radius: Number?;
end

defrecord Rect
  width: Number?;
  height: Number?;
end

defn classify
  signature: from [Shape?(s)] to String?;
  expression
    match s
      | Circle { radius: r } when r > 10 -> 'large circle'
      | Circle { radius: r } -> 'small circle'
      | Rect { width: w, height: h } when w == h -> 'square'
      | Rect { width: w, height: h } -> 'rectangle'
      | _ -> 'unknown'
    end;
end
`;

describe("match expression — end-to-end", () => {
  const { sandbox } = compile(dsl);
  const Circle = sandbox["Circle"] as (radius: number) => unknown;
  const Rect = sandbox["Rect"] as (width: number, height: number) => unknown;
  const classify = sandbox["classify"] as (s: unknown) => string;

  it("large circle (radius > 10)", () => {
    expect(classify(Circle(15))).toBe("large circle");
  });

  it("small circle (radius <= 10)", () => {
    expect(classify(Circle(5))).toBe("small circle");
  });

  it("square (width == height)", () => {
    expect(classify(Rect(4, 4))).toBe("square");
  });

  it("rectangle (width != height)", () => {
    expect(classify(Rect(3, 7))).toBe("rectangle");
  });

  it("unknown type falls through to wildcard", () => {
    expect(classify({ __type: "Triangle" })).toBe("unknown");
  });
});
