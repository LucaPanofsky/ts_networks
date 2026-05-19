import { I, isInfoStructure, type InfoStructure, Contradiction, Nothing, Something } from "../info-structure.js";

type LiftedRecord = Record<string, InfoStructure<unknown>>;

export class MergeObject implements InfoStructure<Record<string, unknown>> {
  private readonly _fields: LiftedRecord;

  constructor(fields: LiftedRecord) {
    this._fields = fields;
  }

  static lift(obj: Record<string, unknown>): MergeObject {
    const lifted: LiftedRecord = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        lifted[key] = MergeObject.lift(value as Record<string, unknown>);
      } else {
        lifted[key] = I(value);
      }
    }
    return new MergeObject(lifted);
  }

  fields(): LiftedRecord {
    return this._fields;
  }

  content(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this._fields)) {
      result[key] = value.content();
    }
    return result;
  }

  equals(other: InfoStructure<unknown>): boolean {
    if (!(other instanceof MergeObject)) return false;
    const otherFields = other._fields;
    const keys = Object.keys(this._fields);
    if (keys.length !== Object.keys(otherFields).length) return false;
    return keys.every(k => {
      const ov = otherFields[k];
      return ov !== undefined && this._fields[k]!.equals(ov);
    });
  }

  unpack(f: (a: Record<string, unknown>) => unknown): InfoStructure<unknown> {
    const result = f(this.content());
    if (isInfoStructure(result)) return result;
    return MergeObject.lift(result as Record<string, unknown>);
  }

  flatten(): InfoStructure<unknown> {
    return this;
  }

  bind(f: (a: Record<string, unknown>) => InfoStructure<unknown>): InfoStructure<unknown> {
    return this.unpack(f).flatten();
  }

  merge(other: InfoStructure<unknown>): InfoStructure<unknown> {
    if (other === Nothing) return this;
    if (other instanceof MergeObject) {
      const result: LiftedRecord = {};
      const allKeys = new Set([...Object.keys(this._fields), ...Object.keys(other._fields)]);
      for (const key of allKeys) {
        const a = this._fields[key] ?? Nothing;
        const b = other._fields[key] ?? Nothing;
        const merged = a.merge(b);
        if (merged instanceof Contradiction) return merged;
        result[key] = merged;
      }
      return new MergeObject(result);
    }
    if (other instanceof Something) return new Contradiction("merge/contradiction", new Set([this, other]));
    return other.merge(this);
  }

  abort(): Contradiction {
    return new Contradiction("aborted", new Set());
  }
}
