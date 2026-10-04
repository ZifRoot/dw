import { getTableColumns } from "drizzle-orm";
import { type AnyPgColumn, type AnyPgTable } from "drizzle-orm/pg-core";

export type BinaryCopyType = "int4" | "text" | "bytea";

export type BinaryCopyValue = {
  type: BinaryCopyType;
  value: number | string | Buffer | null;
};

export type BinaryCopyWriter = NodeJS.ReadWriteStream & {
  write(chunk: BinaryCopyValue[]): boolean;
};

type BinaryCopyStrategy = {
  type: BinaryCopyType;
  map: (column: AnyPgColumn, value: unknown) => BinaryCopyValue;
};

const { rowWriter } = require("pg-copy-streams-binary") as {
  rowWriter: () => BinaryCopyWriter;
};

const BINARY_COPY_STRATEGIES: Record<string, BinaryCopyStrategy> = {
  integer: {
    type: "int4",
    map: (column, driverValue) => {
      if (typeof driverValue !== "number") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped integer to ${typeof driverValue}`,
        );
      }

      return { type: "int4", value: driverValue };
    },
  },
  text: {
    type: "text",
    map: (column, driverValue) => {
      if (typeof driverValue !== "string") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped text to ${typeof driverValue}`,
        );
      }

      return { type: "text", value: driverValue };
    },
  },
  bytea: {
    type: "bytea",
    map: (column, driverValue) => {
      if (
        !Buffer.isBuffer(driverValue) &&
        !(driverValue instanceof Uint8Array)
      ) {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped bytea to an unsupported value`,
        );
      }

      return { type: "bytea", value: Buffer.from(driverValue) };
    },
  },
};

function mapDrizzleValueToBinaryCopy(
  column: AnyPgColumn,
  value: unknown,
): BinaryCopyValue {
  const strategy = BINARY_COPY_STRATEGIES[column.getSQLType()];

  if (!strategy) {
    throw new Error(
      `Unsupported Drizzle column type for binary COPY: ${column.getSQLType()}`,
    );
  }

  if (value == null) {
    return { type: strategy.type, value: null };
  }

  return strategy.map(column, column.mapToDriverValue(value));
}

export async function createBinaryCopyFromDrizzleTable<TTable extends AnyPgTable>(
  table: TTable,
  rows: Array<TTable["$inferInsert"]>,
): Promise<Blob> {
  const columns = Object.entries(getTableColumns(table));
  const writer = rowWriter();
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  const completed = new Promise<void>((resolve, reject) => {
    writer.on("data", (chunk: Buffer) =>
      chunks.push(new Uint8Array(chunk).slice()),
    );
    writer.once("end", resolve);
    writer.once("error", reject);
  });

  for (const row of rows) {
    const rowValues = columns.map(([propertyName, column]) =>
      mapDrizzleValueToBinaryCopy(
        column,
        (row as Record<string, unknown>)[propertyName],
      ),
    );

    writer.write(rowValues);
  }

  writer.end();
  await completed;

  return new Blob(chunks);
}
