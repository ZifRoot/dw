import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  getTableConfig,
  type AnyPgColumn,
  type AnyPgTable,
} from "drizzle-orm/pg-core";
import { getTableColumns, sql } from "drizzle-orm";

import {
  copyRowsTable,
  type CopyRowsInsert,
  type CopyRowsSelect,
} from "./PGliteCopyTestSchema";

type BinaryCopyType = "int4" | "text" | "bytea";

type BinaryCopyValue = {
  type: BinaryCopyType;
  value: number | string | Buffer | null;
};

type BinaryCopyWriter = NodeJS.ReadWriteStream & {
  write(chunk: BinaryCopyValue[]): boolean;
};

const { rowWriter } = require("pg-copy-streams-binary") as {
  rowWriter: () => BinaryCopyWriter;
};

const COPY_TYPES: Record<string, BinaryCopyType> = {
  integer: "int4",
  text: "text",
  bytea: "bytea",
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function createTableFromDrizzleSchema(table: AnyPgTable): string {
  const config = getTableConfig(table);
  const columns = config.columns.map(
    (column) =>
      `${quoteIdentifier(column.name)} ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}`,
  );

  for (const primaryKey of config.primaryKeys) {
    columns.push(
      `PRIMARY KEY (${primaryKey.columns.map((column) => quoteIdentifier(column.name)).join(", ")})`,
    );
  }

  return `CREATE TABLE ${quoteIdentifier(config.name)} (\n  ${columns.join(",\n  ")}\n)`;
}

function getBinaryCopyType(column: AnyPgColumn): BinaryCopyType {
  const copyType = COPY_TYPES[column.getSQLType()];

  if (!copyType) {
    throw new Error(
      `Unsupported Drizzle column type for binary COPY: ${column.getSQLType()}`,
    );
  }

  return copyType;
}

function mapDrizzleValueToBinaryCopy(
  column: AnyPgColumn,
  value: unknown,
): BinaryCopyValue {
  const type = getBinaryCopyType(column);

  if (value == null) {
    return { type, value: null };
  }

  const driverValue = column.mapToDriverValue(value);

  switch (type) {
    case "int4":
      if (typeof driverValue !== "number") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped integer to ${typeof driverValue}`,
        );
      }
      return { type, value: driverValue };

    case "text":
      if (typeof driverValue !== "string") {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped text to ${typeof driverValue}`,
        );
      }
      return { type, value: driverValue };

    case "bytea":
      if (!(Buffer.isBuffer(driverValue) || driverValue instanceof Uint8Array)) {
        throw new TypeError(
          `Drizzle column "${column.name}" mapped bytea to an unsupported value`,
        );
      }
      return { type, value: Buffer.from(driverValue) };
  }
}

async function createBinaryCopyFromDrizzleTable<TTable extends AnyPgTable>(
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

function createRows(): CopyRowsInsert[] {
  const svgBlock = `<svg xmlns="http://www.w3.org/2000/svg">
  <g data-value="quotes " ' \\ & < >">
    <text>Привет, мир! 👋 日本語 Ελληνικά العربية</text>
    <text>line-1
line-2
line-3
\tindented</text>
  </g>
</svg>`;

  const content = Array.from({ length: 256 }, () => svgBlock).join("\n");

  return Array.from({ length: 32 }, (_, index) => ({
    id: index + 1,
    content,
    payload: Buffer.from([0, 1, 2, 127, 128, 255, index]).toString("hex"),
  }));
}

test(
  "PGlite binary COPY converts rows from the Drizzle table schema",
  async () => {
    const pg = new PGlite();
    const db = drizzle({ client: pg });

    try {
      await db.execute(sql.raw(createTableFromDrizzleSchema(copyRowsTable)));

      const rows = createRows();

      // Use Drizzle's own table model for the source data before building COPY bytes.
      await db.insert(copyRowsTable).values(rows);
      await db.delete(copyRowsTable);

      const binaryCopy = await createBinaryCopyFromDrizzleTable(
        copyRowsTable,
        rows,
      );

      await pg.query(
        "COPY copy_rows_drizzle (id, content, payload) FROM '/dev/blob' WITH (FORMAT binary)",
        [],
        { blob: binaryCopy },
      );

      const result = await db
        .select()
        .from(copyRowsTable)
        .orderBy(copyRowsTable.id);

      assert.equal(
        result.length,
        rows.length,
        "COPY must restore every generated row",
      );

      for (let index = 0; index < rows.length; index += 1) {
        const actual = result[index] as CopyRowsSelect;

        assert.equal(
          actual.id,
          rows[index].id,
          `row ${index + 1}: id must survive binary COPY unchanged`,
        );
        assert.equal(
          actual.content,
          rows[index].content,
          `row ${index + 1}: text content must survive binary COPY unchanged`,
        );
        const expectedPayload = Buffer.from(rows[index].payload, "hex");
        const actualPayload = Buffer.from(actual.payload);

        assert.deepEqual(
          actualPayload,
          expectedPayload,
          `row ${index + 1}: BYTEA bytes must survive binary COPY unchanged after Drizzle mapping`,
        );
      }
    } finally {
      await pg.close();
    }
  },
);
