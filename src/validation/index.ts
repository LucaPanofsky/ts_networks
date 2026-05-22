import { checkReferences } from "./checks/references.js";
import { checkArities } from "./checks/arities.js";
import { checkTopology } from "./checks/topology.js";
import type { ProgramAST } from "../data-network/types.js";
import type { ValidationError, ValidationReport, Severity, ReportStatus } from "./types.js";

export type { ValidationError, ValidationReport, Severity, ReportStatus };

export function validateProgram(program: ProgramAST): ValidationReport {
  const verdicts: ValidationError[] = [
    ...checkReferences(program),
    ...checkArities(program),
    ...checkTopology(program),
  ];

  let status: ReportStatus;
  if (verdicts.some(v => v.severity === "error")) {
    status = "errors";
  } else if (verdicts.some(v => v.severity === "warning")) {
    status = "ok-with-warnings";
  } else {
    status = "ok";
  }

  return { status, verdicts };
}
