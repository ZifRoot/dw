import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { sql } from "drizzle-orm";

import {
  createBinaryCopyFromDrizzleTable,
} from "../src/utils/drizzle-binary-copy";

import {
  copyRowsTable,
  type CopyRowsInsert,
  type CopyRowsSelect,
} from "./PGliteCopyTestSchema";

const execFile = promisify(execFileCallback);

async function createTableFromDrizzleSchema(): Promise<string> {
  const rootDirectory = resolve(__dirname, "../../..");
  const schemaPath = resolve(
    rootDirectory,
    "packages/server/test/PGliteCopyTestSchema.ts",
  );
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

  const { stdout } = await execFile(
    npxCommand,
    [
      "--no-install",
      "drizzle-kit",
      "export",
      "--dialect=postgresql",
      `--schema=${schemaPath}`,
      "--sql",
    ],
    {
      cwd: rootDirectory,
      maxBuffer: 1024 * 1024,
    },
  );

  return stdout;
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

test("PGlite binary COPY converts rows from the Drizzle table schema", async () => {
  const pg = new PGlite();
  const db = drizzle({ client: pg });

  try {
    const ddl = await createTableFromDrizzleSchema();

    await db.execute(sql.raw(ddl));

    const rows = createRows();

    const binaryCopy = await createBinaryCopyFromDrizzleTable(copyRowsTable, rows);

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
});
