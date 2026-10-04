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

type PreparedColumn = {
  propertyName: string;
  map: (value: unknown) => BinaryCopyValue;
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

function prepareColumn(
  propertyName: string,
  column: AnyPgColumn,
): PreparedColumn {
  const strategy = BINARY_COPY_STRATEGIES[column.getSQLType()];

  if (!strategy) {
    throw new Error(
      `Unsupported Drizzle column type for binary COPY: ${column.getSQLType()}`,
    );
  }

  return {
    propertyName,
    map: (value) => {
      if (value == null) {
        return { type: strategy.type, value: null };
      }

      return strategy.map(column, column.mapToDriverValue(value));
    },
  };
}

export async function createBinaryCopyFromDrizzleTable<TTable extends AnyPgTable>(
  table: TTable,
  rows: Array<TTable["$inferInsert"]>,
): Promise<Blob> {
  const columns = Object.entries(getTableColumns(table)).map(
    ([propertyName, column]) => prepareColumn(propertyName, column),
  );
  const writer = rowWriter();
  const chunks: Buffer[] = [];

  const completed = new Promise<void>((resolve, reject) => {
    writer.on("data", (chunk: Buffer) => chunks.push(chunk));
    writer.once("end", resolve);
    writer.once("error", reject);
  });

  for (const row of rows) {
    const sourceRow = row as Record<string, unknown>;
    const rowValues = columns.map(({ propertyName, map }) =>
      map(sourceRow[propertyName]),
    );

    writer.write(rowValues);
  }

  writer.end();
  await completed;

  return new Blob(chunks);
}
