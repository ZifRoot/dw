import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type AnyPgColumn, type AnyPgTable } from "drizzle-orm/pg-core";

export type BinaryCopyType = "int4" | "text" | "bytea";

export type BinaryCopyValue = {
  type: BinaryCopyType;
  value: number | string | Buffer | null;
};

export type BinaryCopyWriter = NodeJS.ReadWriteStream & {
  write(chunk: BinaryCopyValue[]): boolean;
};

const { rowWriter } = require("pg-copy-streams-binary") as {
  rowWriter: () => BinaryCopyWriter;
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function createTableFromDrizzleSchema(table: AnyPgTable): string {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => `${quoteIdentifier(column.name)} ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}`);

  for (const primaryKey of config.primaryKeys) {
    columns.push(`PRIMARY KEY (${primaryKey.columns.map((column) => quoteIdentifier(column.name)).join(", ")})`);
  }

  return `CREATE TABLE ${quoteIdentifier(config.name)} (\n  ${columns.join(",\n  ")}\n)`;
}

export const COPY_TYPES: Record<string, BinaryCopyType> = {
  integer: "int4",
  text: "text",
  bytea: "bytea",
};

function getBinaryCopyType(column: AnyPgColumn): BinaryCopyType {
  const copyType = COPY_TYPES[column.getSQLType()];

  if (!copyType) {
    throw new Error(`Unsupported Drizzle column type for binary COPY: ${column.getSQLType()}`);
  }

  return copyType;
}

function mapDrizzleValueToBinaryCopy(column: AnyPgColumn, value: unknown): BinaryCopyValue {
  const type = getBinaryCopyType(column);

  if (value == null) {
    return { type, value: null };
  }

  const driverValue = column.mapToDriverValue(value);

  switch (type) {
    case "int4":
      if (typeof driverValue !== "number") {
        throw new TypeError(`Drizzle column "${column.name}" mapped integer to ${typeof driverValue}`);
      }
      return { type, value: driverValue };

    case "text":
      if (typeof driverValue !== "string") {
        throw new TypeError(`Drizzle column "${column.name}" mapped text to ${typeof driverValue}`);
      }
      return { type, value: driverValue };

    case "bytea":
      if (!(Buffer.isBuffer(driverValue) || driverValue instanceof Uint8Array)) {
        throw new TypeError(`Drizzle column "${column.name}" mapped bytea to an unsupported value`);
      }
      return { type, value: Buffer.from(driverValue) };
  }
}

export async function createBinaryCopyFromDrizzleTable<TTable extends AnyPgTable>(table: TTable, rows: Array<TTable["$inferInsert"]>): Promise<Blob> {
  const columns = Object.entries(getTableColumns(table));
  const writer = rowWriter();
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  const completed = new Promise<void>((resolve, reject) => {
    writer.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk).slice()));
    writer.once("end", resolve);
    writer.once("error", reject);
  });

  for (const row of rows) {
    const rowValues = columns.map(([propertyName, column]) => mapDrizzleValueToBinaryCopy(column, (row as Record<string, unknown>)[propertyName]));

    writer.write(rowValues);
  }

  writer.end();
  await completed;

  return new Blob(chunks);
}
