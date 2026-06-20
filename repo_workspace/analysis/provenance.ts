// Pure provenance helpers: the shape of the git facts a report is stamped with, the
// versioned-output filename slug, and the header badges. No I/O — the git facts are
// gathered by the shell (gather.ts:gatherGitInfo) and passed in, so the naming and
// display logic stays a total function that the tests can pin down exactly.

/** Git facts about the working tree a report was generated from. Every field is "if
 *  available": null when not a git repo / detached HEAD / git unavailable. */
export interface GitInfo {
  branch: string | null; // e.g. "feat/x"; "HEAD" when detached
  commit: string | null; // full sha
  shortCommit: string | null; // abbreviated sha
  commitDate: string | null; // YYYY-MM-DD of HEAD's commit
  dirty: boolean; // working tree has uncommitted changes
}

/**
 * Filename slug for a versioned report: `<generatedAt>-<shortsha>` so files sort by date
 * and tie to the commit they describe. Falls back to `<generatedAt>-nogit` when there is
 * no commit (non-git context), so a report is always writable.
 */
export function reportSlug(generatedAt: string, git: GitInfo): string {
  return `${generatedAt}-${git.shortCommit ?? "nogit"}`;
}

export type BadgeKind = "ink" | "plain" | "red";
export interface Badge {
  label: string;
  kind: BadgeKind;
}

/**
 * The provenance badges shown in the report header: branch · commit · generated date, plus
 * a red "uncommitted changes" badge when the tree was dirty (so a report from a dirty tree
 * is honest about it). Missing facts render as an em dash rather than being dropped.
 */
export function provenanceBadges(generatedAt: string, git: GitInfo): Badge[] {
  const dash = "—";
  const badges: Badge[] = [
    { label: `Branch · ${git.branch ?? dash}`, kind: "ink" },
    { label: `Commit · ${git.shortCommit ?? dash}`, kind: "plain" },
    { label: `Generated · ${generatedAt}`, kind: "plain" },
  ];
  if (git.dirty) badges.push({ label: "Uncommitted changes", kind: "red" });
  return badges;
}
