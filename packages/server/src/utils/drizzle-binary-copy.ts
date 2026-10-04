import { getTableColumns } from "drizzle-orm";
import { type AnyPgColumn, type AnyPgTable } from "drizzle-orm/pg-core";

export type BinaryCopyType =
  | "bool"
  | "float4"
  | "float8"
  | "int4"
  | "text"
  | "bytea";

export type BinaryCopyValue = {
  type: BinaryCopyType;
  value: boolean | number | string | Buffer | null;
};

export type BinaryCopyWriter = NodeJS.ReadWriteStream & {
  write(chunk: BinaryCopyValue[]): boolean;
};

export type BinaryCopyTypeOverride = BinaryCopyType | undefined;

export type BinaryCopyOptions = {
  typeOverrides?: Record<string, BinaryCopyTypeOverride>;
};

type BinaryCopyStrategy = {
  type: BinaryCopyType;
  map: (column: AnyPgColumn, value: unknown) => BinaryCopyValue;
};

type PreparedColumn = {
  propertyName: string;
  columnName: string;
  map: (value: unknown) => BinaryCopyValue;
};

const { rowWriter } = require("pg-copy-streams-binary") as {
  rowWriter: () => BinaryCopyWriter;
};

const BINARY_COPY_STRATEGIES: Record<string, BinaryCopyStrategy> = {
  boolean: {
    type: "bool",
    map: (column, driverValue) => {
      if (typeof driverValue !== "boolean") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped boolean to ${typeof driverValue}`,
        );
      }

      return { type: "bool", value: driverValue };
    },
  },
  doublePrecision: {
    type: "float8",
    map: (column, driverValue) => {
      if (typeof driverValue !== "number") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped double precision to ${typeof driverValue}`,
        );
      }

      return { type: "float8", value: driverValue };
    },
  },
  real: {
    type: "float4",
    map: (column, driverValue) => {
      if (typeof driverValue !== "number") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped real to ${typeof driverValue}`,
        );
      }

      return { type: "float4", value: driverValue };
    },
  },
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
  varchar: {
    type: "text",
    map: (column, driverValue) => {
      if (typeof driverValue !== "string") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped varchar to ${typeof driverValue}`,
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
  uuid: {
    type: "text",
    map: (column, driverValue) => {
      if (typeof driverValue !== "string") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped uuid to ${typeof driverValue}`,
        );
      }

      return { type: "text", value: driverValue };
    },
  },
  jsonb: {
    type: "text",
    map: (column, driverValue) => {
      if (typeof driverValue === "string") {
        return { type: "text", value: driverValue };
      }

      if (typeof driverValue !== "object" || driverValue === null) {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped jsonb to an unsupported value`,
        );
      }

      return { type: "text", value: JSON.stringify(driverValue) };
    },
  },
  "timestamp with time zone": {
    type: "text",
    map: (column, driverValue) => {
      if (!(driverValue instanceof Date)) {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped timestamp with time zone to an unsupported value`,
        );
      }

      return { type: "text", value: driverValue.toISOString() };
    },
  },
  "timestamp without time zone": {
    type: "text",
    map: (column, driverValue) => {
      if (!(driverValue instanceof Date)) {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped timestamp without time zone to an unsupported value`,
        );
      }

      return { type: "text", value: driverValue.toISOString() };
    },
  },
  timestamp: {
    type: "text",
    map: (column, driverValue) => {
      if (!(driverValue instanceof Date)) {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped timestamp to an unsupported value`,
        );
      }

      return { type: "text", value: driverValue.toISOString() };
    },
  },
};

function prepareColumn(
  propertyName: string,
  column: AnyPgColumn,
  options: BinaryCopyOptions,
): PreparedColumn {
  const sqlType = column.getSQLType();
  const strategy = BINARY_COPY_STRATEGIES[sqlType];

  if (!strategy) {
    throw new Error(
      `Unsupported Drizzle column type for binary COPY: ${sqlType}`,
    );
  }

  const targetType = options.typeOverrides?.[sqlType] ?? strategy.type;

  return {
    propertyName,
    columnName: column.name,
    map: (value) => {
      if (value == null) {
        return { type: targetType, value: null };
      }

      const mapped = strategy.map(column, column.mapToDriverValue(value));

      if (mapped.type !== targetType) {
        const override = BINARY_COPY_STRATEGIES[sqlType];
        if (!override) {
          throw new Error(
            `Unsupported Drizzle column type override: ${sqlType}`,
          );
        }

        if (targetType === "text") {
          if (typeof mapped.value === "string") {
            return { type: "text", value: mapped.value };
          }

          if (mapped.value instanceof Date) {
            return { type: "text", value: mapped.value.toISOString() };
          }

          return { type: "text", value: String(mapped.value) };
        }
      }

      return { ...mapped, type: targetType };
    },
  };
}

export async function createBinaryCopyFromDrizzleTable<TTable extends AnyPgTable>(
  table: TTable,
  rows: Array<TTable["$inferInsert"]>,
  options: BinaryCopyOptions = {},
): Promise<Blob> {
  const columns = Object.entries(getTableColumns(table)).map(
    ([propertyName, column]) => prepareColumn(propertyName, column, options),
  );
  const writer = rowWriter();
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  const completed = new Promise<void>((resolve, reject) => {
    writer.on("data", (chunk: Buffer) =>
      chunks.push(Uint8Array.from(chunk)),
    );
    writer.once("end", resolve);
    writer.once("error", reject);
  });

  for (const row of rows) {
    const sourceRow = row as Record<string, unknown>;
    const rowValues = columns.map(({ propertyName, columnName, map }) =>
      map(sourceRow[propertyName] ?? sourceRow[columnName]),
    );

    writer.write(rowValues);
  }

  writer.end();
  await completed;

  return new Blob(chunks);
}
