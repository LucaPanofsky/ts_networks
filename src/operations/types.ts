export type Operation<I, O> = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  handle: (input: I) => O;
};

export type SerializedError = { kind: string; message: string; severity: "error" | "warning" };

export type SerializedEnrichedNetwork = {
  name: string;
  cells: Record<string, { writtenBy: string[]; readBy: string[]; errors: SerializedError[] }>;
  propagators: Array<{ fn: string | null; from: string[]; to: string; errors: SerializedError[] }>;
};
