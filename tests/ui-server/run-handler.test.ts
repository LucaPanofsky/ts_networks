import { handleRun } from "../../src/ui-server/run-handler.js";
import { readFileSync } from "fs";

const geometrySrc = readFileSync("tests/fixtures/geometry.tsn", "utf8");

test("error when source is empty", async () => {
  const result = await handleRun({ source: "", network: "rectangleMetrics", cells: {} });
  expect(result.ok).toBe(false);
});

test("error when network is empty", async () => {
  const result = await handleRun({ source: geometrySrc, network: "", cells: {} });
  expect(result.ok).toBe(false);
});

test("error when network not found", async () => {
  const result = await handleRun({ source: geometrySrc, network: "missing", cells: {} });
  expect(result.ok).toBe(false);
});

test("error on bad cell expression", async () => {
  const result = await handleRun({ source: geometrySrc, network: "rectangleMetrics", cells: { rect: "???" } });
  expect(result.ok).toBe(false);
});

// ── geometry evaluation ───────────────────────────────────────────────────────

test("evaluates rectangleMetrics: area = width * height", async () => {
  const result = await handleRun({
    source: geometrySrc,
    network: "rectangleMetrics",
    cells: { rect: "Rectangle(Point(0, 0), 5, 3)" },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.cells["area"]).toBe(15);
});

test("evaluates rectangleMetrics: area = 0 for zero width", async () => {
  const result = await handleRun({
    source: geometrySrc,
    network: "rectangleMetrics",
    cells: { rect: "Rectangle(Point(0, 0), 0, 10)" },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.cells["area"]).toBe(0);
});
