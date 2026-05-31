import { compile } from "../../../src/sandbox/jsgen/index.js";
import { APromise } from "../../../src/information-structures/apromise.js";
import { Something } from "../../../src/info-structure.js";
import { callAgent } from "../../../src/sandbox/agent-client.js";

jest.mock("../../../src/sandbox/agent-client.js", () => ({
  callAgent: jest.fn(),
}));

const mockCallAgent = callAgent as jest.MockedFunction<typeof callAgent>;

const DSL = `
defrecord DocumentAnalysis
  type: String?;
  sentiment: String?;
  summary: String?;
  confidence: Number?;
end

defllmfn analyzeDocument
  signature: from [String?(text)] to DocumentAnalysis?;
  with: model = 'claude-opus-4-7';
  """
  Analyze: {{text}}
  """;
end

defn classifyResult
  signature: from [DocumentAnalysis?(analysis)] to String?;
  expression
    match analysis
      | DocumentAnalysis { type: t } when t == 'legal' -> 'legal-review-required'
      | DocumentAnalysis { sentiment: s, confidence: c } when s == 'negative' && c > 0.7 -> 'high-confidence-negative'
      | DocumentAnalysis { sentiment: s, confidence: c } when s == 'positive' && c > 0.7 -> 'high-confidence-positive'
      | DocumentAnalysis { confidence: c } when c < 0.4 -> 'low-confidence'
      | _ -> 'standard'
    end;
end

defnetwork documentPipeline
  signature: from [text] to label;
  propagate analyzeDocument from [text] to analysis;
  propagate classifyResult from [analysis] to label;
end
`;

function fakeAnalysis(overrides: Partial<Record<string, unknown>>) {
  return Promise.resolve({
    __type: "DocumentAnalysis",
    type: "report",
    sentiment: "neutral",
    summary: "A document.",
    confidence: 0.6,
    ...overrides,
  });
}

async function runPipeline(overrides: Partial<Record<string, unknown>>): Promise<unknown> {
  mockCallAgent.mockReturnValueOnce(fakeAnalysis(overrides));
  const { networks } = compile(DSL);
  const result = networks.get("documentPipeline")!.invoke({ text: "some text" });
  const labelAP = result.cells.get("label")!.knows() as APromise<unknown>;
  const resolved = await labelAP.deferred.promise;
  return (resolved as Something<unknown>).content();
}

beforeEach(() => mockCallAgent.mockClear());

describe("documentPipeline: agentic network integration", () => {
  test("run() returns synchronously with APromise in label cell", () => {
    mockCallAgent.mockReturnValueOnce(fakeAnalysis({}));
    const { networks } = compile(DSL);
    const result = networks.get("documentPipeline")!.invoke({ text: "some text" });
    const label = result.cells.get("label")!.knows();
    expect(label).toBeInstanceOf(APromise);
    expect((label as APromise<unknown>).deferred.isRealized).toBe(false);
  });

  test("high-confidence positive sentiment → 'high-confidence-positive'", async () => {
    const label = await runPipeline({ sentiment: "positive", confidence: 0.9 });
    expect(label).toBe("high-confidence-positive");
  });

  test("high-confidence negative sentiment → 'high-confidence-negative'", async () => {
    const label = await runPipeline({ sentiment: "negative", confidence: 0.8 });
    expect(label).toBe("high-confidence-negative");
  });

  test("legal document type → 'legal-review-required'", async () => {
    const label = await runPipeline({ type: "legal" });
    expect(label).toBe("legal-review-required");
  });

  test("low confidence → 'low-confidence'", async () => {
    const label = await runPipeline({ confidence: 0.3 });
    expect(label).toBe("low-confidence");
  });

  test("unmatched case → 'standard'", async () => {
    const label = await runPipeline({ sentiment: "neutral", confidence: 0.6 });
    expect(label).toBe("standard");
  });
});
