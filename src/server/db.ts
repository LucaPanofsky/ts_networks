import Database from "better-sqlite3";

export type NetworkMeta  = { name: string; from: string[]; to: string };
export type FunctionMeta = { name: string; from: string[]; to: string };
export type FieldMeta    = { name: string; predicate: string };
export type RecordMeta   = { name: string; fields: FieldMeta[] };

export type ProgramMeta = {
  name:       string;
  networks:   NetworkMeta[];
  functions:  FunctionMeta[];
  records:    RecordMeta[];
  updated_at: number;
};

export type ProgramFull = ProgramMeta & {
  dsl:            string;
  clojure_source: string;
};

type ProgramRow = {
  name:           string;
  dsl:            string;
  clojure_source: string;
  networks_json:  string;
  functions_json: string;
  records_json:   string;
  updated_at:     number;
};

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS programs (
      name           TEXT PRIMARY KEY,
      dsl            TEXT NOT NULL,
      clojure_source TEXT NOT NULL,
      networks_json  TEXT NOT NULL,
      functions_json TEXT NOT NULL,
      records_json   TEXT NOT NULL,
      updated_at     INTEGER NOT NULL
    )
  `);
  return db;
}

export function upsertProgram(db: Db, row: Omit<ProgramRow, "updated_at">): void {
  db.prepare(`
    INSERT INTO programs (name, dsl, clojure_source, networks_json, functions_json, records_json, updated_at)
    VALUES (@name, @dsl, @clojure_source, @networks_json, @functions_json, @records_json, @updated_at)
    ON CONFLICT(name) DO UPDATE SET
      dsl            = excluded.dsl,
      clojure_source = excluded.clojure_source,
      networks_json  = excluded.networks_json,
      functions_json = excluded.functions_json,
      records_json   = excluded.records_json,
      updated_at     = excluded.updated_at
  `).run({ ...row, updated_at: Date.now() });
}

export function getProgram(db: Db, name: string): ProgramFull | undefined {
  const row = db.prepare("SELECT * FROM programs WHERE name = ?").get(name) as ProgramRow | undefined;
  if (!row) return undefined;
  return rowToFull(row);
}

export function listPrograms(db: Db): ProgramMeta[] {
  const rows = db.prepare(
    "SELECT name, networks_json, functions_json, records_json, updated_at FROM programs ORDER BY name"
  ).all() as Omit<ProgramRow, "dsl" | "clojure_source">[];
  return rows.map(rowToMeta);
}

export function deleteProgram(db: Db, name: string): boolean {
  const result = db.prepare("DELETE FROM programs WHERE name = ?").run(name);
  return result.changes > 0;
}

function rowToMeta(row: Omit<ProgramRow, "dsl" | "clojure_source">): ProgramMeta {
  return {
    name:       row.name,
    networks:   JSON.parse(row.networks_json) as NetworkMeta[],
    functions:  JSON.parse(row.functions_json) as FunctionMeta[],
    records:    JSON.parse(row.records_json) as RecordMeta[],
    updated_at: row.updated_at,
  };
}

function rowToFull(row: ProgramRow): ProgramFull {
  return {
    ...rowToMeta(row),
    dsl:            row.dsl,
    clojure_source: row.clojure_source,
  };
}
