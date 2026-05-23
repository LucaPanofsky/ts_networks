import { handleRun } from "../../src/ui-server/run-handler.js";

const src = "defnetwork add\n  signature: from [a, b] to sum;\nend";

test("returns network and cells on valid input", () => {
  const result = handleRun({ source: src, network: "add", cells: { a: "1", b: "2" } });
  expect(result).toEqual({ ok: true, network: "add", cells: { a: "1", b: "2" } });
});

test("error when source is empty", () => {
  const result = handleRun({ source: "", network: "add", cells: {} });
  expect(result.ok).toBe(false);
});

test("error when network is empty", () => {
  const result = handleRun({ source: src, network: "", cells: {} });
  expect(result.ok).toBe(false);
});
