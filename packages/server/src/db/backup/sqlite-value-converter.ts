import type { BackupColumnType } from "./sqlite-backup-schema";

type SqliteValue = null | number | string | Buffer;

export function toSqliteValue(type: BackupColumnType, value: unknown): SqliteValue {
  if (value == null) return null;
  switch (type) {
    case "uuid": return String(value);
    case "json":
    case "embedding": return typeof value === "string" ? value : JSON.stringify(value);
    case "boolean": return value ? 1 : 0;
    case "timestamp": return value instanceof Date ? value.toISOString() : String(value);
    case "bytea": return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    case "text":
    case "integer":
    case "real": return value;
  }
}

export function fromSqliteValue(type: BackupColumnType, value: unknown): unknown {
  if (value == null) return null;
  switch (type) {
    case "uuid": return String(value);
    case "json":
    case "embedding":
      if (typeof value !== "string") throw new Error("SQLite " + type + " value must be JSON text");
      JSON.parse(value);
      return value;
    case "boolean": return value === true || value === 1;
    case "timestamp": return String(value);
    case "bytea": return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    case "text":
    case "integer":
    case "real": return value;
  }
}
