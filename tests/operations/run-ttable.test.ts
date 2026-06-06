import { run } from "../../src/operations/run.js";

// A TTable is callable directly as a propagator (`propagate TTable/<name> …`). This
// drives the real pipeline (parse → sandbox → registry → network → table leaf) for the
// located mode (the header row matched by its declared texts and consumed).

const source = `
defrecord Pair
  x: String?;
  y: String?;
end

TTable Pairs
  row: Pair;
  cell: '|';
  header x = 'X';
  header y = 'Y';
end

defnetwork extractPairs
  signature: from [doc] to rows;
  propagate TTable/Pairs from [doc] to rows;
end
`;

describe("run operation: TTable/<name> as a propagator", () => {
  test("located mode — header row matched and consumed, columns mapped by name", async () => {
    const doc = "X | Y |\na | b |\nc | d |\n";
    const result = await run.handle({ source, network: "extractPairs", cells: { doc: JSON.stringify(doc) } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cells["rows"]).toEqual([
      { __type: "Pair", x: "a", y: "b" },
      { __type: "Pair", x: "c", y: "d" },
    ]);
  });
});
