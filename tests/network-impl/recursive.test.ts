import { buildNetworks } from "../helpers/build-networks.js";
import { Something } from "../../src/info-structure.js";

// A self-recursive network: the runner's `onRecurse` turns a tail self-reference
// (`propagate exampleSearch from [betterInput] to done`) into iteration, so it runs
// synchronously to a fixpoint rather than spawning an async sub-network leaf. Engine
// semantics, exercised through a network built directly. (Ported from the retired jsgen suite.)

const dsl = `
defnetwork exampleSearch
  signature: from [input] to done;

  switch goodEnough? from [input] to inputIsGood;
  propagate not from [inputIsGood] to inputIsNotGood;
  switch from [inputIsGood, input] to done;
  switch from [inputIsNotGood, input] to inputIfNotGood;
  propagate improve from [inputIfNotGood] to betterInput;
  propagate exampleSearch from [betterInput] to done;
end

defpredicate goodEnough?
  signature: from [Number?(n)] to Boolean?;
  expression n > 5;
end

defn not
  signature: from [Boolean?(b)] to Boolean?;
  expression if(b, false, true);
end

defn improve
  signature: from [Number?(n)] to Number?;
  expression n + 1;
end
`;

describe("recursive networks — exampleSearch", () => {
  const network = buildNetworks(dsl).get("exampleSearch")!;

  it("input 6 is already good enough — returns 6 immediately", () => {
    const result = network.invoke({ input: 6 });
    expect(result.type).toBe("done");
    expect(result.cells.get("done")!.knows().equals(new Something(6))).toBe(true);
  });

  it("input 3 recurses until good enough — returns 6", () => {
    const result = network.invoke({ input: 3 });
    expect(result.type).toBe("done");
    expect(result.cells.get("done")!.knows().equals(new Something(6))).toBe(true);
  });
});
