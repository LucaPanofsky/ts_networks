export type Severity = "error" | "warning";

export type ValidationError = {
  severity: Severity;
  check:    string;
  network:  string;
  message:  string;
};

export type ReportStatus = "ok" | "ok-with-warnings" | "errors";

export type ValidationReport = {
  status:   ReportStatus;
  verdicts: ValidationError[];
};
