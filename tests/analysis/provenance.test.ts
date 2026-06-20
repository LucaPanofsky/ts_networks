import { reportSlug, provenanceBadges, type GitInfo } from "../../repo_workspace/analysis/provenance.js";

const GIT: GitInfo = {
  branch: "feat/analysis-report-house-style",
  commit: "be353a4f0011223344556677889900aabbccddee",
  shortCommit: "be353a4",
  commitDate: "2026-06-20",
  dirty: false,
};
// "if available" → every field null, a non-git / detached-HEAD context.
const NOGIT: GitInfo = {
  branch: null, commit: null, shortCommit: null, commitDate: null, dirty: false,
};

describe("reportSlug — versioned filename", () => {
  test("date + short sha so files sort by date and tie to the commit", () => {
    expect(reportSlug("2026-06-20", GIT)).toBe("2026-06-20-be353a4");
  });

  // NEGATIVE: with no commit the slug must still be a valid, writable name, not "...-null".
  test("falls back to <date>-nogit when there is no commit", () => {
    expect(reportSlug("2026-06-20", NOGIT)).toBe("2026-06-20-nogit");
  });

  test("the dirty flag does not leak into the filename", () => {
    expect(reportSlug("2026-06-20", { ...GIT, dirty: true })).toBe("2026-06-20-be353a4");
  });
});

describe("provenanceBadges — header stamp", () => {
  test("branch · commit · generated date, in that order, on a clean tree", () => {
    const b = provenanceBadges("2026-06-21", GIT);
    expect(b.map((x) => x.label)).toEqual([
      "Branch · feat/analysis-report-house-style",
      "Commit · be353a4",
      "Generated · 2026-06-21",
    ]);
    expect(b[0]!.kind).toBe("ink");
  });

  // The dirty marker is the whole point of the honesty requirement: a report built from an
  // uncommitted tree must say so, with the red kind.
  test("a dirty tree appends a red 'Uncommitted changes' badge", () => {
    const b = provenanceBadges("2026-06-21", { ...GIT, dirty: true });
    expect(b).toHaveLength(4);
    expect(b[3]).toEqual({ label: "Uncommitted changes", kind: "red" });
  });

  test("a clean tree has no uncommitted-changes badge", () => {
    expect(provenanceBadges("2026-06-21", GIT).some((x) => x.label.includes("Uncommitted"))).toBe(false);
  });

  // NEGATIVE: missing facts render as an em dash, never the literal "null".
  test("missing branch/commit show an em dash, not null", () => {
    const b = provenanceBadges("2026-06-21", NOGIT);
    expect(b[0]!.label).toBe("Branch · —");
    expect(b[1]!.label).toBe("Commit · —");
  });
});
