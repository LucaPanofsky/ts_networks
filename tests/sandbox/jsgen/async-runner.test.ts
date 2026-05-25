import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Something } from "../../../src/info-structure.js";
import { callAgent } from "../../../src/sandbox/agent-client.js";

jest.mock("../../../src/sandbox/agent-client.js", () => ({
  callAgent: jest.fn(),
}));

const mockCallAgent = callAgent as jest.MockedFunction<typeof callAgent>;

// A recursive network where the "improve" step is an async agent call.
// Each round the agent increments n by 1; recursion stops when n > 5.
const DSL = `
defrecord Improved
  value: Number?;
end

defagent asyncImprove
  signature: from [Number?(n)] to Improved?;
  with: model = 'claude-opus-4-7';
  """Improve {{n}}""";
end

defn extractValue
  signature: from [Improved?(i)] to Number?;
  expression i.value;
end

defpredicate goodEnough?
  signature: from [Number?(n)] to Boolean?;
  expression n > 5;
end

defn not
  signature: from [Boolean?(b)] to Boolean?;
  expression if(b, false, true);
end

defnetwork asyncSearch
  signature: from [input] to done;

  switch goodEnough? from [input] to inputIsGood;
  propagate not from [inputIsGood] to inputIsNotGood;
  switch from [inputIsGood, input] to done;
  switch from [inputIsNotGood, input] to inputIfNotGood;
  propagate asyncImprove from [inputIfNotGood] to improved;
  propagate extractValue from [improved] to betterInput;
  propagate asyncSearch from [betterInput] to done;
end
`;

beforeEach(() => {
  mockCallAgent.mockClear();
  mockCallAgent.mockImplementation((_prompt, args) => {
    const n = (args as { n: unknown }).n as number;
    return Promise.resolve({ __type: "Improved", value: n + 1 });
  });
});

describe("invokeAsync: recursive network with async agent step", () => {
  test("base case: input already good enough — resolves immediately without agent call", async () => {
    const { networks } = compile(DSL);
    const result = await networks.get("asyncSearch")!.invokeAsync({ input: 6 });
    expect(result.type).toBe("done");
    expect(result.cells.get("done")!.knows()).toEqual(new Something(6));
    expect(mockCallAgent).not.toHaveBeenCalled();
  });

  test("input 5 recurses once — agent called once, result is 6", async () => {
    const { networks } = compile(DSL);
    const result = await networks.get("asyncSearch")!.invokeAsync({ input: 5 });
    expect(result.type).toBe("done");
    expect(result.cells.get("done")!.knows()).toEqual(new Something(6));
    expect(mockCallAgent).toHaveBeenCalledTimes(1);
  });

  test("input 3 recurses three times — agent called three times, result is 6", async () => {
    const { networks } = compile(DSL);
    const result = await networks.get("asyncSearch")!.invokeAsync({ input: 3 });
    expect(result.type).toBe("done");
    expect(result.cells.get("done")!.knows()).toEqual(new Something(6));
    expect(mockCallAgent).toHaveBeenCalledTimes(3);
  });
});
